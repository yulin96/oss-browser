<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { t } from '../i18n'

defineProps<{
  open: boolean
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()
</script>

<template>
  <AlertDialog :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogContent class="border-(--border) bg-(--surface) text-foreground">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <div
          class="inline-flex h-9 items-center justify-center rounded-md border border-(--border) px-4 text-sm font-medium hover:bg-background"
          role="button"
          tabindex="0"
          @click="emit('update:open', false)"
          @keydown.enter="emit('update:open', false)"
        >
          {{ t('取消') }}
        </div>
        <div
          :class="`inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium ${
            destructive
              ? 'bg-destructive text-white hover:opacity-90'
              : 'bg-(--primary) text-white hover:opacity-90'
          }`"
          role="button"
          tabindex="0"
          @click="emit('confirm')"
          @keydown.enter="emit('confirm')"
        >
          {{ confirmLabel }}
        </div>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
