import { afterEach, describe, expect, it, vi } from 'vitest'
import { FloatingUploadManager } from './floating-upload-manager'
import type { OssService } from './oss-service'
import type { FloatingUploadStore } from './floating-upload-store'
import type { FloatingUploadTarget } from '../shared/types'

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Menu: {},
  Tray: {},
  nativeImage: {},
  screen: {}
}))

afterEach(() => vi.restoreAllMocks())

const oldTarget: FloatingUploadTarget = { accountId: 'A', bucket: 'old-bucket', prefix: '' }
const newTarget: FloatingUploadTarget = { accountId: 'B', bucket: 'new-bucket', prefix: '' }

describe('floating upload account ownership', () => {
  it('ignores saved target settings returned by an older account connection', async () => {
    let finish!: (settings: { target: FloatingUploadTarget; enabled: boolean }) => void
    const get = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce({ target: newTarget, enabled: false })
    const manager = new FloatingUploadManager(
      {} as OssService,
      { get } as unknown as FloatingUploadStore,
      () => null,
      vi.fn(),
      vi.fn()
    )
    const old = manager.setAccount('A')
    await manager.setAccount('B')
    finish({ target: oldTarget, enabled: false })
    await old
    expect(manager.getState().target).toEqual(newTarget)
  })

  it('does not replace the new account state when an old upload finishes', async () => {
    let finish!: (result: boolean) => void
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    const get = vi
      .fn()
      .mockResolvedValueOnce({ target: oldTarget, enabled: false })
      .mockResolvedValueOnce({ target: newTarget, enabled: false })
    const oss = {
      getUploadConflictPolicy: () => 'replace',
      upload: () => {
        started()
        return new Promise<boolean>((resolve) => {
          finish = resolve
        })
      }
    }
    const manager = new FloatingUploadManager(
      oss as unknown as OssService,
      { get } as unknown as FloatingUploadStore,
      () => null,
      vi.fn(),
      vi.fn()
    )
    await manager.setAccount('A')
    const upload = manager.upload(['/tmp/old-file.txt'])
    await startedPromise
    await manager.setAccount('B')
    finish(false)
    await upload
    expect(manager.getState()).toMatchObject({
      target: newTarget,
      status: 'idle',
      total: 0,
      progress: 0
    })
  })
})
