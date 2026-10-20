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
  defaultDomain: ReturnType<typeof vi.fn>
  domains: ReturnType<typeof vi.fn>
  signedUrl: ReturnType<typeof vi.fn>
}> {
  const setHeaders = vi.fn(async () => undefined)
  const pickDownloadFolder = vi.fn(async () => '/tmp/download')
  const download = vi.fn(async () => true)
  const defaultDomain = vi.fn(async () => 'bucket.custom.example.com')
  const domains = vi.fn(async () => ['assets.example.com'])
  const signedUrl = vi.fn(async () => 'https://bucket.custom.example.com/file.txt?Signature=test')
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  vi.stubGlobal('document', { documentElement: { dataset: {} } })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    ossBrowser: {
      system: { platform: 'darwin' },
      objects: {
        defaultDomain,
        domains,
        signedUrl,
        isPublic: vi.fn(async () => false),
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
  return { controller, setHeaders, pickDownloadFolder, download, defaultDomain, domains, signedUrl }
}

describe('object action contracts', () => {
  it('uses the configured default domain with no region and ignores an invalid remembered domain', async () => {
    const { controller, defaultDomain, signedUrl } = await fixture()
    vi.spyOn(localStorage, 'getItem').mockImplementation((key) =>
      key.startsWith('oss-browser-domain:') ? 'bucket..aliyuncs.com' : null
    )
    controller.handleObjectAction('share')
    await vi.waitFor(() => expect(controller.sharePreparing.value).toBe(false))
    expect(defaultDomain).toHaveBeenCalledExactlyOnceWith('bucket')
    expect(controller.domainOptions.value).toEqual([
      'bucket.custom.example.com',
      'assets.example.com'
    ])
    expect(controller.selectedDomain.value).toBe('bucket.custom.example.com')
    await controller.createShareLink()
    expect(controller.previewUrl.value).toBe(await signedUrl.mock.results[0].value)
  })

  it('keeps the default address when domain discovery is denied and permits an explicit CNAME', async () => {
    const { controller, domains } = await fixture()
    domains.mockRejectedValueOnce(new Error('AccessDenied'))
    controller.handleObjectAction('share')
    await vi.waitFor(() => expect(controller.sharePreparing.value).toBe(false))
    expect(controller.domainOptions.value).toEqual(['bucket.custom.example.com'])
    await controller.createShareLink()
    expect(controller.previewUrl.value).toBe(
      'https://bucket.custom.example.com/file.txt?Signature=test'
    )
    controller.selectedDomain.value = 'assets.example.com'
    await controller.createShareLink()
    expect(controller.previewUrl.value).toBe('https://assets.example.com/file.txt?Signature=test')
  })

  it('uses the configured host for unsigned public addresses', async () => {
    const { controller, signedUrl } = await fixture()
    vi.spyOn(window.ossBrowser.objects, 'isPublic').mockResolvedValue(true)
    controller.handleObjectAction('share')
    await vi.waitFor(() => expect(controller.sharePreparing.value).toBe(false))
    expect(controller.previewUrl.value).toBe('https://bucket.custom.example.com/file.txt')
    expect(signedUrl).not.toHaveBeenCalled()
  })

  it('reports default-domain failures and does not generate a link with stale domain state', async () => {
    const { controller, defaultDomain, signedUrl } = await fixture()
    controller.selectedDomain.value = 'stale.example.com'
    defaultDomain.mockRejectedValueOnce(new Error('domain unavailable'))
    controller.handleObjectAction('share')
    await vi.waitFor(() => expect(controller.sharePreparing.value).toBe(false))
    expect(controller.errorMessage.value).toBe('domain unavailable')
    expect(controller.selectedDomain.value).toBe('')
    await controller.createShareLink()
    expect(controller.previewUrl.value).toBe('')
    expect(signedUrl).not.toHaveBeenCalled()
  })

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
