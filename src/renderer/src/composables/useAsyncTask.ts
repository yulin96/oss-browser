import { computed, ref, type ComputedRef, type Ref } from 'vue'

export function useAsyncTask(onStart?: () => void): {
  pending: ComputedRef<boolean>
  error: Ref<string>
  clearError: () => void
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>
} {
  const pendingCount = ref(0)
  const error = ref('')
  const pending = computed(() => pendingCount.value > 0)

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    onStart?.()
    pendingCount.value += 1
    error.value = ''
    try {
      return await task()
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      return undefined
    } finally {
      pendingCount.value -= 1
    }
  }

  return {
    pending,
    error,
    clearError: () => {
      error.value = ''
    },
    run
  }
}
