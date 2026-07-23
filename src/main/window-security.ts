import { is } from '@electron-toolkit/utils'
import { shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

function isTrustedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      return url.origin === new URL(process.env.ELECTRON_RENDERER_URL).origin
    }

    const rendererUrl = new URL(pathToFileURL(join(__dirname, '../renderer/index.html')).href)
    url.search = ''
    url.hash = ''
    return url.href === rendererUrl.href
  } catch {
    return false
  }
}

export function configureRendererWindow(window: BrowserWindow): void {
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
}

export function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  if (
    !event.senderFrame ||
    event.senderFrame !== event.sender.mainFrame ||
    !isTrustedRendererUrl(event.senderFrame.url)
  ) {
    throw new Error('拒绝来自非受信页面的操作')
  }
}

export async function openExternalUrl(value: string): Promise<void> {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('仅允许打开 HTTP 或 HTTPS 地址')
  }
  await shell.openExternal(url.toString())
}
