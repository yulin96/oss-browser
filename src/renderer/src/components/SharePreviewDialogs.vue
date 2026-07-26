<script setup lang="ts">
import { ref, watch } from 'vue'
import { CircleCheck, Copy, LoaderCircle, RefreshCw, TriangleAlert } from '@lucide/vue'
import type { ObjectPreviewKind } from '../../../shared/object-preview'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import ModalShell from './ModalShell.vue'
import CodePreview from './previews/CodePreview.vue'
import FontPreview from './previews/FontPreview.vue'
import PdfPreview from './previews/PdfPreview.vue'
import StructuredTextPreview from './previews/StructuredTextPreview.vue'

const props = defineProps<{ controller: AppController }>()
const {
  modal,
  previewUrl,
  previewText,
  objectPreview,
  previewLoading,
  previewError,
  previewSaving,
  previewSaved,
  previewSaveError,
  shareNeedsExpiry,
  sharePreparing,
  shareCopied,
  domainOptions,
  selectedDomain,
  cdnDomains,
  selectedCdnDomain,
  cachePanel,
  cacheRefreshTasks,
  cacheTasksLoading,
  cacheRefreshQuota,
  cacheQuotaLoading,
  cacheQuotaError,
  objectForm,
  cacheForm,
  selectedMediaProcesses,
  mediaProcessOptions,
  selectedObjects,
  previewType,
  handleCacheDomainChange,
  showCachePanel,
  loadCacheRefreshTasks,
  confirmCacheRefresh,
  createShareLink,
  updateAddressDomain,
  toggleMediaProcess,
  copyShareUrl,
  openPreview,
  savePreviewText,
  openPreviewExternally
} = props.controller

const mediaError = ref('')

watch(objectPreview, () => {
  mediaError.value = ''
})

function structuredFormat(kind: ObjectPreviewKind): 'markdown' | 'json' | 'yaml' | 'csv' | 'tsv' {
  return kind as 'markdown' | 'json' | 'yaml' | 'csv' | 'tsv'
}

function cacheTaskStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    Pending: '等待中',
    Refreshing: '处理中',
    Complete: '已完成',
    Failed: '失败',
    Timeout: '已超时',
    Canceled: '已取消'
  }
  return t(labels[status] || status)
}

function cacheTaskStatusClass(status: string): string {
  return ['Pending', 'Refreshing', 'Complete', 'Failed', 'Timeout', 'Canceled'].includes(status)
    ? status.toLowerCase()
    : 'unknown'
}
</script>

