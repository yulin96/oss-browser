<script setup lang="ts">
import { CircleCheck, Copy } from '@lucide/vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import ModalShell from './ModalShell.vue'

const props = defineProps<{ controller: AppController }>()
const {
  modal,
  previewUrl,
  previewText,
  shareNeedsExpiry,
  sharePreparing,
  shareCopied,
  domainOptions,
  selectedDomain,
  cdnDomains,
  selectedCdnDomain,
  objectForm,
  cacheForm,
  selectedMediaProcesses,
  mediaProcessOptions,
  selectedObjects,
  previewType,
  updateCacheDomain,
  confirmCacheRefresh,
  createShareLink,
  toggleMediaProcess,
  copyShareUrl,
  savePreviewText,
  openPreviewExternally
} = props.controller
</script>

<template>
  <div class="contents">
    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'cache'" :title="t('刷新 CDN 缓存')" @close="modal = null">
        <label class="field-label">{{ t('CDN 加速域名') }}</label>
        <div class="select-wrap">
          <select v-model="selectedCdnDomain" @change="updateCacheDomain">
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
        <label class="check-row"
          ><input v-model="cacheForm.force" type="checkbox" /> {{ t('强制刷新') }}</label
        >

        <template #footer>
          <AppButton :label="t('取消')" @click="modal = null" />
          <AppButton
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
            <select v-model="selectedDomain" @change="previewUrl && createShareLink()">
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
        width="800px"
        @close="modal = null"
      >
        <div class="preview-area">
          <img v-if="previewType === 'image'" :src="previewUrl" />
          <video v-else-if="previewType === 'video'" :src="previewUrl" controls autoplay />
          <audio v-else-if="previewType === 'audio'" :src="previewUrl" controls autoplay />
          <iframe
            v-else-if="previewType === 'pdf' || previewType === 'document'"
            :src="previewUrl"
            sandbox="allow-downloads allow-forms allow-scripts"
            referrerpolicy="no-referrer"
          />
          <div v-else-if="previewType === 'text'" class="text-preview">
            <textarea v-model="previewText" spellcheck="false" />
            <div class="text-preview-actions">
              <AppButton :label="t('保存修改')" tone="primary" @click="savePreviewText" />
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
        </div>
      </ModalShell>
    </Transition>
  </div>
</template>
