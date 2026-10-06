import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCloudOperations } from './useCloudOperations'
import type { ConfirmationRequest } from './useConfirmation'

vi.mock('../i18n', () => ({ t: (key: string) => key }))
afterEach(() => vi.unstubAllGlobals())

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function fixture(): {
  cloud: ReturnType<typeof useCloudOperations>
  setModal: ReturnType<typeof vi.fn>
  setError: ReturnType<typeof vi.fn>
  requestConfirmation: ReturnType<typeof vi.fn<(request: ConfirmationRequest) => void>>
} {
  const setModal = vi.fn()
  const setError = vi.fn()
  const requestConfirmation = vi.fn<(request: ConfirmationRequest) => void>()
  const cloud = useCloudOperations({
    runCloudTask: (task) => task(),
    requestConfirmation,
    getBucket: () => ({ name: 'bucket', region: '' }),
    getSelectedObjects: () => [
      { name: 'file.txt', displayName: 'file.txt', size: 1, isDirectory: false }
    ],
    ramForm: { ramUserName: '', ramDisplayName: '', ramComments: '' },
    setModal,
    getError: () => '',
    setError
  })
  return { cloud, setModal, setError, requestConfirmation }
}

describe('cloud operation account isolation', () => {
  it.each([
    [false, 1],
    [true, 0]
  ] as const)(
    'only executes a RAM deletion confirmation for its original account, reset=%s',
    async (reset, calls) => {
      const removeUser = vi.fn(async () => undefined)
      vi.stubGlobal('window', { ossBrowser: { ram: { removeUser, listUsers: async () => [] } } })
      const { cloud, requestConfirmation } = fixture()
      cloud.removeRamUser({ userName: 'old-user' })
      const request = requestConfirmation.mock.calls[0][0]
      if (reset) cloud.resetCloudOperations()
      await request.action()
      expect(removeUser).toHaveBeenCalledTimes(calls)
    }
  )
  it('drops RAM users returned by the previous account', async () => {
    const pending = deferred<{ userName: string }[]>()
    vi.stubGlobal('window', { ossBrowser: { ram: { listUsers: () => pending.promise } } })
    const { cloud, setModal } = fixture()
    const request = cloud.openRamUsers()
    cloud.resetCloudOperations()
    pending.resolve([{ userName: 'old-account-user' }])
    await request
    expect(cloud.ramUsers.value).toEqual([])
    expect(setModal).not.toHaveBeenCalled()
  })

  it('drops object details returned after account reset', async () => {
    const pending = deferred<{
      headers: Record<string, string>
      metadata: Record<string, string>
    }>()
    vi.stubGlobal('window', { ossBrowser: { objects: { details: () => pending.promise } } })
    const { cloud, setModal } = fixture()
    const request = cloud.showDetails()
    cloud.resetCloudOperations()
    pending.resolve({ headers: { etag: 'old' }, metadata: { owner: 'old-account' } })
    await request
    expect(cloud.objectDetails.value).toBeNull()
    expect(setModal).not.toHaveBeenCalled()
  })

  it('does not request access keys in the new account after creating an old-account key', async () => {
    const pending = deferred<{ accessKeyId: string; accessKeySecret: string }>()
    const listAccessKeys = vi.fn(async () => [])
    vi.stubGlobal('window', {
      ossBrowser: { ram: { createAccessKey: () => pending.promise, listAccessKeys } }
    })
    const { cloud } = fixture()
    cloud.editRamUser({ userName: 'old-user' })
    const request = cloud.createRamAccessKey()
    cloud.resetCloudOperations()
    pending.resolve({ accessKeyId: 'old-key', accessKeySecret: 'test-secret' })
    await request
    expect(cloud.createdAccessKey.value).toBeNull()
    expect(cloud.ramAccessKeys.value).toEqual([])
    expect(listAccessKeys).not.toHaveBeenCalled()
  })
})