<template>
  <div class="contents">
    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'cache'"
        :title="t('刷新 CDN 缓存')"
        width="720px"
        @close="modal = null"
      >
        <label class="field-label">{{ t('CDN 加速域名') }}</label>
        <div class="select-wrap">
          <select
            v-model="selectedCdnDomain"
            :disabled="cacheTasksLoading || cacheQuotaLoading"
            @change="handleCacheDomainChange"
          >
            <option
              v-for="domain in cdnDomains"
              :key="domain.domainName"
              :value="domain.domainName"
            >
              {{ domain.domainName }} ·
              {{
                domain.credentialSources.length === 2
                  ? t('主凭证 / CDN 凭证')
                  : domain.credentialSources[0] === 'dedicated'
                    ? t('CDN 凭证')
                    : t('主凭证')
              }}
            </option>
          </select>
        </div>

        <div class="cache-header-tabs">
          <div
            class="cache-tab"
            :class="{ active: cachePanel === 'refresh' }"
            role="button"
            tabindex="0"
            @click="showCachePanel('refresh')"
            @keydown.enter="showCachePanel('refresh')"
          >
            {{ t('提交刷新') }}
          </div>
          <div
            class="cache-tab"
            :class="{ active: cachePanel === 'history' }"
            role="button"
            tabindex="0"
            @click="showCachePanel('history')"
            @keydown.enter="showCachePanel('history')"
          >
            {{ t('刷新记录') }}
          </div>
        </div>

        <div class="cache-panel-content">
          <template v-if="cachePanel === 'refresh'">
            <label class="field-label">{{ t('刷新类型') }}</label>
            <div class="select-wrap">
              <select v-model="cacheForm.objectType">
                <option value="File">{{ t('文件') }}</option>
                <option value="Directory">{{ t('目录') }}</option>
                <option value="Regex">{{ t('正则') }}</option>
              </select>
            </div>
            <label class="field-label">URL</label>
            <div class="textarea-wrap">
              <textarea
                v-model.trim="cacheForm.objectPath"
                rows="5"
                placeholder="https://static.example.com/path/"
              />
            </div>
          </template>

          <div v-else class="cache-history">
            <div class="cache-history-head">
              <span>{{ t('仅显示最近三天的刷新任务') }}</span>
              <AppButton
                :label="cacheTasksLoading ? t('正在刷新…') : t('刷新')"
                :icon="RefreshCw"
                :disabled="cacheTasksLoading"
                @click="loadCacheRefreshTasks()"
              />
            </div>
            <div v-if="cacheTasksLoading" class="cache-history-empty">
              {{ t('正在加载刷新记录…') }}
            </div>
            <div v-else-if="!cacheRefreshTasks.length" class="cache-history-empty">
              {{ t('暂无刷新记录') }}
            </div>
            <div v-else class="cache-task-list">
              <div
                v-for="task in cacheRefreshTasks"
                :key="`${task.taskId}:${task.objectType}:${task.objectPath}`"
                class="cache-task"
              >
                <div class="cache-task-primary">
                  <span class="cache-task-type">
                    {{
                      task.objectType === 'Directory'
                        ? t('目录')
                        : task.objectType === 'Regex'
                          ? t('正则')
                          : t('文件')
                    }}
                  </span>
                  <span class="cache-task-path" :title="task.objectPath">
                    {{ task.objectPath || '—' }}
                  </span>
                  <span class="cache-task-status" :class="cacheTaskStatusClass(task.status)">
                    {{ cacheTaskStatusLabel(task.status) }}
                    <template v-if="task.process"> · {{ task.process }}</template>
                  </span>
                </div>
                <div class="cache-task-meta">
                  <span>{{
                    task.creationTime ? new Date(task.creationTime).toLocaleString() : '—'
                  }}</span>
                  <span>{{ t('任务 ID：{id}', { id: task.taskId || '—' }) }}</span>
                  <span v-if="task.description" class="cache-task-error" :title="task.description">
                    {{ task.description }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="cache-quota" :class="{ error: cacheQuotaError }" :title="cacheQuotaError">
            <span v-if="cacheQuotaLoading">{{ t('正在查询刷新额度…') }}</span>
            <span v-else-if="cacheRefreshQuota">
              {{ t('今日刷新剩余') }}： {{ t('文件') }} {{ cacheRefreshQuota.fileRemain || '—' }}/{{
                cacheRefreshQuota.fileQuota || '—'
              }}
              · {{ t('目录') }} {{ cacheRefreshQuota.directoryRemain || '—' }}/{{
                cacheRefreshQuota.directoryQuota || '—'
              }}
              · {{ t('正则') }} {{ cacheRefreshQuota.regexRemain || '—' }}/{{
                cacheRefreshQuota.regexQuota || '—'
              }}
            </span>
            <span v-else-if="cacheQuotaError">{{ t('刷新额度不可用') }}</span>
          </div>
          <AppButton
            :label="cachePanel === 'refresh' ? t('取消') : t('关闭')"
            @click="modal = null"
          />
          <AppButton
            v-if="cachePanel === 'refresh'"
            :label="t('提交刷新')"
            tone="primary"
            :disabled="!cacheForm.objectPath"
            @click="confirmCacheRefresh"
          />
        </template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'share'"
        :title="t('获取地址')"
        width="680px"
        @close="modal = null"
      >
        <div v-if="sharePreparing" class="share-loading">{{ t('正在检查地址访问权限…') }}</div>
        <template v-else>
          <label class="field-label">{{ t('访问域名') }}</label>
          <div class="select-wrap">
            <select v-model="selectedDomain" @change="updateAddressDomain">
              <option v-for="domain in domainOptions" :key="domain" :value="domain">
                {{ domain }}
              </option>
            </select>
          </div>
          <div v-if="shareNeedsExpiry && !previewUrl" class="share-expiry-step">
            <div>
              <label class="field-label">{{ t('有效期（秒）') }}</label>
              <div class="input-wrap">
                <input
                  v-model.number="objectForm.expires"
                  type="number"
                  min="1"
                  @keydown.enter="createShareLink"
                />
              </div>
            </div>
            <AppButton :label="t('生成')" tone="primary" @click="createShareLink" />
          </div>

          <template v-if="previewUrl">
            <label class="field-label">{{ t('地址') }}</label>
            <div class="textarea-wrap share-address-input">
              <textarea :value="previewUrl" rows="3" readonly />
              <AppButton
                class="share-copy-button"
                :class="{ 'is-copied': shareCopied }"
                :label="shareCopied ? t('已复制') : t('复制')"
                :icon="shareCopied ? CircleCheck : Copy"
                tone="default"
                @click="copyShareUrl"
              />
            </div>
            <div v-if="previewType === 'image' || previewType === 'video'" class="share-media-row">
              <span>{{ t('媒体处理') }}</span>
              <div
                v-for="option in mediaProcessOptions"
                :key="option.id"
                class="media-process-tag"
                :class="{ active: selectedMediaProcesses.includes(option.id) }"
                role="button"
                tabindex="0"
                @click="toggleMediaProcess(option.id)"
                @keydown.enter="toggleMediaProcess(option.id)"
              >
                {{ t(option.label) }}
              </div>
            </div>
          </template>
        </template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'preview'"
        :title="t('预览：{name}', { name: selectedObjects[0]?.displayName || '' })"
        width="960px"
        @close="modal = null"
      >
        <div class="preview-area" :class="objectPreview?.kind">
          <div v-if="previewLoading" class="preview-status">
            <LoaderCircle class="spin" :size="28" />
            <span>{{ t('正在准备预览…') }}</span>
          </div>
          <div v-else-if="previewError || mediaError" class="preview-status is-error">
            <TriangleAlert :size="30" />
            <strong>{{ t('无法预览此文件') }}</strong>
            <span>{{ previewError || mediaError }}</span>
            <AppButton :label="t('重试')" @click="openPreview" />
          </div>
          <template v-else-if="objectPreview">
            <img
              v-if="objectPreview.kind === 'image'"
              :src="objectPreview.url"
              @error="mediaError = t('图片加载失败')"
            />
            <video
              v-else-if="objectPreview.kind === 'video'"
              :src="objectPreview.url"
              controls
              autoplay
              @error="mediaError = t('当前视频编码无法播放或文件无法读取')"
            />
            <audio
              v-else-if="objectPreview.kind === 'audio'"
              :src="objectPreview.url"
              controls
              autoplay
              @error="mediaError = t('当前音频编码无法播放或文件无法读取')"
            />
            <PdfPreview
              v-else-if="objectPreview.kind === 'pdf' && objectPreview.url"
              :url="objectPreview.url"
            />
            <FontPreview
              v-else-if="objectPreview.kind === 'font' && objectPreview.url"
              :url="objectPreview.url"
              :name="objectPreview.name"
              :size="objectPreview.size"
            />
            <StructuredTextPreview
              v-else-if="['markdown', 'json', 'yaml', 'csv', 'tsv'].includes(objectPreview.kind)"
              :content="previewText"
              :format="structuredFormat(objectPreview.kind)"
            />
            <CodePreview
              v-else-if="objectPreview.kind === 'code'"
              :content="previewText"
              :language="objectPreview.language"
              editable
              :saving="previewSaving"
              :saved="previewSaved"
              :save-error="previewSaveError"
              @save="savePreviewText"
            />
            <iframe
              v-else-if="objectPreview.kind === 'document'"
              :src="objectPreview.url"
              sandbox="allow-downloads allow-forms allow-scripts"
              referrerpolicy="no-referrer"
            />
            <div v-else-if="objectPreview.kind === 'text'" class="text-preview">
              <textarea v-model="previewText" spellcheck="false" />
              <div class="text-preview-actions">
                <AppButton :label="t('保存修改')" tone="primary" @click="savePreviewText()" />
              </div>
            </div>
            <div v-else class="preview-unknown">
              <span>{{ t('该格式暂不支持直接预览') }}</span
              ><AppButton
                :label="t('在浏览器中打开')"
                tone="primary"
                @click="openPreviewExternally"
              />
            </div>
          </template>
        </div>
      </ModalShell>
    </Transition>
  </div>
</template>
