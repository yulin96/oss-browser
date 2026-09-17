import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import OSS from 'ali-oss'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  nativeImage: { createFromPath: vi.fn() }
}))

import { OssService } from '../src/main/oss-service'
import { DEFAULT_APP_SETTINGS } from '../src/shared/app-settings'
import type { AuthConfig, ObjectInfo, TransferItem } from '../src/shared/types'

interface OssClientStub {
  list: ReturnType<typeof vi.fn>
  copy: ReturnType<typeof vi.fn>
  deleteMulti?: ReturnType<typeof vi.fn>
  get?: ReturnType<typeof vi.fn>
  head?: ReturnType<typeof vi.fn>
  signatureUrl?: ReturnType<typeof vi.fn>
  put?: ReturnType<typeof vi.fn>
  putStream?: ReturnType<typeof vi.fn>
  multipartUpload?: ReturnType<typeof vi.fn>
  cancel?: ReturnType<typeof vi.fn>
}

describe('upload byte progress', () => {
  it('reports small-file bytes before the upload response without changing the contents', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oss-browser-byte-progress-'))
    temporaryDirectories.push(directory)
    const localPath = join(directory, 'video.mp4')
    const contents = Buffer.alloc(512 * 1024, 37)
    await writeFile(localPath, contents)
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 101))
    const reports: TransferItem[] = []
    const service = new OssService((item) => reports.push(item))
    const putStream = vi.fn(async (_name: string, stream: Readable) => {
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(chunk)
      expect(Buffer.concat(chunks)).toEqual(contents)
      expect(reports.some((item) => item.progress > 0 && item.progress < 0.99)).toBe(true)
      expect(reports.at(-1)?.progress).toBe(0.99)
      expect(reports.every((item) => item.status === 'running')).toBe(true)
    })
    useClients(service, { bucket: { list: vi.fn(), copy: vi.fn(), putStream } })
    expect(await service.upload('bucket', '', [localPath])).toBe(true)
    expect(reports.at(-1)).toMatchObject({ status: 'done', progress: 1 })
  })

  it.each([false, true])(
    'tracks SDK streams with retries and checkpoint resume=%s',
    async (resume) => {
      const directory = await mkdtemp(join(tmpdir(), 'oss-browser-part-progress-'))
      temporaryDirectories.push(directory)
      const localPath = join(directory, 'video.mp4')
      const partSize = 1024 * 1024
      const contents = Buffer.alloc(partSize * 3, 53)
      await writeFile(localPath, contents)
      const checkpointPath = join(directory, 'checkpoint.json')
      if (resume) {
        await writeFile(
          checkpointPath,
          JSON.stringify({
            file: localPath,
            fileSize: contents.length,
            name: 'video.mp4',
            partSize,
            uploadId: 'test-upload',
            localFile: {
              mtimeMs: (await stat(localPath)).mtimeMs,
              ctimeMs: (await stat(localPath)).ctimeMs
            },
            doneParts: [{ number: 1, etag: 'part-1' }]
          })
        )
      }
      let now = Date.now()
      vi.spyOn(Date, 'now').mockImplementation(() => (now += 101))
      const reports: TransferItem[] = []
      const service = new OssService((item) => reports.push(item))
      service.updateSettings({ ...DEFAULT_APP_SETTINGS, partSizeMb: 1, multipartParallel: 2 })
      vi.spyOn(
        service as unknown as { checkpointPath: () => string },
        'checkpointPath'
      ).mockReturnValue(checkpointPath)
      const client = new OSS({
        region: 'oss-cn-hangzhou',
        accessKeyId: 'test',
        accessKeySecret: 'test',
        retryMax: 5
      })
      vi.spyOn(
        service as unknown as { bucketClient: () => typeof client },
        'bucketClient'
      ).mockReturnValue(client)
      client.initMultipartUpload = vi.fn().mockResolvedValue({ uploadId: 'test-upload', res: {} })
      const attempts = new Map<number, number>()
      const streamClient = client as typeof client & {
        _createStream: unknown
        _uploadPart: (
          name: string,
          id: string,
          part: number,
          data: { stream: Readable }
        ) => Promise<unknown>
      }
      const originalCreateStream = streamClient._createStream
      streamClient._uploadPart = async (_name, _id, part, { stream }) => {
        const attempt = (attempts.get(part) || 0) + 1
        attempts.set(part, attempt)
        const chunks: Buffer[] = []
        for await (const chunk of stream) {
          chunks.push(chunk)
          if (part === 2 && attempt === 1) {
            throw Object.assign(new Error('simulated connection failure'), { status: -1 })
          }
        }
        expect(Buffer.concat(chunks)).toEqual(
          contents.subarray((part - 1) * partSize, part * partSize)
        )
        return { res: { headers: { etag: `part-${part}` } } }
      }
      client.completeMultipartUpload = vi.fn().mockImplementation(async () => {
        expect(reports.every((item) => item.status === 'running' && item.progress <= 0.99)).toBe(
          true
        )
        expect(
          reports.some((item) => item.progress > (resume ? 1 / 3 : 0) && item.progress < 0.5)
        ).toBe(true)
        expect(reports.at(-1)?.progress).toBe(0.99)
        return {}
      })
      const completed = await service.upload('bucket', '', [localPath])
      expect(reports.filter((item) => item.status === 'error')).toEqual([])
      expect(completed).toBe(true)
      expect(attempts.get(2)).toBe(2)
      expect(attempts.has(1)).toBe(!resume)
      expect(streamClient._createStream).toBe(originalCreateStream)
      expect(reports.at(-1)).toMatchObject({ status: 'done', progress: 1 })
      expect(
        reports.some((item, index) => index > 0 && item.progress < reports[index - 1].progress)
      ).toBe(true)
    }
  )
})

