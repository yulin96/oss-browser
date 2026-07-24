import { createCipheriv, pbkdf2Sync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptLegacyMacSafeStorage } from '../src/main/macos-legacy-safe-storage'

function encryptLegacyMacSafeStorage(value: string, password: string): Buffer {
  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
  const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  return Buffer.concat([
    Buffer.from('v10'),
    cipher.update(Buffer.from(value, 'utf8')),
    cipher.final()
  ])
}

describe('legacy macOS safe storage', () => {
  it('decrypts Chromium v10 data with the legacy application password', () => {
    const password = 'legacy-safe-storage-password'
    const serialized = JSON.stringify({
      accessKeyId: 'test-access-key',
      accessKeySecret: 'test-access-secret'
    })

    expect(
      decryptLegacyMacSafeStorage(encryptLegacyMacSafeStorage(serialized, password), password)
    ).toBe(serialized)
  })

  it('rejects an unsupported encrypted value', () => {
    expect(() => decryptLegacyMacSafeStorage(Buffer.from('invalid'), 'password')).toThrow(
      '不支持的旧版安全存储格式'
    )
  })
})
