import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue'

import type { TransferItem } from '../../../shared/types'
import type { ConfirmationRequest } from './useConfirmation'
import { t } from '../i18n'

export interface TransferSummary {
  done: number
  total: number
  progress: number
}

export function useTransfers(requestConfirmation: (request: ConfirmationRequest) => void): {
  transfers: Ref<TransferItem[]>
  showTransfers: Ref<boolean>
  activeTransferTab: Ref<TransferItem['direction']>
  transferSummaries: ComputedRef<Record<TransferItem['direction'], TransferSummary>>
  activeTransferSummary: ComputedRef<TransferSummary>
  visibleTransfers: ComputedRef<TransferItem[]>
  hasCompletedTransfers: ComputedRef<boolean>
  hasVisibleTransfers: ComputedRef<boolean>
  canResumeTransfers: ComputedRef<boolean>
  canPauseTransfers: ComputedRef<boolean>
  initializeTransfers: () => void
  disposeTransfers: () => void
  resetTransfers: () => void
  clearCompletedTransferRecords: () => void
  pauseAllTransfers: () => Promise<void>
  resumeAllTransfers: () => Promise<void>
  confirmDeleteAllTransfers: () => void
  cancelTransfer: (id: string) => Promise<void>
} {
  const transfers = ref<TransferItem[]>([])
  const batches = reactive(
    new Map<
      string,
      {
        direction: TransferItem['direction']
        rawDone: number
        rawTotal: number
        removedDone: number
      }
    >()
  )
  const showTransfers = ref(false)
  const activeTransferTab = ref<TransferItem['direction']>('upload')
  let removeTransferListener: (() => void) | undefined

  const transferSummaries = computed<Record<TransferItem['direction'], TransferSummary>>(() => {
    const summaries = {
      upload: { done: 0, total: 0, progress: 0 },
      download: { done: 0, total: 0, progress: 0 }
    }
    for (const batch of batches.values()) {
      if (!Number.isFinite(batch.rawDone) || !Number.isFinite(batch.rawTotal)) continue
      summaries[batch.direction].done += Math.max(0, batch.rawDone - batch.removedDone)
      summaries[batch.direction].total += Math.max(0, batch.rawTotal - batch.removedDone)
    }
    for (const transfer of transfers.value) {
      const batch = batches.get(transfer.batchId)
      if (batch && Number.isFinite(batch.rawDone) && Number.isFinite(batch.rawTotal)) continue
      summaries[transfer.direction].total += 1
      if (transfer.status === 'done') summaries[transfer.direction].done += 1
    }
    for (const summary of Object.values(summaries)) {
      summary.progress = summary.total ? summary.done / summary.total : 0
    }
    return summaries
  })
  const activeTransferSummary = computed(() => transferSummaries.value[activeTransferTab.value])
  const visibleTransfers = computed(() =>
    transfers.value.filter((transfer) => transfer.direction === activeTransferTab.value)
  )
  const hasCompletedTransfers = computed(() =>
    visibleTransfers.value.some((transfer) => transfer.status === 'done')
  )
  const hasVisibleTransfers = computed(() => visibleTransfers.value.length > 0)
  const canResumeTransfers = computed(() =>
    visibleTransfers.value.some(
      (transfer) => transfer.status === 'paused' || transfer.status === 'error'
    )
  )
  const canPauseTransfers = computed(() =>
    visibleTransfers.value.some((transfer) => transfer.status === 'running')
  )

  function initializeTransfers(): void {
    removeTransferListener?.()
    removeTransferListener = window.ossBrowser.onTransfer((item) => {
      const index = transfers.value.findIndex((transfer) => transfer.id === item.id)
      if (index === -1) transfers.value.unshift(item)
      else transfers.value[index] = item
      if (item.batchId && Number.isFinite(item.batchDone) && Number.isFinite(item.batchTotal)) {
        const batch = batches.get(item.batchId)
        batches.set(item.batchId, {
          direction: item.direction,
          rawDone: Math.max(batch?.rawDone || 0, item.batchDone),
          rawTotal: item.batchTotal,
          removedDone: batch?.removedDone || 0
        })
      } else {
        console.error('[transfers] Invalid batch progress', {
          id: item.id,
          batchId: item.batchId,
          batchDone: item.batchDone,
          batchTotal: item.batchTotal
        })
      }
      activeTransferTab.value = item.direction
      showTransfers.value = true
    })
  }

  function disposeTransfers(): void {
    removeTransferListener?.()
    removeTransferListener = undefined
  }

  function resetTransfers(): void {
    transfers.value = []
    batches.clear()
    showTransfers.value = false
    activeTransferTab.value = 'upload'
  }

  function clearCompletedTransferRecords(): void {
    const removedByBatch = new Map<string, number>()
    transfers.value = transfers.value.filter((transfer) => {
      const remove = transfer.direction === activeTransferTab.value && transfer.status === 'done'
      if (remove)
        removedByBatch.set(transfer.batchId, (removedByBatch.get(transfer.batchId) || 0) + 1)
      return !remove
    })
    for (const [batchId, count] of removedByBatch) {
      const batch = batches.get(batchId)
      if (!batch) continue
      batch.removedDone += count
      if (batch.removedDone >= batch.rawTotal) batches.delete(batchId)
    }
  }

  async function pauseAllTransfers(): Promise<void> {
    await window.ossBrowser.transfers.pauseAll(activeTransferTab.value)
  }

  async function resumeAllTransfers(): Promise<void> {
    await window.ossBrowser.transfers.resumeAll(activeTransferTab.value)
  }

  function confirmDeleteAllTransfers(): void {
    const direction = activeTransferTab.value
    requestConfirmation({
      title: t('删除全部传输任务'),
      description: t('确定删除全部{name}任务吗？正在传输的任务将被取消。', {
        name: t(direction === 'upload' ? '上传' : '下载')
      }),
      confirmLabel: t('删除全部'),
      destructive: true,
      action: () => deleteAllTransfers(direction)
    })
  }

  async function deleteAllTransfers(direction: TransferItem['direction']): Promise<void> {
    await window.ossBrowser.transfers.cancelAll(direction)
    transfers.value = transfers.value.filter((transfer) => transfer.direction !== direction)
    for (const [batchId, batch] of batches) {
      if (batch.direction === direction) batches.delete(batchId)
    }
  }

  function cancelTransfer(id: string): Promise<void> {
    return window.ossBrowser.transfers.cancel(id)
  }

  return {
    transfers,
    showTransfers,
    activeTransferTab,
    transferSummaries,
    activeTransferSummary,
    visibleTransfers,
    hasCompletedTransfers,
    hasVisibleTransfers,
    canResumeTransfers,
    canPauseTransfers,
    initializeTransfers,
    disposeTransfers,
    resetTransfers,
    clearCompletedTransferRecords,
    pauseAllTransfers,
    resumeAllTransfers,
    confirmDeleteAllTransfers,
    cancelTransfer
  }
}
