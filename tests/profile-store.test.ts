import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => state.userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8')
  }
}))

import { ProfileStore } from '../src/main/profile-store'
import type { SavedProfile } from '../src/shared/types'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

describe('ProfileStore renderer boundary', () => {
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

    await store.setSecure(profile.id, false)
    await store.setCdnCredentials(profile.id, undefined)
    const updated = await store.get(profile.id)
    expect(updated).toMatchObject({
      config: { accessKeySecret: 'access-secret', secure: false }
    })
    expect(updated.config.cdnCredentials).toBeUndefined()
  })
})
