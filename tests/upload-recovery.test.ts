import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import OSS from 'ali-oss'
import { afterEach, expect, it, vi, type Mock } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

import { OssService } from '../src/main/oss-service'
import { DEFAULT_APP_SETTINGS } from '../src/shared/app-settings'
import type { MultipartUploadInfo, TransferItem } from '../src/shared/types'

const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function setup(): Promise<{
  file: string
  checkpointPath: string
  reports: TransferItem[]
  service: OssService
  init: Mock
  part: Mock
  complete: Mock
  listParts: Mock
  saveCheckpoint: (extra?: Record<string, unknown>) => Promise<void>
}> {
  const directory = await mkdtemp(join(tmpdir(), 'oss-upload-recovery-'))
  directories.push(directory)
  const file = join(directory, 'video.mp4')
  const checkpointPath = join(directory, 'checkpoint.json')
  await writeFile(file, Buffer.alloc(2 * 1024 * 1024))
  const reports: TransferItem[] = []
  const service = new OssService((item) => reports.push(item))
  service.updateSettings({
    ...DEFAULT_APP_SETTINGS,
    partSizeMb: 1,
    multipartParallel: 2,
    retryTimes: 0
  })
  vi.spyOn(
    service as unknown as { checkpointPath: () => string },
    'checkpointPath'
  ).mockReturnValue(checkpointPath)
  const init = vi.fn(async () => ({ uploadId: `session-${init.mock.calls.length}`, res: {} }))
  const part = vi.fn(
    async (_name: string, _id: string, number: number, data: { stream: Readable }) => {
      for await (const chunk of data.stream) void chunk
      return { res: { headers: { etag: `part-${number}` } } }
    }
  )
  const complete = vi.fn().mockResolvedValue({})
  const listParts = vi
    .fn()
    .mockRejectedValue({ code: 'NoSuchUpload', status: 404, message: 'Missing upload' })
  vi.spyOn(service as unknown as { bucketClient: () => OSS }, 'bucketClient').mockImplementation(
    () => {
      const client = new OSS({
        region: 'oss-cn-hangzhou',
        accessKeyId: 'test',
        accessKeySecret: 'test',
        retryMax: 0
      })
      client.initMultipartUpload = init as unknown as typeof client.initMultipartUpload
      client.completeMultipartUpload = complete
      client.listParts = listParts
      ;(client as unknown as { _uploadPart: typeof part })._uploadPart = part
      return client
    }
  )
  async function saveCheckpoint(extra: Record<string, unknown> = {}): Promise<void> {
    const info = await stat(file)
    await writeFile(
      checkpointPath,
      JSON.stringify({
        file,
        name: 'video.mp4',
        fileSize: info.size,
        partSize: 1024 * 1024,
        uploadId: 'old-session',
        doneParts: [],
        localFile: { mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs },
        ...extra
      })
    )
  }
  return {
    file,
    checkpointPath,
    reports,
    service,
    init,
    part,
    complete,
    listParts,
    saveCheckpoint
  }
}

