<script setup lang="ts">
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import ModalShell from './ModalShell.vue'

const props = defineProps<{ controller: AppController }>()
const {
  modal,
  ramUsers,
  ramAccessKeys,
  activeRamUser,
  createdAccessKey,
  ramForm,
  openRamUsers,
  editRamUser,
  saveRamUser,
  removeRamUser,
  openRamKeys,
  createRamAccessKey,
  removeRamAccessKey
} = props.controller
</script>

<template>
  <div class="contents">
    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'ram-users'"
        :title="t('RAM 用户')"
        width="760px"
        @close="modal = null"
      >
        <div class="modal-toolbar">
          <AppButton :label="t('新建用户')" tone="primary" @click="editRamUser()" />
        </div>
        <div v-if="!ramUsers.length" class="modal-empty">{{ t('暂无 RAM 用户') }}</div>
        <div v-for="user in ramUsers" :key="user.userName" class="ram-row">
          <div>
            <strong>{{ user.userName }}</strong
            ><span>{{ user.displayName || user.comments || '—' }}</span>
          </div>
          <div class="ram-actions">
            <AppButton :label="t('编辑')" @click="editRamUser(user)" />
            <AppButton label="AccessKey" @click="openRamKeys(user)" />
            <AppButton :label="t('删除')" tone="danger" @click="removeRamUser(user)" />
          </div>
        </div>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'ram-user'"
        :title="activeRamUser ? t('编辑 RAM 用户') : t('新建 RAM 用户')"
        @close="modal = null"
      >
        <label class="field-label">{{ t('用户名') }}</label>
        <div class="input-wrap"><input v-model.trim="ramForm.ramUserName" /></div>
        <label class="field-label">{{ t('显示名称') }}</label>
        <div class="input-wrap"><input v-model.trim="ramForm.ramDisplayName" /></div>
        <label class="field-label">{{ t('备注') }}</label>
        <div class="input-wrap"><input v-model.trim="ramForm.ramComments" /></div>
        <template #footer
          ><AppButton :label="t('取消')" @click="openRamUsers" /><AppButton
            :label="t('保存')"
            tone="primary"
            :disabled="!ramForm.ramUserName"
            @click="saveRamUser"
        /></template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'ram-keys'"
        :title="`AccessKey：${activeRamUser?.userName || ''}`"
        width="700px"
        @close="modal = null"
      >
        <div class="modal-toolbar">
          <AppButton :label="t('新建 AccessKey')" tone="primary" @click="createRamAccessKey" />
        </div>
        <div v-if="createdAccessKey" class="new-access-key">
          <strong>{{ t('请立即保存，Secret 仅显示一次') }}</strong>
          <span>AccessKey ID：{{ createdAccessKey.accessKeyId }}</span>
          <span>AccessKey Secret：{{ createdAccessKey.accessKeySecret }}</span>
        </div>
        <div v-for="key in ramAccessKeys" :key="key.accessKeyId" class="ram-row">
          <div>
            <strong>{{ key.accessKeyId }}</strong
            ><span>{{ key.status }} · {{ key.createDate }}</span>
          </div>
          <AppButton :label="t('删除')" tone="danger" @click="removeRamAccessKey(key)" />
        </div>
        <template #footer><AppButton :label="t('返回用户列表')" @click="openRamUsers" /></template>
      </ModalShell>
    </Transition>
  </div>
</template>
