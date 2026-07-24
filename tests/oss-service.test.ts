import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  nativeImage: { createFromPath: vi.fn() }
}))

import { OssService } from '../src/main/oss-service'
import { DEFAULT_APP_SETTINGS } from '../src/shared/app-settings'
import type { AuthConfig, ObjectInfo } from '../src/shared/types'

interface OssClientStub {
  list: ReturnType<typeof vi.fn>
  copy: ReturnType<typeof vi.fn>
  put?: ReturnType<typeof vi.fn>
  putStream?: ReturnType<typeof vi.fn>
  cancel?: ReturnType<typeof vi.fn>
}

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
