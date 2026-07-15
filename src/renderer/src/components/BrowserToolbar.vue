<script setup lang="ts">
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarClock,
  CaseSensitive,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  FileType2,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  Search,
  Square,
  SquareCheck,
  Upload,
  Weight,
  X
} from '@lucide/vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import AppTooltip from './AppTooltip.vue'

const props = defineProps<{ controller: AppController }>()
const {
  copyBuffer,
  selectedNames,
  searchText,
  viewMode,
  sortField,
  sortDirection,
  selectedObjects,
  filteredObjects,
  pageCounts,
  setSortField,
  setSortDirection,
  setViewMode,
  toggleAll,
  canPaste,
  selectUpload,
  openModal,
  copySelected,
  pasteToCurrentDirectory,
  downloadSelected
} = props.controller
</script>

<template>
  <div class="toolbar">
    <div class="more-actions upload-actions group">
      <AppButton :label="t('上传')" :icon="Upload" :end-icon="ChevronDown" tone="primary" />
      <div
        class="more-menu upload-menu invisible pointer-events-none opacity-0 group-hover:visible group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100"
      >
        <div @click="selectUpload('files')"><Upload :size="15" />{{ t('上传文件') }}</div>
        <div @click="selectUpload('folder')"><FolderUp :size="15" />{{ t('上传文件夹') }}</div>
      </div>
    </div>
    <AppButton :label="t('新建文件夹')" :icon="FolderPlus" @click="openModal('create-folder')" />
    <div class="toolbar-divider" />
    <AppButton
      :label="t('全选')"
      :icon="
        selectedNames.size === filteredObjects.length && filteredObjects.length > 0
          ? SquareCheck
          : Square
      "
      @click="toggleAll"
    />
    <div class="toolbar-divider" />
    <AppButton
      :label="t('下载')"
      :icon="Download"
      :disabled="!selectedObjects.length"
      @click="downloadSelected"
    />
    <AppButton
      :label="t('复制')"
      :icon="Copy"
      :disabled="!selectedObjects.length"
      @click="copySelected"
    />
    <div v-if="copyBuffer" class="paste-group">
      <AppButton
        :label="t('粘贴到此处')"
        :icon="ClipboardPaste"
        tone="primary"
        :disabled="!canPaste"
        @click="pasteToCurrentDirectory"
      />
      <AppTooltip :label="t('取消复制')">
        <div class="paste-cancel" role="button" tabindex="0" @click="copyBuffer = null">
          <X :size="16" />
        </div>
      </AppTooltip>
    </div>
    <div class="toolbar-spacer" />
    <div class="page-counts">
      {{ t('{directories} 个文件夹，{files} 个文件', pageCounts) }}
    </div>
    <div class="search-wrap toolbar-search">
      <Search :size="15" /><input v-model="searchText" :placeholder="t('搜索当前目录')" />
    </div>
    <div class="more-actions sort-actions group">
      <div class="sort-trigger" role="button" tabindex="0" :aria-label="t('排序字段')">
        <CaseSensitive v-if="sortField === 'name'" :size="17" />
        <CalendarClock v-else-if="sortField === 'modified'" :size="17" />
        <FileType2 v-else-if="sortField === 'type'" :size="17" />
        <Weight v-else :size="17" />
      </div>
      <div
        class="more-menu sort-menu invisible pointer-events-none opacity-0 group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        <div :class="{ active: sortField === 'name' }" @click="setSortField('name')">
          <CaseSensitive :size="15" />{{ t('名称')
          }}<Check v-if="sortField === 'name'" class="sort-check" :size="14" />
        </div>
        <div :class="{ active: sortField === 'modified' }" @click="setSortField('modified')">
          <CalendarClock :size="15" />{{ t('修改日期')
          }}<Check v-if="sortField === 'modified'" class="sort-check" :size="14" />
        </div>
        <div :class="{ active: sortField === 'type' }" @click="setSortField('type')">
          <FileType2 :size="15" />{{ t('类型')
          }}<Check v-if="sortField === 'type'" class="sort-check" :size="14" />
        </div>
        <div :class="{ active: sortField === 'size' }" @click="setSortField('size')">
          <Weight :size="15" />{{ t('大小')
          }}<Check v-if="sortField === 'size'" class="sort-check" :size="14" />
        </div>
      </div>
    </div>
    <div class="more-actions sort-actions group">
      <div class="sort-trigger" role="button" tabindex="0" :aria-label="t('排序方向')">
        <ArrowDownWideNarrow v-if="sortDirection === 'desc'" :size="17" />
        <ArrowUpNarrowWide v-else :size="17" />
      </div>
      <div
        class="more-menu sort-menu direction-sort-menu invisible pointer-events-none opacity-0 group-hover:visible group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        <div :class="{ active: sortDirection === 'asc' }" @click="setSortDirection('asc')">
          <ArrowUpNarrowWide :size="15" />{{ t('升序')
          }}<Check v-if="sortDirection === 'asc'" class="sort-check" :size="14" />
        </div>
        <div :class="{ active: sortDirection === 'desc' }" @click="setSortDirection('desc')">
          <ArrowDownWideNarrow :size="15" />{{ t('降序')
          }}<Check v-if="sortDirection === 'desc'" class="sort-check" :size="14" />
        </div>
      </div>
    </div>
    <div
      class="view-switch t-tabs"
      data-count="2"
      :data-active="viewMode === 'list' ? '0' : '1'"
      :aria-label="t('文件显示方式')"
    >
      <AppTooltip :label="t('列表模式')">
        <div
          :class="{ active: viewMode === 'list' }"
          role="button"
          tabindex="0"
          @click="setViewMode('list')"
        >
          <List :size="17" />
        </div>
      </AppTooltip>
      <AppTooltip :label="t('图标模式')">
        <div
          :class="{ active: viewMode === 'grid' }"
          role="button"
          tabindex="0"
          @click="setViewMode('grid')"
        >
          <LayoutGrid :size="17" />
        </div>
      </AppTooltip>
    </div>
  </div>
</template>
