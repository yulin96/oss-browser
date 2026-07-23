import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/i18n', () => ({ t: (key: string) => key }))

import { useTransfers } from '../src/renderer/src/composables/useTransfers'
import type { TransferItem } from '../src/shared/types'
import type { ConfirmationRequest } from '../src/renderer/src/composables/useConfirmation'

function transfer(overrides: Partial<TransferItem> = {}): TransferItem {
  return {
    id: 'transfer-1',
    batchId: 'batch-1',
    batchTotal: 1000,
    batchDone: 0,
    direction: 'upload',
    name: 'example.txt',
    progress: 0,
    status: 'running',
    ...overrides
  }
}

describe('useTransfers', () => {
  let listener: (item: TransferItem) => void
  let confirmation: ConfirmationRequest | undefined
  const cancelAll = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    confirmation = undefined
    cancelAll.mockClear()
    vi.stubGlobal('window', {
      ossBrowser: {
        onTransfer: (nextListener: (item: TransferItem) => void) => {
          listener = nextListener
          return vi.fn()
        },
        transfers: {
          cancel: vi.fn().mockResolvedValue(undefined),
          pauseAll: vi.fn().mockResolvedValue(undefined),
          resumeAll: vi.fn().mockResolvedValue(undefined),
          cancelAll
        }
      }
    })
  })

  it('only opens the panel automatically for a new batch', () => {
    const state = useTransfers((request) => {
      confirmation = request
    })
    state.initializeTransfers()

    listener(transfer())
    expect(state.showTransfers.value).toBe(true)
    expect(state.transferSummaries.value.upload.total).toBe(1000)

    state.showTransfers.value = false
    listener(transfer({ progress: 0.5 }))
    listener(transfer({ id: 'transfer-2', name: 'second.txt' }))
    expect(state.showTransfers.value).toBe(false)

    listener(transfer({ id: 'transfer-3', batchId: 'batch-2', batchTotal: 1 }))
    expect(state.showTransfers.value).toBe(true)
  })

  it('bounds detailed records while preserving the batch total', () => {
    const state = useTransfers(() => undefined)
    state.initializeTransfers()

    for (let index = 0; index < 250; index += 1) {
      listener(
        transfer({
          id: `transfer-${index}`,
          batchTotal: 250,
          batchDone: index + 1,
          status: 'done',
          progress: 1
        })
      )
    }

    expect(state.transfers.value).toHaveLength(200)
    expect(state.transferSummaries.value.upload).toMatchObject({ done: 250, total: 250 })
  })

  it('ignores delayed progress after deleting a transfer batch', async () => {
    const state = useTransfers((request) => {
      confirmation = request
    })
    state.initializeTransfers()
    listener(transfer())

    state.confirmDeleteAllTransfers()
    await confirmation?.action()
    state.showTransfers.value = false
    listener(transfer({ progress: 0.5 }))

    expect(cancelAll).toHaveBeenCalledWith('upload')
    expect(state.transfers.value).toHaveLength(0)
    expect(state.showTransfers.value).toBe(false)
    expect(state.transferSummaries.value.upload.total).toBe(0)
  })
})
