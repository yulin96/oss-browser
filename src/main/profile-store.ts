import { app, safeStorage } from 'electron'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { CdnCredentials, SavedProfile, SavedProfileSummary } from '../shared/types'
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

function requireSecureStorage(): void {
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
  ) {
    throw new Error('系统安全存储不可用，请启用系统密钥环，或关闭“记住登录信息”后连接')
  }
}

export class ProfileStore {
  private mutationQueue: Promise<unknown> = Promise.resolve()

  private get path(): string {
    return join(app.getPath('userData'), 'profiles.json')
  }

  async list(): Promise<SavedProfileSummary[]> {
    requireSecureStorage()
    return this.mutate(async () => {
      const stored = await this.read()
      const { profiles, migrated } = await this.decrypt(stored)
      if (migrated) await writeJsonFileAtomic(this.path, stored)
      return profiles.map(toSavedProfileSummary)
    })
  }

  async get(id: string): Promise<SavedProfile> {
    requireSecureStorage()
    return this.mutate(async () => {
      const stored = await this.read()
      const target = stored.find((item) => item.id === id)
      if (!target) throw new Error('未找到已保存账号')
      const { profiles, migrated } = await this.decrypt([target])
      if (migrated) await writeJsonFileAtomic(this.path, stored)
      return profiles[0]
    })
  }

  async save(profile: SavedProfile): Promise<void> {
    requireSecureStorage()
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

  async setSecure(id: string, secure: boolean): Promise<void> {
    await this.updateConfig(id, (config) => ({ ...config, secure }))
  }

  async setCdnCredentials(id: string, credentials?: CdnCredentials): Promise<void> {
    await this.updateConfig(id, (config) => ({ ...config, cdnCredentials: credentials }))
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

  private async updateConfig(
    id: string,
    update: (config: SavedProfile['config']) => SavedProfile['config']
  ): Promise<void> {
    requireSecureStorage()
    await this.mutate(async () => {
      const stored = await this.read()
      const target = stored.find((item) => item.id === id)
      if (!target) throw new Error('未找到已保存账号')
      const {
        profiles: [profile]
      } = await this.decrypt([target])
      target.encryptedConfig = safeStorage
        .encryptString(JSON.stringify(update(profile.config)))
        .toString('base64')
      await writeJsonFileAtomic(this.path, stored)
    })
  }

  private async decrypt(
    stored: StoredProfile[]
  ): Promise<{ profiles: SavedProfile[]; migrated: boolean }> {
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
    return { profiles, migrated }
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

export function toSavedProfileSummary(profile: SavedProfile): SavedProfileSummary {
  return {
    id: profile.id,
    label: profile.label,
    alias: profile.config.alias,
    endpoint: profile.config.endpoint,
    endpointMode: profile.config.endpointMode,
    accessKeyId: profile.config.accessKeyId,
    secure: profile.config.secure,
    remember: profile.config.remember,
    presetPath: profile.config.presetPath,
    hasCdnCredentials: Boolean(profile.config.cdnCredentials),
    cdnAccessKeyId: profile.config.cdnCredentials?.accessKeyId
  }
}
