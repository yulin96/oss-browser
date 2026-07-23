import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  nativeImage: { createFromPath: vi.fn() }
}))

import { OssService } from '../src/main/oss-service'
import type { ObjectInfo } from '../src/shared/types'

interface OssClientStub {
  list: ReturnType<typeof vi.fn>
  copy: ReturnType<typeof vi.fn>
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
})
