<script setup lang="ts">
import { X } from '@lucide/vue'
defineProps<{ title: string; width?: string; size?: 'default' | 'large' }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="modal-mask" @mousedown.self="$emit('close')">
    <div
      class="modal-card"
      :class="{ 'is-large': size === 'large' }"
      :style="size === 'large' ? undefined : { width: width || '480px' }"
    >
      <div class="modal-head">
        <div class="modal-title">{{ title }}</div>
        <div class="icon-button" role="button" tabindex="0" @click="$emit('close')">
          <X :size="18" />
        </div>
      </div>
      <div class="modal-body"><slot /></div>
      <div v-if="$slots.footer" class="modal-footer"><slot name="footer" /></div>
    </div>
  </div>
</template>
