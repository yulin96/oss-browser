<script setup lang="ts">
import AppView from './components/AppView.vue'
import { TooltipProvider } from './components/ui/tooltip'
import { useAppController } from './composables/useAppController'

const controller = useAppController()
</script>

<template>
  <TooltipProvider :delay-duration="500" :skip-delay-duration="300">
    <AppView :controller="controller" />
  </TooltipProvider>
</template>
