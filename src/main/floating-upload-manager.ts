import { is } from '@electron-toolkit/utils'
import {
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  screen,
  type MenuItemConstructorOptions
} from 'electron'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import type {
  FloatingUploadRequest,
  FloatingUploadState,
  FloatingUploadTarget,
  FloatingWindowPosition,
  TransferItem
} from '../shared/types'
import { FloatingUploadStore } from './floating-upload-store'
import type { OssService } from './oss-service'

const controlSize = 64
const expandedControlWidth = 280
const shadowPadding = 12
const collapsedSize = controlSize + shadowPadding * 2
const expandedWidth = expandedControlWidth + shadowPadding * 2
const screenMargin = 12
const useFixedWindowShape = process.platform === 'win32'

export class FloatingUploadManager {
  private window: BrowserWindow | null = null
  private tray: Tray | null = null
  private accountId: string | null = null
  private activeBatchId: string | null = null
  private readonly transferItems = new Map<string, TransferItem>()
  private pendingRequest: FloatingUploadRequest | null = null
  private resetTimer: NodeJS.Timeout | undefined
  private resizeSequence = 0
  private expansionTarget = false
  private state: FloatingUploadState = {
    visible: false,
    expanded: false,
    dockSide: 'right',
    status: 'idle',
    progress: 0,
    completed: 0,
    total: 0
  }

  constructor(
    private readonly oss: OssService,
    private readonly store: FloatingUploadStore,
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly showMainWindow: () => void,
    private readonly quitApplication: () => void
  ) {}