describe('OssService object previews', () => {
  it('uses an opaque expiring token instead of exposing the signed object URL', () => {
    const service = new OssService(vi.fn())
    const client = {
      list: vi.fn(),
      copy: vi.fn(),
      signatureUrl: vi.fn().mockReturnValue('https://bucket.example/private.pdf?signature=secret')
    }
    useClients(service, { bucket: client })

    const previewUrl = service.prepareObjectPreview('bucket', 'private.pdf')
    const token = new URL(previewUrl).pathname.slice(1)

    expect(previewUrl).toMatch(/^oss-browser-media:\/\/object\/[0-9a-f-]+$/)
    expect(previewUrl).not.toContain('private.pdf')
    expect(service.resolveObjectPreview(token)).toBe(
      'https://bucket.example/private.pdf?signature=secret'
    )

    service.discardObjectPreview(token)
    expect(service.resolveObjectPreview(token)).toBeUndefined()
  })
})

interface CdnClientStub {
  describeUserDomains: ReturnType<typeof vi.fn>
  refreshObjectCaches: ReturnType<typeof vi.fn>
  describeRefreshQuota: ReturnType<typeof vi.fn>
  describeRefreshTaskById: ReturnType<typeof vi.fn>
  describeRefreshTasks: ReturnType<typeof vi.fn>
}

const temporaryDirectories: string[] = []

function object(name: string, isDirectory = false): ObjectInfo {
  return {
    name,
    displayName: name.replace(/\/$/, ''),
    size: 0,
    isDirectory
  }
}

function useClients(service: OssService, clients: Record<string, OssClientStub>): void {
  vi.spyOn(
    service as unknown as { bucketClient: (bucket: string) => OssClientStub },
    'bucketClient'
  ).mockImplementation((bucket) => clients[bucket])
}

function useCdnClients(
  service: OssService,
  clients: Record<'primary' | 'dedicated', CdnClientStub>
): void {
  vi.spyOn(
    service as unknown as {
      cdnClient: (source?: 'primary' | 'dedicated') => CdnClientStub
    },
    'cdnClient'
  ).mockImplementation((source = 'primary') => clients[source])
}

function setAuth(service: OssService, cdnCredentials = true): void {
  const config: AuthConfig = {
    endpoint: 'oss-cn-hangzhou.aliyuncs.com',
    endpointMode: 'public',
    accessKeyId: 'primary-id',
    accessKeySecret: 'primary-secret',
    secure: true,
    remember: true,
    ...(cdnCredentials
      ? {
          cdnCredentials: {
            accessKeyId: 'dedicated-id',
            accessKeySecret: 'dedicated-secret'
          }
        }
      : {})
  }
  const target = service as unknown as { auth: AuthConfig | null }
  target.auth = config
}

