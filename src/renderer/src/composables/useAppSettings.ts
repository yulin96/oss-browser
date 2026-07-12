import { reactive, ref, watch, type Ref } from 'vue'
import type { AppSettings, AuthConfig, SavedProfile } from '../../../shared/types'

export type ThemeMode = 'system' | 'light' | 'dark'

const defaultSettings: AppSettings = {
  maxUploadJobs: 3,
  maxDownloadJobs: 3,
  multipartParallel: 4,
  partSizeMb: 10,
  timeoutSeconds: 60,
  retryTimes: 5,
  listPageSize: 1000,
  showImagePreview: true
}

export function useAppSettings(options: {
  auth: AuthConfig
  loggedIn: Ref<boolean>
  savedProfiles: Ref<SavedProfile[]>
  profileId: () => string
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>
  taskError: Ref<string>
  showToast: (message: string) => void
  openModal: () => void
}): {
  settings: AppSettings
  themeMode: Ref<ThemeMode>
  initializeSettings: () => Promise<void>
  disposeSettings: () => void
  openSettings: () => void
} {
  const settings = reactive<AppSettings>({ ...defaultSettings })
  const storedTheme = localStorage.getItem('oss-browser-theme')
  const themeMode = ref<ThemeMode>(
    storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'system'
  )
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')

  function applyTheme(): void {
    const resolvedTheme =
      themeMode.value === 'system' ? (darkModeQuery.matches ? 'dark' : 'light') : themeMode.value
    document.documentElement.dataset.theme = resolvedTheme
  }

  applyTheme()

  async function initializeSettings(): Promise<void> {
    darkModeQuery.addEventListener('change', applyTheme)
    const storedSettings = localStorage.getItem('oss-browser-settings')
    if (storedSettings) {
      try {
        Object.assign(settings, JSON.parse(storedSettings))
      } catch {
        localStorage.removeItem('oss-browser-settings')
      }
    }
    await window.ossBrowser.settings.update({ ...settings })
  }

  function openSettings(): void {
    options.openModal()
  }

  // 监听 settings 改变，实时同步到主进程和 localStorage
  watch(
    settings,
    async (nextVal) => {
      await window.ossBrowser.settings.update({ ...nextVal })
      localStorage.setItem('oss-browser-settings', JSON.stringify(nextVal))
    },
    { deep: true }
  )

  // 监听主题改变，实时同步到 localStorage 并应用
  watch(themeMode, (nextTheme) => {
    localStorage.setItem('oss-browser-theme', nextTheme)
    applyTheme()
  })

  // 监听 HTTPS 设置改变，实时写入主进程并保存 profile
  watch(
    () => options.auth.secure,
    async (nextSecure) => {
      if (!options.loggedIn.value) return
      await window.ossBrowser.auth.setSecure(nextSecure)
      if (options.auth.remember) {
        await window.ossBrowser.profiles.save({
          id: options.profileId(),
          label: options.auth.alias?.trim() || options.auth.accessKeyId,
          config: { ...options.auth }
        })
        options.savedProfiles.value = await window.ossBrowser.profiles.list()
      }
    }
  )

  return {
    settings,
    themeMode,
    initializeSettings,
    disposeSettings: () => darkModeQuery.removeEventListener('change', applyTheme),
    openSettings
  }
}
