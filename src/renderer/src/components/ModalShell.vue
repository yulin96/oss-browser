<script setup lang="ts">
import { X } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ title: string; width?: string; size?: 'default' | 'large' }>()
const emit = defineEmits<{ close: [] }>()

const modalMask = ref<HTMLElement | null>(null)
const modalCard = ref<HTMLElement | null>(null)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
  requestAnimationFrame(() => {
    if (props.size === 'large') return
    modalCard.value
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])'
      )
      ?.focus({ preventScroll: true })
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})

function handleClose(): void {
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return
  if (document.querySelector('[data-slot="alert-dialog-content"][data-state="open"]')) return

  const openModals = document.querySelectorAll<HTMLElement>('.modal-mask')
  if (openModals.item(openModals.length - 1) !== modalMask.value) return

  event.preventDefault()
  event.stopImmediatePropagation()
  handleClose()
}
</script>

<template>
  <div ref="modalMask" class="modal-mask" @mousedown.self="handleClose">
    <div
      ref="modalCard"
      class="modal-card"
      :class="{ 'is-large': size === 'large' }"
      :style="size === 'large' ? undefined : { width: width || '480px' }"
    >
      <div class="modal-head">
        <div class="modal-title">{{ title }}</div>
        <div class="icon-button" role="button" tabindex="0" @click="handleClose">
          <X :size="18" />
        </div>
      </div>
      <div class="modal-body"><slot /></div>
      <div v-if="$slots.footer" class="modal-footer"><slot name="footer" /></div>
    </div>
  </div>
</template>
