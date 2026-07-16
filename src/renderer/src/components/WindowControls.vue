<script setup lang="ts">
import { Copy, Minus, Square, X } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

import type { AppPlatform } from '../../../shared/types'

const props = defineProps<{ platform: AppPlatform }>()

const maximized = ref(false)
let removeMaximizeListener: (() => void) | undefined

onMounted(async () => {
  if (props.platform === 'darwin') return
  maximized.value = await window.ossBrowser.window.isMaximized()
  removeMaximizeListener = window.ossBrowser.window.onMaximizeChange((value) => {
    maximized.value = value
  })
})

onBeforeUnmount(() => removeMaximizeListener?.())

async function toggleMaximize(): Promise<void> {
  maximized.value = await window.ossBrowser.window.toggleMaximize()
}

function minimize(): void {
  void window.ossBrowser.window.minimize()
}

function close(): void {
  void window.ossBrowser.window.close()
}
</script>

<template>
  <div v-if="platform !== 'darwin'" class="window-controls">
    <div
      class="window-control"
      role="button"
      tabindex="0"
      title="Minimize"
      aria-label="Minimize"
      @click="minimize"
      @keydown.enter="minimize"
      @keydown.space.prevent="minimize"
    >
      <Minus :size="16" />
    </div>
    <div
      class="window-control"
      role="button"
      tabindex="0"
      :title="maximized ? 'Restore' : 'Maximize'"
      :aria-label="maximized ? 'Restore' : 'Maximize'"
      @click="toggleMaximize"
      @keydown.enter="toggleMaximize"
      @keydown.space.prevent="toggleMaximize"
    >
      <Copy v-if="maximized" :size="13" />
      <Square v-else :size="13" />
    </div>
    <div
      class="window-control is-close"
      role="button"
      tabindex="0"
      title="Close"
      aria-label="Close"
      @click="close"
      @keydown.enter="close"
      @keydown.space.prevent="close"
    >
      <X :size="17" />
    </div>
  </div>
</template>
