import { computed, ref, type ComputedRef, type Ref } from 'vue'

export function useAsyncTask(onStart?: () => void): {
  pending: ComputedRef<boolean>
  error: Ref<string>
  clearError: () => void
  reset: () => void
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>
} {
  const pendingCount = ref(0)
  const error = ref('')
  const pending = computed(() => pendingCount.value > 0)
  let generation = 0

  async function run<T>(task: () => Promise<T>): Promise<T | undefined> {
    const currentGeneration = generation
    onStart?.()
    pendingCount.value += 1
    error.value = ''
    try {
      const result = await task()
      return currentGeneration === generation ? result : undefined
    } catch (reason) {
      if (currentGeneration === generation)
        error.value = reason instanceof Error ? reason.message : String(reason)
      return undefined
    } finally {
      if (currentGeneration === generation) pendingCount.value -= 1
    }
  }

  return {
    pending,
    error,
    reset: () => {
      generation += 1
      pendingCount.value = 0
      error.value = ''
    },
    clearError: () => {
      error.value = ''
    },
    run
  }
}
