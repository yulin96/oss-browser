import type { AppSettings, UploadConflictPolicy } from './types'

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = {
  maxUploadJobs: 3,
  maxDownloadJobs: 3,
  multipartParallel: 5,
  partSizeMb: 10,
  timeoutSeconds: 60,
  retryTimes: 5,
  listPageSize: 500,
  showImagePreview: true,
  showImageResolution: false,
  uploadConflictPolicy: 'ask'
}

const integerRanges = {
  maxUploadJobs: [1, 10],
  maxDownloadJobs: [1, 10],
  multipartParallel: [1, 10],
  partSizeMb: [1, 1024],
  timeoutSeconds: [10, 86400],
  retryTimes: [0, 10],
  listPageSize: [10, 1000]
} as const satisfies Record<
  | 'maxUploadJobs'
  | 'maxDownloadJobs'
  | 'multipartParallel'
  | 'partSizeMb'
  | 'timeoutSeconds'
  | 'retryTimes'
  | 'listPageSize',
  readonly [number, number]
>

function integerSetting(source: Record<string, unknown>, key: keyof typeof integerRanges): number {
  const value = source[key]
  const [minimum, maximum] = integerRanges[key]
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`设置“${key}”必须是 ${minimum} 到 ${maximum} 之间的整数`)
  }
  return value as number
}

function booleanSetting(source: Record<string, unknown>, key: string): boolean {
  const value = source[key]
  if (typeof value !== 'boolean') throw new Error(`设置“${key}”必须是布尔值`)
  return value
}

function conflictPolicySetting(source: Record<string, unknown>): UploadConflictPolicy {
  const value = source.uploadConflictPolicy
  if (value !== 'ask' && value !== 'replace' && value !== 'skip') {
    throw new Error('上传同名文件设置无效')
  }
  return value
}

export function validateAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('应用设置格式不正确')
  }
  const source = value as Record<string, unknown>
  return {
    maxUploadJobs: integerSetting(source, 'maxUploadJobs'),
    maxDownloadJobs: integerSetting(source, 'maxDownloadJobs'),
    multipartParallel: integerSetting(source, 'multipartParallel'),
    partSizeMb: integerSetting(source, 'partSizeMb'),
    timeoutSeconds: integerSetting(source, 'timeoutSeconds'),
    retryTimes: integerSetting(source, 'retryTimes'),
    listPageSize: integerSetting(source, 'listPageSize'),
    showImagePreview: booleanSetting(source, 'showImagePreview'),
    showImageResolution: booleanSetting(source, 'showImageResolution'),
    uploadConflictPolicy: conflictPolicySetting(source)
  }
}
