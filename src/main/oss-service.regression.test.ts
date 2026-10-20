import OSS from 'ali-oss'
import { app } from 'electron'
import { link, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_APP_SETTINGS } from '../shared/app-settings'
import type { AuthConfig, ObjectInfo, TransferItem } from '../shared/types'
import { OssService } from './oss-service'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => tmpdir()) }, nativeImage: {} }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename), link: vi.fn(actual.link) }
})

const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

async function directory(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'oss-browser-regression-'))
  directories.push(value)
  vi.mocked(app.getPath).mockReturnValue(value)
  return value
}

const file: ObjectInfo = { name: 'file.txt', displayName: 'file.txt', size: 6, isDirectory: false }

function installClient(service: OssService, client: Record<string, unknown>): void {
  vi.spyOn(service as unknown as { bucketClient: () => unknown }, 'bucketClient').mockReturnValue(
    client
  )
}

function downloadClient(): {
  cancel: ReturnType<typeof vi.fn>
  getObjectMeta: ReturnType<typeof vi.fn>
  getStream: ReturnType<typeof vi.fn>
} {
  return {
    cancel: vi.fn(),
    getObjectMeta: vi.fn(async () => ({
      res: { headers: { 'content-length': 6, etag: 'remote-etag' } }
    })),
    getStream: vi.fn(async () => ({ stream: Readable.from([Buffer.from('remote')]) }))
  }
}

