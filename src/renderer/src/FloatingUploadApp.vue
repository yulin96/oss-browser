<script setup lang="ts">
import { Check, CloudUpload, Folder, LoaderCircle, TriangleAlert } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { FloatingUploadState, FloatingWindowPosition } from '../../shared/types'

const state = ref<FloatingUploadState>({
  visible: false,
  expanded: false,
  dockSide: 'right',
  status: 'idle',
  progress: 0,
  completed: 0,
  total: 0
})
const dragActive = ref(false)
let dragDepth = 0
let collapseTimer: ReturnType<typeof setTimeout> | undefined
let removeStateListener: (() => void) | undefined
let themeQuery: MediaQueryList | undefined
let moveStart:
  | {
      pointerX: number
      pointerY: number
      window: FloatingWindowPosition
      moved: boolean
    }
  | undefined

const statusLabel = computed(() => {
  if (state.value.status === 'uploading') {
    return `${Math.round(state.value.progress * 100)}% · ${state.value.completed}/${state.value.total}`
  }
  return state.value.message || state.value.target?.prefix || '/'
})

const statusIcon = computed(() => {
  if (state.value.status === 'checking' || state.value.status === 'uploading') return LoaderCircle
  if (state.value.status === 'success') return Check
  if (state.value.status === 'error') return TriangleAlert
  return Folder
})

function applyTheme(): void {
  const stored = localStorage.getItem('oss-browser-theme')
  const theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  document.documentElement.dataset.theme = theme
}

function setExpanded(expanded: boolean): void {
  if (moveStart || dragActive.value) return
  void window.ossBrowser.floatingUpload.setExpanded(expanded)
}

function expand(): void {
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = undefined
  setExpanded(true)
}

function scheduleCollapse(): void {
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = setTimeout(() => {
    collapseTimer = undefined
    setExpanded(false)
  }, 180)
}

function handleDragEnter(): void {
  dragDepth += 1
  dragActive.value = true
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = undefined
  void window.ossBrowser.floatingUpload.setExpanded(true)
}

function handleDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth) return
  dragActive.value = false
  scheduleCollapse()
}

async function handleDrop(event: DragEvent): Promise<void> {
  dragDepth = 0
  dragActive.value = false
  const paths = Array.from(event.dataTransfer?.files || [])
    .map((file) => window.ossBrowser.files.getPathForFile(file))
    .filter(Boolean)
  if (!paths.length) return
  try {
    await window.ossBrowser.floatingUpload.upload(paths)
  } catch (error) {
    console.error('[floating-upload] Upload failed', error)
  } finally {
    scheduleCollapse()
  }
}

async function startMove(event: PointerEvent): Promise<void> {
  if (event.button !== 0 || dragActive.value) return
  if (collapseTimer) clearTimeout(collapseTimer)
  collapseTimer = undefined
  event.currentTarget instanceof HTMLElement &&
    event.currentTarget.setPointerCapture(event.pointerId)
  await window.ossBrowser.floatingUpload.setExpanded(false)
  moveStart = {
    pointerX: event.screenX,
    pointerY: event.screenY,
    window: await window.ossBrowser.floatingUpload.getPosition(),
    moved: false
  }
}

function move(event: PointerEvent): void {
  if (!moveStart) return
  const x = moveStart.window.x + event.screenX - moveStart.pointerX
  const y = moveStart.window.y + event.screenY - moveStart.pointerY
  if (
    Math.abs(event.screenX - moveStart.pointerX) + Math.abs(event.screenY - moveStart.pointerY) >
    3
  ) {
    moveStart.moved = true
  }
  if (moveStart.moved) void window.ossBrowser.floatingUpload.moveTo({ x, y })
}

async function finishMove(): Promise<void> {
  if (!moveStart) return
  const moved = moveStart.moved
  moveStart = undefined
  if (moved) await window.ossBrowser.floatingUpload.finishMove()
}

function showContextMenu(): void {
  void window.ossBrowser.floatingUpload.showMenu()
}

onMounted(async () => {
  applyTheme()
  themeQuery = window.matchMedia('(prefers-color-scheme: dark)')
  themeQuery.addEventListener('change', applyTheme)
  removeStateListener = window.ossBrowser.floatingUpload.onState((nextState) => {
    state.value = nextState
    applyTheme()
  })
  state.value = await window.ossBrowser.floatingUpload.getState()
})

onBeforeUnmount(() => {
  removeStateListener?.()
  themeQuery?.removeEventListener('change', applyTheme)
  if (collapseTimer) clearTimeout(collapseTimer)
})
</script>

