import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FloatingUploadTarget, FloatingWindowPosition } from '../shared/types'

interface FloatingUploadAccountSettings {
  target?: FloatingUploadTarget
  enabled: boolean
  position?: FloatingWindowPosition
}

type StoredFloatingUploadSettings = Record<string, FloatingUploadAccountSettings>

export class FloatingUploadStore {
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
    const stored = await this.read()
    const next = { ...(stored[accountId] || { enabled: false }), ...patch }
    stored[accountId] = next
    await writeFile(this.path, JSON.stringify(stored, null, 2), { mode: 0o600 })
    return next
  }

  private async read(): Promise<StoredFloatingUploadSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as StoredFloatingUploadSettings) : {}
    } catch {
      return {}
    }
  }
}