function cdnClient(domains: string[]): CdnClientStub {
  return {
    describeUserDomains: vi.fn().mockResolvedValue({
      body: {
        totalCount: domains.length,
        domains: {
          pageData: domains.map((domainName) => ({ domainName, domainStatus: 'online' }))
        }
      }
    }),
    refreshObjectCaches: vi.fn(),
    describeRefreshQuota: vi.fn().mockResolvedValue({ body: {} }),
    describeRefreshTaskById: vi.fn().mockResolvedValue({ body: { tasks: [] } }),
    describeRefreshTasks: vi.fn().mockResolvedValue({
      body: { tasks: { CDNTask: [] } }
    })
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

describe('OssService CDN credentials', () => {
  it('merges domains and records which credentials can manage each domain', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient(['primary.example.com', 'shared.example.com'])
    const dedicated = cdnClient(['dedicated.example.com', 'shared.example.com'])
    useCdnClients(service, { primary, dedicated })

    await expect(service.listCdnDomains()).resolves.toEqual([
      { domainName: 'dedicated.example.com', credentialSources: ['dedicated'] },
      { domainName: 'primary.example.com', credentialSources: ['primary'] },
      { domainName: 'shared.example.com', credentialSources: ['primary', 'dedicated'] }
    ])
  })

  it('uses dedicated domains when the primary credentials lack CDN permission', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient([])
    primary.describeUserDomains.mockRejectedValue({ code: 'AccessDenied' })
    const dedicated = cdnClient(['dedicated.example.com'])
    useCdnClients(service, { primary, dedicated })

    await expect(service.listCdnDomains()).resolves.toEqual([
      { domainName: 'dedicated.example.com', credentialSources: ['dedicated'] }
    ])
  })

  it('does not silently hide dedicated domains when dedicated credentials fail', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient(['primary.example.com'])
    const dedicated = cdnClient([])
    dedicated.describeUserDomains.mockRejectedValue(new Error('InvalidAccessKeyId'))
    useCdnClients(service, { primary, dedicated })

    await expect(service.listCdnDomains()).rejects.toThrow('InvalidAccessKeyId')
  })

  it('prefers dedicated credentials and retries the primary credentials on permission denial', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient(['shared.example.com'])
    const dedicated = cdnClient(['shared.example.com'])
    dedicated.refreshObjectCaches.mockRejectedValue({ code: 'AccessDenied' })
    primary.refreshObjectCaches.mockResolvedValue({ body: { refreshTaskId: 'primary-task' } })
    useCdnClients(service, { primary, dedicated })

    await expect(
      service.refreshCdnCache({
        domainName: 'shared.example.com',
        objectPath: 'https://shared.example.com/image.png',
        objectType: 'File'
      })
    ).resolves.toBe('primary-task')
    expect(dedicated.refreshObjectCaches).toHaveBeenCalledOnce()
    expect(primary.refreshObjectCaches).toHaveBeenCalledOnce()
  })

  it('rejects incomplete URLs and URLs for another domain before calling CDN', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient(['primary.example.com'])
    const dedicated = cdnClient(['dedicated.example.com'])
    useCdnClients(service, { primary, dedicated })

    await expect(
      service.refreshCdnCache({
        domainName: 'primary.example.com',
        objectPath: '/image.png',
        objectType: 'File'
      })
    ).rejects.toThrow('不是有效的完整 URL')
    await expect(
      service.refreshCdnCache({
        domainName: 'primary.example.com',
        objectPath: 'https://other.example.com/image.png',
        objectType: 'File'
      })
    ).rejects.toThrow('与所选 CDN 域名')
    expect(primary.describeUserDomains).not.toHaveBeenCalled()
    expect(dedicated.describeUserDomains).not.toHaveBeenCalled()
  })

  it('does not treat a request ID as a refresh task ID', async () => {
    const service = new OssService(vi.fn())
    setAuth(service, false)
    const primary = cdnClient(['primary.example.com'])
    primary.refreshObjectCaches.mockResolvedValue({ body: { requestId: 'request-only' } })
    useCdnClients(service, { primary, dedicated: cdnClient([]) })

    await expect(
      service.refreshCdnCache({
        domainName: 'primary.example.com',
        objectPath: 'https://primary.example.com/image.png',
        objectType: 'File'
      })
    ).rejects.toThrow('未返回任务 ID')
  })

  it('uses one lightweight request per credential for CDN permission probing', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient(['primary.example.com'])
    const dedicated = cdnClient(['dedicated.example.com'])
    useCdnClients(service, { primary, dedicated })
    const probeCdnDomains = (
      service as unknown as {
        probeCdnDomains: () => Promise<string | undefined>
      }
    ).probeCdnDomains.bind(service)

    await expect(probeCdnDomains()).resolves.toBeUndefined()
    expect(primary.describeUserDomains).toHaveBeenCalledOnce()
    expect(primary.describeUserDomains).toHaveBeenCalledWith({ pageNumber: 1, pageSize: 1 })
    expect(dedicated.describeUserDomains).toHaveBeenCalledOnce()
    expect(dedicated.describeUserDomains).toHaveBeenCalledWith({ pageNumber: 1, pageSize: 1 })
  })

  it('lists file, directory, and regex refresh tasks for the selected domain', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient([])
    const dedicated = cdnClient(['dedicated.example.com'])
    dedicated.describeRefreshTasks.mockImplementation(({ objectType }: { objectType: string }) =>
      Promise.resolve({
        body: {
          tasks: {
            CDNTask: [
              {
                taskId: `${objectType}-task`,
                objectPath: `https://dedicated.example.com/${objectType}`,
                objectType,
                status: objectType === 'file' ? 'Complete' : 'Refreshing',
                process: objectType === 'file' ? '100%' : '50%',
                creationTime: `2026-07-2${objectType === 'file' ? '4' : '3'}T12:00:00Z`
              }
            ]
          }
        }
      })
    )
    useCdnClients(service, { primary, dedicated })

    await expect(service.listCdnRefreshTasks('dedicated.example.com')).resolves.toEqual([
      expect.objectContaining({ taskId: 'file-task', objectType: 'File', status: 'Complete' }),
      expect.objectContaining({
        taskId: 'directory-task',
        objectType: 'Directory',
        status: 'Refreshing'
      }),
      expect.objectContaining({ taskId: 'regex-task', objectType: 'Regex' })
    ])
    expect(dedicated.describeRefreshTasks).toHaveBeenCalledTimes(3)
    expect(dedicated.describeRefreshTasks).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        domainName: 'dedicated.example.com',
        objectType: 'file',
        pageNumber: 1,
        pageSize: 100
      })
    )
    expect(primary.describeRefreshTasks).not.toHaveBeenCalled()
  })

  it('falls back to primary credentials when querying a submitted task is denied', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient(['shared.example.com'])
    const dedicated = cdnClient(['shared.example.com'])
    dedicated.describeRefreshTaskById.mockRejectedValue({ code: 'AccessDenied' })
    primary.describeRefreshTaskById.mockResolvedValue({
      body: {
        tasks: [
          {
            taskId: 'primary-task',
            objectPath: 'https://shared.example.com/image.png',
            objectType: 'file',
            status: 'Pending',
            creationTime: '2026-07-24T12:00:00Z'
          }
        ]
      }
    })
    useCdnClients(service, { primary, dedicated })

    await expect(
      service.listCdnRefreshTasks('shared.example.com', 'primary-task')
    ).resolves.toEqual([
      {
        taskId: 'primary-task',
        domainName: 'shared.example.com',
        objectPath: 'https://shared.example.com/image.png',
        objectType: 'File',
        status: 'Pending',
        process: '',
        creationTime: '2026-07-24T12:00:00Z',
        description: ''
      }
    ])
    expect(dedicated.describeRefreshTaskById).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'primary-task' })
    )
    expect(primary.describeRefreshTaskById).toHaveBeenCalledOnce()
  })

  it('queries the refresh quota with the credentials selected for the domain', async () => {
    const service = new OssService(vi.fn())
    setAuth(service)
    const primary = cdnClient(['primary.example.com'])
    const dedicated = cdnClient(['dedicated.example.com'])
    dedicated.describeRefreshQuota.mockResolvedValue({
      body: {
        urlQuota: '2000',
        urlRemain: '1996',
        dirQuota: '100',
        dirRemain: '99',
        regexQuota: '20',
        regexRemain: '10'
      }
    })
    useCdnClients(service, { primary, dedicated })

    await expect(service.getCdnRefreshQuota('dedicated.example.com')).resolves.toEqual({
      fileQuota: '2000',
      fileRemain: '1996',
      directoryQuota: '100',
      directoryRemain: '99',
      regexQuota: '20',
      regexRemain: '10'
    })
    expect(dedicated.describeRefreshQuota).toHaveBeenCalledOnce()
    expect(primary.describeRefreshQuota).not.toHaveBeenCalled()
  })
})

