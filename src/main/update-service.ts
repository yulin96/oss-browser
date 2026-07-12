import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '../shared/types'

const { autoUpdater } = electronUpdater

export class UpdateService {
  private state: UpdateState = { status: 'idle' }
  private initialized = false

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  initialize(): void {
    if (process.platform === 'darwin') {
      this.state = { status: 'unsupported' }
      return
    }
    if (this.initialized || !app.isPackaged) return
    this.initialized = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => this.setState({ status: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      this.setState({ status: 'available', version: info.version })
    )
    autoUpdater.on('update-not-available', (info) =>
      this.setState({ status: 'not-available', version: info.version })
    )
    autoUpdater.on('download-progress', (progress) =>
      this.setState({
        status: 'downloading',
        version: this.state.version,
        percent: Math.round(progress.percent)
      })
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.setState({ status: 'downloaded', version: info.version, percent: 100 })
    )
    autoUpdater.on('error', (error) => this.setState({ status: 'error', message: error.message }))

    setTimeout(() => void this.check().catch(() => undefined), 5000)
  }

  getState(): UpdateState {
    if (process.platform === 'darwin') return { status: 'unsupported' }
    return this.state
  }

  async check(): Promise<UpdateState> {
    if (process.platform === 'darwin') return { status: 'unsupported' }
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
