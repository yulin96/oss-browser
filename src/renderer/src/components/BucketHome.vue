<script setup lang="ts">
import { bucket as bucketIcon } from '@lucide/lab'
import {
  Icon as LucideIcon,
  KeyRound,
  ListTodo,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from '@lucide/vue'

import type { BucketInfo } from '../../../shared/types'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import AppTooltip from './AppTooltip.vue'

defineProps<{
  buckets: BucketInfo[]
  searchText: string
  menu: { visible: boolean; x: number; y: number }
  actionTarget: BucketInfo | null
}>()

const emit = defineEmits<{
  'update:searchText': [value: string]
  refresh: []
  create: []
  open: [bucket: BucketInfo]
  openMenu: [event: MouseEvent, bucket: BucketInfo]
  closeMenu: []
  acl: [bucket: BucketInfo]
  multipart: [bucket: BucketInfo]
  delete: [bucket: BucketInfo]
}>()
</script>

<template>
  <section class="bucket-home">
    <div class="bucket-home-head">
      <div>
        <h1>{{ t('选择 Bucket') }}</h1>
        <p>{{ t('选择一个 Bucket 开始管理文件') }}</p>
      </div>
      <div class="bucket-home-actions">
        <div class="search-wrap">
          <Search :size="15" />
          <input
            :value="searchText"
            :placeholder="t('搜索 Bucket')"
            @input="emit('update:searchText', ($event.target as HTMLInputElement).value)"
          />
        </div>
        <AppButton :label="t('刷新')" :icon="RefreshCw" @click="emit('refresh')" />
        <AppButton :label="t('新建 Bucket')" :icon="Plus" tone="primary" @click="emit('create')" />
      </div>
    </div>
    <div class="bucket-grid">
      <div
        v-for="bucket in buckets"
        :key="bucket.name"
        class="bucket-card"
        role="button"
        tabindex="0"
        @click="emit('open', bucket)"
        @contextmenu="emit('openMenu', $event, bucket)"
      >
        <div class="bucket-card-icon">
          <LucideIcon name="bucket" :icon-node="bucketIcon" :size="26" />
        </div>
        <div class="bucket-card-info">
          <strong>{{ bucket.name }}</strong>
          <span
            >{{ bucket.region || t('自定义 Endpoint') }} ·
            {{ bucket.storageClass || t('标准存储') }}</span
          >
        </div>
        <div class="bucket-card-actions">
          <AppTooltip :label="t('更多')"
            ><div class="icon-button" @click="emit('openMenu', $event, bucket)">
              <MoreHorizontal :size="17" /></div
          ></AppTooltip>
        </div>
      </div>
    </div>
    <div
      v-if="menu.visible && actionTarget"
      class="more-menu context-menu bucket-menu"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @click="emit('closeMenu')"
    >
      <div @click="emit('acl', actionTarget)"><KeyRound :size="15" />{{ t('Bucket 权限') }}</div>
      <div @click="emit('multipart', actionTarget)">
        <ListTodo :size="15" />{{ t('未完成的分片上传') }}
      </div>
      <div class="danger" @click="emit('delete', actionTarget)">
        <Trash2 :size="15" />{{ t('删除 Bucket') }}
      </div>
    </div>
    <div v-if="!buckets.length" class="welcome-state">
      <LucideIcon name="bucket" :icon-node="bucketIcon" :size="48" />
      <h2>{{ t('暂无 Bucket') }}</h2>
      <p>{{ t('新建 Bucket 后即可开始使用。') }}</p>
    </div>
  </section>
</template>
