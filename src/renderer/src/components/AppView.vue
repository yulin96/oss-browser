<script setup lang="ts">
import { CircleCheck, X } from '@lucide/vue'

import appIcon from '../assets/icon.png'
import type { AppController } from '../composables/useAppController'
import AppDialogs from './AppDialogs.vue'
import BrowserWorkspace from './BrowserWorkspace.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import LoginView from './LoginView.vue'

const props = defineProps<{ controller: AppController }>()
const { controller } = props
const {
  anyPending,
  toastMessage,
  initializing,
  loggedIn,
  confirmation,
  confirmationOpen,
  closeConfirmation,
  confirmPendingAction,
  finishConfirmationClose
} = controller
</script>

<template>
  <main class="app-shell">
    <div v-if="anyPending" class="loading-bar" />
    <Transition name="toast">
      <div v-if="toastMessage" class="success-toast">
        <CircleCheck :size="18" />
        <span>{{ toastMessage }}</span>
        <div role="button" tabindex="0" @click="toastMessage = ''"><X :size="15" /></div>
      </div>
    </Transition>

    <section v-if="initializing" class="startup-page">
      <img :src="appIcon" alt="OSS Browser" />
    </section>

    <LoginView v-else-if="!loggedIn" :controller="controller" />

    <BrowserWorkspace v-else :controller="controller" />

    <AppDialogs :controller="controller" />

    <ConfirmDialog
      :open="confirmationOpen"
      :title="confirmation?.title || ''"
      :description="confirmation?.description || ''"
      :confirm-label="confirmation?.confirmLabel || ''"
      :destructive="confirmation?.destructive"
      @update:open="!$event && closeConfirmation()"
      @confirm="confirmPendingAction"
      @after-leave="finishConfirmationClose"
    />
  </main>
</template>
