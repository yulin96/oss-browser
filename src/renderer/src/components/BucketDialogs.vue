<script setup lang="ts">
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import ModalShell from './ModalShell.vue'

const props = defineProps<{ controller: AppController }>()
const {
  modal,
  multipartUploads,
  OSS_REGIONS,
  bucketForm,
  createBucket,
  applyBucketAcl,
  abortMultipart
} = props.controller
</script>

<template>
  <div class="contents">
    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'create-bucket'" :title="t('新建 Bucket')" @close="modal = null">
        <label class="field-label">{{ t('Bucket 名称') }}</label>
        <div class="input-wrap">
          <input v-model.trim="bucketForm.name" :placeholder="t('全局唯一名称')" />
        </div>
        <label class="field-label">{{ t('地域') }}</label>
        <div class="select-wrap">
          <select v-model="bucketForm.region">
            <option v-for="item in OSS_REGIONS" :key="item.id" :value="item.id">
              {{ t(item.label) }} ({{ item.id }})
            </option>
          </select>
        </div>
        <label class="field-label">{{ t('读写权限') }}</label>
        <div class="select-wrap">
          <select v-model="bucketForm.acl">
            <option value="private">{{ t('私有') }}</option>
            <option value="public-read">{{ t('公共读') }}</option>
            <option value="public-read-write">{{ t('公共读写') }}</option>
          </select>
        </div>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('创建')"
            tone="primary"
            :disabled="!bucketForm.name"
            @click="createBucket"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'bucket-acl'"
        :title="t('设置 Bucket 权限')"
        @close="modal = null"
      >
        <div class="select-wrap">
          <select v-model="bucketForm.acl">
            <option value="private">{{ t('私有') }}</option>
            <option value="public-read">{{ t('公共读') }}</option>
            <option value="public-read-write">{{ t('公共读写') }}</option>
          </select>
        </div>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('保存')"
            tone="primary"
            @click="applyBucketAcl"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'multipart'"
        :title="t('未完成的分片上传')"
        width="720px"
        @close="modal = null"
      >
        <div v-if="!multipartUploads.length" class="modal-empty">
          {{ t('没有未完成的分片上传') }}
        </div>
        <div v-for="part in multipartUploads" :key="part.uploadId" class="multipart-row">
          <div>
            <strong>{{ part.name }}</strong
            ><span>{{ part.initiated || part.uploadId }}</span>
          </div>
          <AppButton :label="t('终止')" tone="danger" @click="abortMultipart(part)" />
        </div>
      </ModalShell>
    </Transition>
  </div>
</template>
