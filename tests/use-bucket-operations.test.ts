import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../src/renderer/src/i18n', () => ({ t: (key: string) => key }))
import { useBucketOperations } from '../src/renderer/src/composables/useBucketOperations'
import type { BucketInfo } from '../src/shared/types'
import type { ConfirmationRequest } from '../src/renderer/src/composables/useConfirmation'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('confirms only older uploads, refreshes the list and reports partial failures', async () => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const bucket = { name: 'bucket' } as BucketInfo
  const old = { name: 'old', uploadId: 'old', initiated: new Date(now - 7200000).toISOString() }
  const recent = { name: 'recent', uploadId: 'recent', initiated: new Date(now).toISOString() }
  const unknown = { name: 'unknown', uploadId: 'unknown' }
  const listMultipart = vi
    .fn()
    .mockResolvedValueOnce([old, recent, unknown])
    .mockResolvedValue([old, recent, unknown])
  const abortMultipartBatch = vi
    .fn()
    .mockResolvedValue({ aborted: 0, skipped: 0, failed: [{ ...old, error: 'AccessDenied' }] })
  vi.stubGlobal('window', { ossBrowser: { buckets: { listMultipart, abortMultipartBatch } } })
  let confirmation: ConfirmationRequest | undefined
  const state = useBucketOperations({
    form: { name: '', region: '', acl: '' },
    run: (task) => task(),
    runBrowserTask: (task) => task(),
    requestConfirmation: (request) => {
      confirmation = request
    },
    getCurrentBucket: () => bucket,
    clearCurrentBucket: vi.fn(),
    refreshBuckets: vi.fn(),
    setModal: vi.fn(),
    closeBucketMenu: vi.fn(),
    invalidateAddressAccess: vi.fn(),
    getError: () => ''
  })
  await state.openMultipart(bucket)
  expect(state.oldMultipartCount.value).toBe(1)
  state.abortOldMultipart()
  expect(abortMultipartBatch).not.toHaveBeenCalled()
  expect(confirmation?.destructive).toBe(true)
  await confirmation?.action()
  expect(abortMultipartBatch).toHaveBeenCalledWith('bucket', [old])
  expect(listMultipart).toHaveBeenCalledTimes(2)
  expect(state.multipartResult.value).toContain('old: AccessDenied')
  expect(state.multipartBusy.value).toBe(false)
})
