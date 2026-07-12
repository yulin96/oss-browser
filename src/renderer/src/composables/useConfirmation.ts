import { shallowRef } from 'vue'

export interface ConfirmationRequest {
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  action: () => void | Promise<void>
}

export function useConfirmation(): {
  confirmation: ReturnType<typeof shallowRef<ConfirmationRequest | null>>
  requestConfirmation: (request: ConfirmationRequest) => void
  confirmPendingAction: () => Promise<void>
} {
  const confirmation = shallowRef<ConfirmationRequest | null>(null)

  async function confirmPendingAction(): Promise<void> {
    const pending = confirmation.value
    confirmation.value = null
    await pending?.action()
  }

  return {
    confirmation,
    requestConfirmation: (request) => {
      confirmation.value = request
    },
    confirmPendingAction
  }
}
