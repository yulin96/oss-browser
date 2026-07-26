<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LoaderCircle, TriangleAlert } from '@lucide/vue'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { t } from '../../i18n'

const props = defineProps<{
  document: PDFDocumentProxy
  pageNumber: number
  scale: number
  rotation: number
}>()

const emit = defineEmits<{
  visibility: [pageNumber: number, visible: boolean, ratio: number, top: number]
}>()

const shell = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const loading = ref(false)
const error = ref('')
const shouldRender = ref(false)
const rendered = ref(false)
const baseWidth = ref(612)
const baseHeight = ref(792)

let pageProxy: PDFPageProxy | undefined
let renderTask: RenderTask | undefined
let renderObserver: IntersectionObserver | undefined
let visibilityObserver: IntersectionObserver | undefined
let renderGeneration = 0

const placeholderHeight = computed(() => {
  const rotated = props.rotation % 180 !== 0
  return Math.max(320, (rotated ? baseWidth.value : baseHeight.value) * props.scale)
})

async function renderPage(): Promise<void> {
  if (!shouldRender.value || !canvas.value) return
  const generation = ++renderGeneration
  renderTask?.cancel()
  loading.value = true
  error.value = ''

  try {
    pageProxy ||= await props.document.getPage(props.pageNumber)
    if (generation !== renderGeneration || !shouldRender.value) return
    const naturalViewport = pageProxy.getViewport({ scale: 1 })
    baseWidth.value = naturalViewport.width
    baseHeight.value = naturalViewport.height
    const viewport = pageProxy.getViewport({ scale: props.scale, rotation: props.rotation })
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const target = canvas.value
    const context = target.getContext('2d')
    if (!context) throw new Error(t('无法创建 PDF 画布'))

    target.width = Math.max(1, Math.floor(viewport.width * pixelRatio))
    target.height = Math.max(1, Math.floor(viewport.height * pixelRatio))
    target.style.width = `${Math.floor(viewport.width)}px`
    target.style.height = `${Math.floor(viewport.height)}px`

    renderTask = pageProxy.render({
      canvas: target,
      canvasContext: context,
      viewport,
      transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0]
    })
    await renderTask.promise
    rendered.value = true
  } catch (reason) {
    if (
      generation === renderGeneration &&
      !(reason instanceof Error && reason.name === 'RenderingCancelledException')
    ) {
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  } finally {
    if (generation === renderGeneration) loading.value = false
  }
}

function releaseCanvas(): void {
  renderGeneration += 1
  renderTask?.cancel()
  renderTask = undefined
  rendered.value = false
  const target = canvas.value
  if (target) {
    target.width = 1
    target.height = 1
  }
  pageProxy?.cleanup()
}

watch([() => props.scale, () => props.rotation], renderPage)

onMounted(async () => {
  await nextTick()
  const target = shell.value
  if (!target) return
  const scrollRoot = target.parentElement

  renderObserver = new IntersectionObserver(
    ([entry]) => {
      shouldRender.value = entry.isIntersecting
      if (entry.isIntersecting) void renderPage()
      else releaseCanvas()
    },
    { root: scrollRoot, rootMargin: '720px 0px' }
  )
  visibilityObserver = new IntersectionObserver(
    ([entry]) => {
      emit(
        'visibility',
        props.pageNumber,
        entry.isIntersecting,
        entry.intersectionRatio,
        entry.boundingClientRect.top
      )
    },
    { root: scrollRoot, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
  )
  renderObserver.observe(target)
  visibilityObserver.observe(target)
})

onBeforeUnmount(() => {
  renderObserver?.disconnect()
  visibilityObserver?.disconnect()
  releaseCanvas()
})
</script>

<template>
  <section
    ref="shell"
    class="pdf-page-shell"
    :data-page-number="pageNumber"
    :style="{ minHeight: `${placeholderHeight}px` }"
    :aria-label="t('第 {page} 页', { page: pageNumber })"
  >
    <span class="pdf-page-label">{{ pageNumber }}</span>
    <canvas ref="canvas" :class="{ rendered }" />
    <div v-if="loading && !rendered" class="pdf-page-status">
      <LoaderCircle class="spin" :size="22" />
      <span>{{ t('正在渲染第 {page} 页…', { page: pageNumber }) }}</span>
    </div>
    <div v-else-if="error" class="pdf-page-status is-error">
      <TriangleAlert :size="22" />
      <span>{{ error }}</span>
    </div>
  </section>
</template>
