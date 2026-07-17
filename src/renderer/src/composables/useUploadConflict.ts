import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { UploadConflict, UploadConflictPolicy } from '../../../shared/types'

export interface UploadConflictResolution {
  skipNames: string[]
  rememberedPolicy?: Exclude<UploadConflictPolicy, 'ask'>
}

export function useUploadConflict(): {
  uploadConflictOpen: ComputedRef<boolean>
  currentUploadConflict: ComputedRef<UploadConflict | null>
  uploadConflictIndex: Ref<number>
  uploadConflictTotal: ComputedRef<number>
  rememberUploadConflictChoice: Ref<boolean>
  resolveUploadConflicts: (conflicts: UploadConflict[]) => Promise<UploadConflictResolution | null>
  replaceUploadConflict: () => void
  replaceAllUploadConflicts: () => void
  skipUploadConflict: () => void
  skipAllUploadConflicts: () => void
  cancelUploadConflicts: () => void
} {
  const conflicts = ref<UploadConflict[]>([])
  const uploadConflictIndex = ref(0)
  const rememberUploadConflictChoice = ref(false)
  const skippedNames = new Set<string>()
  let finish: ((resolution: UploadConflictResolution | null) => void) | null = null

  const currentUploadConflict = computed(() => conflicts.value[uploadConflictIndex.value] || null)
  const uploadConflictOpen = computed(() => currentUploadConflict.value !== null)
  const uploadConflictTotal = computed(() => conflicts.value.length)

  function reset(): void {
    conflicts.value = []
    uploadConflictIndex.value = 0
    rememberUploadConflictChoice.value = false
    skippedNames.clear()
    finish = null
  }

  function complete(resolution: UploadConflictResolution | null): void {
    const resolve = finish
    reset()
    resolve?.(resolution)
  }

  function finishOrContinue(): void {
    if (uploadConflictIndex.value + 1 < conflicts.value.length) {
      uploadConflictIndex.value += 1
      return
    }
    complete({ skipNames: [...skippedNames] })
  }

  function replaceUploadConflict(): void {
    if (rememberUploadConflictChoice.value) {
      complete({ skipNames: [...skippedNames], rememberedPolicy: 'replace' })
      return
    }
    finishOrContinue()
  }

  function replaceAllUploadConflicts(): void {
    complete({
      skipNames: [...skippedNames],
      rememberedPolicy: rememberUploadConflictChoice.value ? 'replace' : undefined
    })
  }

  function skipUploadConflict(): void {
    const current = currentUploadConflict.value
    if (!current) return
    skippedNames.add(current.name)
    if (rememberUploadConflictChoice.value) {
      for (const conflict of conflicts.value.slice(uploadConflictIndex.value + 1)) {
        skippedNames.add(conflict.name)
      }
      complete({ skipNames: [...skippedNames], rememberedPolicy: 'skip' })
      return
    }
    finishOrContinue()
  }

  function skipAllUploadConflicts(): void {
    for (const conflict of conflicts.value.slice(uploadConflictIndex.value)) {
      skippedNames.add(conflict.name)
    }
    complete({
      skipNames: [...skippedNames],
      rememberedPolicy: rememberUploadConflictChoice.value ? 'skip' : undefined
    })
  }

  function cancelUploadConflicts(): void {
    complete(null)
  }

  return {
    uploadConflictOpen,
    currentUploadConflict,
    uploadConflictIndex,
    uploadConflictTotal,
    rememberUploadConflictChoice,
    resolveUploadConflicts: (nextConflicts) => {
      if (!nextConflicts.length) return Promise.resolve({ skipNames: [] })
      cancelUploadConflicts()
      conflicts.value = nextConflicts
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    replaceUploadConflict,
    replaceAllUploadConflicts,
    skipUploadConflict,
    skipAllUploadConflicts,
    cancelUploadConflicts
  }
}
