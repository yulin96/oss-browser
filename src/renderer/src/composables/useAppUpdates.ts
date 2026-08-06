import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { UpdateState } from '../../../shared/types'
import { t } from '../i18n'
import type { ConfirmationRequest } from './useConfirmation'

export function useAppUpdates(requestConfirmation: (request: ConfirmationRequest) => void): {
  appVersion: Ref<string>
  currentReleaseNotes: Ref<string>
  updateState: Ref<UpdateState>
  updateDescription: ComputedRef<string>
  updateButtonLabel: ComputedRef<string>
  initializeUpdates: () => Promise<void>
  disposeUpdates: () => void
  handleUpdateAction: () => Promise<void>
} {
  const appVersion = ref('')
  const currentReleaseNotes = ref('')
  const updateState = ref<UpdateState>({ status: 'idle' })
  let promptedAvailableVersion = ''
  let promptedDownloadedVersion = ''
  let promptedFailedVersion = ''
  let removeUpdateListener: (() => void) | undefined

  const updateDescription = computed(() => {
    if (updateState.value.status === 'checking') return t('正在检查新版本…')
    if (updateState.value.status === 'available')
      return t('发现新版本 {version}', {
        version: updateState.value.version || ''
      })
    if (updateState.value.status === 'downloading')
      return t('正在下载新版本：{percent}%', { percent: updateState.value.percent || 0 })
    if (updateState.value.status === 'downloaded')
      return t('新版本 {version} 已下载，重启后安装', {
        version: updateState.value.version || ''
      })
    if (updateState.value.status === 'error') return t('检查更新失败，请稍后重试')
    if (updateState.value.status === 'unsupported') return t('开发模式下不检查更新')
    if (updateState.value.status === 'not-available') return t('当前已是最新版本')
    return t('当前版本：{version}', { version: appVersion.value })
  })

  const updateButtonLabel = computed(() => {
    if (updateState.value.status === 'checking') return t('检查中')
    if (updateState.value.status === 'available') return t('下载更新')
    if (updateState.value.status === 'downloading') return `${updateState.value.percent || 0}%`
    if (updateState.value.status === 'downloaded') return t('重启安装')
    if (updateState.value.status === 'error' && updateState.value.version) return t('手动下载')
    return t('检查更新')
  })

  function requestAvailableUpdate(): void {
    requestConfirmation({
      title: t('发现新版本'),
      description: t('新版本 {version} 已发布，是否现在下载？', {
        version: updateState.value.version || ''
      }),
      details: updateState.value.releaseNotes,
      confirmLabel: t('下载更新'),
      action: () => window.ossBrowser.updates.download()
    })
  }

  function requestUpdateInstall(): void {
    requestConfirmation({
      title: t('更新已准备好'),
      description: t('程序将关闭并安装新版本，是否立即重启？'),
      confirmLabel: t('重启安装'),
      action: () => window.ossBrowser.updates.install()
    })
  }

  function requestManualUpdate(): void {
    requestConfirmation({
      title: t('自动更新失败'),
      description: t('自动更新未能完成，可前往 GitHub 手动下载。'),
      details: updateState.value.message,
      confirmLabel: t('手动下载'),
      action: () =>
        window.ossBrowser.system.openExternal(
          'https://github.com/yulin96/oss-browser/releases/latest'
        )
    })
  }

  function handleUpdateState(state: UpdateState): void {
    updateState.value = state
    if (state.status === 'available' && state.version !== promptedAvailableVersion) {
      promptedAvailableVersion = state.version || 'latest'
      requestAvailableUpdate()
    }
    if (state.status === 'downloaded' && state.version !== promptedDownloadedVersion) {
      promptedDownloadedVersion = state.version || 'latest'
      requestUpdateInstall()
    }
    if (state.status === 'error' && state.version && state.version !== promptedFailedVersion) {
      promptedFailedVersion = state.version
      requestManualUpdate()
    }
  }

  async function initializeUpdates(): Promise<void> {
    const [version, releaseNotes] = await Promise.all([
      window.ossBrowser.system.getVersion(),
      window.ossBrowser.system.getReleaseNotes()
    ])
    appVersion.value = version
    currentReleaseNotes.value = releaseNotes
    removeUpdateListener = window.ossBrowser.onUpdate(handleUpdateState)
    updateState.value = await window.ossBrowser.updates.getState()
    handleUpdateState(updateState.value)
  }

  async function handleUpdateAction(): Promise<void> {
    if (updateState.value.status === 'available') return requestAvailableUpdate()
    if (updateState.value.status === 'downloaded') return requestUpdateInstall()
    if (updateState.value.status === 'error' && updateState.value.version)
      return requestManualUpdate()
    if (updateState.value.status === 'checking' || updateState.value.status === 'downloading')
      return
    try {
      handleUpdateState(await window.ossBrowser.updates.check())
    } catch {
      updateState.value = { status: 'error' }
    }
  }

  return {
    appVersion,
    currentReleaseNotes,
    updateState,
    updateDescription,
    updateButtonLabel,
    initializeUpdates,
    disposeUpdates: () => removeUpdateListener?.(),
    handleUpdateAction
  }
}