<template>
  <main
    class="floating-upload-shell"
    :class="[
      `dock-${state.dockSide}`,
      `upload-status-${state.status}`,
      { expanded: state.expanded, 'drag-active': dragActive }
    ]"
    aria-live="polite"
    @mouseenter="expand"
    @mouseleave="scheduleCollapse"
    @contextmenu.prevent="showContextMenu"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div class="floating-upload-control">
      <div
        class="floating-upload-orb"
        role="button"
        tabindex="0"
        aria-label="拖动悬浮上传窗口"
        @pointerdown="startMove"
        @pointermove="move"
        @pointerup="finishMove"
        @pointercancel="finishMove"
      >
        <svg class="floating-progress" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="29" />
          <circle
            v-if="state.status === 'uploading'"
            class="floating-progress-value"
            cx="32"
            cy="32"
            r="29"
            :style="{ strokeDashoffset: `${182.2 * (1 - state.progress)}` }"
          />
        </svg>
        <CloudUpload :size="28" />
      </div>

      <div
        v-if="state.expanded"
        class="floating-target"
        :title="`oss://${state.target?.bucket}/${state.target?.prefix || ''}`"
      >
        <strong>{{ state.target?.bucket }}</strong>
        <span :class="`status-${state.status}`">{{ statusLabel }}</span>
      </div>

      <div v-if="state.expanded" class="floating-status-icon" :class="`status-${state.status}`">
        <component
          :is="statusIcon"
          :size="18"
          :class="{ spinning: state.status === 'checking' || state.status === 'uploading' }"
        />
      </div>
    </div>
  </main>
</template>

<style>
html.floating-window,
html.floating-window body,
html.floating-window #app {
  background: transparent !important;
}

.floating-upload-shell {
  display: flex;
  width: 100%;
  height: 64px;
  overflow: hidden;
  align-items: center;
  background: transparent;
}

.floating-upload-shell.dock-right {
  justify-content: flex-end;
}

.floating-upload-control {
  display: flex;
  width: 64px;
  height: 64px;
  min-width: 64px;
  align-items: center;
  overflow: hidden;
  border-radius: 32px;
  background: transparent;
  transition:
    background-color var(--duration-quick) var(--ease-smooth-out),
    box-shadow var(--duration-quick) var(--ease-smooth-out);
}

.floating-upload-shell.expanded .floating-upload-control {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 4px 8px rgba(15, 23, 34, 0.18);
}

.floating-upload-shell.dock-right .floating-upload-control {
  flex-direction: row-reverse;
}

.floating-upload-orb {
  position: relative;
  display: grid;
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: var(--primary);
  box-shadow: 0 4px 8px rgba(15, 23, 34, 0.24);
  cursor: grab;
  touch-action: none;
}

.floating-upload-orb:active {
  cursor: grabbing;
}

.floating-upload-orb:focus-visible {
  outline: 2px solid #fff;
  outline-offset: -5px;
}

.floating-progress {
  position: absolute;
  inset: 0;
  width: 64px;
  height: 64px;
  transform: rotate(-90deg);
  pointer-events: none;
}

.floating-progress circle {
  fill: none;
  stroke: rgba(255, 255, 255, 0.26);
  stroke-width: 2;
}

.floating-progress .floating-progress-value {
  stroke: #fff;
  stroke-dasharray: 182.2;
  stroke-linecap: round;
  transition: stroke-dashoffset var(--duration-quick) var(--ease-smooth-out);
}

.floating-target {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  padding: 0 12px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
}

.floating-target strong,
.floating-target span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.floating-target strong {
  color: var(--text);
  font-weight: 500;
}

.floating-target span {
  color: var(--muted);
  font-weight: 400;
}

.floating-status-icon {
  display: grid;
  width: 48px;
  height: 32px;
  flex: 0 0 48px;
  place-items: center;
  border-left: 1px solid var(--border);
  color: var(--muted);
}

.dock-right .floating-status-icon {
  border-right: 1px solid var(--border);
  border-left: 0;
}

.floating-upload-shell.drag-active .floating-upload-control {
  background: var(--primary-soft);
}

.floating-upload-shell.drag-active .floating-upload-orb {
  outline: 2px dashed var(--primary-dark, #4c9aff);
  outline-offset: -5px;
}

.floating-upload-shell.upload-status-success .floating-upload-orb {
  background: #22a06b;
}

.floating-upload-shell.upload-status-error .floating-upload-orb {
  background: var(--danger);
}

.status-success {
  color: #22a06b !important;
}

.status-error {
  color: var(--danger) !important;
}

.status-waiting {
  color: var(--primary) !important;
}

.spinning {
  animation: floating-spin 900ms linear infinite;
}

@keyframes floating-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .floating-upload-control,
  .floating-progress .floating-progress-value {
    transition: none;
  }

  .spinning {
    animation-duration: 1600ms;
  }
}
</style>
