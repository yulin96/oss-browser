import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { safeStorage } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8')
  }
}))

import { ProfileStore } from '../src/main/profile-store'
import type { SavedProfile } from '../src/shared/types'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

describe('ProfileStore renderer boundary', () => {
  it('rejects weak Linux storage without writing a credential file', async () => {
    state.userData = await mkdtemp(join(tmpdir(), 'oss-browser-profiles-'))
    temporaryDirectories.push(state.userData)
    vi.stubGlobal('process', Object.create(process, { platform: { value: 'linux' } }))
    vi.spyOn(safeStorage, 'getSelectedStorageBackend').mockReturnValue('basic_text')
    const store = new ProfileStore()
    const profile: SavedProfile = {
      id: 'test',
      label: 'test',
      config: {
        endpoint: 'endpoint',
        endpointMode: 'custom',
        accessKeyId: 'id',
        accessKeySecret: 'temporary',
        secure: true,
        remember: true
      }
    }
    await expect(store.save(profile)).rejects.toThrow('系统密钥环')
    await expect(readFile(join(state.userData, 'profiles.json'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('lists only non-sensitive profile summaries', async () => {
    state.userData = await mkdtemp(join(tmpdir(), 'oss-browser-profiles-'))
    temporaryDirectories.push(state.userData)
    const store = new ProfileStore()
    const profile: SavedProfile = {
      id: 'endpoint|access-id',
      label: 'Production',
      config: {
        alias: 'Production',
        endpoint: 'endpoint',
        endpointMode: 'custom',
        accessKeyId: 'access-id',
        accessKeySecret: 'access-secret',
        secure: true,
        remember: true,
        cdnCredentials: {
          accessKeyId: 'cdn-id',
          accessKeySecret: 'cdn-secret'
        }
      }
    }
    await store.save(profile)

    await expect(store.list()).resolves.toEqual([
      {
        id: profile.id,
        label: 'Production',
        alias: 'Production',
        endpoint: 'endpoint',
        endpointMode: 'custom',
        accessKeyId: 'access-id',
        secure: true,
        remember: true,
        hasCdnCredentials: true,
        cdnAccessKeyId: 'cdn-id'
      }
    ])
    expect(JSON.stringify(await store.list())).not.toContain('access-secret')
    expect(JSON.stringify(await store.list())).not.toContain('cdn-secret')

    const path = join(state.userData, 'profiles.json')
    const stored = JSON.parse(await readFile(path, 'utf8'))
    stored.push({ id: 'unreadable', label: 'unreadable', encryptedConfig: 'invalid' })
    await writeFile(path, JSON.stringify(stored))
    await store.setSecure(profile.id, false)
    await store.setCdnCredentials(profile.id, undefined)
    const updated = await store.get(profile.id)
    expect(updated).toMatchObject({
      config: { accessKeySecret: 'access-secret', secure: false }
    })
    expect(updated.config.cdnCredentials).toBeUndefined()
  })
})
