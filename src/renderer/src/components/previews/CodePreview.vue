<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Check, CircleCheck, Copy, Eye, Pencil, Save, TriangleAlert, WrapText } from '@lucide/vue'
import { t } from '../../i18n'
import { highlightCode } from '../../utils/code-highlight'
import AppButton from '../AppButton.vue'
import AppTooltip from '../AppTooltip.vue'

const props = defineProps<{
  content: string
  language?: string
  editable?: boolean
  saving?: boolean
  saved?: boolean
  saveError?: string
}>()

const emit = defineEmits<{ save: [content: string] }>()

const wrap = ref(false)
const copied = ref(false)
const editing = ref(false)
const draft = ref(props.content)
const highlighted = ref(highlightCode(props.content, props.language))
const editorHighlight = ref<HTMLElement | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
let highlightTimer: ReturnType<typeof setTimeout> | undefined

const dirty = computed(() => draft.value !== props.content)

async function copyContent(): Promise<void> {
  await window.ossBrowser.system.writeClipboard(draft.value)
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1400)
}

function toggleEditing(): void {
  editing.value = !editing.value
}

function saveContent(): void {
  if (!dirty.value || props.saving) return
  emit('save', draft.value)
}

function insertIndent(event: KeyboardEvent): void {
  const target = event.target as HTMLTextAreaElement
  const start = target.selectionStart
  const end = target.selectionEnd
  draft.value = `${draft.value.slice(0, start)}  ${draft.value.slice(end)}`
  requestAnimationFrame(() => {
    target.selectionStart = target.selectionEnd = start + 2
  })
}

function syncEditorScroll(event: Event): void {
  const target = event.target as HTMLTextAreaElement
  if (!editorHighlight.value) return
  // 用 transform 平移代替 scrollTop 同步：pre 的 scrollTop 会被钳制在自身
  // 可滚动范围内，而 textarea 可滚动距离更长（末尾换行多一行、横向滚动条
  // 占高度），钳制后高亮层与光标错位一行。transform 不受此限制。
  editorHighlight.value.style.transform = `translate(${-target.scrollLeft}px, ${-target.scrollTop}px)`
}

watch(
  () => props.content,
  (content) => {
    draft.value = content
  }
)

watch(
  [draft, () => props.language],
  () => {
    if (highlightTimer) return
    highlightTimer = setTimeout(
      () => {
        highlighted.value = highlightCode(draft.value, props.language)
        highlightTimer = undefined
      },
      draft.value.length > 500_000 ? 100 : 16
    )
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
  if (highlightTimer) clearTimeout(highlightTimer)
})
</script>

<!-- highlight.js escapes source text before producing its token markup. -->
<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="code-preview">
    <div class="preview-toolbar">
      <div class="code-toolbar-meta">
        <span class="preview-toolbar-label">{{ language || t('纯文本') }}</span>
        <span v-if="saved" class="code-save-status is-saved">
          <CircleCheck :size="14" />
          {{ t('已保存') }}
        </span>
        <span v-else-if="saveError" class="code-save-status is-error" :title="saveError">
          <TriangleAlert :size="14" />
          {{ t('保存失败') }}：{{ saveError }}
        </span>
      </div>
      <div class="preview-toolbar-actions">
        <AppButton
          v-if="editable"
          :label="editing ? t('退出编辑') : t('编辑')"
          :icon="editing ? Eye : Pencil"
          tone="ghost"
          @click="toggleEditing"
        />
        <AppTooltip :label="wrap ? t('关闭自动换行') : t('开启自动换行')">
          <div
            class="preview-tool-button"
            :class="{ active: wrap }"
            role="button"
            tabindex="0"
            @click="wrap = !wrap"
            @keydown.enter="wrap = !wrap"
            @keydown.space.prevent="wrap = !wrap"
          >
            <WrapText :size="16" />
          </div>
        </AppTooltip>
        <AppTooltip :label="copied ? t('已复制') : t('复制内容')">
          <div
            class="preview-tool-button"
            role="button"
            tabindex="0"
            @click="copyContent"
            @keydown.enter="copyContent"
            @keydown.space.prevent="copyContent"
          >
            <Check v-if="copied" :size="16" />
            <Copy v-else :size="16" />
          </div>
        </AppTooltip>
        <AppButton
          v-if="editable && dirty"
          :label="saving ? t('正在保存…') : t('保存修改')"
          :icon="Save"
          tone="primary"
          :disabled="saving"
          @click="saveContent"
        />
      </div>
    </div>
    <div v-if="editing" class="code-editor-wrap" :class="{ wrap }">
      <pre class="code-editor-highlight" aria-hidden="true"><code
        ref="editorHighlight"
        class="hljs"
        v-html="highlighted"
      /></pre>
      <textarea
        v-model="draft"
        class="code-editor"
        spellcheck="false"
        :wrap="wrap ? 'soft' : 'off'"
        :aria-label="t('编辑代码')"
        @scroll="syncEditorScroll"
        @keydown.tab.prevent="insertIndent"
        @keydown.meta.s.prevent="saveContent"
        @keydown.ctrl.s.prevent="saveContent"
      />
    </div>
    <pre v-else :class="{ wrap }"><code class="hljs" v-html="highlighted" /></pre>
  </div>
</template>
