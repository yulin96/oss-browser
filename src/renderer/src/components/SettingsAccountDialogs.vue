<script setup lang="ts">
import { GitFork, Monitor, Moon, RefreshCw, ShieldCheck, Star, Sun, Trash2 } from '@lucide/vue'
import type { AppController } from '../composables/useAppController'
import { t } from '../i18n'
import AppButton from './AppButton.vue'
import ModalShell from './ModalShell.vue'

const props = defineProps<{ controller: AppController }>()
const {
  modal,
  showProfilesModal,
  savedProfiles,
  permissionResults,
  permissionChecking,
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
          <div class="theme-select-buttons">
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
          <label><input v-model="auth.secure" type="checkbox" /> HTTPS</label>
        </div>
        <div class="setting-row">
          <div>
            <strong>{{ t('图片缩略图') }}</strong
            ><span>{{ t('在文件列表中显示图片预览') }}</span>
          </div>
          <label
            ><input v-model="settings.showImagePreview" type="checkbox" /> {{ t('显示') }}</label
          >
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
            >{{ t('上传分片大小（MB）') }}
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
            <AppButton :label="t('使用')" tone="primary" @click="useProfile(profile)" />
            <AppButton :label="t('删除')" tone="danger" @click="removeProfile(profile)" />
          </div>
        </div>
        <template #footer>
          <AppButton :label="t('清空全部')" tone="danger" @click="clearSavedProfile" />
          <AppButton :label="t('关闭')" @click="showProfilesModal = false" />
        </template>
      </ModalShell>
    </Transition>
  </div>
</template>
