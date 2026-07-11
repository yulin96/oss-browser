import { app, safeStorage } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SavedProfile } from '../shared/types'

interface StoredProfile {
  id: string
  label: string
  encryptedConfig: string
}

export class ProfileStore {
  private get path(): string {
    return join(app.getPath('userData'), 'profiles.json')
  }

  async list(): Promise<SavedProfile[]> {
    if (!safeStorage.isEncryptionAvailable()) return []
    const stored = await this.read()
    const profiles: SavedProfile[] = []
    for (const profile of stored) {
      try {
        profiles.push({
          id: profile.id,
          label: profile.label,
          config: JSON.parse(
            safeStorage.decryptString(Buffer.from(profile.encryptedConfig, 'base64'))
          )
        })
      } catch {
        continue
      }
    }
    return profiles
  }

  async save(profile: SavedProfile): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储当前不可用')
    const stored = await this.read()
    const next: StoredProfile = {
      id: profile.id,
      label: profile.label,
      encryptedConfig: safeStorage.encryptString(JSON.stringify(profile.config)).toString('base64')
    }
    const index = stored.findIndex((item) => item.id === profile.id)
    if (index === -1) stored.unshift(next)
    else stored[index] = next
    await writeFile(this.path, JSON.stringify(stored, null, 2), { mode: 0o600 })
  }

  async remove(id: string): Promise<void> {
    const stored = await this.read()
    await writeFile(
      this.path,
      JSON.stringify(
        stored.filter((item) => item.id !== id),
        null,
        2
      ),
      { mode: 0o600 }
    )
  }

  async clear(): Promise<void> {
    await rm(this.path, { force: true })
  }

  private async read(): Promise<StoredProfile[]> {
    try {
      return JSON.parse(await readFile(this.path, 'utf8')) as StoredProfile[]
    } catch {
      return []
    }
  }
}
