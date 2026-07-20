<script setup lang="ts">
import { bucket as bucketIcon } from '@lucide/lab'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CloudUpload,
  Home,
  HousePlus,
  Icon as LucideIcon,
  RefreshCw,
  Star
} from '@lucide/vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppTooltip from './AppTooltip.vue'
import BucketStorageStat from './BucketStorageStat.vue'

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
  goBucketHome,
  goHome,
  toggleFavorite,
  isCurrentFavorite,
  setCurrentAsHome,
  isCurrentHome,
  loadObjects,
  floatingUploadState,
  toggleFloatingUpload,
  showFloatingUploadMenu
} = props.controller
</script>

<template>
  <div class="quick-nav">
    <AppTooltip :label="t('后退')" side="top">
      <div class="nav-icon" :class="{ disabled: navigationIndex <= 0 }" @click="goBack">
        <ArrowLeft :size="18" />
      </div>
    </AppTooltip>
    <AppTooltip :label="t('前进')" side="top">
      <div
        class="nav-icon"
        :class="{ disabled: navigationIndex >= navigationHistory.length - 1 }"
        @click="goForward"
      >
        <ArrowRight :size="18" />
      </div>
    </AppTooltip>
    <AppTooltip :label="t('上一级')" side="top">
      <div class="nav-icon" @click="goUp"><ArrowUp :size="18" /></div>
    </AppTooltip>
    <AppTooltip :label="t('刷新')" side="top">
      <div class="nav-icon" @click="loadObjects()"><RefreshCw :size="18" /></div>
    </AppTooltip>
    <AppTooltip :label="t('Bucket 首页')" side="top">
      <div class="nav-icon" @click="goBucketHome">
        <LucideIcon name="bucket" :icon-node="bucketIcon" :size="18" />
      </div>
    </AppTooltip>
    <AppTooltip :label="t('首页')" side="top">
      <div class="nav-icon" @click="goHome"><Home :size="18" /></div>
    </AppTooltip>
    <div class="address-wrap">
      <input
        v-model="addressInput"
        class="flex-1 min-w-0"
        spellcheck="false"
        @keydown.enter="goToAddress()"
      />
      <AppTooltip :label="t('悬浮上传')" side="top">
        <div
          class="address-action"
          :class="{ active: floatingUploadState.visible }"
          role="button"
          tabindex="0"
          :aria-pressed="floatingUploadState.visible"
          @click="toggleFloatingUpload"
          @contextmenu.prevent="showFloatingUploadMenu"
          @keydown.enter.prevent="toggleFloatingUpload"
          @keydown.space.prevent="toggleFloatingUpload"
        >
          <CloudUpload :size="18" />
        </div>
      </AppTooltip>
      <div
        v-if="currentBucket?.region"
        class="ml-1 flex select-none items-center border-l border-solid border-(--border) px-2.5 font-mono text-[11px] text-muted-foreground"
      >
        {{ currentBucket.region }}
      </div>
      <BucketStorageStat :controller="controller" />
    </div>
    <AppTooltip :label="t('收藏当前目录')" side="top">
      <div
        class="nav-icon favorite-nav"
        :class="{ active: isCurrentFavorite() }"
        @click="toggleFavorite"
      >
        <Star :size="18" />
      </div>
    </AppTooltip>
    <AppTooltip :label="t(isCurrentHome() ? '取消首页' : '设为首页')" side="top">
      <div class="nav-icon home-nav" :class="{ active: isCurrentHome() }" @click="setCurrentAsHome">
        <HousePlus :size="18" />
      </div>
    </AppTooltip>
  </div>
</template>