it('verifies a stale SDK session and automatically restarts once', async () => {
  const f = await setup()
  await f.saveCheckpoint()
  f.part.mockRejectedValueOnce(
    Object.assign(new Error('Missing upload'), { status: 404, code: 'NoSuchUpload' })
  )
  expect(await f.service.upload('bucket', '', [f.file])).toBe(true)
  expect(f.listParts).toHaveBeenCalledWith('video.mp4', 'old-session', { 'max-parts': 1 })
  expect(f.init).toHaveBeenCalledTimes(1)
  expect(f.complete).toHaveBeenCalledTimes(1)
  expect(f.reports.at(-1)?.status).toBe('done')
  await expect(stat(f.checkpointPath)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('does not repeatedly restart when a new upload session also fails', async () => {
  const f = await setup()
  await f.saveCheckpoint()
  f.part.mockRejectedValue({ status: 404, code: 'NoSuchUpload', message: 'Missing upload' })
  expect(await f.service.upload('bucket', '', [f.file])).toBe(false)
  expect(f.init).toHaveBeenCalledTimes(1)
  expect(f.reports.at(-1)?.error).not.toContain('[object Object]')
  expect(f.reports.at(-1)?.error).toContain('404')
})

it.each(['network', 'permission', 'unconfirmed-404'])(
  'preserves checkpoints for %s failures',
  async (kind) => {
    const f = await setup()
    await f.saveCheckpoint()
    const error =
      kind === 'network'
        ? { status: -1, code: 'ConnectionTimeout', message: 'Connection timed out' }
        : kind === 'permission'
          ? { status: 403, code: 'AccessDenied', message: 'Permission denied' }
          : { status: 404, code: 'NoSuchBucket', message: 'Missing bucket' }
    f.part.mockRejectedValue(error)
    f.listParts.mockRejectedValue({
      status: 403,
      code: 'AccessDenied',
      message: 'Cannot verify session'
    })
    expect(await f.service.upload('bucket', '', [f.file])).toBe(false)
    expect(f.init).not.toHaveBeenCalled()
    expect(JSON.parse(await readFile(f.checkpointPath, 'utf8')).uploadId).toBe('old-session')
    expect(f.reports.at(-1)?.error).toContain(
      kind === 'network' ? 'ConnectionTimeout' : 'AccessDenied'
    )
  }
)

it('resumes valid parts after a network interruption', async () => {
  const f = await setup()
  await f.saveCheckpoint({ doneParts: [{ number: 1, etag: 'part-1' }] })
  f.part.mockRejectedValueOnce({ status: -1, message: 'offline' })
  expect(await f.service.upload('bucket', '', [f.file])).toBe(false)
  expect(await f.service.upload('bucket', '', [f.file])).toBe(true)
  expect(f.init).not.toHaveBeenCalled()
  expect(f.part.mock.calls.every((call) => call[2] === 2 && call[1] === 'old-session')).toBe(true)
})

it.each(['size', 'modified', 'legacy', 'corrupt'])(
  'starts fresh for %s checkpoints',
  async (kind) => {
    const f = await setup()
    await f.saveCheckpoint(kind === 'legacy' ? { localFile: undefined } : {})
    if (kind === 'size') await writeFile(f.file, Buffer.alloc(3 * 1024 * 1024))
    if (kind === 'modified') await utimes(f.file, new Date(), new Date(Date.now() + 10000))
    if (kind === 'corrupt') await writeFile(f.checkpointPath, '{broken')
    expect(await f.service.upload('bucket', '', [f.file])).toBe(true)
    expect(f.init).toHaveBeenCalledTimes(1)
    expect(f.part.mock.calls.every((call) => call[1] !== 'old-session')).toBe(true)
  }
)

it('clears only the failed task checkpoint before a manual retry and ignores duplicate retries', async () => {
  const f = await setup()
  await f.saveCheckpoint({ doneParts: [{ number: 1, etag: 'part-1' }] })
  f.part.mockRejectedValueOnce({ status: -1, message: 'offline' })
  expect(await f.service.upload('bucket', '', [f.file])).toBe(false)
  const id = f.reports.at(-1)!.id
  await Promise.all([f.service.restartUpload(id), f.service.restartUpload(id)])
  expect(f.init).toHaveBeenCalledTimes(1)
  expect(f.part.mock.calls.some((call) => call[2] === 1 && call[1] !== 'old-session')).toBe(true)
  expect(f.reports.at(-1)?.status).toBe('done')
})

it('does not complete an upload when the local file changes during transfer', async () => {
  const f = await setup()
  f.part.mockImplementationOnce(async () => {
    await utimes(f.file, new Date(), new Date(Date.now() + 10000))
    return { res: { headers: { etag: 'changed' } } }
  })
  expect(await f.service.upload('bucket', '', [f.file])).toBe(false)
  expect(f.complete).not.toHaveBeenCalled()
  expect(f.reports.at(-1)?.error).toContain('本地文件在上传期间发生变化')
})

it('paginates multipart uploads and enforces the one-hour cutoff using server timestamps', async () => {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const upload = (id: string, age: number): MultipartUploadInfo => ({
    name: `${id}.mp4`,
    uploadId: id,
    initiated: new Date(now - age).toISOString()
  })
  const old = upload('old', 3600001)
  const failed = upload('failed', 7200000)
  const recent = upload('recent', 60000)
  const boundary = upload('boundary', 3600000)
  const unknown = { name: 'unknown.mp4', uploadId: 'unknown' }
  const invalid = { ...unknown, uploadId: 'invalid', initiated: 'invalid' }
  const future = upload('future', -60000)
  const unselected = upload('unselected', 7200000)
  const listUploads = vi
    .fn()
    .mockResolvedValueOnce({
      uploads: [old, recent, boundary],
      isTruncated: true,
      nextKeyMarker: 'k',
      nextUploadIdMarker: 'i'
    })
    .mockResolvedValueOnce({
      uploads: [failed, unknown, invalid, future, unselected],
      isTruncated: false
    })
  const abort = vi.fn(async (_name: string, id: string) => {
    if (id === 'failed') throw { code: 'AccessDenied', message: 'Permission denied' }
  })
  const service = new OssService(vi.fn())
  vi.spyOn(service as unknown as { bucketClient: () => unknown }, 'bucketClient').mockReturnValue({
    listUploads,
    abortMultipartUpload: abort
  })
  const result = await service.abortMultipartBatch('bucket', [
    old,
    old,
    failed,
    { ...recent, initiated: old.initiated },
    boundary,
    unknown,
    invalid,
    future
  ])
  expect(listUploads.mock.calls[1][0]).toMatchObject({ 'key-marker': 'k', 'upload-id-marker': 'i' })
  expect(abort).toHaveBeenCalledTimes(2)
  expect(result).toMatchObject({
    aborted: 1,
    skipped: 5,
    failed: [{ uploadId: 'failed', error: 'Permission denied (AccessDenied)' }]
  })
})
