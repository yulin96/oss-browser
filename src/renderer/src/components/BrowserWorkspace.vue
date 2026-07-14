<script setup lang="ts">
import { ClipboardPaste, FolderPlus, FolderUp, Upload } from '@lucide/vue'

import type { AppController } from '../composables/useAppController'
import { locale, setLocale, t, type AppLocale } from '../i18n'
import AppHeader from './AppHeader.vue'
import BrowserNavigation from './BrowserNavigation.vue'
import BrowserToolbar from './BrowserToolbar.vue'
import BucketHome from './BucketHome.vue'
import ObjectActionMenu from './ObjectActionMenu.vue'
import ObjectBrowser from './ObjectBrowser.vue'
import TransferPanel from './TransferPanel.vue'

const props = defineProps<{ controller: AppController }>()
const { controller } = props
const {
  appVersion,
  auth,
  transfers,
  updateState,
  modal,
  openCacheRefresh,
  showTransfers,
  openSettings,
  confirmLogout,
  currentBucket,
  bucketSearchText,
  filteredBuckets,
  bucketMenu,
  bucketActionTarget,
  refreshBuckets,
  openModal,
  openBucket,
  openBucketMenu,
  openBucketAcl,
  openMultipart,
  deleteBucket,
  dragActive,
  openEmptyContextMenu,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  contextMenu,
  selectedObjects,
  handleObjectAction,
  emptyContextMenu,
  closeActions,
  upload,
  canPaste,
  pasteToCurrentDirectory
} = controller
</script>

<template>
  <AppHeader
    :app-version="appVersion"
    :locale="locale"
    :account-label="auth.alias?.trim() || auth.accessKeyId"
    :transfer-count="transfers.length"
    :update-status="updateState.status"
    @locale-change="setLocale($event as AppLocale)"
    @favorites="modal = 'favorites'"
    @cache-refresh="openCacheRefresh()"
    @transfers="showTransfers = !showTransfers"
    @settings="openSettings"
    @logout="confirmLogout"
  />

  <div class="workspace-full">
    <BucketHome
      v-if="!currentBucket"
      v-model:search-text="bucketSearchText"
      :buckets="filteredBuckets"
      :menu="bucketMenu"
      :action-target="bucketActionTarget"
      @refresh="refreshBuckets"
      @create="openModal('create-bucket')"
      @open="openBucket"
      @open-menu="openBucketMenu"
      @close-menu="bucketMenu.visible = false"
      @acl="openBucketAcl"
      @multipart="openMultipart"
      @delete="deleteBucket"
    />

    <section
      v-else
      class="content"
      :class="{ 'drag-active': dragActive }"
      @contextmenu="openEmptyContextMenu"
      @dragenter.prevent="handleDragEnter"
      @dragover.prevent
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <BrowserNavigation :controller="controller" />
      <BrowserToolbar :controller="controller" />
      <ObjectBrowser :controller="controller" />
    </section>
  </div>

  <Transition name="context-menu">
    <ObjectActionMenu
      v-if="contextMenu.visible"
      :selected="selectedObjects"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @select="handleObjectAction"
    />
  </Transition>

  <Transition name="context-menu">
    <div
      v-if="emptyContextMenu.visible"
      class="more-menu context-menu empty-context-menu"
      :style="{ left: `${emptyContextMenu.x}px`, top: `${emptyContextMenu.y}px` }"
      @click="closeActions"
    >
      <div @click="upload('files')"><Upload :size="15" />{{ t('上传文件') }}</div>
      <div @click="upload('folder')"><FolderUp :size="15" />{{ t('上传文件夹') }}</div>
      <div @click="openModal('create-folder')"><FolderPlus :size="15" />{{ t('新建文件夹') }}</div>
      <div :class="{ disabled: !canPaste }" @click="canPaste && pasteToCurrentDirectory()">
        <ClipboardPaste :size="15" />{{ t('粘贴') }}
      </div>
    </div>
  </Transition>

  <Transition name="transfer-panel">
    <TransferPanel v-if="showTransfers" :controller="controller" />
  </Transition>
</template>
