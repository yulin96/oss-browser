<script setup lang="ts">
import { X } from '@lucide/vue'
import { onMounted, ref } from 'vue'

defineProps<{ title: string; width?: string; size?: 'default' | 'large' }>()
const emit = defineEmits<{ close: [] }>()

const show = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    show.value = true
  })
})

function handleClose(): void {
  show.value = false
  setTimeout(() => {
    emit('close')
  }, 180)
}
</script>

<template>
  <div class="modal-mask" :class="{ 'is-active': show }" @mousedown.self="handleClose">
    <div
      class="modal-card"
      :class="{ 'is-large': size === 'large', 'is-active': show }"
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
