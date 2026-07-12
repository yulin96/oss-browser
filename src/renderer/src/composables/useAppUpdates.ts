import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { UpdateState } from '../../../shared/types'
import type { ConfirmationRequest } from './useConfirmation'
import { t } from '../i18n'

export function useAppUpdates(
  requestConfirmation: (request: ConfirmationRequest) => void,
  showToast: (message: string) => void
): {
  appVersion: Ref<string>
  updateState: Ref<UpdateState>
  updateDescription: ComputedRef<string>
  updateButtonLabel: ComputedRef<string>
  initializeUpdates: () => Promise<void>
  disposeUpdates: () => void
  handleUpdateAction: () => Promise<void>
} {
  const appVersion = ref('')
  const updateState = ref<UpdateState>({ status: 'idle' })
  const manualUpdateCheck = ref(false)
  let promptedAvailableVersion = ''
  let promptedDownloadedVersion = ''
  let removeUpdateListener: (() => void) | undefined

  const updateDescription = computed(() => {
    if (updateState.value.status === 'checking') return t('正在检查新版本…')
    if (updateState.value.status === 'available')
      return t('发现新版本 {version}', { version: updateState.value.version || '' })
    if (updateState.value.status === 'downloading')
      return t('正在下载新版本：{percent}%', { percent: updateState.value.percent || 0 })
    if (updateState.value.status === 'downloaded')
      return t('新版本 {version} 已下载，重启后安装', {
        version: updateState.value.version || ''
      })
    if (updateState.value.status === 'error') return t('检查更新失败，请稍后重试')
    if (updateState.value.status === 'unsupported') return t('开发模式下不检查更新')
    return t('当前版本：{version}', { version: appVersion.value })
  })

  const updateButtonLabel = computed(() => {
    if (updateState.value.status === 'checking') return t('检查中')
    if (updateState.value.status === 'available') return t('下载更新')
    if (updateState.value.status === 'downloading') return `${updateState.value.percent || 0}%`
    if (updateState.value.status === 'downloaded') return t('重启安装')
    return t('检查更新')
  })

  function requestUpdateDownload(): void {
    requestConfirmation({
      title: t('发现新版本'),
      description: t('新版本 {version} 已发布，是否现在下载？', {
        version: updateState.value.version || ''
      }),
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

  function handleUpdateState(state: UpdateState): void {
    updateState.value = state
    if (state.status === 'available' && state.version !== promptedAvailableVersion) {
      promptedAvailableVersion = state.version || 'latest'
      requestUpdateDownload()
    }
    if (state.status === 'downloaded' && state.version !== promptedDownloadedVersion) {
      promptedDownloadedVersion = state.version || 'latest'
      requestUpdateInstall()
    }
    if (manualUpdateCheck.value && state.status === 'not-available') {
      manualUpdateCheck.value = false
      showToast(t('当前已是最新版本'))
    }
    if (manualUpdateCheck.value && state.status === 'error') {
      manualUpdateCheck.value = false
      showToast(t('检查更新失败，请稍后重试'))
    }
  }

  async function initializeUpdates(): Promise<void> {
    removeUpdateListener = window.ossBrowser.onUpdate(handleUpdateState)
    updateState.value = await window.ossBrowser.updates.getState()
    handleUpdateState(updateState.value)
    appVersion.value = await window.ossBrowser.system.getVersion()
  }

  async function handleUpdateAction(): Promise<void> {
    if (updateState.value.status === 'available') return requestUpdateDownload()
    if (updateState.value.status === 'downloaded') return requestUpdateInstall()
    if (updateState.value.status === 'checking' || updateState.value.status === 'downloading')
      return
    manualUpdateCheck.value = true
    try {
      handleUpdateState(await window.ossBrowser.updates.check())
    } catch {
      manualUpdateCheck.value = false
      showToast(t('检查更新失败，请稍后重试'))
    }
  }

  return {
    appVersion,
    updateState,
    updateDescription,
    updateButtonLabel,
    initializeUpdates,
    disposeUpdates: () => removeUpdateListener?.(),
    handleUpdateAction
  }
}
