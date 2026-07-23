import { reactive, ref, watch, type Ref } from 'vue'
import { DEFAULT_APP_SETTINGS, validateAppSettings } from '../../../shared/app-settings'
import type { AppSettings, AuthConfig, SavedProfile } from '../../../shared/types'

export type ThemeMode = 'system' | 'light' | 'dark'

const defaultSettings: AppSettings = { ...DEFAULT_APP_SETTINGS }

const legacyDefaultSettings: AppSettings = {
  ...defaultSettings,
  listPageSize: 1000
}
const settingsStorageKey = 'oss-browser-settings'
const settingsStorageVersion = 2
const settingKeys = Object.keys(defaultSettings) as Array<keyof AppSettings>

interface StoredSettings {
  version: number
  overrides: Partial<AppSettings>
}

export function useAppSettings(options: {
  auth: AuthConfig
  loggedIn: Ref<boolean>
  savedProfiles: Ref<SavedProfile[]>
  profileId: () => string
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>
  taskError: Ref<string>
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
  let initializingSettings = true

  function knownSettings(value: unknown): Partial<AppSettings> {
    if (!value || typeof value !== 'object') return {}
    const source = value as Record<string, unknown>
    return Object.fromEntries(
      settingKeys
        .filter((key) => {
          if (key === 'uploadConflictPolicy') {
            return source[key] === 'ask' || source[key] === 'replace' || source[key] === 'skip'
          }
          return typeof source[key] === typeof defaultSettings[key]
        })
        .map((key) => [key, source[key]])
    ) as Partial<AppSettings>
  }

  function loadSettingsOverrides(): Partial<AppSettings> {
    const storedSettings = localStorage.getItem(settingsStorageKey)
    if (!storedSettings) return {}
    try {
      const parsed = JSON.parse(storedSettings) as unknown
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed as StoredSettings).version === settingsStorageVersion
      ) {
        return knownSettings((parsed as StoredSettings).overrides)
      }

      const legacySettings = knownSettings(parsed)
      return Object.fromEntries(
        settingKeys
          .filter(
            (key) =>
              legacySettings[key] !== undefined &&
              legacySettings[key] !== legacyDefaultSettings[key]
          )
          .map((key) => [key, legacySettings[key]])
      ) as Partial<AppSettings>
    } catch {
      localStorage.removeItem(settingsStorageKey)
      return {}
    }
  }

  function storeSettingsOverrides(value: AppSettings): void {
    const overrides = Object.fromEntries(
      settingKeys
        .filter((key) => value[key] !== defaultSettings[key])
        .map((key) => [key, value[key]])
    ) as Partial<AppSettings>
    if (!Object.keys(overrides).length) {
      localStorage.removeItem(settingsStorageKey)
      return
    }
    localStorage.setItem(
      settingsStorageKey,
      JSON.stringify({ version: settingsStorageVersion, overrides } satisfies StoredSettings)
    )
  }

  function applyTheme(): void {
    const resolvedTheme =
      themeMode.value === 'system' ? (darkModeQuery.matches ? 'dark' : 'light') : themeMode.value
    document.documentElement.dataset.theme = resolvedTheme
  }

  applyTheme()

  async function initializeSettings(): Promise<void> {
    darkModeQuery.addEventListener('change', applyTheme)
    Object.assign(settings, loadSettingsOverrides())
    try {
      Object.assign(settings, validateAppSettings(settings))
    } catch {
      Object.assign(settings, defaultSettings)
      localStorage.removeItem(settingsStorageKey)
    }
    storeSettingsOverrides(settings)
    try {
      await window.ossBrowser.settings.update({ ...settings })
    } finally {
      initializingSettings = false
    }
  }

  function openSettings(): void {
    options.openModal()
  }

  // 监听 settings 改变，实时同步到主进程并只保存偏离默认值的覆盖项
  watch(
    settings,
    async (nextVal) => {
      if (initializingSettings) return
      try {
        const validated = validateAppSettings(nextVal)
        await window.ossBrowser.settings.update(validated)
        storeSettingsOverrides(validated)
        options.taskError.value = ''
      } catch (error) {
        options.taskError.value = error instanceof Error ? error.message : String(error)
      }
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
