<script setup lang="ts">
import { X } from '@lucide/vue'
import { onMounted, ref } from 'vue'

const props = defineProps<{ title: string; width?: string; size?: 'default' | 'large' }>()
const emit = defineEmits<{ close: [] }>()

const modalCard = ref<HTMLElement | null>(null)

onMounted(() => {
  requestAnimationFrame(() => {
    if (props.size === 'large') return
    modalCard.value
      ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input:not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])'
      )
      ?.focus({ preventScroll: true })
  })
})

function handleClose(): void {
  emit('close')
}
</script>

<template>
  <div class="modal-mask" @mousedown.self="handleClose">
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