describe('OssService object operations', () => {
  it('forbids overwriting objects during cross-directory transfer', async () => {
    const sourceClient = { list: vi.fn(), copy: vi.fn() }
    const copy = vi.fn().mockRejectedValue({ code: 'FileAlreadyExists' })
    const targetClient = { list: vi.fn(), copy }
    const service = new OssService(vi.fn())
    useClients(service, { source: sourceClient, target: targetClient })

    await expect(
      service.transferObjects('source', [object('example.txt')], 'oss://target/archive/', false)
    ).rejects.toThrow('目标对象已存在，不能覆盖')
    expect(copy).toHaveBeenCalledWith('archive/example.txt', 'example.txt', 'source', {
      headers: { 'x-oss-forbid-overwrite': 'true' }
    })
  })

  it('rejects moving a directory into its own descendant', async () => {
    const client = { list: vi.fn(), copy: vi.fn(), deleteMulti: vi.fn() }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })

    await expect(service.moveObject('bucket', 'source/', 'source/nested/')).rejects.toThrow(
      '目标目录不能位于源目录内部'
    )
    expect(client.list).not.toHaveBeenCalled()
    expect(client.copy).not.toHaveBeenCalled()
    expect(client.deleteMulti).not.toHaveBeenCalled()
  })

  it('deletes only the source snapshot copied during a directory move', async () => {
    const client = {
      list: vi.fn().mockResolvedValue({
        objects: [{ name: 'source/first.txt' }, { name: 'source/second.txt' }],
        isTruncated: false
      }),
      copy: vi.fn().mockResolvedValue(undefined),
      deleteMulti: vi.fn().mockResolvedValue(undefined)
    }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })

    await service.moveObject('bucket', 'source/', 'target/')

    expect(client.list).toHaveBeenCalledOnce()
    expect(client.deleteMulti).toHaveBeenCalledWith(['source/first.txt', 'source/second.txt'], {
      quiet: true
    })
  })

  it('rejects transferring a directory into its own descendant before listing it', async () => {
    const client = { list: vi.fn(), copy: vi.fn(), deleteMulti: vi.fn() }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })

    await expect(
      service.transferObjects(
        'bucket',
        [object('source/', true)],
        'oss://bucket/source/nested/',
        true
      )
    ).rejects.toThrow('目标目录不能位于源目录内部')
    expect(client.list).not.toHaveBeenCalled()
    expect(client.copy).not.toHaveBeenCalled()
    expect(client.deleteMulti).not.toHaveBeenCalled()
  })

  it('deletes only the copied source snapshot during a directory transfer', async () => {
    const client = {
      list: vi.fn().mockResolvedValue({
        objects: [{ name: 'source/first.txt' }, { name: 'source/second.txt' }],
        isTruncated: false
      }),
      copy: vi.fn().mockResolvedValue(undefined),
      deleteMulti: vi.fn().mockResolvedValue(undefined)
    }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })

    await service.transferObjects('bucket', [object('source/', true)], 'oss://bucket/target/', true)

    expect(client.list).toHaveBeenCalledOnce()
    expect(client.deleteMulti).toHaveBeenCalledWith(['source/first.txt', 'source/second.txt'], {
      quiet: true
    })
  })

  it('preserves existing headers and metadata when updating one HTTP header', async () => {
    const client = {
      list: vi.fn(),
      head: vi.fn().mockResolvedValue({
        res: {
          headers: {
            etag: '"old-etag"',
            'content-type': 'text/plain',
            'content-encoding': 'gzip',
            'cache-control': 'max-age=60'
          }
        },
        meta: { owner: 'operations' }
      }),
      copy: vi.fn().mockResolvedValue(undefined)
    }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })

    await service.setObjectHeaders('bucket', 'example.txt', { 'Cache-Control': 'no-cache' })

    expect(client.copy).toHaveBeenCalledWith('example.txt', 'example.txt', {
      meta: { owner: 'operations' },
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'text/plain',
        'content-encoding': 'gzip',
        'If-Match': '"old-etag"'
      }
    })
  })

  it('rejects saving text when the remote ETag changed', async () => {
    const client = {
      list: vi.fn(),
      copy: vi.fn(),
      head: vi.fn().mockResolvedValue({ res: { headers: { etag: '"new-etag"' } } }),
      put: vi.fn()
    }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })

    await expect(
      service.saveText('bucket', 'example.txt', 'updated', '"old-etag"')
    ).rejects.toThrow('对象已被其他位置修改，请重新打开后再保存')
    expect(client.put).not.toHaveBeenCalled()
  })

  it('returns the new ETag after saving unchanged remote text', async () => {
    const client = {
      list: vi.fn(),
      copy: vi.fn(),
      head: vi.fn().mockResolvedValue({
        res: { headers: { etag: '"old-etag"', 'content-type': 'text/plain' } },
        meta: { owner: 'operations' }
      }),
      put: vi.fn().mockResolvedValue({ res: { headers: { etag: '"new-etag"' } } })
    }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })

    await expect(service.saveText('bucket', 'example.txt', 'updated', '"old-etag"')).resolves.toBe(
      '"new-etag"'
    )
    expect(client.put).toHaveBeenCalledWith('example.txt', Buffer.from('updated'), {
      meta: { owner: 'operations' },
      headers: { 'content-type': 'text/plain' }
    })
  })

  it('forbids overwriting objects that appeared after upload conflict scanning', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oss-browser-upload-conflict-'))
    temporaryDirectories.push(directory)
    const localPath = join(directory, 'example.txt')
    await writeFile(localPath, 'example')
    const putStream = vi.fn().mockResolvedValue(undefined)
    const client = {
      list: vi.fn().mockResolvedValue({ objects: [], isTruncated: false }),
      copy: vi.fn(),
      putStream,
      cancel: vi.fn()
    }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })

    const preparation = await service.findUploadConflicts('bucket', '', [localPath])
    await expect(
      service.upload('bucket', '', [localPath], { preparationId: preparation.id })
    ).resolves.toBe(true)

    expect(putStream).toHaveBeenCalledWith(
      'example.txt',
      expect.anything(),
      expect.objectContaining({ headers: { 'x-oss-forbid-overwrite': 'true' } })
    )
  })

  it('keeps direct replacement uploads overwrite-enabled', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oss-browser-upload-replace-'))
    temporaryDirectories.push(directory)
    const localPath = join(directory, 'example.txt')
    await writeFile(localPath, 'example')
    const putStream = vi.fn().mockResolvedValue(undefined)
    const service = new OssService(vi.fn())
    useClients(service, {
      bucket: { list: vi.fn(), copy: vi.fn(), putStream, cancel: vi.fn() }
    })

    await expect(service.upload('bucket', '', [localPath])).resolves.toBe(true)

    expect(putStream).toHaveBeenCalledWith(
      'example.txt',
      expect.anything(),
      expect.objectContaining({ headers: undefined })
    )
  })

  it('restores empty folders and nested folder markers during download', async () => {
    const list = vi.fn().mockResolvedValue({
      objects: [{ name: 'empty/' }, { name: 'empty/nested/' }],
      isTruncated: false
    })
    const client = { list, copy: vi.fn() }
    const service = new OssService(vi.fn())
    useClients(service, { bucket: client })
    const destination = await mkdtemp(join(tmpdir(), 'oss-browser-download-'))
    temporaryDirectories.push(destination)

    await expect(service.download('bucket', [object('empty/', true)], destination)).resolves.toBe(
      true
    )
    expect((await stat(join(destination, 'empty'))).isDirectory()).toBe(true)
    expect((await stat(join(destination, 'empty/nested'))).isDirectory()).toBe(true)
  })

  it('enumerates multiple download folders concurrently', async () => {
    let activeListings = 0
    let maximumActiveListings = 0
    const list = vi.fn().mockImplementation(async ({ prefix }: { prefix: string }) => {
      activeListings += 1
      maximumActiveListings = Math.max(maximumActiveListings, activeListings)
      await new Promise((resolve) => setTimeout(resolve, 5))
      activeListings -= 1
      return { objects: [{ name: prefix }], isTruncated: false }
    })
    const service = new OssService(vi.fn())
    useClients(service, { bucket: { list, copy: vi.fn() } })
    const destination = await mkdtemp(join(tmpdir(), 'oss-browser-download-'))
    temporaryDirectories.push(destination)

    await service.download('bucket', [object('first/', true), object('second/', true)], destination)

    expect(maximumActiveListings).toBe(2)
  })

  it('rejects local inputs that map to the same upload target', async () => {
    const firstDirectory = await mkdtemp(join(tmpdir(), 'oss-browser-upload-first-'))
    const secondDirectory = await mkdtemp(join(tmpdir(), 'oss-browser-upload-second-'))
    temporaryDirectories.push(firstDirectory, secondDirectory)
    const firstPath = join(firstDirectory, 'same.txt')
    const secondPath = join(secondDirectory, 'same.txt')
    await Promise.all([writeFile(firstPath, 'first'), writeFile(secondPath, 'second')])
    const service = new OssService(vi.fn())
    const prepareUploadEntries = (
      service as unknown as {
        prepareUploadEntries: (prefix: string, paths: string[]) => Promise<unknown>
      }
    ).prepareUploadEntries.bind(service)

    await expect(prepareUploadEntries('', [firstPath, secondPath])).rejects.toThrow(
      '上传内容包含相同的目标路径：same.txt'
    )
  })

  it('reports queued uploads as paused and resumes them', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oss-browser-upload-pause-'))
    temporaryDirectories.push(directory)
    const localPath = join(directory, 'example.txt')
    await writeFile(localPath, 'example')
    const statuses: string[] = []
    const service = new OssService((item) => statuses.push(item.status))
    let attempts = 0
    const putStream = vi
      .fn()
      .mockImplementation(
        (
          _name: string,
          stream: { once: (event: string, listener: (error: Error) => void) => void }
        ) => {
          attempts += 1
          if (attempts === 1) {
            return new Promise((_resolve, reject) => {
              stream.once('error', reject)
              setTimeout(() => {
                service.pauseAllTransfers('upload')
                setTimeout(() => service.resumeAllTransfers('upload'), 0)
              }, 0)
            })
          }
          return Promise.resolve()
        }
      )
    useClients(service, {
      bucket: { list: vi.fn(), copy: vi.fn(), putStream, cancel: vi.fn() }
    })

    await expect(service.upload('bucket', '', [localPath])).resolves.toBe(true)
    expect(statuses).toContain('paused')
    expect(statuses.at(-1)).toBe('done')
    expect(putStream).toHaveBeenCalledTimes(2)
  })

  it('stops taking queued uploads after deleting the batch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oss-browser-upload-cancel-'))
    temporaryDirectories.push(directory)
    const paths = await Promise.all(
      ['first.txt', 'second.txt', 'third.txt'].map(async (name) => {
        const path = join(directory, name)
        await writeFile(path, name)
        return path
      })
    )
    const service = new OssService(vi.fn())
    service.updateSettings({ ...DEFAULT_APP_SETTINGS, maxUploadJobs: 1 })
    const putStream = vi.fn().mockImplementation(
      (
        _name: string,
        stream: { once: (event: string, listener: (error: Error) => void) => void }
      ) =>
        new Promise((_resolve, reject) => {
          stream.once('error', reject)
          setTimeout(() => service.cancelAllTransfers('upload'), 0)
        })
    )
    useClients(service, {
      bucket: { list: vi.fn(), copy: vi.fn(), putStream, cancel: vi.fn() }
    })

    await expect(service.upload('bucket', '', paths)).resolves.toBe(false)
    expect(putStream).toHaveBeenCalledOnce()
  })

  it('destroys a small-file upload stream when cancelling one task', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'oss-browser-upload-single-cancel-'))
    temporaryDirectories.push(directory)
    const localPath = join(directory, 'example.txt')
    await writeFile(localPath, 'example')
    let transferId = ''
    const statuses: string[] = []
    const service = new OssService((item) => {
      transferId = item.id
      statuses.push(item.status)
    })
    const putStream = vi.fn().mockImplementation(
      (
        _name: string,
        stream: { once: (event: string, listener: (error: Error) => void) => void }
      ) =>
        new Promise((_resolve, reject) => {
          stream.once('error', reject)
          setTimeout(() => service.cancelTransfer(transferId), 0)
        })
    )
    useClients(service, {
      bucket: { list: vi.fn(), copy: vi.fn(), putStream, cancel: vi.fn() }
    })

    await expect(service.upload('bucket', '', [localPath])).resolves.toBe(false)
    expect(statuses.at(-1)).toBe('cancelled')
    expect(putStream).toHaveBeenCalledOnce()
  })
})