  isVisible(): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible())
  }

  getState(): FloatingUploadState {
    return { ...this.state, target: this.state.target ? { ...this.state.target } : undefined }
  }

  async setAccount(accountId: string | null): Promise<void> {
    this.accountId = accountId
    this.destroyWindow()
    this.destroyTray()
    this.pendingRequest = null
    this.activeBatchId = null
    this.transferItems.clear()
    this.state = {
      visible: false,
      expanded: false,
      dockSide: 'right',
      status: 'idle',
      progress: 0,
      completed: 0,
      total: 0
    }
    if (!accountId) {
      this.emitState()
      return
    }
    const settings = await this.store.get(accountId)
    this.state.target = settings.target
    if (settings.position) {
      const display = screen.getDisplayNearestPoint(settings.position)
      this.state.dockSide =
        settings.position.x + collapsedSize / 2 < display.workArea.x + display.workArea.width / 2
          ? 'left'
          : 'right'
    }
    if (settings.enabled && settings.target) await this.show(settings.position)
    else this.emitState()
  }

  async toggle(suggestedTarget?: FloatingUploadTarget): Promise<FloatingUploadState> {
    if (this.isVisible()) {
      await this.close()
      return this.getState()
    }
    this.assertAccount()
    const settings = await this.store.get(this.accountId!)
    if (suggestedTarget) {
      await this.setTarget(suggestedTarget)
    } else if (!settings.target) {
      throw new Error('请先进入一个 Bucket 目录')
    } else {
      this.state.target = settings.target
    }
    await this.store.update(this.accountId!, { enabled: true })
    await this.show(settings.position)
    return this.getState()
  }

  async setTarget(target: FloatingUploadTarget): Promise<FloatingUploadState> {
    this.assertTarget(target)
    this.state.target = { ...target, prefix: this.normalizePrefix(target.prefix) }
    await this.store.update(target.accountId, { target: this.state.target })
    this.emitState()
    return this.getState()
  }

  async close(): Promise<void> {
    const restoreMainWindow = !this.getMainWindow()?.isVisible()
    if (this.accountId) await this.store.update(this.accountId, { enabled: false })
    this.destroyWindow()
    this.destroyTray()
    this.state.visible = false
    this.state.expanded = false
    this.emitState()
    if (restoreMainWindow) this.showMainWindow()
  }

  showMenu(suggestedTarget?: FloatingUploadTarget): void {
    const template: MenuItemConstructorOptions[] = []
    if (suggestedTarget) {
      template.push({
        label: '设为当前目录',
        click: () => {
          void this.setTarget(suggestedTarget).then(() => this.ensureVisible())
        }
      })
    }
    if (template.length) template.push({ type: 'separator' })
    template.push(
      { label: '显示主窗口', click: this.showMainWindow },
      { label: '关闭悬浮球', click: () => void this.close() },
      { type: 'separator' },
      { label: '退出 OSS Browser', click: this.quitApplication }
    )
    Menu.buildFromTemplate(template).popup({
      window: this.window || this.getMainWindow() || undefined
    })
  }

  async setExpanded(expanded: boolean, duration: number): Promise<void> {
    const window = this.window
    if (!window || window.isDestroyed() || this.expansionTarget === expanded) return
    this.expansionTarget = expanded
    const sequence = ++this.resizeSequence
    if (expanded) {
      if (useFixedWindowShape) this.setWindowShape(window, true)
      else this.setWindowWidth(window, window.getBounds(), expandedWidth)
    }
    this.state.expanded = expanded
    this.emitState()
    if (!expanded && duration > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, duration))
    }
    if (sequence !== this.resizeSequence || window.isDestroyed()) return
    if (!expanded) {
      if (useFixedWindowShape) this.setWindowShape(window, false)
      else this.setWindowWidth(window, window.getBounds(), collapsedSize)
    }
  }

  getPosition(): FloatingWindowPosition {
    const bounds = this.window?.getBounds()
    return bounds ? { x: bounds.x, y: bounds.y } : { x: 0, y: 0 }
  }

  moveTo(position: FloatingWindowPosition): void {
    if (!this.window || this.window.isDestroyed()) return
    const offset = this.collapsedWindowOffset()
    const display = screen.getDisplayNearestPoint({ x: position.x + offset, y: position.y })
    const x = Math.min(
      display.workArea.x + display.workArea.width - controlSize - shadowPadding - offset,
      Math.max(display.workArea.x - shadowPadding - offset, Math.round(position.x))
    )
    const y = Math.min(
      display.workArea.y + display.workArea.height - controlSize - shadowPadding,
      Math.max(display.workArea.y - shadowPadding, Math.round(position.y))
    )
    this.window.setPosition(x, y)
  }

  async finishMove(): Promise<void> {
    if (!this.window || this.window.isDestroyed() || !this.accountId) return
    const bounds = this.window.getBounds()
    const offset = this.collapsedWindowOffset()
    const collapsedBounds = { ...bounds, x: bounds.x + offset, width: collapsedSize }
    const display = screen.getDisplayMatching(collapsedBounds)
    const center = collapsedBounds.x + collapsedBounds.width / 2
    this.state.dockSide =
      center < display.workArea.x + display.workArea.width / 2 ? 'left' : 'right'
    const collapsedX =
      this.state.dockSide === 'left'
        ? display.workArea.x + screenMargin - shadowPadding
        : display.workArea.x + display.workArea.width - controlSize - screenMargin - shadowPadding
    const x = collapsedX - this.collapsedWindowOffset()
    const y = Math.min(
      display.workArea.y + display.workArea.height - controlSize - screenMargin - shadowPadding,
      Math.max(display.workArea.y + screenMargin - shadowPadding, bounds.y)
    )
    this.window.setBounds(
      { x, y, width: useFixedWindowShape ? expandedWidth : collapsedSize, height: collapsedSize },
      false
    )
    this.setWindowShape(this.window, false)
    await this.store.update(this.accountId, { position: { x: collapsedX, y } })
    this.emitState()
  }

  async upload(paths: string[]): Promise<void> {
    const target = this.state.target
    if (!target || !paths.length) return
    if (
      this.state.status === 'checking' ||
      this.state.status === 'waiting' ||
      this.state.status === 'uploading'
    ) {
      throw new Error('已有悬浮上传任务正在处理')
    }
    this.setStatus('checking', '正在检查上传内容')
    try {
      const policy = this.oss.getUploadConflictPolicy()
      let skipNames: string[] = []
      if (policy !== 'replace') {
        const conflicts = await this.oss.findUploadConflicts(target.bucket, target.prefix, paths)
        if (policy === 'skip') skipNames = conflicts.map((item) => item.name)
        else if (conflicts.length) {
          this.pendingRequest = { target, paths, conflicts }
          this.setStatus('waiting', '需要确认同名文件')
          this.showMainWindow()
          this.getMainWindow()?.webContents.send('floating-upload:request', this.pendingRequest)
          return
        }
      }
      await this.performUpload(paths, skipNames)
    } catch (error) {
      this.setStatus('error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  async resolveRequest(skipNames: string[] | null): Promise<void> {
    const request = this.pendingRequest
    this.pendingRequest = null
    if (!request) return
    if (skipNames === null) {
      this.setStatus('idle')
      return
    }
    await this.performUpload(request.paths, skipNames)
  }

  handleTransfer(item: TransferItem): void {
    if (!this.activeBatchId || item.batchId !== this.activeBatchId) return
    this.transferItems.set(item.id, item)
    const items = [...this.transferItems.values()]
    const total = item.batchTotal
    const completed = Math.max(
      item.batchDone,
      items.filter((entry) => entry.status === 'done').length
    )
    const progress = total
      ? Math.min(
          1,
          (completed +
            items
              .filter((entry) => entry.status === 'running')
              .reduce((sum, entry) => sum + entry.progress, 0)) /
            total
        )
      : 0
    this.state.total = total
    this.state.completed = completed
    this.state.progress = progress
    this.emitState()
  }

  private async performUpload(paths: string[], skipNames: string[]): Promise<void> {
    const target = this.state.target
    if (!target) return
    this.activeBatchId = null
    this.transferItems.clear()
    this.state.total = paths.length
    this.state.completed = 0
    this.state.progress = 0
    this.setStatus('uploading', '正在上传')
    try {
      const completed = await this.oss.upload(
        target.bucket,
        target.prefix,
        paths,
        { skipNames },
        (batchId) => {
          this.activeBatchId = batchId
        }
      )
      this.state.progress = completed ? 1 : this.state.progress
      this.state.completed = completed ? this.state.total : this.state.completed
      this.setStatus(completed ? 'success' : 'error', completed ? '上传完成' : '部分文件上传失败')
    } catch (error) {
      this.setStatus('error', error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      this.activeBatchId = null
      this.transferItems.clear()
    }
  }

  private async show(position?: FloatingWindowPosition): Promise<void> {
    if (!this.state.target) return
    if (!this.window || this.window.isDestroyed()) this.createWindow(position)
    this.ensureTray()
    this.window?.showInactive()
    this.state.visible = true
    this.emitState()
  }

  private ensureVisible(): void {
    if (!this.isVisible()) void this.toggle(this.state.target)
  }

  private createWindow(position?: FloatingWindowPosition): void {
    const initial = this.initialPosition(position)
    const initialWidth = useFixedWindowShape ? expandedWidth : collapsedSize
    this.window = new BrowserWindow({
      x: initial.x,
      y: initial.y,
      width: initialWidth,
      height: collapsedSize,
      minWidth: initialWidth,
      minHeight: collapsedSize,
      maxHeight: collapsedSize,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false
      }
    })
    this.setWindowShape(this.window, false)
    this.window.setAlwaysOnTop(true, 'floating')
    if (process.platform === 'darwin') {
      this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    }
    this.window.on('closed', () => {
      this.window = null
      this.state.visible = false
      this.state.expanded = false
      this.emitState()
    })
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?window=floating-upload`)
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/index.html'), {
        query: { window: 'floating-upload' }
      })
    }
  }

  private ensureTray(): void {
    if (this.tray) return
    const trayIcon = nativeImage.createFromPath(icon).resize({ width: 18, height: 18 })
    this.tray = new Tray(trayIcon)
    this.tray.setToolTip('OSS Browser')
    this.tray.on('click', this.showMainWindow)
    this.tray.on('right-click', () => this.showMenu())
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '显示主窗口', click: this.showMainWindow },
        { label: '显示悬浮球', click: () => this.window?.showInactive() },
        { type: 'separator' },
        { label: '退出 OSS Browser', click: this.quitApplication }
      ])
    )
  }

  private destroyWindow(): void {
    this.resizeSequence += 1
    this.expansionTarget = false
    if (!this.window || this.window.isDestroyed()) return
    this.window.destroy()
    this.window = null
  }

  private destroyTray(): void {
    this.tray?.destroy()
    this.tray = null
  }

  private initialPosition(saved?: FloatingWindowPosition): FloatingWindowPosition {
    const display = saved
      ? screen.getDisplayNearestPoint(saved)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    if (saved) {
      const collapsedX = Math.min(
        display.workArea.x + display.workArea.width - controlSize - screenMargin - shadowPadding,
        Math.max(display.workArea.x + screenMargin - shadowPadding, saved.x)
      )
      return {
        x: collapsedX - this.collapsedWindowOffset(),
        y: Math.min(
          display.workArea.y + display.workArea.height - controlSize - screenMargin - shadowPadding,
          Math.max(display.workArea.y + screenMargin - shadowPadding, saved.y)
        )
      }
    }
    const collapsedX =
      display.workArea.x + display.workArea.width - controlSize - screenMargin - shadowPadding
    return {
      x: collapsedX - this.collapsedWindowOffset(),
      y: display.workArea.y + Math.round((display.workArea.height - collapsedSize) / 2)
    }
  }

  private collapsedWindowOffset(): number {
    return useFixedWindowShape && this.state.dockSide === 'right'
      ? expandedWidth - collapsedSize
      : 0
  }

  private setWindowShape(window: BrowserWindow, expanded: boolean): void {
    if (!useFixedWindowShape) return
    const x = expanded ? 0 : this.collapsedWindowOffset()
    window.setShape([
      { x, y: 0, width: expanded ? expandedWidth : collapsedSize, height: collapsedSize }
    ])
  }

  private setWindowWidth(window: BrowserWindow, start: Electron.Rectangle, width: number): void {
    const x = this.state.dockSide === 'right' ? start.x + start.width - width : start.x
    window.setBounds({ x, y: start.y, width, height: collapsedSize }, false)
  }

  private setStatus(status: FloatingUploadState['status'], message?: string): void {
    if (this.resetTimer) clearTimeout(this.resetTimer)
    this.state.status = status
    this.state.message = message
    this.emitState()
    if (status === 'success') {
      this.resetTimer = setTimeout(() => this.setStatus('idle'), 1800)
    }
  }

  private emitState(): void {
    const state = this.getState()
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('floating-upload:state', state)
    }
  }

  private assertAccount(): void {
    if (!this.accountId) throw new Error('请先登录')
  }

  private assertTarget(target: FloatingUploadTarget): void {
    this.assertAccount()
    if (target.accountId !== this.accountId) throw new Error('悬浮上传目标与当前账号不一致')
    if (!target.bucket) throw new Error('请选择上传 Bucket')
  }

  private normalizePrefix(prefix: string): string {
    if (!prefix) return ''
    return `${prefix.replace(/^\/+|\/+$/g, '')}/`
  }
}
