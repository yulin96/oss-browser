import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain as electronIpcMain,
  net,
  protocol,
  screen,
  type IpcMainInvokeEvent,
  type Rectangle,
  Menu,
  shell
} from 'electron'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import icon from '../../resources/icon.png?asset'
import type {
  AppSettings,
  AuthConfig,
  CacheRefreshRequest,
  CdnCredentials,
  GrantOptions,
  ObjectInfo,
  SavedProfile,
  TransferItem,
  UploadOptions
} from '../shared/types'
import { extractVersionReleaseNotes } from '../shared/release-notes.mjs'
import { OssService } from './oss-service'
import { FloatingUploadManager } from './floating-upload-manager'
import { FloatingUploadStore } from './floating-upload-store'
import { ProfileStore } from './profile-store'
import { UpdateService } from './update-service'
import { assertTrustedIpcSender, configureRendererWindow, openExternalUrl } from './window-security'
import { WindowStateStore, type WindowState } from './window-state-store'

app.setPath('userData', join(app.getPath('appData'), is.dev ? 'oss-browser-dev' : 'oss-browser'))
app.setName('OSS Browser')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'oss-browser-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
])

let mainWindow: BrowserWindow | null = null
let isQuitting = false
const oss = new OssService((item: TransferItem) => {
  mainWindow?.webContents.send('transfer:progress', item)
  floatingUpload?.handleTransfer(item)
})
const profiles = new ProfileStore()
const floatingUploadStore = new FloatingUploadStore()
const windowStateStore = new WindowStateStore()
const updates = new UpdateService(() => mainWindow)
let lastUploadDirectory: string | undefined
let lastDownloadDirectory: string | undefined
const ipcMain = {
  handle(channel: string, listener: Parameters<typeof electronIpcMain.handle>[1]): void {
    electronIpcMain.handle(channel, (event, ...args) => {
      assertTrustedIpcSender(event)
      return listener(event, ...args)
    })
  }
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    void createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function quitApplication(): Promise<void> {
  if (isQuitting) return
  isQuitting = true
  if (mainWindow && !mainWindow.isDestroyed()) {
    await windowStateStore.save(mainWindow).catch((error) => {
      console.error('保存窗口状态失败', error)
    })
  }
  app.quit()
}

const floatingUpload = new FloatingUploadManager(
  oss,
  floatingUploadStore,
  () => mainWindow,
  showMainWindow,
  () => void quitApplication()
)

function withPreviewCors(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

function registerMediaProtocol(): void {
  protocol.handle('oss-browser-media', async (request) => {
    const url = new URL(request.url)
    const token = url.pathname.slice(1)
    if (!token || token.includes('/')) return new Response(null, { status: 404 })
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Headers': 'Range',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response(null, { status: 405 })

    if (url.hostname === 'upload') {
      const localPath = oss.resolveLocalMediaPreview(token)
      if (!localPath) return new Response(null, { status: 404 })
      const range = request.headers.get('range')
      return net.fetch(pathToFileURL(localPath).toString(), {
        method: request.method,
        headers: range ? { range } : undefined
      })
    }

    if (url.hostname !== 'object') return new Response(null, { status: 404 })
    const previewUrl = oss.resolveObjectPreview(token)
    if (!previewUrl) return new Response(null, { status: 404 })

    const range = request.headers.get('range')
    try {
      if (request.method === 'HEAD') {
        const response = await net.fetch(previewUrl, {
          headers: { range: range || 'bytes=0-0' }
        })
        return withPreviewCors(
          new Response(null, {
            status: response.ok ? 200 : response.status,
            headers: response.headers
          })
        )
      }
      return withPreviewCors(
        await net.fetch(previewUrl, {
          headers: range ? { range } : undefined
        })
      )
    } catch (error) {
      console.error('读取预览对象失败', error)
      return withPreviewCors(new Response(null, { status: 502 }))
    }
  })
}

function intersectArea(first: Rectangle, second: Rectangle): number {
  const width = Math.max(
    0,
    Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x)
  )
  const height = Math.max(
    0,
    Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y)
  )
  return width * height
}

