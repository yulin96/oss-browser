<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  label: string
  icon?: Component
  endIcon?: Component
  tone?: 'primary' | 'default' | 'danger' | 'ghost'
  disabled?: boolean
}>()

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <div
    class="app-button"
    :class="[`is-${tone || 'default'}`, { 'is-disabled': disabled }]"
    role="button"
    :tabindex="disabled ? -1 : 0"
    @click="!disabled && emit('click')"
    @keydown.enter="!disabled && emit('click')"
  >
    <component :is="icon" v-if="icon" :size="15" />
    {{ label }}
    <component :is="endIcon" v-if="endIcon" :size="14" />
  </div>
</template>
