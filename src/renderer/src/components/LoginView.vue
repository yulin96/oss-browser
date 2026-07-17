<script setup lang="ts">
import { ChevronDown, CircleCheck, Globe2, KeyRound, Monitor, Moon, Sun, X } from '@lucide/vue'
import appIcon from '../assets/icon.png'
import type { AppController } from '../composables/useAppController'
import { locale, localeLabel, localeOptions, t } from '../i18n'
import AppButton from './AppButton.vue'
import AppTooltip from './AppTooltip.vue'
import { Switch } from './ui/switch'

const props = defineProps<{ controller: AppController }>()
const {
  authMode,
  authToken,
  showProfilesModal,
  savedProfiles,
  auth,
  authTask,
  errorMessage,
  themeMode,
  login,
  loginWithToken,
  changeLocale
} = props.controller
</script>

<template>
  <section class="login-page">
    <div class="login-preferences">
      <div
        class="login-theme-switch t-tabs"
        data-count="3"
        :data-active="themeMode === 'system' ? '0' : themeMode === 'light' ? '1' : '2'"
        :aria-label="t('外观主题')"
      >
        <AppTooltip :label="t('跟随系统')" side="bottom">
          <div
            :class="{ active: themeMode === 'system' }"
            role="button"
            tabindex="0"
            :aria-label="t('跟随系统')"
            @click="themeMode = 'system'"
          >
            <Monitor :size="15" />
          </div>
        </AppTooltip>
        <AppTooltip :label="t('浅色')" side="bottom">
          <div
            :class="{ active: themeMode === 'light' }"
            role="button"
            tabindex="0"
            :aria-label="t('浅色')"
            @click="themeMode = 'light'"
          >
            <Sun :size="15" />
          </div>
        </AppTooltip>
        <AppTooltip :label="t('深色')" side="bottom">
          <div
            :class="{ active: themeMode === 'dark' }"
            role="button"
            tabindex="0"
            :aria-label="t('深色')"
            @click="themeMode = 'dark'"
          >
            <Moon :size="15" />
          </div>
        </AppTooltip>
      </div>
      <div class="language-picker login-language">
        <Globe2 :size="16" />
        <span>{{ localeLabel(locale) }}</span>
        <ChevronDown :size="14" />
        <select :value="locale" aria-label="Language" @change="changeLocale">
          <option v-for="option in localeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
    </div>
    <div class="brand-panel">
      <div class="brand-mark">
        <img :src="appIcon" alt="OSS Browser" />
      </div>
      <h1>OSS Browser</h1>
      <p>{{ t('快速、安全地管理阿里云对象存储') }}</p>
      <div class="feature-list">
        <div><CircleCheck :size="17" /> {{ t('原生支持 Apple Silicon') }}</div>
        <div><CircleCheck :size="17" /> {{ t('文件与文件夹批量传输') }}</div>
        <div><CircleCheck :size="17" /> {{ t('权限、分享与在线预览') }}</div>
      </div>
    </div>
    <div class="login-card">
      <!-- <div class="login-title">{{ t('连接 OSS') }}</div>
        <div class="login-subtitle">{{ t('使用 AccessKey、STS 凭证或授权码登录') }}</div> -->
      <div
        class="auth-tabs t-tabs"
        data-count="2"
        :data-active="authMode === 'access-key' ? '0' : '1'"
      >
        <div
          :class="{ active: authMode === 'access-key' }"
          role="button"
          tabindex="0"
          @click="authMode = 'access-key'"
        >
          AccessKey
        </div>
        <div
          :class="{ active: authMode === 'token' }"
          role="button"
          tabindex="0"
          @click="authMode = 'token'"
        >
          {{ t('授权码') }}
        </div>
      </div>

      <div class="login-form-body">
        <template v-if="authMode === 'token'">
          <div class="token-form">
            <label class="field-label">{{ t('授权码') }}</label>
            <div class="textarea-wrap">
              <textarea v-model.trim="authToken" :placeholder="t('粘贴 Base64 授权码')" />
            </div>
            <div v-if="errorMessage" :key="errorMessage" class="error-box login-error-shake">
              <span>{{ errorMessage }}</span>
              <AppTooltip :label="t('关闭')">
                <div
                  class="error-dismiss"
                  role="button"
                  tabindex="0"
                  :aria-label="t('关闭')"
                  @click="errorMessage = ''"
                  @keydown.enter="errorMessage = ''"
                  @keydown.space.prevent="errorMessage = ''"
                >
                  <X :size="16" />
                </div>
              </AppTooltip>
            </div>
          </div>
          <AppButton
            class="token-connect-button"
            :label="t('使用授权码连接')"
            tone="primary"
            :disabled="!authToken || authTask.pending.value"
            @click="loginWithToken"
          />
        </template>

        <template v-else>
          <div class="access-key-form">
            <label class="field-label">Endpoint</label>
            <div class="field-row" :class="{ 'single-field': auth.endpointMode === 'public' }">
              <div class="select-wrap compact">
                <select v-model="auth.endpointMode">
                  <option value="public">{{ t('公共云') }}</option>
                  <option value="custom">{{ t('自定义') }}</option>
                  <option value="cname">CNAME</option>
                  <option value="private">{{ t('私网连接') }}</option>
                </select>
              </div>
              <div v-if="auth.endpointMode !== 'public'" class="input-wrap">
                <input v-model.trim="auth.endpoint" placeholder="oss-cn-hangzhou.aliyuncs.com" />
              </div>
            </div>

            <label class="field-label">AccessKey ID</label>
            <div class="input-wrap">
              <input v-model.trim="auth.accessKeyId" autocomplete="username" />
            </div>

            <label class="field-label">AccessKey Secret</label>
            <div class="input-wrap">
              <input
                v-model="auth.accessKeySecret"
                type="password"
                autocomplete="current-password"
              />
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div>
                <label class="field-label">{{ t('账号别名（可选）') }}</label>
                <div class="input-wrap">
                  <input v-model.trim="auth.alias" :placeholder="t('例如：公司生产环境')" />
                </div>
              </div>
              <div>
                <label class="field-label">{{ t('预设路径（可选）') }}</label>
                <div class="input-wrap">
                  <input v-model.trim="auth.presetPath" placeholder="oss://bucket/path/" />
                </div>
              </div>
            </div>

            <template v-if="auth.accessKeyId.startsWith('STS.')">
              <label class="field-label">STS Token</label>
              <div class="input-wrap"><input v-model="auth.stsToken" type="password" /></div>
            </template>

            <div class="login-options">
              <label><Switch v-model="auth.secure" /> {{ t('使用 HTTPS') }}</label>
              <label><Switch v-model="auth.remember" /> {{ t('记住登录信息') }}</label>
            </div>
            <div v-if="errorMessage" :key="errorMessage" class="error-box login-error-shake">
              <span>{{ errorMessage }}</span>
              <AppTooltip :label="t('关闭')">
                <div
                  class="error-dismiss"
                  role="button"
                  tabindex="0"
                  :aria-label="t('关闭')"
                  @click="errorMessage = ''"
                  @keydown.enter="errorMessage = ''"
                  @keydown.space.prevent="errorMessage = ''"
                >
                  <X :size="16" />
                </div>
              </AppTooltip>
            </div>
          </div>
          <AppButton
            :label="t('连接')"
            tone="primary"
            :disabled="
              (auth.endpointMode !== 'public' && !auth.endpoint) ||
              !auth.accessKeyId ||
              !auth.accessKeySecret ||
              authTask.pending.value
            "
            @click="login"
          />
        </template>
      </div>
      <div
        v-if="savedProfiles.length"
        class="saved-profile-entry"
        role="button"
        tabindex="0"
        @click="showProfilesModal = true"
      >
        <KeyRound :size="15" />{{ t('使用已保存账号') }}
      </div>
    </div>
  </section>
</template>
