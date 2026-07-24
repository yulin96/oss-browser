import { app, safeStorage } from 'electron'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { SavedProfile } from '../shared/types'
import { readJsonFile, writeJsonFileAtomic } from './atomic-json-file'
import {
  decryptLegacyMacSafeStorage,
  readLegacyMacSafeStoragePassword
} from './macos-legacy-safe-storage'

interface StoredProfile {
  id: string
  label: string
  encryptedConfig: string
}

export class ProfileStore {
  private mutationQueue: Promise<unknown> = Promise.resolve()

  private get path(): string {
    return join(app.getPath('userData'), 'profiles.json')
  }

  async list(): Promise<SavedProfile[]> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储当前不可用')
    return this.mutate(async () => {
      const stored = await this.read()
      const profiles: SavedProfile[] = []
      let legacyPassword: string | undefined
      let legacyPasswordLoaded = false
      let migrated = false

      for (const profile of stored) {
        const encrypted = Buffer.from(profile.encryptedConfig, 'base64')
        let serialized: string
        try {
          serialized = safeStorage.decryptString(encrypted)
        } catch (error) {
          if (process.platform !== 'darwin') {
            throw new Error(`已保存账号“${profile.label}”无法解密`, { cause: error })
          }
          if (!legacyPasswordLoaded) {
            legacyPassword = await readLegacyMacSafeStoragePassword()
            legacyPasswordLoaded = true
          }
          if (!legacyPassword) {
            throw new Error(`已保存账号“${profile.label}”无法解密`, { cause: error })
          }
          try {
            serialized = decryptLegacyMacSafeStorage(encrypted, legacyPassword)
            profile.encryptedConfig = safeStorage.encryptString(serialized).toString('base64')
            migrated = true
          } catch (legacyError) {
            throw new Error(`已保存账号“${profile.label}”无法解密`, { cause: legacyError })
          }
        }

        try {
          profiles.push({
            id: profile.id,
            label: profile.label,
            config: JSON.parse(serialized)
          })
        } catch (error) {
          throw new Error(`已保存账号“${profile.label}”内容无效`, { cause: error })
        }
      }

      if (migrated) await writeJsonFileAtomic(this.path, stored)
      return profiles
    })
  }

  async save(profile: SavedProfile): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统安全存储当前不可用')
    await this.mutate(async () => {
      const stored = await this.read()
      const next: StoredProfile = {
        id: profile.id,
        label: profile.label,
        encryptedConfig: safeStorage
          .encryptString(JSON.stringify(profile.config))
          .toString('base64')
      }
      const index = stored.findIndex((item) => item.id === profile.id)
      if (index === -1) stored.unshift(next)
      else stored[index] = next
      await writeJsonFileAtomic(this.path, stored)
    })
  }

  async remove(id: string): Promise<void> {
    await this.mutate(async () => {
      const stored = await this.read()
      await writeJsonFileAtomic(
        this.path,
        stored.filter((item) => item.id !== id)
      )
    })
  }

  async clear(): Promise<void> {
    await this.mutate(() => rm(this.path, { force: true }))
  }

  private async read(): Promise<StoredProfile[]> {
    const parsed = await readJsonFile(this.path)
    if (parsed === undefined) return []
    if (
      !Array.isArray(parsed) ||
      !parsed.every(
        (profile) =>
          profile &&
          typeof profile === 'object' &&
          typeof profile.id === 'string' &&
          typeof profile.label === 'string' &&
          typeof profile.encryptedConfig === 'string'
      )
    ) {
      throw new Error('账号配置文件格式不正确')
    }
    return parsed as StoredProfile[]
  }

  private mutate<T>(task: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(task, task)
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
