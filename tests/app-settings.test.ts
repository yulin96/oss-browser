import { describe, expect, it } from 'vitest'
import { DEFAULT_APP_SETTINGS, validateAppSettings } from '../src/shared/app-settings'

describe('validateAppSettings', () => {
  it('returns an independent validated settings object', () => {
    const source = { ...DEFAULT_APP_SETTINGS }

    const result = validateAppSettings(source)

    expect(result).toEqual(source)
    expect(result).not.toBe(source)
  })

  it.each([
    ['maxUploadJobs', 0],
    ['maxDownloadJobs', 11],
    ['multipartParallel', 1.5],
    ['partSizeMb', 0],
    ['timeoutSeconds', 9],
    ['retryTimes', -1],
    ['listPageSize', 1001]
  ])('rejects an invalid %s value', (key, value) => {
    expect(() => validateAppSettings({ ...DEFAULT_APP_SETTINGS, [key]: value })).toThrow()
  })

  it('rejects invalid boolean and conflict policy values', () => {
    expect(() =>
      validateAppSettings({ ...DEFAULT_APP_SETTINGS, showImagePreview: 'yes' })
    ).toThrow()
    expect(() =>
      validateAppSettings({ ...DEFAULT_APP_SETTINGS, uploadConflictPolicy: 'overwrite' })
    ).toThrow()
  })
})
