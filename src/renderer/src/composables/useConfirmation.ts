import type { Ref, ShallowRef } from 'vue'
import { ref, shallowRef } from 'vue'

export interface ConfirmationRequest {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  action: () => void | Promise<void>
}

export function useConfirmation(): {
  confirmation: ShallowRef<ConfirmationRequest | null>
  confirmationOpen: Ref<boolean>
  requestConfirmation: (request: ConfirmationRequest) => void
  closeConfirmation: () => void
  confirmPendingAction: () => void
  finishConfirmationClose: () => Promise<void>
  resetConfirmation: () => void
} {
  const confirmation = shallowRef<ConfirmationRequest | null>(null)
  const confirmationOpen = ref(false)
  let pendingAction: ConfirmationRequest['action'] | null = null

  function closeConfirmation(): void {
    confirmationOpen.value = false
  }

  function confirmPendingAction(): void {
    if (!confirmationOpen.value) return
    pendingAction = confirmation.value?.action ?? null
    confirmationOpen.value = false
  }

  async function finishConfirmationClose(): Promise<void> {
    const action = pendingAction
    pendingAction = null
    confirmation.value = null
    await action?.()
  }

  function resetConfirmation(): void {
    confirmationOpen.value = false
    confirmation.value = null
    pendingAction = null
  }

  return {
    confirmation,
    confirmationOpen,
    requestConfirmation: (request) => {
      confirmation.value = request
      confirmationOpen.value = true
    },
    closeConfirmation,
    confirmPendingAction,
    finishConfirmationClose,
    resetConfirmation
  }
}
