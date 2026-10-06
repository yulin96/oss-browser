import { EventEmitter } from 'node:events'
import { app, shell, type BrowserWindow } from 'electron'
import electronUpdater, { type UpdateInfo } from 'electron-updater'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateService } from './update-service'

vi.mock('electron', () => ({
  app: { isPackaged: true },
  shell: { openExternal: vi.fn(async () => undefined) }
}))
vi.mock('electron-updater', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    default: {
      autoUpdater: Object.assign(new EventEmitter(), {
        autoDownload: true,
        autoInstallOnAppQuit: true,
        checkForUpdates: vi.fn(),
        downloadUpdate: vi.fn(async () => []),
        quitAndInstall: vi.fn()
      })
    }
  }
})

const updater = electronUpdater.autoUpdater as typeof electronUpdater.autoUpdater & EventEmitter
const info = { version: '0.6.0', releaseNotes: '  新版本说明  ' } as UpdateInfo

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  updater.removeAllListeners()
  Object.defineProperty(app, 'isPackaged', { value: true, configurable: true })
})

afterEach(() => {
  updater.removeAllListeners()
  vi.useRealTimers()
})

describe('GitHub update flow', () => {
  it.each(['win32', 'linux'] as const)('keeps application updates on %s', async (platform) => {
    const send = vi.fn()
    const window = { webContents: { send } } as unknown as BrowserWindow
    const service = new UpdateService(() => window, platform)
    service.initialize()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(true)
    updater.emit('update-available', info)
    expect(service.getState()).toEqual({
      status: 'available',
      version: '0.6.0',
      releaseNotes: '新版本说明'
    })
    expect(send).toHaveBeenLastCalledWith('update:status', service.getState())
    await service.download()
    expect(updater.downloadUpdate).toHaveBeenCalledOnce()
    updater.emit('download-progress', { percent: 42.8 })
    expect(service.getState()).toMatchObject({
      status: 'downloading',
      percent: 43,
      releaseNotes: '新版本说明'
    })
    updater.emit('update-downloaded', info)
    service.install()
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true)
    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  it.each(['arm64', 'x64'] as const)(
    'opens the macOS %s DMG on GitHub without downloading or installing in the app',
    async (architecture) => {
      const service = new UpdateService(() => null, 'darwin', architecture)
      service.initialize()
      expect(updater.autoInstallOnAppQuit).toBe(false)
      updater.emit('update-available', info)
      await service.download()
      expect(shell.openExternal).toHaveBeenCalledExactlyOnceWith(
        `https://github.com/yulin96/oss-browser/releases/download/v0.6.0/oss-browser-0.6.0-${architecture}.dmg`
      )
      expect(service.getState().status).toBe('available')
      updater.emit('update-downloaded', info)
      service.install()
      expect(updater.downloadUpdate).not.toHaveBeenCalled()
      expect(updater.quitAndInstall).not.toHaveBeenCalled()
    }
  )

  it('does not check or download updates in development', async () => {
    Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
    const service = new UpdateService(() => null)
    service.initialize()
    expect(await service.check()).toEqual({ status: 'unsupported' })
    await service.download()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(shell.openExternal).not.toHaveBeenCalled()
  })
})
