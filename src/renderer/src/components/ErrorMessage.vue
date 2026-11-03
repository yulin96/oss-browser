<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../i18n'
import { describeError } from '../utils/errorMessage'

const props = defineProps<{ message: string }>()
const presentation = computed(() => describeError(props.message))
</script>

<template>
  <div class="error-message" role="alert">
    <span>{{ presentation.summary }}</span>
    <details v-if="presentation.details" class="error-details">
      <summary>{{ t('错误详情') }}</summary>
      <div>{{ presentation.details }}</div>
    </details>
  </div>
</template>

<style scoped>
.error-message {
  min-width: 0;
  overflow-wrap: anywhere;
}
.error-details {
  margin-top: 4px;
  font-size: 12px;
  text-align: start;
}
.error-details summary {
  cursor: pointer;
}
.error-details > div {
  margin-top: 4px;
  white-space: pre-wrap;
  user-select: text;
}
</style>