describe('download protection and session isolation', () => {
  it.each([0, 6])('preserves independent sidecar files when downloading %i bytes', async (size) => {
    const destination = await directory()
    const partialPath = join(destination, 'file.txt.ossbrowser.part')
    const sidecarPath = `${partialPath}.json`
    await writeFile(partialPath, 'independent file')
    await writeFile(sidecarPath, 'independent json')
    const confirm = vi.fn(async () => false)
    const service = new OssService(vi.fn(), confirm)
    const client = downloadClient()
    client.getObjectMeta.mockResolvedValue({
      res: { headers: { 'content-length': size, etag: 'remote-etag' } }
    })
    installClient(service, client)

    expect(await service.download('bucket', [{ ...file, size }], destination)).toBe(true)
    expect(await readFile(partialPath, 'utf8')).toBe('independent file')
    expect(await readFile(sidecarPath, 'utf8')).toBe('independent json')
    expect(await readFile(join(destination, 'file.txt'), 'utf8')).toBe(size ? 'remote' : '')
    expect(confirm).not.toHaveBeenCalled()
    expect(
      (await readdir(destination)).filter((name) => name.startsWith('.oss-browser-download-'))
    ).toEqual([])
  })

  it('rejects concurrent writes to one destination without disturbing the active download', async () => {
    const destination = await directory()
    const pending = deferred<{ stream: Readable }>()
    const started = deferred<void>()
    const service = new OssService(vi.fn())
    const client = downloadClient()
    client.getStream.mockImplementationOnce(() => {
      started.resolve()
      return pending.promise
    })
    installClient(service, client)
    const first = service.download('bucket', [file], destination)
    await started.promise
    const second = await service.download('another-bucket', [file], destination)
    pending.resolve({ stream: Readable.from([Buffer.from('remote')]) })

    expect(second).toBe(false)
    expect(await first).toBe(true)
    expect(client.getObjectMeta).toHaveBeenCalledOnce()
    expect(await readFile(join(destination, 'file.txt'), 'utf8')).toBe('remote')
  })

  it.runIf(process.platform === 'win32')(
    'rejects Windows destination aliases before writing files',
    async () => {
      const destination = await directory()
      const service = new OssService(vi.fn())
      const client = downloadClient()
      installClient(service, client)
      await expect(
        service.download(
          'bucket',
          [
            { ...file, name: 'one', displayName: 'folder/file.txt' },
            { ...file, name: 'two', displayName: 'FOLDER\\FILE.TXT' }
          ],
          destination
        )
      ).rejects.toThrow('多个下载对象指向同一本地文件')
      expect(client.getObjectMeta).not.toHaveBeenCalled()
    }
  )

  it('resumes completed ranges from an owned workspace in a new service instance', async () => {
    const destination = await directory()
    const partSize = 1024 * 1024
    const first = new OssService(vi.fn())
    first.updateSettings({ ...DEFAULT_APP_SETTINGS, partSizeMb: 1, multipartParallel: 1 })
    const firstClient = {
      cancel: vi.fn(),
      getObjectMeta: vi.fn(async () => ({
        res: { headers: { 'content-length': partSize + 3, etag: 'v1' } }
      })),
      getStream: vi
        .fn()
        .mockResolvedValueOnce({ stream: Readable.from([Buffer.alloc(partSize, 65)]) })
        .mockRejectedValueOnce(new Error('network interrupted'))
    }
    installClient(first, firstClient)
    expect(await first.download('bucket', [file], destination)).toBe(false)

    const second = new OssService(vi.fn())
    const secondClient = {
      ...firstClient,
      getStream: vi.fn(async () => ({ stream: Readable.from([Buffer.from('end')]) }))
    }
    installClient(second, secondClient)
    expect(await second.download('bucket', [file], destination)).toBe(true)
    expect(secondClient.getStream).toHaveBeenCalledExactlyOnceWith('file.txt', {
      headers: { Range: `bytes=${partSize}-${partSize + 2}`, 'If-Match': 'v1' }
    })
    const content = await readFile(join(destination, 'file.txt'))
    expect(content.subarray(0, partSize).equals(Buffer.alloc(partSize, 65))).toBe(true)
    expect(content.subarray(partSize).toString()).toBe('end')
    expect(await readdir(join(destination, 'download-checkpoints'))).toEqual([])
  })

  it('does not reuse a workspace whose ownership marker does not match', async () => {
    const destination = await directory()
    const first = new OssService(vi.fn())
    const client = downloadClient()
    client.getStream.mockRejectedValueOnce(new Error('network interrupted'))
    installClient(first, client)
    expect(await first.download('bucket', [file], destination)).toBe(false)
    const [checkpointName] = await readdir(join(destination, 'download-checkpoints'))
    const checkpoint = JSON.parse(
      await readFile(join(destination, 'download-checkpoints', checkpointName), 'utf8')
    )
    await writeFile(join(checkpoint.directory, 'owner'), 'another owner')
    await writeFile(join(checkpoint.directory, 'data.part'), 'independent data')

    const second = new OssService(vi.fn())
    installClient(second, downloadClient())
    expect(await second.download('bucket', [file], destination)).toBe(true)
    expect(await readFile(join(checkpoint.directory, 'data.part'), 'utf8')).toBe('independent data')
    expect(await readFile(join(checkpoint.directory, 'owner'), 'utf8')).toBe('another owner')
  })

  it('restarts an owned checkpoint with malformed ranges', async () => {
    const destination = await directory()
    const first = new OssService(vi.fn())
    const client = downloadClient()
    client.getStream.mockRejectedValueOnce(new Error('network interrupted'))
    installClient(first, client)
    expect(await first.download('bucket', [file], destination)).toBe(false)
    const [checkpointName] = await readdir(join(destination, 'download-checkpoints'))
    const checkpointPath = join(destination, 'download-checkpoints', checkpointName)
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'))
    await writeFile(checkpointPath, JSON.stringify({ ...checkpoint, completed: [null] }))
    const second = new OssService(vi.fn())
    installClient(second, downloadClient())
    expect(await second.download('bucket', [file], destination)).toBe(true)
    expect(await readFile(join(destination, 'file.txt'), 'utf8')).toBe('remote')
    await expect(stat(checkpoint.directory)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('stops directory pagination when the account changes during a page request', async () => {
    const destination = await directory()
    const pending = deferred<{
      objects: { name: string }[]
      isTruncated: boolean
      nextMarker: string
    }>()
    const started = deferred<void>()
    const list = vi
      .fn()
      .mockImplementationOnce(() => {
        started.resolve()
        return pending.promise
      })
      .mockResolvedValueOnce({ objects: [], isTruncated: false })
    const service = new OssService(vi.fn())
    installClient(service, { list })
    const download = service.download(
      'bucket',
      [{ ...file, name: 'folder/', displayName: 'folder', isDirectory: true }],
      destination
    )
    await started.promise
    service.disconnect()
    pending.resolve({
      objects: [{ name: 'folder/file.txt' }],
      isTruncated: true,
      nextMarker: 'next'
    })
    expect(await download).toBe(false)
    expect(list).toHaveBeenCalledOnce()
  })
  it('commits without overwrite on volumes that cannot create hard links', async () => {
    const destination = await directory()
    const service = new OssService(vi.fn())
    installClient(service, downloadClient())
    vi.mocked(link).mockRejectedValueOnce(
      Object.assign(new Error('unsupported'), { code: 'ENOTSUP' })
    )
    expect(await service.download('bucket', [file], destination)).toBe(true)
    expect(await readFile(join(destination, 'file.txt'), 'utf8')).toBe('remote')
    await expect(stat(join(destination, 'file.txt.ossbrowser.part'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })
  it('preserves the original file if an approved replacement cannot be committed', async () => {
    const destination = await directory()
    const localPath = join(destination, 'file.txt')
    await writeFile(localPath, 'original')
    const service = new OssService(vi.fn(), async () => true)
    installClient(service, downloadClient())
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(rename).mockImplementation(async (source, target) => {
      if (target === localPath) throw Object.assign(new Error('rename denied'), { code: 'EACCES' })
      await actual.rename(source, target)
    })
    expect(await service.download('bucket', [file], destination)).toBe(false)
    expect(await readFile(localPath, 'utf8')).toBe('original')
    const [checkpointName] = await readdir(join(destination, 'download-checkpoints'))
    const checkpoint = JSON.parse(
      await readFile(join(destination, 'download-checkpoints', checkpointName), 'utf8')
    )
    expect(await readFile(join(checkpoint.directory, 'data.part'), 'utf8')).toBe('remote')
  })
  it('keeps the original local file and makes no download request when overwrite is declined', async () => {
    const destination = await directory()
    const localPath = join(destination, 'file.txt')
    await writeFile(localPath, 'original')
    const confirm = vi.fn(async () => false)
    const service = new OssService(vi.fn(), confirm)
    const client = downloadClient()
    installClient(service, client)

    expect(await service.download('bucket', [file], destination)).toBe(false)
    expect(confirm).toHaveBeenCalledExactlyOnceWith([localPath])
    expect(await readFile(localPath, 'utf8')).toBe('original')
    expect(client.getObjectMeta).not.toHaveBeenCalled()
    expect(client.getStream).not.toHaveBeenCalled()
  })

  it('replaces only confirmed existing files', async () => {
    const destination = await directory()
    const localPath = join(destination, 'file.txt')
    await writeFile(localPath, 'original')
    const confirm = vi.fn(async () => true)
    const service = new OssService(vi.fn(), confirm)
    installClient(service, downloadClient())

    expect(await service.download('bucket', [file], destination)).toBe(true)
    expect(confirm).toHaveBeenCalledExactlyOnceWith([localPath])
    expect(await readFile(localPath, 'utf8')).toBe('remote')
  })

  it('does not overwrite a file created after conflict inspection', async () => {
    const destination = await directory()
    const localPath = join(destination, 'file.txt')
    const client = downloadClient()
    client.getStream.mockImplementation(async () => {
      await writeFile(localPath, 'created meanwhile')
      return { stream: Readable.from([Buffer.from('remote')]) }
    })
    const confirm = vi.fn(async () => true)
    const service = new OssService(vi.fn(), confirm)
    installClient(service, client)

    expect(await service.download('bucket', [file], destination)).toBe(false)
    expect(await readFile(localPath, 'utf8')).toBe('created meanwhile')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('does not create a new-account transfer after old directory discovery finishes', async () => {
    const destination = await directory()
    const pending = deferred<{ objects: { name: string }[]; isTruncated: boolean }>()
    const started = deferred<void>()
    const reports = vi.fn()
    const service = new OssService(reports)
    const oldClient = {
      list: vi.fn(() => {
        started.resolve()
        return pending.promise
      })
    }
    installClient(service, oldClient)
    const download = service.download(
      'bucket',
      [{ ...file, name: 'folder/', displayName: 'folder', isDirectory: true }],
      destination
    )
    await started.promise
    service.disconnect()
    const nextClient = downloadClient()
    installClient(service, nextClient)
    pending.resolve({ objects: [{ name: 'folder/file.txt' }], isTruncated: false })

    expect(await download).toBe(false)
    expect(nextClient.getObjectMeta).not.toHaveBeenCalled()
    expect(nextClient.getStream).not.toHaveBeenCalled()
    expect(reports).not.toHaveBeenCalled()
    await expect(stat(join(destination, 'folder'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('ignores an overwrite approval after the account changes', async () => {
    const destination = await directory()
    const localPath = join(destination, 'file.txt')
    await writeFile(localPath, 'original')
    const approval = deferred<boolean>()
    const prompted = deferred<void>()
    const confirm = vi.fn(() => {
      prompted.resolve()
      return approval.promise
    })
    const service = new OssService(vi.fn(), confirm)
    const client = downloadClient()
    installClient(service, client)
    const download = service.download('bucket', [file], destination)
    await Promise.race([prompted.promise, download])
    expect(confirm).toHaveBeenCalledOnce()
    service.disconnect()
    approval.resolve(true)

    expect(await download).toBe(false)
    expect(await readFile(localPath, 'utf8')).toBe('original')
    expect(client.getObjectMeta).not.toHaveBeenCalled()
  })
})

describe('global file transfer limits', () => {
  it('pauses queued files and resumes within the global limit', async () => {
    const service = new OssService(vi.fn())
    service.updateSettings({ ...DEFAULT_APP_SETTINGS, maxUploadJobs: 1 })
    const controls = service as unknown as {
      newTransferBatch: (direction: TransferItem['direction'], total: number) => unknown
      newTransfer: (direction: TransferItem['direction'], name: string, batch: unknown) => unknown
      runControlledTransfer: (
        transfer: unknown,
        client: unknown,
        operation: () => Promise<void>
      ) => Promise<void>
    }
    const started = deferred<void>()
    const cancelled = deferred<void>()
    const firstOperation = vi
      .fn()
      .mockImplementationOnce(async () => {
        started.resolve()
        await cancelled.promise
      })
      .mockResolvedValueOnce(undefined)
    const secondOperation = vi.fn(async () => undefined)
    const first = controls.runControlledTransfer(
      controls.newTransfer('upload', 'first', controls.newTransferBatch('upload', 1)),
      { cancel: () => cancelled.resolve() },
      firstOperation
    )
    await started.promise
    const second = controls.runControlledTransfer(
      controls.newTransfer('upload', 'second', controls.newTransferBatch('upload', 1)),
      { cancel: vi.fn() },
      secondOperation
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    service.pauseAllTransfers('upload')
    await new Promise<void>((resolve) => setImmediate(resolve))
    try {
      expect(secondOperation).not.toHaveBeenCalled()
    } finally {
      service.resumeAllTransfers('upload')
      await Promise.all([first, second])
    }
    expect(firstOperation).toHaveBeenCalledTimes(2)
    expect(secondOperation).toHaveBeenCalledOnce()
  })
  it.each(['upload', 'download'] as const)(
    'limits multiple %s batches together',
    async (direction) => {
      const service = new OssService(vi.fn())
      service.updateSettings({ ...DEFAULT_APP_SETTINGS, maxUploadJobs: 1, maxDownloadJobs: 1 })
      const controls = service as unknown as {
        newTransferBatch: (direction: TransferItem['direction'], total: number) => unknown
        newTransfer: (direction: TransferItem['direction'], name: string, batch: unknown) => unknown
        runControlledTransfer: (
          transfer: unknown,
          client: unknown,
          operation: () => Promise<void>
        ) => Promise<void>
      }
      const firstStarted = deferred<void>()
      const release = deferred<void>()
      const firstOperation = vi.fn(async () => {
        firstStarted.resolve()
        await release.promise
      })
      const secondOperation = vi.fn(async () => undefined)
      const client = { cancel: vi.fn() }
      const first = controls.runControlledTransfer(
        controls.newTransfer(direction, 'first', controls.newTransferBatch(direction, 1)),
        client,
        firstOperation
      )
      await firstStarted.promise
      const second = controls.runControlledTransfer(
        controls.newTransfer(direction, 'second', controls.newTransferBatch(direction, 1)),
        client,
        secondOperation
      )
      await new Promise<void>((resolve) => setImmediate(resolve))
      try {
        expect(secondOperation).not.toHaveBeenCalled()
      } finally {
        release.resolve()
        await Promise.all([first, second])
      }
      expect(firstOperation).toHaveBeenCalledOnce()
      expect(secondOperation).toHaveBeenCalledOnce()
    }
  )

  it('settles a cancelled queued transfer without waiting for the running file', async () => {
    const service = new OssService(vi.fn())
    service.updateSettings({ ...DEFAULT_APP_SETTINGS, maxUploadJobs: 1 })
    const controls = service as unknown as {
      newTransferBatch: (direction: TransferItem['direction'], total: number) => unknown
      newTransfer: (
        direction: TransferItem['direction'],
        name: string,
        batch: unknown
      ) => { id: string }
      runControlledTransfer: (
        transfer: unknown,
        client: unknown,
        operation: () => Promise<void>
      ) => Promise<void>
    }
    const started = deferred<void>()
    const release = deferred<void>()
    const firstTransfer = controls.newTransfer(
      'upload',
      'first',
      controls.newTransferBatch('upload', 1)
    )
    const secondTransfer = controls.newTransfer(
      'upload',
      'second',
      controls.newTransferBatch('upload', 1)
    )
    const first = controls.runControlledTransfer(firstTransfer, { cancel: vi.fn() }, async () => {
      started.resolve()
      await release.promise
    })
    await started.promise
    const secondOperation = vi.fn(async () => undefined)
    const second = controls.runControlledTransfer(
      secondTransfer,
      { cancel: vi.fn() },
      secondOperation
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    service.cancelTransfer(secondTransfer.id)
    try {
      await second
      expect(secondOperation).not.toHaveBeenCalled()
    } finally {
      release.resolve()
      await first
    }
  })
})

describe('region and HTTP header contracts', () => {
  it.each([
    [
      'public',
      'oss-cn-hangzhou.aliyuncs.com',
      'oss-cn-shanghai',
      'test-bucket.oss-cn-shanghai.aliyuncs.com'
    ],
    ['custom', 'https://custom.example.com', '', 'test-bucket.custom.example.com'],
    ['cname', 'assets.example.com', '', 'assets.example.com'],
    [
      'private',
      'oss-cn-shanghai-internal.aliyuncs.com',
      '',
      'test-bucket.oss-cn-shanghai-internal.aliyuncs.com'
    ]
  ] as const)(
    'uses the SDK host as the default domain for %s endpoints',
    (endpointMode, endpoint, region, expected) => {
      const service = new OssService(vi.fn())
      const state = service as unknown as { auth: AuthConfig; bucketRegions: Map<string, string> }
      state.auth = {
        endpoint,
        endpointMode,
        accessKeyId: 'test-id',
        accessKeySecret: 'test-secret',
        secure: true,
        remember: false
      }
      if (region) state.bucketRegions.set('test-bucket', region)
      expect(service.defaultObjectDomain('test-bucket')).toBe(expected)
      expect(new URL(service.signedUrl('test-bucket', 'file.txt', 60)).host).toBe(expected)
    }
  )

  it('does not clear a newer connection when an old bucket listing fails', async () => {
    let rejectOld!: (error: Error) => void
    const old = new Promise<unknown>((_resolve, reject) => {
      rejectOld = reject
    })
    vi.spyOn(OSS.prototype as unknown as { listBuckets: () => Promise<unknown> }, 'listBuckets')
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce({ buckets: [{ name: 'new-bucket', region: 'oss-cn-shanghai' }] })
    const service = new OssService(vi.fn())
    const config: AuthConfig = {
      endpoint: 'oss-cn-hangzhou.aliyuncs.com',
      endpointMode: 'public',
      accessKeyId: 'old-key',
      accessKeySecret: 'test-secret',
      secure: true,
      remember: false
    }
    const oldConnection = service.connect(config)
    await service.connect({ ...config, accessKeyId: 'new-key' })
    const rejected = expect(oldConnection).rejects.toThrow('old request failed')
    rejectOld(new Error('old request failed'))
    await rejected
    expect((service as unknown as { auth: AuthConfig }).auth.accessKeyId).toBe('new-key')
  })
  it.each([
    ['public', 'https://new-bucket.oss-cn-shanghai.aliyuncs.com/'],
    ['private', 'https://new-bucket.oss-cn-shanghai-internal.aliyuncs.com/']
  ] as const)(
    'creates a Shanghai bucket through the selected %s endpoint',
    async (endpointMode, url) => {
      const service = new OssService(vi.fn())
      ;(service as unknown as { auth: AuthConfig }).auth = {
        endpoint: 'oss-cn-hangzhou.aliyuncs.com',
        endpointMode,
        accessKeyId: 'audit-key',
        accessKeySecret: 'audit-secret',
        secure: true,
        remember: false
      }
      const urls: string[] = []
      const request = vi.spyOn(
        OSS.prototype as unknown as { request: (params: unknown) => Promise<unknown> },
        'request'
      )
      request.mockImplementation(async function (
        this: { _getReqUrl: (params: unknown) => string },
        params
      ) {
        urls.push(this._getReqUrl(params))
        return { headers: {}, res: {} }
      })
      await service.createBucket('new-bucket', 'oss-cn-shanghai', 'public-read')
      expect(urls[0]).toBe(url)
      expect(urls.every((value) => value.startsWith(url))).toBe(true)
      expect(request).toHaveBeenCalledOnce()
      expect(request.mock.calls[0][0]).toMatchObject({ headers: { 'x-oss-acl': 'public-read' } })
    }
  )

  it('deletes explicitly cleared headers while preserving other headers, metadata and the ETag condition', async () => {
    const service = new OssService(vi.fn())
    const client = {
      head: vi.fn(async () => ({
        meta: { owner: 'operations' },
        res: {
          headers: {
            etag: '"old-etag"',
            'cache-control': 'max-age=60',
            'content-disposition': 'attachment',
            'content-type': 'text/plain',
            'content-encoding': 'gzip'
          }
        }
      })),
      copy: vi.fn(async () => undefined)
    }
    installClient(service, client)
    await service.setObjectHeaders('bucket', 'file.txt', {
      'Cache-Control': null,
      'Content-Disposition': null
    })
    expect(client.copy).toHaveBeenCalledExactlyOnceWith('file.txt', 'file.txt', {
      meta: { owner: 'operations' },
      headers: {
        'content-type': 'text/plain',
        'content-encoding': 'gzip',
        'If-Match': '"old-etag"'
      }
    })
  })
})
