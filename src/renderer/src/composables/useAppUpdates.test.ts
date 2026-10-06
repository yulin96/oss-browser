import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfirmationRequest } from './useConfirmation'
import { useAppUpdates } from './useAppUpdates'

vi.mock('../i18n', () => ({
  t: (key: string, params: Record<string, string | number> = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''))
}))

afterEach(() => vi.unstubAllGlobals())

describe('update confirmation', () => {
  it.each([
    ['darwin', '手动下载', '发现新版本 0.6.0，请前往 GitHub 下载'],
    ['win32', '下载更新', '新版本 0.6.0 已发布，是否现在下载？'],
    ['linux', '下载更新', '新版本 0.6.0 已发布，是否现在下载？']
  ])(
    'describes the update action on %s and waits for confirmation',
    async (platform, label, text) => {
      const requestConfirmation = vi.fn<(request: ConfirmationRequest) => void>()
      const download = vi.fn(async () => undefined)
      const removeListener = vi.fn()
      vi.stubGlobal('window', {
        ossBrowser: {
          system: {
            platform,
            getVersion: async () => '0.5.12',
            getReleaseNotes: async () => '当前版本说明'
          },
          updates: {
            getState: async () => ({
              status: 'available',
              version: '0.6.0',
              releaseNotes: '新版本说明'
            }),
            download
          },
          onUpdate: () => removeListener
        }
      })
      const updates = useAppUpdates(requestConfirmation)
      await updates.initializeUpdates()
      expect(updates.updateButtonLabel.value).toBe(label)
      expect(updates.updateDescription.value).toBe(
        platform === 'darwin' ? '发现新版本 0.6.0，请前往 GitHub 下载' : '发现新版本 0.6.0'
      )
      expect(requestConfirmation).toHaveBeenCalledOnce()
      const request = requestConfirmation.mock.calls[0][0]
      expect(request).toMatchObject({
        title: '发现新版本',
        description: text,
        details: '新版本说明',
        confirmLabel: label
      })
      expect(download).not.toHaveBeenCalled()
      await request.action()
      expect(download).toHaveBeenCalledOnce()
      updates.disposeUpdates()
      expect(removeListener).toHaveBeenCalledOnce()
    }
  )
})
