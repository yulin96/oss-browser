import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'
import type { UpdateState } from '../shared/types'

const { autoUpdater } = electronUpdater

function getReleaseNotes(info: UpdateInfo): string | undefined {
  if (typeof info.releaseNotes === 'string') return info.releaseNotes.trim() || undefined
  if (!Array.isArray(info.releaseNotes)) return undefined
  const notes = info.releaseNotes
    .map((release) => release.note?.trim())
    .filter((note): note is string => Boolean(note))
    .join('\n\n')
  return notes || undefined
}

export class UpdateService {
  private state: UpdateState = { status: 'idle' }
  private initialized = false

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  initialize(): void {
    if (this.initialized || !app.isPackaged) return
    this.initialized = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => this.setState({ status: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.setState({
        status: 'available',
        version: info.version,
        releaseNotes: getReleaseNotes(info)
      })
    )
    autoUpdater.on('update-not-available', (info) =>
      this.setState({ status: 'not-available', version: info.version })
    )
    autoUpdater.on('download-progress', (progress) =>
      this.setState({
        status: 'downloading',
        version: this.state.version,
        percent: Math.round(progress.percent),
        releaseNotes: this.state.releaseNotes
      })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.setState({
        status: 'downloaded',
        version: info.version,
        percent: 100,
        releaseNotes: getReleaseNotes(info)
      })
    )
    autoUpdater.on('error', (error) => this.setState({ status: 'error', message: error.message }))

    setTimeout(() => void this.check().catch(() => undefined), 5000)
  }

  getState(): UpdateState {
    return this.state
  }

  async check(): Promise<UpdateState> {
    if (!app.isPackaged) return { status: 'unsupported' }
    if (this.state.status === 'checking' || this.state.status === 'downloading') return this.state
    await autoUpdater.checkForUpdates()
    return this.state
  }

  async download(): Promise<void> {
    if (process.platform === 'darwin') return
    if (!app.isPackaged || this.state.status !== 'available') return
    await autoUpdater.downloadUpdate()
  }

  install(): void {
    if (process.platform === 'darwin') return
    if (this.state.status === 'downloaded') autoUpdater.quitAndInstall(false, true)
  }

  private setState(state: UpdateState): void {
    this.state = state
    this.getWindow()?.webContents.send('update:status', state)
  }
}
