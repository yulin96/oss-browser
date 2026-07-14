<script setup lang="ts">
import {
  ChevronDown,
  CloudCog,
  Globe2,
  ListTodo,
  LogOut,
  Settings,
  StarCheck,
  UserRound
} from '@lucide/vue'

import type { UpdateStatus } from '../../../shared/types'
import appIcon from '../assets/icon.png'
import { localeLabel, localeOptions, t } from '../i18n'

defineProps<{
  appVersion: string
  locale: string
  accountLabel: string
  transferCount: number
  updateStatus: UpdateStatus
}>()

const emit = defineEmits<{
  localeChange: [locale: string]
  favorites: []
  cacheRefresh: []
  transfers: []
  settings: []
  logout: []
}>()

function changeLocale(event: Event): void {
  emit('localeChange', (event.target as HTMLSelectElement).value)
}
</script>

<template>
  <header class="topbar">
    <div class="top-brand">
      <div class="small-mark"><img :src="appIcon" alt="" /></div>
      <strong>OSS Browser</strong>
      <span
        v-if="appVersion"
        class="app-version"
        :class="{
          'has-update': ['available', 'downloading', 'downloaded'].includes(updateStatus)
        }"
        :title="
          ['available', 'downloading', 'downloaded'].includes(updateStatus)
            ? t('发现新版本')
            : undefined
        "
      >
        v{{ appVersion }}
        <i
          v-if="['available', 'downloading', 'downloaded'].includes(updateStatus)"
          aria-hidden="true"
        />
      </span>
    </div>
    <div class="top-actions">
      <div class="language-picker top-language">
        <Globe2 :size="15" />
        <span>{{ localeLabel(locale, true) }}</span>
        <ChevronDown :size="14" />
        <select :value="locale" aria-label="Language" @change="changeLocale">
          <option v-for="option in localeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="transfer-trigger" role="button" tabindex="0" @click="emit('favorites')">
        <StarCheck :size="16" /> {{ t('收藏夹') }}
      </div>
      <div class="transfer-trigger" role="button" tabindex="0" @click="emit('cacheRefresh')">
        <CloudCog :size="16" /> {{ t('刷新缓存') }}
      </div>
      <div
        class="transfer-trigger transfer-panel-trigger"
        role="button"
        tabindex="0"
        @click="emit('transfers')"
      >
        <ListTodo :size="16" /> {{ t('传输任务') }}
        <span v-if="transferCount" class="badge">{{ transferCount }}</span>
      </div>
      <div class="transfer-trigger" role="button" tabindex="0" @click="emit('settings')">
        <Settings :size="16" /> {{ t('设置') }}
      </div>
      <div class="account-action" role="button" tabindex="0" @click="emit('logout')">
        <UserRound :size="16" /><span>{{ accountLabel }}</span
        ><LogOut :size="16" />
      </div>
    </div>
  </header>
</template>