function restoreBounds(stored?: Rectangle): Rectangle | undefined {
  if (!stored) return undefined
  const display = screen
    .getAllDisplays()
    .map((item) => ({ display: item, area: intersectArea(stored, item.workArea) }))
    .sort((left, right) => right.area - left.area)[0]

  const workArea = display?.area ? display.display.workArea : screen.getPrimaryDisplay().workArea
  const width = Math.min(Math.max(stored.width, 1024), workArea.width)
  const height = Math.min(Math.max(stored.height, 680), workArea.height)
  const centeredX = workArea.x + Math.round((workArea.width - width) / 2)
  const centeredY = workArea.y + Math.round((workArea.height - height) / 2)

  return {
    x: display?.area
      ? Math.min(Math.max(stored.x, workArea.x), workArea.x + workArea.width - width)
      : centeredX,
    y: display?.area
      ? Math.min(Math.max(stored.y, workArea.y), workArea.y + workArea.height - height)
      : centeredY,
    width,
    height
  }
}

async function createWindow(): Promise<void> {
  let storedState: WindowState | undefined
  try {
    storedState = await windowStateStore.load()
  } catch (error) {
    console.error('读取窗口状态失败，将使用默认窗口状态', error)
  }
  const restoredBounds = restoreBounds(storedState?.bounds)

  mainWindow = new BrowserWindow({
    ...(restoredBounds || { width: 1280, height: 800 }),
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f6f8fb',
    title: 'OSS Browser',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' } : { frame: false }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonPosition({ x: 14, y: 19 })
  }

  mainWindow.on('ready-to-show', () => {
    if (storedState?.maximized) mainWindow?.maximize()
    mainWindow?.show()
  })
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximize-change', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximize-change', false))
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    if (floatingUpload.isVisible()) {
      mainWindow?.hide()
      return
    }
    void quitApplication()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  configureRendererWindow(mainWindow)

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  const senderWindow = (event: IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender)

  ipcMain.handle('auth:connect', async (_event, config: AuthConfig) => {
    try {
      const buckets = await oss.connect(config)
      await floatingUpload.setAccount(`${config.endpoint}|${config.accessKeyId}`)
      return buckets
    } catch (error) {
      await floatingUpload.setAccount(null)
      throw error
    }
  })
  ipcMain.handle('auth:disconnect', async () => {
    oss.disconnect()
    await floatingUpload.setAccount(null)
  })
  ipcMain.handle('auth:setSecure', (_event, secure: boolean) => oss.setSecure(secure))
  ipcMain.handle('auth:setCdnCredentials', (_event, credentials?: CdnCredentials) =>
    oss.setCdnCredentials(credentials)
  )
  ipcMain.handle('auth:probePermissions', () => oss.probePermissions())
  ipcMain.handle('profiles:list', () => profiles.list())
  ipcMain.handle('profiles:save', (_event, profile: SavedProfile) => profiles.save(profile))
  ipcMain.handle('profiles:remove', (_event, id: string) => profiles.remove(id))
  ipcMain.handle('profiles:clear', () => profiles.clear())
  ipcMain.handle('settings:update', (_event, settings: AppSettings) => oss.updateSettings(settings))
  ipcMain.handle('grants:createToken', (_event, options: GrantOptions) =>
    oss.createGrantToken(options)
  )
  ipcMain.handle('ram:listUsers', () => oss.listRamUsers())
  ipcMain.handle(
    'ram:saveUser',
    (_event, userName: string, displayName: string, comments: string, originalName?: string) =>
      oss.saveRamUser(userName, displayName, comments, originalName)
  )
  ipcMain.handle('ram:removeUser', (_event, userName: string) => oss.removeRamUser(userName))
  ipcMain.handle('ram:listAccessKeys', (_event, userName: string) =>
    oss.listRamAccessKeys(userName)
  )
  ipcMain.handle('ram:createAccessKey', (_event, userName: string) =>
    oss.createRamAccessKey(userName)
  )
  ipcMain.handle('ram:removeAccessKey', (_event, userName: string, accessKeyId: string) =>
    oss.removeRamAccessKey(userName, accessKeyId)
  )

  ipcMain.handle('buckets:list', () => oss.listBuckets())
  ipcMain.handle('buckets:getStorageStat', (_event, name: string) => oss.getBucketStorageStat(name))
  ipcMain.handle('buckets:getAcl', (_event, name: string) => oss.getBucketAcl(name))
  ipcMain.handle('buckets:create', (_event, name: string, region: string, acl: string) =>
    oss.createBucket(name, region, acl)
  )
  ipcMain.handle('buckets:remove', (_event, name: string) => oss.removeBucket(name))
  ipcMain.handle('buckets:setAcl', (_event, name: string, acl: string) =>
    oss.setBucketAcl(name, acl)
  )
  ipcMain.handle('buckets:listMultipart', (_event, name: string) => oss.listMultipart(name))
  ipcMain.handle(
    'buckets:abortMultipart',
    (_event, bucket: string, name: string, uploadId: string) =>
      oss.abortMultipart(bucket, name, uploadId)
  )

  ipcMain.handle('objects:list', (_event, bucket: string, prefix: string, marker?: string) =>
    oss.listObjects(bucket, prefix, marker)
  )
  ipcMain.handle('objects:createFolder', (_event, bucket: string, path: string) =>
    oss.createFolder(bucket, path)
  )
  ipcMain.handle('objects:remove', (_event, bucket: string, names: string[]) =>
    oss.removeObjects(bucket, names)
  )
  ipcMain.handle('objects:copy', (_event, bucket: string, source: string, target: string) =>
    oss.copyObject(bucket, source, target)
  )
  ipcMain.handle(
    'objects:transfer',
    (_event, bucket: string, items: ObjectInfo[], targetPath: string, move: boolean) =>
      oss.transferObjects(bucket, items, targetPath, move)
  )
  ipcMain.handle('objects:setAcl', (_event, bucket: string, name: string, acl: string) =>
    oss.setObjectAcl(bucket, name, acl)
  )
  ipcMain.handle('objects:isPublic', (_event, bucket: string, name: string) =>
    oss.isObjectPublic(bucket, name)
  )
  ipcMain.handle(
    'objects:setHeaders',
    (_event, bucket: string, name: string, headers: Record<string, string>) =>
      oss.setObjectHeaders(bucket, name, headers)
  )
  ipcMain.handle(
    'objects:signedUrl',
    (_event, bucket: string, name: string, expires: number, process?: string) =>
      oss.signedUrl(bucket, name, expires, process)
  )
  ipcMain.handle('objects:preparePreview', (_event, bucket: string, name: string) =>
    oss.prepareObjectPreview(bucket, name)
  )
  ipcMain.handle('objects:discardPreview', (_event, value: string) => {
    if (!URL.canParse(value)) return
    const url = new URL(value)
    const token = url.hostname === 'object' ? url.pathname.slice(1) : ''
    if (url.protocol !== 'oss-browser-media:' || !token || token.includes('/')) return
    oss.discardObjectPreview(token)
  })
  ipcMain.handle('objects:imageDimensions', (_event, bucket: string, name: string) =>
    oss.getImageDimensions(bucket, name)
  )
  ipcMain.handle('objects:readText', (_event, bucket: string, name: string) =>
    oss.readText(bucket, name)
  )
  ipcMain.handle('objects:saveText', (_event, bucket: string, name: string, content: string) =>
    oss.saveText(bucket, name, content)
  )
  ipcMain.handle('objects:createSymlink', (_event, bucket: string, name: string, target: string) =>
    oss.createSymlink(bucket, name, target)
  )
  ipcMain.handle('objects:restore', (_event, bucket: string, names: string[], days: number) =>
    oss.restoreObjects(bucket, names, days)
  )
  ipcMain.handle('objects:details', (_event, bucket: string, name: string) =>
    oss.getObjectDetails(bucket, name)
  )
  ipcMain.handle('objects:domains', (_event, bucket: string) => oss.listCnameDomains(bucket))
  ipcMain.handle('cache:domains', () => oss.listCdnDomains())
  ipcMain.handle('cache:refresh', (_event, request: CacheRefreshRequest) =>
    oss.refreshCdnCache(request)
  )
  ipcMain.handle('cache:tasks', (_event, domainName: string, taskId?: string) =>
    oss.listCdnRefreshTasks(domainName, taskId)
  )
  ipcMain.handle('cache:quota', (_event, domainName: string) => oss.getCdnRefreshQuota(domainName))

  ipcMain.handle('files:pickUpload', async (_event, kind: 'files' | 'folder') => {
    const properties: Electron.OpenDialogOptions['properties'] =
      kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections']
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择上传内容',
      defaultPath: lastUploadDirectory,
      properties
    })
    if (result.canceled) return []
    lastUploadDirectory = kind === 'folder' ? result.filePaths[0] : dirname(result.filePaths[0])
    return result.filePaths
  })
  ipcMain.handle('files:pickDownloadFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择下载位置',
      defaultPath: lastDownloadDirectory,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled) return null
    lastDownloadDirectory = result.filePaths[0]
    return lastDownloadDirectory
  })
  ipcMain.handle(
    'files:findUploadConflicts',
    (_event, bucket: string, prefix: string, paths: string[]) =>
      oss.findUploadConflicts(bucket, prefix, paths)
  )
  ipcMain.handle('files:discardUploadPreparation', (_event, id: string) =>
    oss.discardUploadPreparation(id)
  )
  ipcMain.handle(
    'files:upload',
    (_event, bucket: string, prefix: string, paths: string[], options?: UploadOptions) =>
      oss.upload(bucket, prefix, paths, options)
  )
  ipcMain.handle(
    'files:download',
    (_event, bucket: string, items: ObjectInfo[], destination: string) =>
      oss.download(bucket, items, destination)
  )
  ipcMain.handle('transfers:cancel', (_event, id: string) => oss.cancelTransfer(id))
  ipcMain.handle('transfers:pauseAll', (_event, direction: TransferItem['direction']) =>
    oss.pauseAllTransfers(direction)
  )
  ipcMain.handle('transfers:resumeAll', (_event, direction: TransferItem['direction']) =>
    oss.resumeAllTransfers(direction)
  )
  ipcMain.handle('transfers:cancelAll', (_event, direction: TransferItem['direction']) =>
    oss.cancelAllTransfers(direction)
  )

  ipcMain.handle('floating-upload:getState', () => floatingUpload.getState())
  ipcMain.handle('floating-upload:toggle', (_event, suggestedTarget) =>
    floatingUpload.toggle(suggestedTarget)
  )
  ipcMain.handle('floating-upload:setTarget', (_event, target) => floatingUpload.setTarget(target))
  ipcMain.handle('floating-upload:close', () => floatingUpload.close())
  ipcMain.handle('floating-upload:showMenu', (_event, suggestedTarget) =>
    floatingUpload.showMenu(suggestedTarget)
  )
  ipcMain.handle('floating-upload:setExpanded', (_event, expanded: boolean, duration: number) =>
    floatingUpload.setExpanded(expanded, duration)
  )
  ipcMain.handle('floating-upload:getPosition', () => floatingUpload.getPosition())
  ipcMain.handle('floating-upload:moveTo', (_event, position) => floatingUpload.moveTo(position))
  ipcMain.handle('floating-upload:finishMove', () => floatingUpload.finishMove())
  ipcMain.handle('floating-upload:upload', (_event, paths: string[]) =>
    floatingUpload.upload(paths)
  )
  ipcMain.handle('floating-upload:resolveRequest', (_event, skipNames: string[] | null) =>
    floatingUpload.resolveRequest(skipNames)
  )

  ipcMain.handle('system:getVersion', () => app.getVersion())
  ipcMain.handle('system:getReleaseNotes', async () => {
    const path = app.isPackaged
      ? join(process.resourcesPath, 'release-notes.md')
      : join(app.getAppPath(), 'release-notes.md')
    try {
      const content = (await readFile(path, 'utf8')).trim()
      if (app.isPackaged) return content

      const releaseNotes = extractVersionReleaseNotes(content, app.getVersion())
      if (releaseNotes === undefined) {
        console.error(`更新日志中缺少 v${app.getVersion()} 版本`)
        return ''
      }
      return releaseNotes
    } catch (error) {
      console.error('读取更新日志失败，将使用空内容', error)
      return ''
    }
  })
  ipcMain.handle('system:openExternal', (_event, url: string) => openExternalUrl(url))
  ipcMain.handle('system:revealFile', (_event, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('system:writeClipboard', (_event, text: string) => clipboard.writeText(text))
  ipcMain.handle('window:minimize', (event) => senderWindow(event)?.minimize())
  ipcMain.handle('window:toggleMaximize', (event) => {
    const window = senderWindow(event)
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })
  ipcMain.handle('window:close', (event) => senderWindow(event)?.close())
  ipcMain.handle('window:isMaximized', (event) => senderWindow(event)?.isMaximized() ?? false)
  ipcMain.handle('updates:getState', () => updates.getState())
  ipcMain.handle('updates:check', () => updates.check())
  ipcMain.handle('updates:download', () => updates.download())
  ipcMain.handle('updates:install', () => updates.install())
}

const hasSingleInstanceLock = is.dev || app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

app.on('second-instance', () => {
  showMainWindow()
})

app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  void quitApplication()
})

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.yulin96.ossbrowser')
  Menu.setApplicationMenu(null)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerMediaProtocol()
  registerIpc()
  await createWindow()
  updates.initialize()

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
