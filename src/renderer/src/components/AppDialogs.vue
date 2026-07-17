<script setup lang="ts">
import type { AppController } from '../composables/useAppController'
import BucketDialogs from './BucketDialogs.vue'
import CloudDialogs from './CloudDialogs.vue'
import ObjectDialogs from './ObjectDialogs.vue'
import SettingsAccountDialogs from './SettingsAccountDialogs.vue'
import SharePreviewDialogs from './SharePreviewDialogs.vue'
import UploadConflictDialog from './UploadConflictDialog.vue'

defineProps<{ controller: AppController }>()
</script>

<template>
  <div class="contents">
    <BucketDialogs :controller="controller" />
    <ObjectDialogs :controller="controller" />
    <SharePreviewDialogs :controller="controller" />
    <CloudDialogs :controller="controller" />
    <SettingsAccountDialogs :controller="controller" />
    <UploadConflictDialog :controller="controller" />
  </div>
</template>
