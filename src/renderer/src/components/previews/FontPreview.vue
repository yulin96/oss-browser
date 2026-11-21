<script setup lang="ts">
import ErrorMessage from '../ErrorMessage.vue'
import { computed, ref, watch } from 'vue'
import { LoaderCircle, TriangleAlert } from '@lucide/vue'
import { t } from '../../i18n'

const props = defineProps<{
  url: string
  name: string
  size: number
}>()

const loading = ref(true)
const error = ref('')
const sample = ref('字体预览 Font Preview 0123456789')
const fontSize = ref(42)
const fontFamily = `oss-preview-${crypto.randomUUID()}`

const formattedSize = computed(() => {
  if (props.size < 1024) return `${props.size} B`
  if (props.size < 1024 * 1024) return `${(props.size / 1024).toFixed(1)} KB`
  return `${(props.size / 1024 / 1024).toFixed(1)} MB`
})

watch(
  () => props.url,
  async (url, _, onCleanup) => {
    const controller = new AbortController()
    let loadedFont: FontFace | undefined
    onCleanup(() => {
      controller.abort()
      if (loadedFont) document.fonts.delete(loadedFont)
    })
    loading.value = true
    error.value = ''
    try {
      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const font = new FontFace(fontFamily, await response.arrayBuffer())
      await font.load()
      if (controller.signal.aborted) return
      document.fonts.add(font)
      loadedFont = font
    } catch (reason) {
      if (!controller.signal.aborted)
        error.value = reason instanceof Error ? reason.message : String(reason)
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="font-preview">
    <div v-if="loading" class="preview-status">
      <LoaderCircle class="spin" :size="26" />
      <span>{{ t('正在加载字体…') }}</span>
    </div>
    <div v-else-if="error" class="preview-status is-error">
      <TriangleAlert :size="28" />
      <strong>{{ t('字体加载失败') }}</strong>
      <ErrorMessage :message="error" />
    </div>
    <template v-else>
      <div class="font-preview-head">
        <div>
          <strong>{{ name }}</strong>
          <span>{{ formattedSize }}</span>
        </div>
        <label>
          <span>{{ t('字号') }}</span>
          <input v-model.number="fontSize" type="range" min="18" max="84" step="2" />
          <span>{{ fontSize }} px</span>
        </label>
      </div>
      <div class="font-preview-body" :style="{ fontFamily }">
        <input v-model="sample" :aria-label="t('字体预览文字')" />
        <div class="font-sample-primary" :style="{ fontSize: `${fontSize}px` }">{{ sample }}</div>
        <div class="font-sample-grid">
          <p>ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
          <p>abcdefghijklmnopqrstuvwxyz</p>
          <p>0123456789 !@#$%^&*()</p>
          <p>春风又绿江南岸，明月何时照我还。</p>
        </div>
      </div>
    </template>
  </div>
</template>
