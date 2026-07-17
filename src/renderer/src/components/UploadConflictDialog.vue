<script setup lang="ts">
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
</script>

<template>
  <Transition name="modal" appear>
    <ModalShell
      v-if="uploadConflictOpen && currentUploadConflict"
      :title="t('发现同名文件')"
      width="560px"
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
