<script setup lang="ts">
import { ArrowLeft, ArrowRight, ArrowUp, Home, HousePlus, RefreshCw, Star } from '@lucide/vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppTooltip from './AppTooltip.vue'

const props = defineProps<{ controller: AppController }>()
const {
  currentBucket,
  addressInput,
  navigationHistory,
  navigationIndex,
  goToAddress,
  goBack,
  goForward,
  goUp,
  goHome,
  toggleFavorite,
  isCurrentFavorite,
  setCurrentAsHome,
  isCurrentHome,
  loadObjects
} = props.controller
</script>

<template>
  <div class="quick-nav">
    <AppTooltip :label="t('后退')">
      <div class="nav-icon" :class="{ disabled: navigationIndex <= 0 }" @click="goBack">
        <ArrowLeft :size="18" />
      </div>
    </AppTooltip>
    <AppTooltip :label="t('前进')">
      <div
        class="nav-icon"
        :class="{ disabled: navigationIndex >= navigationHistory.length - 1 }"
        @click="goForward"
      >
        <ArrowRight :size="18" />
      </div>
    </AppTooltip>
    <AppTooltip :label="t('上一级')">
      <div class="nav-icon" @click="goUp"><ArrowUp :size="18" /></div>
    </AppTooltip>
    <AppTooltip :label="t('刷新')">
      <div class="nav-icon" @click="loadObjects()"><RefreshCw :size="18" /></div>
    </AppTooltip>
    <AppTooltip :label="t('Bucket 首页')">
      <div class="nav-icon" @click="goHome"><Home :size="18" /></div>
    </AppTooltip>
    <div class="address-wrap">
      <input
        v-model="addressInput"
        class="flex-1 min-w-0"
        spellcheck="false"
        @keydown.enter="goToAddress()"
      />
      <div
        v-if="currentBucket?.region"
        class="ml-1 flex select-none items-center border-l border-solid border-(--border) px-2.5 font-mono text-[11px] text-muted-foreground"
      >
        {{ currentBucket.region }}
      </div>
    </div>
    <AppTooltip :label="t('收藏当前目录')">
      <div class="nav-icon" :class="{ active: isCurrentFavorite() }" @click="toggleFavorite">
        <Star :size="18" />
      </div>
    </AppTooltip>
    <AppTooltip :label="t(isCurrentHome() ? '取消首页' : '设为首页')">
      <div class="nav-icon" :class="{ active: isCurrentHome() }" @click="setCurrentAsHome">
        <HousePlus :size="18" />
      </div>
    </AppTooltip>
  </div>
</template>
