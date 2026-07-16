<script setup lang="ts">
import type { AppPlatform } from '../../../shared/types'
import appIcon from '../assets/icon.png'
import WindowControls from './WindowControls.vue'

defineProps<{ platform: AppPlatform }>()
</script>

<template>
  <header class="window-titlebar" :class="`is-${platform}`">
    <div class="window-titlebar-brand">
      <img :src="appIcon" alt="" />
      <span>OSS Browser</span>
    </div>
    <WindowControls :platform="platform" />
  </header>
</template>
