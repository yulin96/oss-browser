import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, nativeImage: {} }))

import { OssService } from '../src/main/oss-service'
import { DEFAULT_APP_SETTINGS } from '../src/shared/app-settings'
import type { TransferItem } from '../src/shared/types'

const directories: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

async function setup(): Promise<{
  first: string
  second: string
  queued: string
  checkpoint: string
  service: OssService
  reports: TransferItem[]
  started: ReturnType<typeof deferred>
  release: ReturnType<typeof deferred>
  putStream: ReturnType<typeof vi.fn>
}> {
  const firstDirectory = await mkdtemp(join(tmpdir(), 'oss-upload-first-'))
  const secondDirectory = await mkdtemp(join(tmpdir(), 'oss-upload-second-'))
  directories.push(firstDirectory, secondDirectory)
  const first = join(firstDirectory, 'same.txt')
  const second = join(secondDirectory, 'same.txt')
  const queued = join(firstDirectory, 'queued.txt')
  const checkpoint = join(firstDirectory, 'checkpoint.json')
  await Promise.all([
    writeFile(first, 'first'),
    writeFile(second, 'second'),
    writeFile(queued, 'queued')
  ])
  const reports: TransferItem[] = []
  const service = new OssService((item) => reports.push(item))
  service.updateSettings({ ...DEFAULT_APP_SETTINGS, maxUploadJobs: 1, retryTimes: 0 })
  const started = deferred()
  const release = deferred()
  const putStream = vi.fn(async (_name: string, stream: Readable) => {
    for await (const chunk of stream) void chunk
  })
  putStream.mockImplementationOnce(async (_name: string, stream: Readable) => {
    for await (const chunk of stream) void chunk
    started.resolve()
    await release.promise
  })
  vi.spyOn(service as unknown as { bucketClient: () => unknown }, 'bucketClient').mockReturnValue({
    putStream,
    list: vi.fn().mockResolvedValue({ objects: [], isTruncated: false }),
    cancel: vi.fn()
  })
  vi.spyOn(
    service as unknown as {
      checkpointPath: (bucket: string, name: string, path: string) => string
    },
    'checkpointPath'
  ).mockImplementation((_bucket, _name, path) => (path === first ? checkpoint : `${path}.json`))
  return { first, second, queued, checkpoint, service, reports, started, release, putStream }
}

it('reserves running and queued targets across batches and releases them after completion', async () => {
  const f = await setup()
  const uploading = f.service.upload('bucket', '', [f.first, f.queued])
  await f.started.promise
  await expect(f.service.upload('bucket', '', [f.first])).rejects.toThrow('该文件已有上传任务')
  await expect(f.service.upload('bucket', '', [f.second])).rejects.toThrow('目标已有其他上传任务')
  await expect(f.service.upload('bucket', '', [f.queued])).rejects.toThrow('该文件已有上传任务')
  expect(f.putStream).toHaveBeenCalledTimes(1)
  f.release.resolve()
  expect(await uploading).toBe(true)
  expect(await f.service.upload('bucket', '', [f.second])).toBe(true)
  expect(f.putStream).toHaveBeenCalledTimes(3)
})

it('keeps distinct buckets and object prefixes independent', async () => {
  const f = await setup()
  f.service.updateSettings({ ...DEFAULT_APP_SETTINGS, maxUploadJobs: 3, retryTimes: 0 })
  const uploading = f.service.upload('bucket', '', [f.first])
  await f.started.promise
  expect(await f.service.upload('other-bucket', '', [f.second])).toBe(true)
  expect(await f.service.upload('bucket', 'other/', [f.second])).toBe(true)
  f.release.resolve()
  expect(await uploading).toBe(true)
})

it('releases targets that never started after cancelling a batch', async () => {
  const f = await setup()
  const uploading = f.service.upload('bucket', '', [f.first, f.queued])
  await f.started.promise
  f.service.cancelAllTransfers('upload')
  f.release.resolve()
  expect(await uploading).toBe(false)
  expect(f.putStream).toHaveBeenCalledTimes(1)
  expect(await f.service.upload('bucket', '', [f.queued])).toBe(true)
})

