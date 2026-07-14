<script setup lang="ts">
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

defineProps<{ label: string }>()
</script>

<template>
  <TooltipProvider :delay-duration="80" :skip-delay-duration="0">
    <Tooltip>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipContent side="top" :side-offset="3">
        {{ label }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
