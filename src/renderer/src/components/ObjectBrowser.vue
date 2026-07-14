<script setup lang="ts">
import { Folder, FolderPlus, Home, LoaderCircle, Star, Upload, X } from '@lucide/vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import AppTooltip from './AppTooltip.vue'

const props = defineProps<{ controller: AppController }>()
const {
  getObjectVisual,
  modal,
  dragActive,
  errorMessage,
  fileBrowser,
  currentBucket,
  objects,
  hasMoreObjects,
  selectedNames,
  searchText,
  viewMode,
  thumbnailUrls,
  failedThumbnailNames,
  filteredObjects,
  loadObjects,
  markThumbnailFailed,
  vThumbnail,
  toggleSelection,
  toggleAll,
  showFileLoading,
  openContextMenu,
  handleBlankClick,
  openItem,
  upload,
  formatSize,
  getFileExtension,
  isFavoriteDirectory,
  isHomeDirectory
} = props.controller
</script>

<template>
  <div v-if="errorMessage" class="error-strip">
    <span>{{ errorMessage }}</span>
    <AppTooltip :label="t('关闭')">
      <div
        class="error-dismiss"
        role="button"
        tabindex="0"
        :aria-label="t('关闭')"
        @click="errorMessage = ''"
        @keydown.enter="errorMessage = ''"
        @keydown.space.prevent="errorMessage = ''"
      >
        <X :size="16" />
      </div>
    </AppTooltip>
  </div>
  <div v-if="showFileLoading && !objects.length" class="file-loading" role="status">
    <LoaderCircle :size="30" />
    <span>{{ t('正在加载文件列表') }}</span>
  </div>
  <div v-else-if="viewMode === 'list'" class="file-table" @click="handleBlankClick">
    <div class="table-row table-head">
      <div>
        <input
          type="checkbox"
          :checked="selectedNames.size === filteredObjects.length && filteredObjects.length > 0"
          @change="toggleAll"
        />
      </div>
      <div>{{ t('名称') }}</div>
      <div>{{ t('大小') }}</div>
      <div>{{ t('存储类型') }}</div>
      <div>{{ t('更新时间') }}</div>
    </div>
    <div
      v-for="item in filteredObjects"
      :key="item.name"
      class="table-row"
      :class="{
        selected: selectedNames.has(item.name),
        'favorite-location': isFavoriteDirectory(item),
        'home-location': isHomeDirectory(item)
      }"
      @click="toggleSelection(item)"
      @contextmenu="openContextMenu($event, item)"
    >
      <div @click.stop>
        <input
          type="checkbox"
          :checked="selectedNames.has(item.name)"
          @change="toggleSelection(item)"
        />
      </div>
      <div class="file-name">
        <span class="file-icon" :class="getObjectVisual(item).kind">
          <span v-thumbnail="item" class="thumbnail-observer-target" />
          <img
            v-if="thumbnailUrls[item.name] && !failedThumbnailNames.has(item.name)"
            :src="thumbnailUrls[item.name]"
            loading="lazy"
            @error="markThumbnailFailed(item.name)"
          />
          <component :is="getObjectVisual(item).icon" v-else :size="18" /> </span
        ><span
          class="file-name-label"
          role="button"
          tabindex="0"
          @click.stop="openItem(item)"
          @keydown.enter.stop="openItem(item)"
          >{{ item.displayName }}</span
        >
        <span v-if="isFavoriteDirectory(item) || isHomeDirectory(item)" class="location-tags">
          <span v-if="isFavoriteDirectory(item)" class="location-tag favorite">
            <Star :size="11" fill="currentColor" />{{ t('收藏') }}
          </span>
          <span v-if="isHomeDirectory(item)" class="location-tag home">
            <Home :size="11" />{{ t('首页') }}
          </span>
        </span>
      </div>
      <div>{{ item.isDirectory ? '—' : formatSize(item.size) }}</div>
      <div>{{ item.storageClass || t('标准') }}</div>
      <div>
        {{ item.lastModified ? new Date(item.lastModified).toLocaleString() : '—' }}
      </div>
    </div>
    <div v-if="!filteredObjects.length && !fileBrowser.loading.value" class="empty-state">
      <div class="empty-icon"><Folder :size="42" /></div>
      <strong>{{ t('当前目录为空') }}</strong>
      <span>{{ t('上传文件或新建文件夹开始使用') }}</span>
      <div class="mt-4 flex justify-center gap-3">
        <AppButton
          :label="t('新建文件夹')"
          :icon="FolderPlus"
          tone="default"
          @click="modal = 'create-folder'"
        />
        <AppButton :label="t('上传文件')" :icon="Upload" tone="primary" @click="upload('files')" />
      </div>
    </div>
    <div
      v-if="hasMoreObjects && !searchText"
      class="load-more"
      role="button"
      tabindex="0"
      @click="loadObjects(true)"
    >
      {{ t('加载更多') }}
    </div>
  </div>
  <div v-else class="object-grid-scroll" @click="handleBlankClick">
    <div v-if="filteredObjects.length" class="object-grid">
      <div
        v-for="item in filteredObjects"
        :key="item.name"
        class="object-card"
        :class="{
          selected: selectedNames.has(item.name),
          'favorite-location': isFavoriteDirectory(item),
          'home-location': isHomeDirectory(item)
        }"
        role="button"
        tabindex="0"
        @click="toggleSelection(item)"
        @dblclick="openItem(item)"
        @contextmenu="openContextMenu($event, item)"
      >
        <div class="object-card-check" @click.stop>
          <input
            type="checkbox"
            :checked="selectedNames.has(item.name)"
            @change="toggleSelection(item)"
          />
        </div>
        <div class="object-preview" :class="getObjectVisual(item).kind">
          <span v-thumbnail="item" class="thumbnail-observer-target" />
          <img
            v-if="thumbnailUrls[item.name] && !failedThumbnailNames.has(item.name)"
            :src="thumbnailUrls[item.name]"
            :alt="item.displayName"
            loading="lazy"
            @error="markThumbnailFailed(item.name)"
          />
          <component :is="getObjectVisual(item).icon" v-else :size="44" />
        </div>
        <div class="object-info">
          <strong :title="item.displayName">{{ item.displayName }}</strong>
          <span style="display: flex; align-items: center">
            <template v-if="item.isDirectory">
              <span>{{ t('文件夹') }}</span>
              <span v-if="isFavoriteDirectory(item)" class="location-tag favorite">
                <Star :size="11" fill="currentColor" />{{ t('收藏') }}
              </span>
              <span v-if="isHomeDirectory(item)" class="location-tag home">
                <Home :size="11" />{{ t('首页') }}
              </span>
            </template>
            <template v-else>
              <span>{{ formatSize(item.size) }}</span>
              <span class="mx-1">·</span>
              <span class="uppercase">{{ getFileExtension(item.name) }}</span>
            </template>
          </span>
        </div>
      </div>
    </div>
    <div v-else-if="!fileBrowser.loading.value" class="empty-state">
      <div class="empty-icon"><Folder :size="42" /></div>
      <strong>{{ t('当前目录为空') }}</strong>
      <span>{{ t('上传文件或新建文件夹开始使用') }}</span>
      <div class="mt-4 flex justify-center gap-3">
        <AppButton
          :label="t('新建文件夹')"
          :icon="FolderPlus"
          tone="default"
          @click="modal = 'create-folder'"
        />
        <AppButton :label="t('上传文件')" :icon="Upload" tone="primary" @click="upload('files')" />
      </div>
    </div>
    <div
      v-if="hasMoreObjects && !searchText"
      class="load-more"
      role="button"
      tabindex="0"
      @click="loadObjects(true)"
    >
      {{ t('加载更多') }}
    </div>
  </div>
  <div v-if="dragActive && currentBucket" class="drop-overlay">
    {{ t('释放后上传到当前目录') }}
  </div>
</template>