it.each([false, true])(
  'protects checkpoints when retry conflicts with another upload (paused=%s)',
  async (paused) => {
    const f = await setup()
    f.putStream.mockReset()
    f.putStream.mockRejectedValueOnce({ status: 403, code: 'AccessDenied' })
    await writeFile(f.checkpoint, 'keep checkpoint')
    expect(await f.service.upload('bucket', '', [f.first])).toBe(false)
    const failedId = f.reports.at(-1)!.id
    f.putStream.mockImplementationOnce(async (_name: string, stream: Readable) => {
      for await (const chunk of stream) void chunk
      f.started.resolve()
      await f.release.promise
    })
    const secondUpload = f.service.upload('bucket', '', [f.second])
    await f.started.promise
    if (paused) f.service.pauseAllTransfers('upload')
    const retrying = f.service.restartUpload(failedId)
    if (paused) {
      await Promise.resolve()
      expect(f.reports.at(-1)?.status).toBe('paused')
      f.service.resumeAllTransfers('upload')
    }
    await retrying
    expect(await readFile(f.checkpoint, 'utf8')).toBe('keep checkpoint')
    expect(f.reports.at(-1)?.error).toContain('目标已有上传任务')
    f.release.resolve()
    expect(await secondUpload).toBe(true)
    f.putStream.mockImplementation(async (_name: string, stream: Readable) => {
      for await (const chunk of stream) void chunk
    })
    await f.service.retryTransfer(failedId)
    expect(f.reports.at(-1)?.status).toBe('done')
  }
)

it('keeps a manually retried target reserved when its original batch finishes', async () => {
  const f = await setup()
  const retryStarted = deferred()
  const retryRelease = deferred()
  f.service.updateSettings({ ...DEFAULT_APP_SETTINGS, maxUploadJobs: 2, retryTimes: 0 })
  f.putStream.mockReset()
  let firstFailed = false
  f.putStream.mockImplementation(async (name: string, stream: Readable) => {
    for await (const chunk of stream) void chunk
    if (name === 'queued.txt') {
      f.started.resolve()
      await f.release.promise
    } else if (!firstFailed) {
      firstFailed = true
      throw { status: 403, code: 'AccessDenied' }
    } else {
      retryStarted.resolve()
      await retryRelease.promise
    }
  })
  const originalBatch = f.service.upload('bucket', '', [f.first, f.queued])
  await f.started.promise
  await vi.waitFor(() => expect(f.reports.some((item) => item.status === 'error')).toBe(true))
  const failedId = f.reports.find((item) => item.status === 'error')!.id
  const retrying = f.service.retryTransfer(failedId)
  await retryStarted.promise
  f.release.resolve()
  expect(await originalBatch).toBe(false)
  await expect(f.service.upload('bucket', '', [f.second])).rejects.toThrow('目标已有其他上传任务')
  retryRelease.resolve()
  await retrying
  expect(f.reports.at(-1)?.status).toBe('done')
})

it('recreates the small-file stream for a transient failure and preserves overwrite protection', async () => {
  const f = await setup()
  f.service.updateSettings({ ...DEFAULT_APP_SETTINGS, retryTimes: 1 })
  const streams: Readable[] = []
  const bodies: Buffer[] = []
  f.putStream.mockReset()
  f.putStream.mockImplementation(async (_name: string, stream: Readable) => {
    streams.push(stream)
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk)
    bodies.push(Buffer.concat(chunks))
    if (streams.length === 1) throw { status: 503, message: 'temporary failure' }
  })
  const preparation = await f.service.findUploadConflicts('bucket', '', [f.first])
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const uploading = f.service.upload('bucket', '', [f.first], { preparationId: preparation.id })
  await vi.waitFor(() => expect(f.reports.at(-1)?.error).toContain('等待重试'))
  await vi.advanceTimersByTimeAsync(1500)
  expect(await uploading).toBe(true)
  expect(streams[0]).not.toBe(streams[1])
  expect(bodies.map((body) => body.toString())).toEqual(['first', 'first'])
  expect(
    f.putStream.mock.calls.every((call) => call[2].headers['x-oss-forbid-overwrite'] === 'true')
  ).toBe(true)
})

it('does not overwrite an object when a lost response is followed by an existence conflict', async () => {
  const f = await setup()
  f.service.updateSettings({ ...DEFAULT_APP_SETTINGS, retryTimes: 5 })
  f.putStream.mockReset()
  f.putStream
    .mockRejectedValueOnce({ status: -1, message: 'response lost' })
    .mockRejectedValueOnce({ status: 409, code: 'FileAlreadyExists' })
  const preparation = await f.service.findUploadConflicts('bucket', '', [f.first])
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const uploading = f.service.upload('bucket', '', [f.first], { preparationId: preparation.id })
  await vi.waitFor(() => expect(f.reports.at(-1)?.error).toContain('等待重试'))
  await vi.advanceTimersByTimeAsync(1500)
  expect(await uploading).toBe(false)
  expect(f.putStream).toHaveBeenCalledTimes(2)
  expect(f.reports.at(-1)?.error).toContain('核实远端文件')
  expect(
    f.putStream.mock.calls.every((call) => call[2].headers['x-oss-forbid-overwrite'] === 'true')
  ).toBe(true)
})
