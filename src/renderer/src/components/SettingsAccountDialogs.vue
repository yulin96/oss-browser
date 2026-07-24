<script setup lang="ts">
import { GitFork, Monitor, Moon, RefreshCw, ShieldCheck, Star, Sun, Trash2 } from '@lucide/vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import ModalShell from './ModalShell.vue'
import { Switch } from './ui/switch'

const props = defineProps<{ controller: AppController }>()
const {
  modal,
  showProfilesModal,
  savedProfiles,
  permissionResults,
  permissionChecking,
  cdnCredentialForm,
  cdnCredentialTargetId,
  auth,
  settings,
  themeMode,
  favorites,
  openFavorite,
  removeFavorite,
  updateState,
  updateDescription,
  updateButtonLabel,
  handleUpdateAction,
  openProjectPage,
  clearSavedProfile,
  useProfile,
  removeProfile,
  openCdnCredentials,
  clearCdnCredentialForm,
  saveCdnCredentials,
  checkPermissions
} = props.controller
</script>

<template>
  <div class="contents">
    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'favorites'"
        :title="t('收藏管理')"
        size="large"
        @close="modal = null"
      >
        <div v-if="!favorites.length" class="modal-empty">{{ t('暂无收藏目录') }}</div>
        <div
          v-for="favorite in favorites"
          :key="`${favorite.bucket}/${favorite.prefix}`"
          class="favorite-row"
        >
          <div role="button" tabindex="0" @click="openFavorite(favorite)">
            <Star :size="17" /><span>oss://{{ favorite.bucket }}/{{ favorite.prefix }}</span>
          </div>
          <AppTooltip :label="t('删除收藏')">
            <div class="icon-button danger" @click="removeFavorite(favorite)">
              <Trash2 :size="16" />
            </div>
          </AppTooltip>
        </div>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell v-if="modal === 'settings'" :title="t('设置')" size="large" @close="modal = null">
        <div class="setting-row project-setting-row">
          <div>
            <strong>{{ t('项目主页') }}</strong
            ><span>github.com/yulin96/oss-browser</span>
          </div>
          <AppButton label="GitHub" :icon="GitFork" @click="openProjectPage" />
        </div>

        <div class="settings-section-title">{{ t('通用设置') }}</div>
        <div class="setting-row">
          <div>
            <strong>{{ t('软件更新') }}</strong
            ><span>{{ updateDescription }}</span>
            <div v-if="updateState.status === 'downloading'" class="update-progress-track">
              <div
                class="update-progress-value"
                :style="{
                  width: `${Math.min(100, Math.max(0, updateState.percent || 0))}%`
                }"
              />
            </div>
          </div>
          <AppButton
            :label="updateButtonLabel"
            :icon="RefreshCw"
            :disabled="updateState.status === 'checking' || updateState.status === 'downloading'"
            @click="handleUpdateAction"
          />
        </div>
        <div class="setting-row">
          <div>
            <strong>{{ t('外观主题') }}</strong
            ><span>{{ t('选择浅色、深色或跟随系统') }}</span>
          </div>
          <div
            class="theme-select-buttons t-tabs"
            data-count="3"
            :data-active="themeMode === 'system' ? '0' : themeMode === 'light' ? '1' : '2'"
          >
            <div
              :class="{ active: themeMode === 'system' }"
              role="button"
              tabindex="0"
              @click="themeMode = 'system'"
            >
              <Monitor :size="14" />
              <span>{{ t('跟随系统') }}</span>
            </div>
            <div
              :class="{ active: themeMode === 'light' }"
              role="button"
              tabindex="0"
              @click="themeMode = 'light'"
            >
              <Sun :size="14" />
              <span>{{ t('浅色') }}</span>
            </div>
            <div
              :class="{ active: themeMode === 'dark' }"
              role="button"
              tabindex="0"
              @click="themeMode = 'dark'"
            >
              <Moon :size="14" />
              <span>{{ t('深色') }}</span>
            </div>
          </div>
        </div>
        <div class="setting-row">
          <div>
            <strong>{{ t('连接安全') }}</strong
            ><span>{{ t('OSS 请求默认使用 HTTPS') }}</span>
          </div>
          <label class="setting-switch">
            <span>HTTPS</span>
            <Switch v-model="auth.secure" :aria-label="t('连接安全')" />
          </label>
        </div>
        <div class="setting-row">
          <div>
            <strong>{{ t('图片缩略图') }}</strong
            ><span>{{ t('在文件列表中显示图片预览') }}</span>
          </div>
          <label class="setting-switch">
            <span>{{ t('显示') }}</span>
            <Switch v-model="settings.showImagePreview" :aria-label="t('图片缩略图')" />
          </label>
        </div>
        <div class="setting-row">
          <div>
            <strong>{{ t('图片分辨率') }}</strong
            ><span>{{ t('在文件列表中显示图片原始宽高') }}</span>
          </div>
          <label class="setting-switch">
            <span>{{ t('显示') }}</span>
            <Switch v-model="settings.showImageResolution" :aria-label="t('图片分辨率')" />
          </label>
        </div>

        <div class="settings-section-title">{{ t('账号与权限') }}</div>
        <div class="setting-row">
          <div>
            <strong>{{ t('本地登录信息') }}</strong
            ><span>{{ t('仅保存在当前电脑') }}</span>
          </div>
          <AppButton :label="t('管理账号')" @click="showProfilesModal = true" />
        </div>
        <div class="setting-row">
          <div>
            <strong>{{ t('账号权限检测') }}</strong
            ><span>{{ t('使用只读请求检测当前凭证可访问的云服务') }}</span>
          </div>
          <AppButton
            :label="permissionChecking ? t('检测中') : t('开始检测')"
            :icon="ShieldCheck"
            :disabled="permissionChecking"
            @click="checkPermissions"
          />
        </div>
        <div v-if="permissionResults.length" class="permission-results">
          <div v-for="item in permissionResults" :key="item.service">
            <div>
              <strong>{{ item.service }}</strong
              ><span>{{ item.permission }}</span>
            </div>
            <span class="permission-status" :class="item.status">
              {{
                item.status === 'accessible'
                  ? t('可访问')
                  : item.status === 'denied'
                    ? t('无权限')
                    : t('检测失败')
              }}
            </span>
          </div>
          <p>{{ t('检测结果仅代表所列只读接口，不等同于完整的 RAM 权限清单。') }}</p>
        </div>

        <div class="settings-section-title">{{ t('上传下载设置') }}</div>
        <div class="setting-row">
          <div>
            <strong>{{ t('上传同名文件') }}</strong
            ><span>{{ t('设置上传遇到同名对象时的默认处理方式') }}</span>
          </div>
          <div class="select-wrap setting-select">
            <select v-model="settings.uploadConflictPolicy" :aria-label="t('上传同名文件')">
              <option value="ask">{{ t('每次询问') }}</option>
              <option value="replace">{{ t('直接替换') }}</option>
              <option value="skip">{{ t('直接跳过') }}</option>
            </select>
          </div>
        </div>
        <div class="settings-grid">
          <label
            >{{ t('同时上传任务') }}
            <div class="input-wrap">
              <input v-model.number="settings.maxUploadJobs" type="number" min="1" max="10" /></div
          ></label>
          <label
            >{{ t('同时下载任务') }}
            <div class="input-wrap">
              <input
                v-model.number="settings.maxDownloadJobs"
                type="number"
                min="1"
                max="10"
              /></div
          ></label>
          <label
            >{{ t('单任务并发分片') }}
            <div class="input-wrap">
              <input
                v-model.number="settings.multipartParallel"
                type="number"
                min="1"
                max="10"
              /></div
          ></label>
          <label
            >{{ t('传输分片大小（MB）') }}
            <div class="input-wrap">
              <input v-model.number="settings.partSizeMb" type="number" min="1" max="1024" /></div
          ></label>
          <label
            >{{ t('连接超时（秒）') }}
            <div class="input-wrap">
              <input v-model.number="settings.timeoutSeconds" type="number" min="10" /></div
          ></label>
          <label
            >{{ t('失败重试次数') }}
            <div class="input-wrap">
              <input v-model.number="settings.retryTimes" type="number" min="0" max="10" /></div
          ></label>
          <label
            >{{ t('每页对象数量') }}
            <div class="input-wrap">
              <input
                v-model.number="settings.listPageSize"
                type="number"
                min="10"
                max="1000"
              /></div
          ></label>
        </div>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="showProfilesModal"
        :title="t('已保存账号')"
        width="540px"
        @close="showProfilesModal = false"
      >
        <div v-if="!savedProfiles.length" class="modal-empty">{{ t('暂无已保存账号') }}</div>
        <div v-for="profile in savedProfiles" :key="profile.id" class="profile-row">
          <div>
            <strong>
              {{ profile.label }}
              <span
                v-if="profile.label !== profile.config.accessKeyId"
                class="text-xs font-normal text-muted-foreground ml-1"
              >
                ({{ profile.config.accessKeyId }})
              </span>
            </strong>
            <span>{{
              profile.config.endpointMode === 'public' ? t('公共云') : profile.config.endpoint
            }}</span>
          </div>
          <div class="row-actions">
            <AppButton
              :label="profile.config.cdnCredentials ? t('修改 CDN 凭证') : t('配置 CDN 凭证')"
              @click="openCdnCredentials(profile)"
            />
            <AppButton :label="t('使用')" tone="primary" @click="useProfile(profile)" />
            <AppButton :label="t('删除')" tone="danger" @click="removeProfile(profile)" />
          </div>
        </div>
        <template #footer>
          <AppButton :label="t('清空全部')" tone="danger" @click="clearSavedProfile" />
          <!-- <AppButton :label="t('关闭')" @click="showProfilesModal = false" /> -->
        </template>
      </ModalShell>
    </Transition>

    <Transition name="modal" appear>
      <ModalShell
        v-if="modal === 'cdn-credentials'"
        :title="t('配置 CDN 凭证')"
        width="540px"
        @close="modal = null"
      >
        <p class="modal-description">
          {{
            cdnCredentialTargetId
              ? t('该凭证仅用于此已保存账号的 CDN 域名查询和缓存刷新。')
              : t('该凭证仅用于 CDN 域名查询和缓存刷新，不影响 OSS 登录。')
          }}
        </p>
        <p class="modal-description">
          {{ t('未配置或域名不属于该凭证时，将使用 OSS 登录凭证。') }}
        </p>
        <label class="field-label">CDN AccessKey ID</label>
        <div class="input-wrap">
          <input v-model.trim="cdnCredentialForm.accessKeyId" autocomplete="username" />
        </div>
        <label class="field-label">CDN AccessKey Secret</label>
        <div class="input-wrap">
          <input
            v-model="cdnCredentialForm.accessKeySecret"
            type="password"
            autocomplete="current-password"
          />
        </div>
        <template #footer>
          <AppButton
            v-if="cdnCredentialForm.accessKeyId || cdnCredentialForm.accessKeySecret"
            :label="t('清空输入')"
            tone="danger"
            @click="clearCdnCredentialForm"
          />
          <AppButton :label="t('取消')" @click="modal = null" />
          <AppButton
            :label="t('保存')"
            tone="primary"
            :disabled="
              Boolean(cdnCredentialForm.accessKeyId) !== Boolean(cdnCredentialForm.accessKeySecret)
            "
            @click="saveCdnCredentials"
          />
        </template>
      </ModalShell>
    </Transition>
  </div>
</template>
