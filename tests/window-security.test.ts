import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }))

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('electron', () => ({ shell: { openExternal } }))

import { assertTrustedIpcSender, openExternalUrl } from '../src/main/window-security'

describe('window security', () => {
  it('rejects IPC from a remote main frame', () => {
    const frame = { url: 'https://attacker.example/preview' }
    const event = {
      senderFrame: frame,
      sender: { mainFrame: frame }
    } as unknown as IpcMainInvokeEvent

    expect(() => assertTrustedIpcSender(event)).toThrow('拒绝来自非受信页面的操作')
  })

  it('only opens HTTP and HTTPS external URLs', async () => {
    await expect(openExternalUrl('file:///tmp/secret')).rejects.toThrow(
      '仅允许打开 HTTP 或 HTTPS 地址'
    )
    await openExternalUrl('https://github.com/yulin96/oss-browser')
    expect(openExternal).toHaveBeenCalledWith('https://github.com/yulin96/oss-browser')
  })
})
