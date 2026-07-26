<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Maximize2,
  RotateCw,
  Search,
  TriangleAlert,
  ZoomIn,
  ZoomOut
} from '@lucide/vue'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy
} from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { t } from '../../i18n'
import AppTooltip from '../AppTooltip.vue'
import PdfPageCanvas from './PdfPageCanvas.vue'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const props = defineProps<{ url: string }>()

const container = ref<HTMLElement | null>(null)
const loading = ref(true)
const loadProgress = ref(0)
const error = ref('')
const pageNumber = ref(1)
const pageCount = ref(0)
const scale = ref(1)
const rotation = ref(0)
const searchQuery = ref('')
const searchMessage = ref('')
const searching = ref(false)
const documentProxy = shallowRef<PDFDocumentProxy>()

let loadingTask: PDFDocumentLoadingTask | undefined
const visiblePages = new Map<number, { ratio: number; top: number }>()

const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)
const pageNumbers = computed(() => Array.from({ length: pageCount.value }, (_, index) => index + 1))

async function loadDocument(): Promise<void> {
  loading.value = true
  loadProgress.value = 0
  error.value = ''
  searchMessage.value = ''
  pageNumber.value = 1
  visiblePages.clear()
  await destroyDocument()

  try {
    const task = getDocument({ url: props.url })
    loadingTask = task
    task.onProgress = ({ loaded, total }) => {
      loadProgress.value = total ? Math.round((loaded / total) * 100) : 0
    }
    const pdf = await task.promise
    documentProxy.value = pdf
    pageCount.value = pdf.numPages
    loading.value = false
    await nextTick()
    await fitWidth()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

async function destroyDocument(): Promise<void> {
  documentProxy.value = undefined
  if (loadingTask) {
    await loadingTask.destroy().catch(() => undefined)
    loadingTask = undefined
  }
}

async function fitWidth(): Promise<void> {
  const pdf = documentProxy.value
  const target = container.value
  if (!pdf || !target) return
  const page = await pdf.getPage(pageNumber.value)
  const viewport = page.getViewport({ scale: 1, rotation: rotation.value })
  scale.value = Math.min(4, Math.max(0.25, (target.clientWidth - 52) / viewport.width))
}

function scrollToPage(targetPage: number, behavior: 'auto' | 'smooth' = 'smooth'): void {
  const normalized = Math.min(pageCount.value, Math.max(1, Math.round(targetPage)))
  pageNumber.value = normalized
  const target = container.value
  const page = target?.querySelector<HTMLElement>(`[data-page-number="${normalized}"]`)
  if (!target || !page) return
  const top =
    page.getBoundingClientRect().top - target.getBoundingClientRect().top + target.scrollTop - 18
  target.scrollTo({ top, behavior })
}

function changePage(offset: number): void {
  scrollToPage(pageNumber.value + offset)
}

function normalizePage(): void {
  scrollToPage(Number.isFinite(pageNumber.value) ? pageNumber.value : 1)
}

function changeZoom(factor: number): void {
  scale.value = Math.min(4, Math.max(0.25, scale.value * factor))
}

function rotate(): void {
  rotation.value = (rotation.value + 90) % 360
}

function updateVisiblePage(candidate: number, visible: boolean, ratio: number, top: number): void {
  if (visible) visiblePages.set(candidate, { ratio, top })
  else visiblePages.delete(candidate)
  if (!visiblePages.size) return
  const current = [...visiblePages.entries()].sort(
    ([pageA, stateA], [pageB, stateB]) =>
      stateB.ratio - stateA.ratio || Math.abs(stateA.top) - Math.abs(stateB.top) || pageA - pageB
  )[0]
  pageNumber.value = current[0]
}

async function searchNext(): Promise<void> {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  const pdf = documentProxy.value
  if (!query || !pdf || searching.value) return
  searching.value = true
  searchMessage.value = ''
  try {
    for (let offset = 1; offset <= pdf.numPages; offset += 1) {
      const candidate = ((pageNumber.value - 1 + offset) % pdf.numPages) + 1
      const page = await pdf.getPage(candidate)
      const text = (await page.getTextContent()).items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .toLocaleLowerCase()
      if (text.includes(query)) {
        searchMessage.value = t('已定位到第 {page} 页', { page: candidate })
        scrollToPage(candidate)
        return
      }
    }
    searchMessage.value = t('未找到匹配内容')
  } finally {
    searching.value = false
  }
}

watch(() => props.url, loadDocument, { immediate: true })

onBeforeUnmount(() => {
  void destroyDocument()
})
</script>

<template>
  <div class="pdf-preview">
    <div v-if="loading" class="preview-status">
      <LoaderCircle class="spin" :size="28" />
      <span>{{ t('正在加载 PDF…') }}</span>
      <small v-if="loadProgress">{{ loadProgress }}%</small>
    </div>
    <div v-else-if="error" class="preview-status is-error">
      <TriangleAlert :size="28" />
      <strong>{{ t('PDF 预览失败') }}</strong>
      <span>{{ error }}</span>
    </div>
    <template v-else-if="documentProxy">
      <div class="preview-toolbar pdf-toolbar">
        <div class="preview-toolbar-actions">
          <AppTooltip :label="t('上一页')">
            <div
              class="preview-tool-button"
              :class="{ disabled: pageNumber <= 1 }"
              role="button"
              :tabindex="pageNumber <= 1 ? -1 : 0"
              @click="pageNumber > 1 && changePage(-1)"
              @keydown.enter="pageNumber > 1 && changePage(-1)"
              @keydown.space.prevent="pageNumber > 1 && changePage(-1)"
            >
              <ChevronLeft :size="17" />
            </div>
          </AppTooltip>
          <label class="pdf-page-input">
            <input
              v-model.number="pageNumber"
              type="number"
              min="1"
              :max="pageCount"
              :aria-label="t('页码')"
              @change="normalizePage"
            />
            <span>/ {{ pageCount }}</span>
          </label>
          <AppTooltip :label="t('下一页')">
            <div
              class="preview-tool-button"
              :class="{ disabled: pageNumber >= pageCount }"
              role="button"
              :tabindex="pageNumber >= pageCount ? -1 : 0"
              @click="pageNumber < pageCount && changePage(1)"
              @keydown.enter="pageNumber < pageCount && changePage(1)"
              @keydown.space.prevent="pageNumber < pageCount && changePage(1)"
            >
              <ChevronRight :size="17" />
            </div>
          </AppTooltip>
        </div>
        <div class="pdf-search">
          <Search :size="15" />
          <input v-model="searchQuery" :placeholder="t('搜索 PDF')" @keydown.enter="searchNext" />
          <span v-if="searchMessage">{{ searchMessage }}</span>
        </div>
        <div class="preview-toolbar-actions">
          <AppTooltip :label="t('缩小')">
            <div
              class="preview-tool-button"
              role="button"
              tabindex="0"
              @click="changeZoom(0.85)"
              @keydown.enter="changeZoom(0.85)"
              @keydown.space.prevent="changeZoom(0.85)"
            >
              <ZoomOut :size="17" />
            </div>
          </AppTooltip>
          <span class="pdf-zoom-label">{{ zoomLabel }}</span>
          <AppTooltip :label="t('放大')">
            <div
              class="preview-tool-button"
              role="button"
              tabindex="0"
              @click="changeZoom(1.18)"
              @keydown.enter="changeZoom(1.18)"
              @keydown.space.prevent="changeZoom(1.18)"
            >
              <ZoomIn :size="17" />
            </div>
          </AppTooltip>
          <AppTooltip :label="t('适应宽度')">
            <div
              class="preview-tool-button"
              role="button"
              tabindex="0"
              @click="fitWidth"
              @keydown.enter="fitWidth"
              @keydown.space.prevent="fitWidth"
            >
              <Maximize2 :size="16" />
            </div>
          </AppTooltip>
          <AppTooltip :label="t('顺时针旋转')">
            <div
              class="preview-tool-button"
              role="button"
              tabindex="0"
              @click="rotate"
              @keydown.enter="rotate"
              @keydown.space.prevent="rotate"
            >
              <RotateCw :size="16" />
            </div>
          </AppTooltip>
        </div>
      </div>
      <div ref="container" class="pdf-canvas-scroll">
        <PdfPageCanvas
          v-for="currentPage in pageNumbers"
          :key="currentPage"
          :document="documentProxy"
          :page-number="currentPage"
          :scale="scale"
          :rotation="rotation"
          @visibility="updateVisiblePage"
        />
      </div>
    </template>
  </div>
</template>
