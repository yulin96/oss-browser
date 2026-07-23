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
import type { ObjectInfo } from '../src/shared/types'

interface OssClientStub {
  list: ReturnType<typeof vi.fn>
  copy: ReturnType<typeof vi.fn>
  put?: ReturnType<typeof vi.fn>
  putStream?: ReturnType<typeof vi.fn>
  cancel?: ReturnType<typeof vi.fn>
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
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
