<script setup lang="ts">
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import ModalShell from './ModalShell.vue'

const props = defineProps<{ controller: AppController }>()
const {
  modal,
  objectDetails,
  objectForm,
  selectedObjects,
  pasteTargetExists,
  createFolder,
  renameSelected,
  transferSelected,
  pasteWithNewName,
  createSymlink,
  restoreSelected,
  applyAcl,
  applyHeaders
} = props.controller
</script>

<template>
  <div class="contents">
    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'create-folder'" :title="t('新建文件夹')" @close="modal = null">
        <label class="field-label">{{ t('文件夹名称') }}</label>
        <div class="input-wrap">
          <input v-model.trim="objectForm.name" @keydown.enter="createFolder" />
        </div>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('创建')"
            tone="primary"
            :disabled="!objectForm.name"
            @click="createFolder"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'rename'" :title="t('重命名')" @close="modal = null">
        <label class="field-label">{{ t('目标名称') }}</label>
        <div class="input-wrap"><input v-model.trim="objectForm.target" /></div>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('确定')"
            tone="primary"
            :disabled="!objectForm.target"
            @click="renameSelected"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'paste-copy'" :title="t('粘贴副本')" @close="modal = null">
        <label class="field-label">{{ t('新名称') }}</label>
        <div class="input-wrap"><input v-model.trim="objectForm.target" /></div>

        <p class="modal-hint">
          {{
            pasteTargetExists
              ? t('该名称已存在，请输入一个新名称。')
              : t('修改名称后，将在当前目录创建一个副本。')
          }}
        </p>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('创建副本')"
            tone="primary"
            :disabled="!objectForm.target || pasteTargetExists"
            @click="pasteWithNewName"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'move'" :title="t('移动对象')" @close="modal = null">
        <label class="field-label">{{ t('目标 OSS 路径') }}</label>
        <div class="input-wrap">
          <input v-model.trim="objectForm.target" placeholder="oss://bucket/path/" />
        </div>
        <p class="modal-hint">{{ t('支持其他目录和其他 Bucket。') }}</p>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('确定')"
            tone="primary"
            :disabled="!objectForm.target.startsWith('oss://')"
            @click="transferSelected(true)"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'acl'" :title="t('设置对象权限')" @close="modal = null">
        <div class="select-wrap">
          <select v-model="objectForm.acl">
            <option value="default">{{ t('继承 Bucket') }}</option>
            <option value="private">{{ t('私有') }}</option>
            <option value="public-read">{{ t('公共读') }}</option>
            <option value="public-read-write">{{ t('公共读写') }}</option>
          </select>
        </div>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('保存')"
            tone="primary"
            @click="applyAcl"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'headers'" :title="t('设置 HTTP 头')" @close="modal = null">
        <label class="field-label">Cache-Control</label>
        <div class="input-wrap">
          <input v-model.trim="objectForm.cacheControl" :placeholder="t('例如 max-age=3600')" />
        </div>
        <label class="field-label">Content-Type</label>
        <div class="input-wrap">
          <input v-model.trim="objectForm.contentType" :placeholder="t('例如 image/png')" />
        </div>
        <label class="field-label">Content-Disposition</label>
        <div class="input-wrap">
          <input v-model.trim="objectForm.contentDisposition" :placeholder="t('例如 attachment')" />
        </div>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('保存')"
            tone="primary"
            @click="applyHeaders"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'symlink'" :title="t('创建软链接')" @close="modal = null">
        <label class="field-label">{{ t('软链接名称') }}</label>
        <div class="input-wrap"><input v-model.trim="objectForm.name" /></div>
        <p class="modal-hint">
          {{ t('目标对象：{name}', { name: selectedObjects[0]?.name || '' }) }}
        </p>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('创建')"
            tone="primary"
            :disabled="!objectForm.name"
            @click="createSymlink"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'restore'" :title="t('恢复归档对象')" @close="modal = null">
        <label class="field-label">{{ t('保持可读天数') }}</label>
        <div class="input-wrap">
          <input v-model.number="objectForm.days" type="number" min="1" max="7" />
        </div>
        <p class="modal-hint">{{ t('适用于归档、冷归档和深度冷归档对象。') }}</p>
        <template #footer
          ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
            :label="t('提交恢复')"
            tone="primary"
            @click="restoreSelected"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'details'"
        :title="t('对象详情')"
        width="680px"
        @close="modal = null"
      >
        <div class="details-list">
          <div v-for="(value, key) in objectDetails?.headers" :key="key">
            <strong>{{ key }}</strong
            ><span>{{ value }}</span>
          </div>
          <div v-for="(value, key) in objectDetails?.metadata" :key="`meta-${key}`">
            <strong>x-oss-meta-{{ key }}</strong
            ><span>{{ value }}</span>
          </div>
        </div>
      </ModalShell>
    </Transition>
  </div>
</template>
