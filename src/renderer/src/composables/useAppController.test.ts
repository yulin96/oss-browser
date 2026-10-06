import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppController, type AppController } from './useAppController'

vi.mock('../i18n', () => ({ t: (key: string) => key, setLocale: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

async function fixture(): Promise<{
  controller: AppController
  setHeaders: ReturnType<typeof vi.fn>
  pickDownloadFolder: ReturnType<typeof vi.fn>
  download: ReturnType<typeof vi.fn>
}> {
  const setHeaders = vi.fn(async () => undefined)
  const pickDownloadFolder = vi.fn(async () => '/tmp/download')
  const download = vi.fn(async () => true)
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  vi.stubGlobal('document', { documentElement: { dataset: {} } })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    ossBrowser: {
      system: { platform: 'darwin' },
      objects: {
        details: async () => ({
          headers: {
            'cache-control': 'max-age=60',
            'content-type': 'text/plain',
            'content-disposition': 'attachment'
          },
          metadata: {}
        }),
        setHeaders
      },
      files: { pickDownloadFolder, download },
      profiles: {
        connect: async () => ({
          profile: {
            id: 'new-endpoint|new-key',
            label: 'new account',
            endpoint: 'new-endpoint',
            endpointMode: 'custom',
            accessKeyId: 'new-key',
            secure: true,
            remember: false,
            hasCdnCredentials: false
          },
          buckets: []
        })
      }
    }
  })
  let controller!: AppController
  await renderToString(
    createSSRApp({
      setup() {
        controller = useAppController()
        return () => null
      }
    })
  )
  controller.currentBucket.value = { name: 'bucket', region: '' }
  controller.objects.value = [
    { name: 'file.txt', displayName: 'file.txt', size: 1, isDirectory: false }
  ]
  controller.selectedNames.value = new Set(['file.txt'])
  return { controller, setHeaders, pickDownloadFolder, download }
}

describe('object action contracts', () => {
  it('submits null to delete cleared single-object headers', async () => {
    const { controller, setHeaders } = await fixture()
    controller.handleObjectAction('headers')
    await vi.waitFor(() => expect(controller.modal.value).toBe('headers'))
    controller.objectForm.cacheControl = ''
    controller.objectForm.contentDisposition = ''
    await controller.applyHeaders()
    expect(setHeaders).toHaveBeenCalledExactlyOnceWith('bucket', 'file.txt', {
      'Cache-Control': null,
      'Content-Type': 'text/plain',
      'Content-Disposition': null
    })
  })

  it('keeps blank headers unchanged when editing multiple objects', async () => {
    const { controller, setHeaders } = await fixture()
    controller.objects.value.push({
      name: 'second.txt',
      displayName: 'second.txt',
      size: 1,
      isDirectory: false
    })
    controller.selectedNames.value = new Set(['file.txt', 'second.txt'])
    controller.handleObjectAction('headers')
    await vi.waitFor(() => expect(controller.modal.value).toBe('headers'))
    controller.objectForm.cacheControl = 'no-cache'
    await controller.applyHeaders()
    expect(setHeaders.mock.calls).toEqual([
      ['bucket', 'file.txt', { 'Cache-Control': 'no-cache' }],
      ['bucket', 'second.txt', { 'Cache-Control': 'no-cache' }]
    ])
  })

  it('does not start a download selected before an account switch', async () => {
    const { controller, pickDownloadFolder, download } = await fixture()
    let choose!: (path: string) => void
    pickDownloadFolder.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          choose = resolve
        })
    )
    const pending = controller.downloadSelected()
    await controller.useProfile({
      id: 'new-endpoint|new-key',
      label: 'new account',
      endpoint: 'new-endpoint',
      endpointMode: 'custom',
      accessKeyId: 'new-key',
      secure: true,
      remember: false,
      hasCdnCredentials: false
    })
    choose('/tmp/download')
    await pending
    expect(download).not.toHaveBeenCalled()
  })
})
