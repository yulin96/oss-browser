<script setup lang="ts">
import { X } from '@lucide/vue'
import { onMounted, ref } from 'vue'

const props = defineProps<{ title: string; width?: string; size?: 'default' | 'large' }>()
const emit = defineEmits<{ close: [] }>()

const isOpen = ref(false)
const isClosing = ref(false)
const modalCard = ref<HTMLElement | null>(null)

onMounted(() => {
  requestAnimationFrame(() => {
    isOpen.value = true
    if (props.size === 'large') return
    modalCard.value
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])'
      )
      ?.focus({ preventScroll: true })
  })
})

function handleClose(): void {
  isOpen.value = false
  isClosing.value = true
  const closeDur =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--modal-close-dur')) ||
    150
  setTimeout(() => {
    isClosing.value = false
    emit('close')
  }, closeDur)
}
</script>

<template>
  <div
    class="modal-mask"
    :class="{ 'is-active': isOpen, 'is-closing': isClosing }"
    @mousedown.self="handleClose"
  >
    <div
      ref="modalCard"
      class="modal-card"
      :class="{ 'is-large': size === 'large', 'is-active': isOpen, 'is-closing': isClosing }"
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
