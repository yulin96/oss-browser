<script setup lang="ts">
import AppView from './components/AppView.vue'
import { useAppController } from './composables/useAppController'

const controller = useAppController()
</script>

<template>
  <AppView :controller="controller" />
</template>
