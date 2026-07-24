import { execFile } from 'node:child_process'
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'

const legacySafeStorageService = 'oss-browser Safe Storage'

export function decryptLegacyMacSafeStorage(encrypted: Buffer, password: string): string {
  if (encrypted.subarray(0, 3).toString('ascii') !== 'v10') {
    throw new Error('不支持的旧版安全存储格式')
  }

  const key = pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20))
  return Buffer.concat([decipher.update(encrypted.subarray(3)), decipher.final()]).toString('utf8')
}

export function readLegacyMacSafeStoragePassword(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/security',
      ['find-generic-password', '-w', '-s', legacySafeStorageService],
      { encoding: 'utf8', maxBuffer: 4096, timeout: 5000 },
      (error, stdout) => {
        const password = error ? '' : stdout.trim()
        resolve(password || undefined)
      }
    )
  })
}
