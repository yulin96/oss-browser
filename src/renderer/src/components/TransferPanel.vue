<script setup lang="ts">
import { Download, Pause, Play, Trash2, Upload, X } from '@lucide/vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import AppTooltip from './AppTooltip.vue'

const props = defineProps<{ controller: AppController }>()
const {
  showTransfers,
  activeTransferTab,
  transferSummaries,
  activeTransferSummary,
  visibleTransfers,
  hasCompletedTransfers,
  hasVisibleTransfers,
  canResumeTransfers,
  canPauseTransfers,
  clearCompletedTransferRecords,
  pauseAllTransfers,
  resumeAllTransfers,
  confirmDeleteAllTransfers,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  cancelTransfer
} = props.controller
</script>

<template>
  <div class="transfer-layer">
    <aside
      class="transfer-panel"
      @dragenter.prevent.stop="handleDragEnter"
      @dragover.prevent.stop
      @dragleave.prevent.stop="handleDragLeave"
      @drop.prevent.stop="handleDrop"
    >
      <div class="transfer-head">
        <div class="transfer-head-row">
          <div class="transfer-tabs">
            <div
              :class="{ active: activeTransferTab === 'upload' }"
              role="button"
              tabindex="0"
              @click="activeTransferTab = 'upload'"
            >
              {{ t('上传') }}
              <span
                >{{ transferSummaries.upload.done }} / {{ transferSummaries.upload.total }}</span
              >
            </div>
            <div
              :class="{ active: activeTransferTab === 'download' }"
              role="button"
              tabindex="0"
              @click="activeTransferTab = 'download'"
            >
              {{ t('下载') }}
              <span
                >{{ transferSummaries.download.done }} /
                {{ transferSummaries.download.total }}</span
              >
            </div>
          </div>
          <AppTooltip :label="t('关闭')">
            <div class="icon-button" role="button" tabindex="0" @click="showTransfers = false">
              <X :size="18" />
            </div>
          </AppTooltip>
        </div>
        <div class="transfer-toolbar">
          <span
            >{{ t('完成') }} {{ activeTransferSummary.done }} /
            {{ activeTransferSummary.total }}</span
          >
          <div class="transfer-head-actions">
            <AppTooltip :label="t('开始全部')">
              <div
                class="transfer-action"
                :class="{ disabled: !canResumeTransfers }"
                :aria-disabled="!canResumeTransfers"
                role="button"
                tabindex="0"
                @click="canResumeTransfers && resumeAllTransfers()"
              >
                <Play :size="16" />
              </div>
            </AppTooltip>
            <AppTooltip :label="t('暂停全部')">
              <div
                class="transfer-action"
                :class="{ disabled: !canPauseTransfers }"
                :aria-disabled="!canPauseTransfers"
                role="button"
                tabindex="0"
                @click="canPauseTransfers && pauseAllTransfers()"
              >
                <Pause :size="16" />
              </div>
            </AppTooltip>
            <AppTooltip :label="t('删除已完成')">
              <div
                class="transfer-action"
                :class="{ disabled: !hasCompletedTransfers }"
                :aria-disabled="!hasCompletedTransfers"
                role="button"
                tabindex="0"
                @click="hasCompletedTransfers && clearCompletedTransferRecords()"
              >
                <Trash2 :size="16" />
              </div>
            </AppTooltip>
            <AppTooltip :label="t('删除全部')">
              <div
                class="transfer-action danger"
                :class="{ disabled: !hasVisibleTransfers }"
                :aria-disabled="!hasVisibleTransfers"
                role="button"
                tabindex="0"
                @click="hasVisibleTransfers && confirmDeleteAllTransfers()"
              >
                <Trash2 :size="16" />
              </div>
            </AppTooltip>
          </div>
        </div>
        <div class="progress transfer-summary-progress">
          <i :style="{ width: `${activeTransferSummary.progress * 100}%` }" />
        </div>
      </div>
      <div v-if="!visibleTransfers.length" class="transfer-empty">
        {{ t('暂无传输任务') }}
      </div>
      <div
        v-for="transfer in visibleTransfers"
        :key="transfer.id"
        class="transfer-item"
        :class="`is-${transfer.status}`"
      >
        <div class="transfer-line">
          <span
            ><Upload v-if="transfer.direction === 'upload'" :size="14" /><Download
              v-else
              :size="14"
            />
            {{ transfer.name }}</span
          ><b>{{
            transfer.status === 'done'
              ? t('完成')
              : transfer.status === 'error'
                ? t('失败')
                : transfer.status === 'paused'
                  ? t('已暂停')
                  : transfer.status === 'cancelled'
                    ? t('已取消')
                    : `${Math.round(transfer.progress * 100)}%`
          }}</b>
          <AppButton
            v-if="transfer.status === 'running'"
            :label="t('取消')"
            tone="ghost"
            @click="cancelTransfer(transfer.id)"
          />
        </div>
        <div class="progress"><i :style="{ width: `${transfer.progress * 100}%` }" /></div>
        <div v-if="transfer.error" class="transfer-error">{{ transfer.error }}</div>
      </div>
    </aside>
  </div>
</template>
