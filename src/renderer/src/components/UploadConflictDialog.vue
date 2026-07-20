<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import ModalShell from './ModalShell.vue'

const props = defineProps<{ controller: AppController }>()
const {
  uploadConflictOpen,
  currentUploadConflict,
  uploadConflictIndex,
  uploadConflictTotal,
  rememberUploadConflictChoice,
  replaceUploadConflict,
  replaceAllUploadConflicts,
  skipUploadConflict,
  skipAllUploadConflicts,
  cancelUploadConflicts
} = props.controller

const failedPreviewUrls = reactive(new Set<string>())
const showMediaComparison = computed(() => {
  const conflict = currentUploadConflict.value
  return Boolean(
    conflict?.previewType && conflict?.existingPreviewUrl && conflict.incomingPreviewUrl
  )
})

function markPreviewFailed(url?: string): void {
  if (url) failedPreviewUrls.add(url)
}

function previewFailed(url?: string): boolean {
  return Boolean(url && failedPreviewUrls.has(url))
}
</script>

<template>
  <Transition name="modal" appear>
    <ModalShell
      v-if="uploadConflictOpen && currentUploadConflict"
      :title="t('发现同名文件')"
      :width="showMediaComparison ? '680px' : '560px'"
      @close="cancelUploadConflicts"
    >
      <p class="upload-conflict-description">
        {{ t('目标位置已存在同名文件，请选择处理方式。') }}
      </p>
      <div class="upload-conflict-file">
        <strong :title="currentUploadConflict.displayName">
          {{ currentUploadConflict.displayName }}
        </strong>
        <span :title="currentUploadConflict.name">{{ currentUploadConflict.name }}</span>
      </div>
      <div v-if="showMediaComparison" class="upload-conflict-comparison">
        <figure>
          <figcaption>{{ t('覆盖前（OSS）') }}</figcaption>
          <div class="upload-conflict-preview">
            <img
              v-if="
                currentUploadConflict.previewType === 'image' &&
                !previewFailed(currentUploadConflict.existingPreviewUrl)
              "
              :src="currentUploadConflict.existingPreviewUrl"
              :alt="t('覆盖前（OSS）')"
              @error="markPreviewFailed(currentUploadConflict.existingPreviewUrl)"
            />
            <video
              v-else-if="!previewFailed(currentUploadConflict.existingPreviewUrl)"
              :src="currentUploadConflict.existingPreviewUrl"
              controls
              preload="metadata"
              @error="markPreviewFailed(currentUploadConflict.existingPreviewUrl)"
            />
            <span v-else>{{ t('该格式暂不支持直接预览') }}</span>
          </div>
        </figure>
        <figure>
          <figcaption>{{ t('覆盖后（本地）') }}</figcaption>
          <div class="upload-conflict-preview">
            <img
              v-if="
                currentUploadConflict.previewType === 'image' &&
                !previewFailed(currentUploadConflict.incomingPreviewUrl)
              "
              :src="currentUploadConflict.incomingPreviewUrl"
              :alt="t('覆盖后（本地）')"
              @error="markPreviewFailed(currentUploadConflict.incomingPreviewUrl)"
            />
            <video
              v-else-if="!previewFailed(currentUploadConflict.incomingPreviewUrl)"
              :src="currentUploadConflict.incomingPreviewUrl"
              controls
              preload="metadata"
              @error="markPreviewFailed(currentUploadConflict.incomingPreviewUrl)"
            />
            <span v-else>{{ t('该格式暂不支持直接预览') }}</span>
          </div>
        </figure>
      </div>
      <div class="upload-conflict-progress">
        {{
          t('第 {current} 个，共 {total} 个冲突', {
            current: uploadConflictIndex + 1,
            total: uploadConflictTotal
          })
        }}
      </div>
      <label class="check-row upload-conflict-remember">
        <input v-model="rememberUploadConflictChoice" type="checkbox" />
        {{ t('不再询问，并记住所选操作') }}
      </label>

      <template #footer>
        <div class="upload-conflict-footer">
          <AppButton
            class="upload-conflict-cancel"
            :label="t('取消上传')"
            tone="ghost"
            @click="cancelUploadConflicts"
          />
          <div class="upload-conflict-actions">
            <AppButton :label="t('替换')" @click="replaceUploadConflict" />
            <AppButton :label="t('全部替换')" @click="replaceAllUploadConflicts" />
            <AppButton :label="t('全部跳过')" @click="skipAllUploadConflicts" />
            <AppButton :label="t('跳过')" tone="primary" @click="skipUploadConflict" />
          </div>
        </div>
      </template>
    </ModalShell>
  </Transition>
</template>
