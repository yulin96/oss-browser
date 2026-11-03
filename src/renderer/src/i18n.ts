import { ref } from 'vue'
import { translate } from '../../shared/i18n'
import type { AppLocale } from '../../shared/types'
export type { AppLocale } from '../../shared/types'

export const localeOptions: Array<{ value: AppLocale; label: string; compactLabel: string }> = [
  { value: 'zh-CN', label: '中文', compactLabel: '中文' },
  { value: 'zh-TW', label: '繁体中文', compactLabel: '繁体中文' },
  { value: 'en-US', label: 'English', compactLabel: 'EN' },
  { value: 'ja-JP', label: '日本語', compactLabel: '日本語' },
  { value: 'ko-KR', label: '한국어', compactLabel: '한국어' }
]

const savedLocale = localStorage.getItem('oss-browser-locale')
export const locale = ref<AppLocale>(
  localeOptions.some((option) => option.value === savedLocale)
    ? (savedLocale as AppLocale)
    : 'zh-CN'
)

export function localeLabel(value: string, compact = false): string {
  const option = localeOptions.find((item) => item.value === value) || localeOptions[0]
  return compact ? option.compactLabel : option.label
}

export function setLocale(value: AppLocale): void {
  locale.value = value
  localStorage.setItem('oss-browser-locale', value)
  document.documentElement.lang = value
  void window.ossBrowser.system.setLocale(value)
}

export function t(source: string, params: Record<string, string | number> = {}): string {
  return translate(locale.value, source, params)
}

export function storageClassLabel(storageClass?: string): string {
  const labels: Record<string, string> = {
    Standard: '标准',
    IA: '低频',
    InfrequentAccess: '低频',
    Archive: '归档',
    ColdArchive: '冷归档',
    DeepColdArchive: '深度冷归档'
  }
  return t(labels[storageClass || 'Standard'] || storageClass || '标准')
}

document.documentElement.lang = locale.value
