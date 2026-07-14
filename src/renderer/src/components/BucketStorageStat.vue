<script setup lang="ts">
import { ChevronDown, Database, LoaderCircle, RefreshCw } from '@lucide/vue'
import { onClickOutside } from '@vueuse/core'
import { computed, ref } from 'vue'
import type { AppController } from '../composables/useAppController'
import { locale, t } from '../i18n'
import AppTooltip from './AppTooltip.vue'

const props = defineProps<{ controller: AppController }>()
const {
  bucketStorageStat,
  bucketStorageStatLoading,
  bucketStorageStatError,
  loadBucketStorageStat
} = props.controller

const root = ref<HTMLElement | null>(null)
const open = ref(false)

const storageTypes = computed(() => {
  const stat = bucketStorageStat.value
  if (!stat) return []
  return [
    { label: t('标准'), storage: stat.standardStorage, count: stat.standardObjectCount },
    {
      label: t('低频'),
      storage: stat.infrequentAccessStorage,
      count: stat.infrequentAccessObjectCount
    },
    { label: t('归档'), storage: stat.archiveStorage, count: stat.archiveObjectCount },
    { label: t('冷归档'), storage: stat.coldArchiveStorage, count: stat.coldArchiveObjectCount },
    {
      label: t('深度冷归档'),
      storage: stat.deepColdArchiveStorage,
      count: stat.deepColdArchiveObjectCount
    }
  ]
})

onClickOutside(root, () => {
  open.value = false
})

function formatStorage(size: number): string {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** index
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value)} ${units[index]}`
}

function formatCount(count: number): string {
  return new Intl.NumberFormat(locale.value).format(count)
}

function formatStatTime(timestamp: number): string {
  return timestamp ? new Date(timestamp * 1000).toLocaleString(locale.value) : '—'
}

function toggle(): void {
  open.value = !open.value
  if (open.value && !bucketStorageStat.value && !bucketStorageStatLoading.value) {
    void loadBucketStorageStat()
  }
}
</script>

<template>
  <div
    ref="root"
    class="relative flex h-full shrink-0 items-center border-l border-solid border-(--border)"
  >
    <AppTooltip :label="t('查看存储统计')">
      <div
        class="flex h-full min-w-[96px] cursor-pointer select-none items-center justify-center gap-1.5 rounded-r-[7px] px-2.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-(--surface-hover) hover:text-(--text)"
        role="button"
        tabindex="0"
        :aria-expanded="open"
        @click="toggle"
        @keydown.enter="toggle"
        @keydown.space.prevent="toggle"
        @keydown.esc.stop="open = false"
      >
        <Database :size="14" />
        <LoaderCircle v-if="bucketStorageStatLoading" :size="13" class="animate-spin" />
        <span v-else>{{ bucketStorageStat ? formatStorage(bucketStorageStat.storage) : '—' }}</span>
        <ChevronDown
          :size="13"
          class="transition-transform duration-150"
          :class="{ 'rotate-180': open }"
        />
      </div>
    </AppTooltip>

    <Transition name="context-menu">
      <div
        v-if="open"
        class="absolute top-[calc(100%+8px)] right-0 z-[120] w-[360px] origin-top-right overflow-hidden rounded-xl border border-solid border-(--border) bg-(--surface) text-xs text-(--text) shadow-[var(--shadow)]"
      >
        <div
          class="flex items-center justify-between border-b border-solid border-(--border) px-4 py-3"
        >
          <strong class="text-[13px]">{{ t('Bucket 存储统计') }}</strong>
          <span class="text-[11px] text-muted-foreground">{{ t('实际存储量') }}</span>
        </div>

        <div
          v-if="bucketStorageStatLoading"
          class="flex items-center justify-center gap-2 px-4 py-10 text-muted-foreground"
        >
          <LoaderCircle :size="16" class="animate-spin" />{{ t('正在读取统计信息') }}
        </div>
        <div
          v-else-if="bucketStorageStatError"
          class="flex flex-col items-center gap-3 px-5 py-8 text-center text-muted-foreground"
          :title="bucketStorageStatError"
        >
          <span>{{ t('无法读取统计信息，请检查网络或 oss:GetBucketStat 权限') }}</span>
          <div
            class="flex cursor-pointer items-center gap-1.5 rounded-md border border-solid border-(--border) px-2.5 py-1.5 font-semibold text-(--text) hover:bg-(--surface-hover)"
            role="button"
            tabindex="0"
            @click="loadBucketStorageStat"
            @keydown.enter="loadBucketStorageStat"
          >
            <RefreshCw :size="13" />{{ t('重试') }}
          </div>
        </div>
        <template v-else-if="bucketStorageStat">
          <div class="grid grid-cols-2 gap-2 p-3">
            <div class="rounded-lg bg-(--background) px-3 py-2.5">
              <span class="block text-[11px] text-muted-foreground">{{ t('总存储量') }}</span>
              <strong class="mt-1 block text-sm">{{
                formatStorage(bucketStorageStat.storage)
              }}</strong>
            </div>
            <div class="rounded-lg bg-(--background) px-3 py-2.5">
              <span class="block text-[11px] text-muted-foreground">{{ t('Object 总数') }}</span>
              <strong class="mt-1 block text-sm">{{
                formatCount(bucketStorageStat.objectCount)
              }}</strong>
            </div>
          </div>

          <div class="mx-3 mb-3 overflow-hidden rounded-lg border border-solid border-(--border)">
            <div
              class="grid grid-cols-[minmax(0,1fr)_86px_70px] gap-2 bg-(--background) px-3 py-2 text-[11px] text-muted-foreground"
            >
              <span>{{ t('存储类型') }}</span>
              <span class="text-right">{{ t('容量') }}</span>
              <span class="text-right">{{ t('文件数') }}</span>
            </div>
            <div
              v-for="item in storageTypes"
              :key="item.label"
              class="grid grid-cols-[minmax(0,1fr)_86px_70px] gap-2 border-t border-solid border-(--border) px-3 py-2.5"
            >
              <span class="truncate font-medium">{{ item.label }}</span>
              <span class="text-right font-mono text-[11px]">{{
                formatStorage(item.storage)
              }}</span>
              <span class="text-right font-mono text-[11px]">{{ formatCount(item.count) }}</span>
            </div>
          </div>

          <div
            class="border-t border-solid border-(--border) px-4 py-2.5 text-[11px] text-muted-foreground"
          >
            {{ t('统计数据时间') }}：{{ formatStatTime(bucketStorageStat.lastModifiedTime) }}
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>
