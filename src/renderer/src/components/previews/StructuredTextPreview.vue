<script setup lang="ts">
import { computed, ref } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import Papa from 'papaparse'
import { parse as parseYaml } from 'yaml'
import { TriangleAlert } from '@lucide/vue'
import { t } from '../../i18n'
import CodePreview from './CodePreview.vue'

const props = defineProps<{
  content: string
  format: 'markdown' | 'json' | 'yaml' | 'csv' | 'tsv'
}>()

const mode = ref<'preview' | 'source'>('preview')
const maxRows = 500
const maxColumns = 50

const sourceLanguage = computed(() => {
  if (props.format === 'markdown') return 'markdown'
  if (props.format === 'yaml') return 'yaml'
  if (props.format === 'json') return 'json'
  return 'plaintext'
})

const markdownHtml = computed(() => {
  if (props.format !== 'markdown') return ''
  return DOMPurify.sanitize(marked.parse(props.content) as string, {
    FORBID_TAGS: ['form', 'iframe', 'img', 'input', 'script', 'style', 'video', 'audio']
  })
})

const parsedData = computed<{ formatted: string; error: string }>(() => {
  try {
    const value =
      props.format === 'json'
        ? JSON.parse(props.content)
        : props.format === 'yaml'
          ? parseYaml(props.content)
          : undefined
    return {
      formatted: value === undefined ? '' : JSON.stringify(value, null, 2),
      error: ''
    }
  } catch (reason) {
    return {
      formatted: '',
      error: reason instanceof Error ? reason.message : String(reason)
    }
  }
})

const parsedTable = computed(() => {
  if (props.format !== 'csv' && props.format !== 'tsv')
    return { headers: [], rows: [], errors: [], truncated: false }
  const result = Papa.parse<string[]>(props.content, {
    delimiter: props.format === 'tsv' ? '\t' : '',
    skipEmptyLines: 'greedy'
  })
  const rows = result.data.map((row) => row.slice(0, maxColumns))
  return {
    headers: rows[0] || [],
    rows: rows.slice(1, maxRows + 1),
    errors: result.errors,
    truncated: rows.length - 1 > maxRows || result.data.some((row) => row.length > maxColumns)
  }
})

function handleMarkdownClick(event: MouseEvent): void {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]')
  if (!link) return
  event.preventDefault()
  const url = new URL(link.href)
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    void window.ossBrowser.system.openExternal(url.toString())
  }
}
</script>

<!-- Markdown HTML is sanitized with DOMPurify before rendering. -->
<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="structured-preview">
    <div class="preview-toolbar">
      <div class="preview-segmented">
        <div
          :class="{ active: mode === 'preview' }"
          role="button"
          tabindex="0"
          @click="mode = 'preview'"
          @keydown.enter="mode = 'preview'"
          @keydown.space.prevent="mode = 'preview'"
        >
          {{ t('预览') }}
        </div>
        <div
          :class="{ active: mode === 'source' }"
          role="button"
          tabindex="0"
          @click="mode = 'source'"
          @keydown.enter="mode = 'source'"
          @keydown.space.prevent="mode = 'source'"
        >
          {{ t('源代码') }}
        </div>
      </div>
      <span v-if="parsedTable.truncated" class="preview-toolbar-hint">
        {{ t('仅显示前 500 行和前 50 列') }}
      </span>
    </div>

    <CodePreview v-if="mode === 'source'" :content="content" :language="sourceLanguage" />
    <div
      v-else-if="format === 'markdown'"
      class="markdown-preview"
      @click="handleMarkdownClick"
      v-html="markdownHtml"
    />
    <template v-else-if="format === 'json' || format === 'yaml'">
      <div v-if="parsedData.error" class="preview-parse-error">
        <TriangleAlert :size="20" />
        <div>
          <strong>{{ t('内容解析失败') }}</strong>
          <span>{{ parsedData.error }}</span>
        </div>
      </div>
      <CodePreview v-else :content="parsedData.formatted" language="json" />
    </template>
    <template v-else>
      <div v-if="parsedTable.errors.length" class="preview-parse-error">
        <TriangleAlert :size="20" />
        <div>
          <strong>{{ t('部分内容无法解析') }}</strong>
          <span>{{ parsedTable.errors[0]?.message }}</span>
        </div>
      </div>
      <div class="data-table-scroll">
        <table class="data-preview-table">
          <thead>
            <tr>
              <th v-for="(header, index) in parsedTable.headers" :key="index">
                {{ header || t('第 {index} 列', { index: index + 1 }) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in parsedTable.rows" :key="rowIndex">
              <td v-for="(_, columnIndex) in parsedTable.headers" :key="columnIndex">
                {{ row[columnIndex] || '' }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!parsedTable.headers.length" class="preview-empty">
          {{ t('没有可显示的数据') }}
        </div>
      </div>
    </template>
  </div>
</template>
