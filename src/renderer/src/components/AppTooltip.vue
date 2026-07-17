<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

defineProps<{
  label: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}>()
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipContent :side="side || 'top'" :side-offset="3">
      {{ label }}
    </TooltipContent>
  </Tooltip>
</template>
