import { reactive, ref, type Ref } from 'vue'
import type { AppSettings, AuthConfig, SavedProfile } from '../../../shared/types'
import { t } from '../i18n'

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
  savedProfiles: Ref<SavedProfile[]>
  profileId: () => string
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>
  taskError: Ref<string>
  showToast: (message: string) => void
  openModal: () => void
}): {
  settings: AppSettings
  settingsDraft: AppSettings
  secureDraft: Ref<boolean>
  themeMode: Ref<ThemeMode>
  themeDraft: Ref<ThemeMode>
  initializeSettings: () => Promise<void>
  disposeSettings: () => void
  openSettings: () => void
  saveSettings: () => Promise<void>
} {
  const settings = reactive<AppSettings>({ ...defaultSettings })
  const settingsDraft = reactive<AppSettings>({ ...defaultSettings })
  const secureDraft = ref(options.auth.secure)
  const storedTheme = localStorage.getItem('oss-browser-theme')
  const themeMode = ref<ThemeMode>(
    storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'system'
  )
  const themeDraft = ref<ThemeMode>(themeMode.value)
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
    Object.assign(settingsDraft, settings)
    secureDraft.value = options.auth.secure
    themeDraft.value = themeMode.value
    options.openModal()
  }

  async function saveSettings(): Promise<void> {
    const nextSettings = { ...settingsDraft }
    const done = await options.run(() =>
      Promise.all([
        window.ossBrowser.settings.update(nextSettings),
        window.ossBrowser.auth.setSecure(secureDraft.value)
      ]).then(() => undefined)
    )
    if (done === undefined && options.taskError.value) return
    Object.assign(settings, nextSettings)
    options.auth.secure = secureDraft.value
    themeMode.value = themeDraft.value
    localStorage.setItem('oss-browser-settings', JSON.stringify(settings))
    localStorage.setItem('oss-browser-theme', themeMode.value)
    applyTheme()
    if (options.auth.remember) {
      await window.ossBrowser.profiles.save({
        id: options.profileId(),
        label: options.auth.alias?.trim() || options.auth.accessKeyId,
        config: { ...options.auth }
      })
      options.savedProfiles.value = await window.ossBrowser.profiles.list()
    }
    options.openModal()
    options.showToast(t('设置已保存'))
  }

  return {
    settings,
    settingsDraft,
    secureDraft,
    themeMode,
    themeDraft,
    initializeSettings,
    disposeSettings: () => darkModeQuery.removeEventListener('change', applyTheme),
    openSettings,
    saveSettings
  }
}
