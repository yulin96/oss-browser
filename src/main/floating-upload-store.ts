import { app } from 'electron'
import { join } from 'node:path'
import type { FloatingUploadTarget, FloatingWindowPosition } from '../shared/types'
import { readJsonFile, writeJsonFileAtomic } from './atomic-json-file'

interface FloatingUploadAccountSettings {
  target?: FloatingUploadTarget
  enabled: boolean
  position?: FloatingWindowPosition
}

type StoredFloatingUploadSettings = Record<string, FloatingUploadAccountSettings>

export class FloatingUploadStore {
  private mutationQueue: Promise<void> = Promise.resolve()

  private get path(): string {
    return join(app.getPath('userData'), 'floating-upload.json')
  }

  async get(accountId: string): Promise<FloatingUploadAccountSettings> {
    return (await this.read())[accountId] || { enabled: false }
  }

  async update(
    accountId: string,
    patch: Partial<FloatingUploadAccountSettings>
  ): Promise<FloatingUploadAccountSettings> {
    let result: FloatingUploadAccountSettings | undefined
    await this.mutate(async () => {
      const stored = await this.read()
      result = { ...(stored[accountId] || { enabled: false }), ...patch }
      stored[accountId] = result
      await writeJsonFileAtomic(this.path, stored)
    })
    return result!
  }

  private async read(): Promise<StoredFloatingUploadSettings> {
    const parsed = await readJsonFile(this.path)
    if (parsed === undefined) return {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('悬浮上传配置文件格式不正确')
    }
    return parsed as StoredFloatingUploadSettings
  }

  private mutate(task: () => Promise<void>): Promise<void> {
    const result = this.mutationQueue.then(task, task)
    this.mutationQueue = result.catch(() => undefined)
    return result
  }
}
