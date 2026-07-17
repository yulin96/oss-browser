<script setup lang="ts">
import { cn } from '@/lib/utils'
import { reactiveOmit } from '@vueuse/core'
import type { TooltipContentEmits, TooltipContentProps } from 'reka-ui'
import { TooltipArrow, TooltipContent, TooltipPortal, useForwardPropsEmits } from 'reka-ui'
import type { HTMLAttributes } from 'vue'

defineOptions({
  inheritAttrs: false
})

const props = withDefaults(
  defineProps<TooltipContentProps & { class?: HTMLAttributes['class'] }>(),
  {
    sideOffset: 4
  }
)

const emits = defineEmits<TooltipContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <TooltipPortal>
    <TooltipContent
      data-slot="tooltip-content"
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'animate-in fade-in-0 zoom-in-95 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-75 motion-reduce:animate-none z-[1200] w-fit rounded-md bg-[#4b5563] px-3 py-1.5 text-xs text-balance text-white',
          props.class
        )
      "
    >
      <slot />

      <TooltipArrow
        class="size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-xs bg-[#4b5563] fill-[#4b5563]"
      />
    </TooltipContent>
  </TooltipPortal>
</template>
