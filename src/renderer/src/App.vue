<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleCheck,
  ClipboardPaste,
  Copy,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson2,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType2,
  FileVideo,
  Folder,
  FolderPlus,
  FolderUp,
  GitFork,
  Globe2,
  Home,
  HousePlus,
  KeyRound,
  LayoutGrid,
  List,
  MoreHorizontal,
  Presentation,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Upload,
  X
} from '@lucide/vue'
import QRCode from 'qrcode'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import type {
  AuthConfig,
  BucketInfo,
  CacheRefreshType,
  MultipartUploadInfo,
  ObjectDetails,
  ObjectInfo,
  PermissionProbeItem,
  RamAccessKey,
  RamUser,
  SavedProfile,
  TransferItem
} from '../../shared/types'
import appIcon from './assets/icon.png'
import AppButton from './components/AppButton.vue'
import AppHeader from './components/AppHeader.vue'
import AppTooltip from './components/AppTooltip.vue'
import BucketHome from './components/BucketHome.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import ModalShell from './components/ModalShell.vue'
import ObjectActionMenu, { type ObjectAction } from './components/ObjectActionMenu.vue'
import { useAppSettings } from './composables/useAppSettings'
import { useAppUpdates } from './composables/useAppUpdates'
import { useAsyncTask } from './composables/useAsyncTask'
import { useConfirmation } from './composables/useConfirmation'
import { useFileBrowser } from './composables/useFileBrowser'
import { locale, setLocale, t, type AppLocale } from './i18n'

type ModalName =
  | 'create-bucket'
  | 'create-folder'
  | 'bucket-acl'
  | 'rename'
  | 'paste-copy'
  | 'move'
  | 'acl'
  | 'headers'
  | 'share'
  | 'preview'
  | 'multipart'
  | 'symlink'
  | 'restore'
  | 'details'
  | 'grant'
  | 'ram-users'
  | 'ram-user'
  | 'ram-keys'
  | 'favorites'
  | 'profiles'
  | 'cache'
  | 'settings'
  | null

interface SessionState {
  profileId: string
}

interface CopyBuffer {
  bucket: string
  prefix: string
  items: ObjectInfo[]
}

const objectIconRules = [
  { pattern: /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic)$/i, icon: FileImage, kind: 'image' },
  { pattern: /\.(mp4|mov|mkv|webm|avi|m4v|flv|wmv|mpeg|mpg)$/i, icon: FileVideo, kind: 'video' },
  { pattern: /\.(mp3|wav|flac|aac|ogg|m4a|wma|aiff)$/i, icon: FileAudio, kind: 'audio' },
  { pattern: /\.(ttf|otf|woff2?|eot)$/i, icon: FileType2, kind: 'font' },
  {
    pattern:
      /\.(html?|css|scss|sass|less|js|jsx|mjs|cjs|ts|tsx|vue|svelte|java|go|rs|py|php|rb|swift|kt)$/i,
    icon: FileCode2,
    kind: 'code'
  },
  { pattern: /\.(json|json5|ya?ml|xml|toml)$/i, icon: FileJson2, kind: 'data' },
  { pattern: /\.(md|mdx|txt|rtf|log|ini|conf)$/i, icon: FileText, kind: 'text' },
  { pattern: /\.(csv|tsv|xls|xlsx|numbers)$/i, icon: FileSpreadsheet, kind: 'sheet' },
  { pattern: /\.(ppt|pptx|key)$/i, icon: Presentation, kind: 'presentation' },
  { pattern: /\.(zip|rar|7z|tar|gz|bz2|xz|dmg|iso)$/i, icon: FileArchive, kind: 'archive' },
  { pattern: /\.(sh|bash|zsh|fish|bat|cmd|ps1)$/i, icon: FileTerminal, kind: 'terminal' },
  { pattern: /\.pdf$/i, icon: FileText, kind: 'pdf' }
]

function getObjectVisual(item: ObjectInfo): { icon: typeof File; kind: string } {
  if (item.isDirectory) return { icon: Folder, kind: 'folder' }
  const match = objectIconRules.find((rule) => rule.pattern.test(item.name))
  return match || { icon: File, kind: 'file' }
}

const loggedIn = ref(false)
const initializing = ref(true)
const authMode = ref<'access-key' | 'token'>('access-key')
const authToken = ref('')
const directError = ref('')
const toastMessage = ref('')
const modal = ref<ModalName>(null)
const transfers = ref<TransferItem[]>([])
const showTransfers = ref(false)
const showMoreActions = ref(false)
const contextMenu = reactive({ visible: false, x: 0, y: 0 })
const emptyContextMenu = reactive({ visible: false, x: 0, y: 0 })
const bucketMenu = reactive({ visible: false, x: 0, y: 0 })
const dragActive = ref(false)
const previewUrl = ref('')
const previewText = ref('')
const qrCodeUrl = ref('')
const grantToken = ref('')
const grantExpiration = ref('')
const ramUsers = ref<RamUser[]>([])
const ramAccessKeys = ref<RamAccessKey[]>([])
const activeRamUser = ref<RamUser | null>(null)
const createdAccessKey = ref<RamAccessKey | null>(null)
const multipartUploads = ref<MultipartUploadInfo[]>([])
const multipartBucket = ref<BucketInfo | null>(null)
const bucketActionTarget = ref<BucketInfo | null>(null)
const objectDetails = ref<ObjectDetails | null>(null)
const savedProfiles = ref<SavedProfile[]>([])
const copyBuffer = shallowRef<CopyBuffer | null>(null)
const domainOptions = ref<string[]>([])
const selectedDomain = ref('')
const cdnDomains = ref<string[]>([])
const selectedCdnDomain = ref('')
const permissionResults = ref<PermissionProbeItem[]>([])
const permissionChecking = ref(false)

const { confirmation, requestConfirmation, confirmPendingAction } = useConfirmation()

const auth = reactive<AuthConfig>({
  alias: '',
  endpoint: 'oss-cn-hangzhou.aliyuncs.com',
  endpointMode: 'public',
  accessKeyId: '',
  accessKeySecret: '',
  stsToken: '',
  secure: true,
  remember: false,
  presetPath: ''
})
const authTask = useAsyncTask(clearAsyncErrors)
const browserTask = useAsyncTask(clearAsyncErrors)
const operationTask = useAsyncTask(clearAsyncErrors)
const cloudTask = useAsyncTask(clearAsyncErrors)
const settingsTask = useAsyncTask(clearAsyncErrors)
const anyPending = computed(
  () =>
    authTask.pending.value ||
    browserTask.pending.value ||
    operationTask.pending.value ||
    cloudTask.pending.value ||
    settingsTask.pending.value ||
    fileBrowser.loading.value
)
const errorMessage = computed({
  get: () =>
    directError.value ||
    fileBrowser.error.value ||
    authTask.error.value ||
    browserTask.error.value ||
    operationTask.error.value ||
    cloudTask.error.value ||
    settingsTask.error.value,
  set: (value: string) => {
    directError.value = value
    if (!value) {
      fileBrowser.error.value = ''
      authTask.clearError()
      browserTask.clearError()
      operationTask.clearError()
      cloudTask.clearError()
      settingsTask.clearError()
    }
  }
})
const run = operationTask.run

function clearAsyncErrors(): void {
  directError.value = ''
  fileBrowser.error.value = ''
  authTask.clearError()
  browserTask.clearError()
  operationTask.clearError()
  cloudTask.clearError()
  settingsTask.clearError()
}
const OSS_REGIONS = [
  { id: 'oss-cn-hangzhou', label: '华东 1 (杭州)' },
  { id: 'oss-cn-shanghai', label: '华东 2 (上海)' },
  { id: 'oss-cn-nanjing', label: '华东 5 (南京)' },
  { id: 'oss-cn-fuzhou', label: '华东 6 (福州)' },
  { id: 'oss-cn-qingdao', label: '华北 1 (青岛)' },
  { id: 'oss-cn-beijing', label: '华北 2 (北京)' },
  { id: 'oss-cn-zhangjiakou', label: '华北 3 (张家口)' },
  { id: 'oss-cn-huhehaote', label: '华北 5 (呼和浩特)' },
  { id: 'oss-cn-wulanchabu', label: '华北 6 (乌兰察布)' },
  { id: 'oss-cn-shenzhen', label: '华南 1 (深圳)' },
  { id: 'oss-cn-heyuan', label: '华南 2 (河源)' },
  { id: 'oss-cn-guangzhou', label: '华南 3 (广州)' },
  { id: 'oss-cn-chengdu', label: '西南 1 (成都)' },
  { id: 'oss-cn-hongkong', label: '中国 (香港)' },
  { id: 'oss-us-west-1', label: '美国西部 1 (硅谷)' },
  { id: 'oss-us-east-1', label: '美国东部 1 (弗吉尼亚)' },
  { id: 'oss-ap-northeast-1', label: '日本 (东京)' },
  { id: 'oss-ap-northeast-2', label: '韩国 (首尔)' },
  { id: 'oss-ap-southeast-1', label: '亚太东南 1 (新加坡)' },
  { id: 'oss-ap-southeast-2', label: '亚太东南 2 (悉尼)' },
  { id: 'oss-ap-southeast-3', label: '亚太东南 3 (吉隆坡)' },
  { id: 'oss-ap-southeast-5', label: '亚太东南 5 (雅加达)' },
  { id: 'oss-ap-southeast-6', label: '菲律宾 (马尼拉)' },
  { id: 'oss-ap-southeast-7', label: '泰国 (曼谷)' },
  { id: 'oss-ap-south-1', label: '印度 (孟买)' },
  { id: 'oss-eu-central-1', label: '德国 (法兰克福)' },
  { id: 'oss-eu-west-1', label: '英国 (伦敦)' }
]
const form = reactive({
  name: '',
  region: 'oss-cn-hangzhou',
  acl: 'private',
  target: '',
  cacheControl: '',
  contentType: '',
  contentDisposition: '',
  expires: 3600,
  days: 1,
  customDomain: '',
  roleArn: '',
  privilege: 'readOnly' as 'readOnly' | 'readWrite' | 'all',
  durationSeconds: 3600,
  ramUserName: '',
  ramDisplayName: '',
  ramComments: ''
})
const cacheForm = reactive({
  objectType: 'File' as CacheRefreshType,
  objectPath: '',
  force: false
})
const mediaForm = reactive({
  mode: 'none' as 'none' | 'image' | 'video' | 'custom',
  width: 0,
  height: 0,
  quality: 90,
  format: '',
  resizeMode: 'lfit',
  rotate: 0,
  videoTime: 0,
  custom: ''
})
const {
  settings,
  settingsDraft,
  secureDraft,
  themeDraft,
  initializeSettings,
  disposeSettings,
  openSettings,
  saveSettings
} = useAppSettings({
  auth,
  savedProfiles,
  profileId,
  run: settingsTask.run,
  taskError: settingsTask.error,
  showToast,
  openModal: () => {
    modal.value = modal.value === 'settings' ? null : 'settings'
  }
})

const fileBrowser = useFileBrowser({
  settings,
  profileId,
  saveSession,
  closeModal: () => {
    modal.value = null
  },
  runBrowserTask: browserTask.run
})
const {
  buckets,
  currentBucket,
  prefix,
  objects,
  hasMoreObjects,
  selectedNames,
  searchText,
  bucketSearchText,
  viewMode,
  addressInput,
  navigationHistory,
  navigationIndex,
  favorites,
  thumbnailUrls,
  failedThumbnailNames,
  selectedObjects,
  filteredObjects,
  filteredBuckets,
  pageCounts,
  loadAccountPreferences,
  openInitialLocation,
  refreshBuckets,
  openBucket,
  goToAddress,
  goBack,
  goForward,
  goUp,
  goHome,
  toggleFavorite,
  isCurrentFavorite,
  openFavorite,
  removeFavorite,
  setCurrentAsHome,
  isCurrentHome,
  loadObjects,
  markThumbnailFailed,
  setViewMode,
  enterDirectory,
  toggleSelection,
  toggleAll
} = fileBrowser

const {
  appVersion,
  updateState,
  updateDescription,
  updateButtonLabel,
  isMac,
  initializeUpdates,
  disposeUpdates,
  handleUpdateAction
} = useAppUpdates(requestConfirmation, showToast)

const canPaste = computed(() => Boolean(copyBuffer.value && currentBucket.value))
const isSamePasteLocation = computed(
  () =>
    copyBuffer.value?.bucket === currentBucket.value?.name &&
    copyBuffer.value?.prefix === prefix.value
)
const pasteSourceName = computed(() => copyBuffer.value?.items[0]?.displayName || '')
const pasteTargetExists = computed(() =>
  objects.value.some((item) => item.displayName === form.target)
)
const previewType = computed(() => {
  const name = selectedObjects.value[0]?.name.toLowerCase() || ''
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name)) return 'image'
  if (/\.(mp4|webm|mov|m4v)$/.test(name)) return 'video'
  if (/\.(mp3|wav|ogg|m4a)$/.test(name)) return 'audio'
  if (/\.(pdf)$/.test(name)) return 'pdf'
  if (/\.(docx?|xlsx?|pptx?)$/.test(name)) return 'document'
  if (
    /\.(txt|md|json|ya?ml|xml|csv|log|js|mjs|cjs|ts|tsx|jsx|vue|html?|css|scss|less|py|java|go|rs|sh|sql|ini|conf)$/.test(
      name
    )
  )
    return 'text'
  return 'other'
})

let removeTransferListener: (() => void) | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined
let dragDepth = 0
let permissionProbeGeneration = 0

onMounted(async () => {
  document.addEventListener('pointerdown', closeFloatingMenus)
  document.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('dragleave', handleDocumentDragLeave)
  window.addEventListener('dragend', resetDragState)
  window.addEventListener('drop', resetDragState)
  window.addEventListener('blur', resetDragState)
  viewMode.value = localStorage.getItem('oss-browser-view-mode') === 'grid' ? 'grid' : 'list'
  await initializeUpdates()
  try {
    await initializeSettings()
    savedProfiles.value = await window.ossBrowser.profiles.list()
    removeTransferListener = window.ossBrowser.onTransfer((item) => {
      const index = transfers.value.findIndex((transfer) => transfer.id === item.id)
      if (index === -1) transfers.value.unshift(item)
      else transfers.value[index] = item
      showTransfers.value = true
    })
    await restoreSession()
  } finally {
    initializing.value = false
  }
})

onBeforeUnmount(() => {
  removeTransferListener?.()
  disposeUpdates()
  disposeSettings()
  document.removeEventListener('pointerdown', closeFloatingMenus)
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('dragleave', handleDocumentDragLeave)
  window.removeEventListener('dragend', resetDragState)
  window.removeEventListener('drop', resetDragState)
  window.removeEventListener('blur', resetDragState)
  if (toastTimer) clearTimeout(toastTimer)
})

function showToast(message: string): void {
  toastMessage.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
}

function handleDragEnter(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return
  dragDepth += 1
  dragActive.value = true
}

function handleDragLeave(): void {
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) dragActive.value = false
}

function handleDocumentDragLeave(event: DragEvent): void {
  if (!event.relatedTarget) resetDragState()
}

function resetDragState(): void {
  dragDepth = 0
  dragActive.value = false
}

function resetAccountRuntimeState(): void {
  fileBrowser.reset()
  errorMessage.value = ''
  toastMessage.value = ''
  transfers.value = []
  showTransfers.value = false
  showMoreActions.value = false
  contextMenu.visible = false
  emptyContextMenu.visible = false
  bucketMenu.visible = false
  resetDragState()
  previewUrl.value = ''
  previewText.value = ''
  qrCodeUrl.value = ''
  grantToken.value = ''
  grantExpiration.value = ''
  ramUsers.value = []
  ramAccessKeys.value = []
  activeRamUser.value = null
  createdAccessKey.value = null
  multipartUploads.value = []
  multipartBucket.value = null
  bucketActionTarget.value = null
  objectDetails.value = null
  copyBuffer.value = null
  domainOptions.value = []
  selectedDomain.value = ''
  cdnDomains.value = []
  selectedCdnDomain.value = ''
  confirmation.value = null
  permissionProbeGeneration += 1
  permissionResults.value = []
  permissionChecking.value = false
  authToken.value = ''
  modal.value = null
  Object.assign(form, {
    name: '',
    acl: 'private',
    target: '',
    cacheControl: '',
    contentType: '',
    contentDisposition: '',
    expires: 3600,
    days: 1,
    customDomain: '',
    roleArn: '',
    privilege: 'readOnly',
    durationSeconds: 3600,
    ramUserName: '',
    ramDisplayName: '',
    ramComments: ''
  })
  Object.assign(cacheForm, { objectType: 'File', objectPath: '', force: false })
  Object.assign(mediaForm, {
    mode: 'none',
    width: 0,
    height: 0,
    quality: 90,
    format: '',
    resizeMode: 'lfit',
    rotate: 0,
    videoTime: 0,
    custom: ''
  })
}

function closeFloatingMenus(event: PointerEvent): void {
  const target = event.target as HTMLElement
  if (!target.closest('.more-actions') && !target.closest('.context-menu')) {
    showMoreActions.value = false
    contextMenu.visible = false
    emptyContextMenu.visible = false
    bucketMenu.visible = false
  }
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    showMoreActions.value = false
    contextMenu.visible = false
    emptyContextMenu.visible = false
    bucketMenu.visible = false
  }
}

function openContextMenu(event: MouseEvent, item: ObjectInfo): void {
  event.preventDefault()
  if (!selectedNames.value.has(item.name)) selectedNames.value = new Set([item.name])
  showMoreActions.value = false
  contextMenu.x = Math.min(event.clientX, window.innerWidth - 220)
  contextMenu.y = Math.max(8, Math.min(event.clientY, window.innerHeight - 440))
  contextMenu.visible = true
  emptyContextMenu.visible = false
}

function openEmptyContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (target.closest('.object-card, .table-row, .toolbar, .quick-nav, .context-menu')) return
  event.preventDefault()
  showMoreActions.value = false
  contextMenu.visible = false
  selectedNames.value = new Set()
  emptyContextMenu.x = Math.min(event.clientX, window.innerWidth - 200)
  emptyContextMenu.y = Math.min(event.clientY, window.innerHeight - 150)
  emptyContextMenu.visible = true
}

function closeActions(): void {
  showMoreActions.value = false
  contextMenu.visible = false
  emptyContextMenu.visible = false
  bucketMenu.visible = false
}

function openBucketMenu(event: MouseEvent, bucket: BucketInfo): void {
  event.preventDefault()
  event.stopPropagation()
  bucketActionTarget.value = bucket
  bucketMenu.x = Math.min(event.clientX, window.innerWidth - 200)
  bucketMenu.y = Math.min(event.clientY, window.innerHeight - 150)
  bucketMenu.visible = true
}

async function openBucketAcl(bucket: BucketInfo): Promise<void> {
  bucketActionTarget.value = bucket
  bucketMenu.visible = false
  const acl = await browserTask.run(() => window.ossBrowser.buckets.getAcl(bucket.name))
  if (!acl) return
  form.acl = acl
  modal.value = 'bucket-acl'
}

async function login(): Promise<void> {
  if (auth.endpointMode === 'public') auth.endpoint = 'oss-cn-hangzhou.aliyuncs.com'
  const result = await authTask.run(() => window.ossBrowser.auth.connect({ ...auth }))
  if (!result) return
  resetAccountRuntimeState()
  buckets.value = result
  loggedIn.value = true
  loadAccountPreferences()
  if (auth.remember) {
    const profile: SavedProfile = {
      id: `${auth.endpoint}|${auth.accessKeyId}`,
      label: auth.alias?.trim() || auth.accessKeyId,
      config: { ...auth }
    }
    await window.ossBrowser.profiles.save(profile)
    savedProfiles.value = await window.ossBrowser.profiles.list()
    saveSession()
  } else {
    localStorage.removeItem('oss-browser-session')
  }
  await openInitialLocation(result, auth.presetPath || '')
}

async function restoreSession(): Promise<void> {
  const raw = localStorage.getItem('oss-browser-session')
  if (!raw) return
  try {
    const session = JSON.parse(raw) as SessionState
    const profile = savedProfiles.value.find((item) => item.id === session.profileId)
    if (!profile) return
    Object.assign(auth, profile.config)
    const result = await window.ossBrowser.auth.connect({ ...profile.config })
    resetAccountRuntimeState()
    buckets.value = result
    loggedIn.value = true
    loadAccountPreferences()
    await openInitialLocation(result, auth.presetPath || '')
  } catch {
    localStorage.removeItem('oss-browser-session')
  }
}

function saveSession(): void {
  if (!auth.remember) return
  localStorage.setItem(
    'oss-browser-session',
    JSON.stringify({
      profileId: profileId()
    } satisfies SessionState)
  )
}

function profileId(): string {
  return `${auth.endpoint}|${auth.accessKeyId}`
}

async function loginWithToken(): Promise<void> {
  errorMessage.value = ''
  try {
    const bytes = Uint8Array.from(atob(authToken.value.trim()), (char) => char.charCodeAt(0))
    const token = JSON.parse(new TextDecoder().decode(bytes)) as {
      id: string
      secret: string
      stoken?: string
      expiration?: string
      osspath?: string
      eptpl?: string
      region?: string
    }
    if (!token.id || !token.secret) throw new Error(t('授权码内容不完整'))
    if (token.expiration && new Date(token.expiration).getTime() <= Date.now()) {
      throw new Error(t('授权码已经过期'))
    }
    auth.accessKeyId = token.id
    auth.accessKeySecret = token.secret
    auth.stsToken = token.stoken || ''
    auth.presetPath = token.osspath || ''
    auth.endpoint = (token.eptpl || `${token.region || 'oss-cn-hangzhou'}.aliyuncs.com`)
      .replace('{region}', token.region || 'oss-cn-hangzhou')
      .replace(/^https?:\/\//, '')
    auth.endpointMode = 'custom'
    await login()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('授权码格式不正确')
  }
}

async function logout(): Promise<void> {
  await window.ossBrowser.auth.disconnect()
  loggedIn.value = false
  resetAccountRuntimeState()
  localStorage.removeItem('oss-browser-session')
}

function confirmLogout(): void {
  requestConfirmation({
    title: t('退出登录'),
    description: t('确定退出当前账号吗？'),
    confirmLabel: t('退出登录'),
    destructive: true,
    action: logout
  })
}

async function openItem(item: ObjectInfo): Promise<void> {
  if (item.isDirectory) {
    await enterDirectory(item)
  } else {
    selectedNames.value = new Set([item.name])
    await openPreview()
  }
}

function openModal(name: ModalName): void {
  showMoreActions.value = false
  form.name = ''
  form.target =
    name === 'move'
      ? `oss://${currentBucket.value?.name || ''}/${prefix.value}`
      : selectedObjects.value[0]?.displayName || ''
  form.acl = 'private'
  if (name === 'share') void prepareAddressModal()
  if (name === 'cache') prepareCacheRefresh()
  modal.value = name
}

function handleObjectAction(action: ObjectAction): void {
  closeActions()
  if (action === 'download') return void downloadSelected()
  if (action === 'copy') return copySelected()
  if (action === 'move') return openModal('move')
  if (action === 'rename') return openModal('rename')
  if (action === 'acl') return openModal('acl')
  if (action === 'headers') return openModal('headers')
  if (action === 'share') return openModal('share')
  if (action === 'symlink') return openModal('symlink')
  if (action === 'restore') return openModal('restore')
  if (action === 'details') return void showDetails()
  if (action === 'grant') return openModal('grant')
  if (action === 'cache') return void openCacheRefresh(selectedObjects.value[0])
  if (action === 'delete') return removeSelected()
}

async function prepareAddressModal(): Promise<void> {
  previewUrl.value = ''
  qrCodeUrl.value = ''
  await loadDomainOptions()
}

async function loadDomainOptions(): Promise<void> {
  domainOptions.value = []
  if (!currentBucket.value) return
  const bucket = currentBucket.value
  const standardDomain = `${bucket.name}.${bucket.region}.aliyuncs.com`
  const domains = await window.ossBrowser.objects.domains(bucket.name).catch(() => [])
  domainOptions.value = [standardDomain, ...(domains || [])].filter(
    (item, index, values) => values.indexOf(item) === index
  )
  const remembered = localStorage.getItem(`oss-browser-domain:${profileId()}:${bucket.name}`)
  selectedDomain.value =
    remembered && domainOptions.value.includes(remembered) ? remembered : standardDomain
}

function prepareCacheRefresh(item?: ObjectInfo): void {
  const domain = selectedCdnDomain.value
  const base = domain ? `https://${domain}` : ''
  if (item) {
    cacheForm.objectType = item.isDirectory ? 'Directory' : 'File'
    cacheForm.objectPath = `${base}/${item.name}`
  } else {
    cacheForm.objectType = 'Directory'
    cacheForm.objectPath = currentBucket.value ? `${base}/${prefix.value}` : ''
  }
}

async function openCacheRefresh(item?: ObjectInfo): Promise<void> {
  if (item) selectedNames.value = new Set([item.name])
  const domains = await cloudTask.run(() => window.ossBrowser.cache.domains())
  if (!domains) return
  cdnDomains.value = domains
  if (!cdnDomains.value.length) {
    errorMessage.value = t('当前账号没有可用的 CDN 加速域名')
    return
  }
  const remembered = localStorage.getItem(`oss-browser-cdn-domain:${profileId()}`)
  selectedCdnDomain.value =
    remembered && cdnDomains.value.includes(remembered) ? remembered : cdnDomains.value[0]
  prepareCacheRefresh(item)
  modal.value = 'cache'
}

function updateCacheDomain(): void {
  if (!cacheForm.objectPath.trim()) return
  const url = new URL(cacheForm.objectPath)
  url.hostname = selectedCdnDomain.value
  cacheForm.objectPath = url.toString()
  localStorage.setItem(`oss-browser-cdn-domain:${profileId()}`, selectedCdnDomain.value)
}

async function submitCacheRefresh(): Promise<void> {
  const taskId = await cloudTask.run(() => window.ossBrowser.cache.refresh({ ...cacheForm }))
  if (!taskId) return
  modal.value = null
  showToast(t('缓存刷新任务已提交：{id}', { id: taskId }))
}

function confirmCacheRefresh(): void {
  requestConfirmation({
    title: t('确认刷新 CDN 缓存'),
    description: t('刷新会清除 CDN 节点缓存并产生回源流量，请确认地址和类型无误。'),
    confirmLabel: t('确认刷新'),
    destructive: true,
    action: submitCacheRefresh
  })
}

async function createBucket(): Promise<void> {
  const done = await run(() => window.ossBrowser.buckets.create(form.name, form.region, form.acl))
  if (done === undefined && errorMessage.value) return
  modal.value = null
  await refreshBuckets()
  showToast(t('Bucket 创建成功'))
}

function deleteBucket(bucket: BucketInfo): void {
  requestConfirmation({
    title: t('删除 Bucket'),
    description: t('确定删除 Bucket「{name}」吗？Bucket 必须为空。', { name: bucket.name }),
    confirmLabel: t('删除'),
    destructive: true,
    action: () => performDeleteBucket(bucket)
  })
}

async function performDeleteBucket(bucket: BucketInfo): Promise<void> {
  const done = await run(() => window.ossBrowser.buckets.remove(bucket.name))
  if (done === undefined && errorMessage.value) return
  if (currentBucket.value?.name === bucket.name) currentBucket.value = null
  await refreshBuckets()
}

async function createFolder(): Promise<void> {
  if (!currentBucket.value) return
  const done = await run(() =>
    window.ossBrowser.objects.createFolder(currentBucket.value!.name, `${prefix.value}${form.name}`)
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
  await loadObjects()
  showToast(t('文件夹创建成功'))
}

async function applyBucketAcl(): Promise<void> {
  if (!bucketActionTarget.value) return
  const done = await run(() =>
    window.ossBrowser.buckets.setAcl(bucketActionTarget.value!.name, form.acl)
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
  await refreshBuckets()
  showToast(t('Bucket 权限已保存'))
}

function removeSelected(): void {
  if (!currentBucket.value || !selectedObjects.value.length) return
  requestConfirmation({
    title: t('删除文件'),
    description: t('确定删除选中的 {count} 项吗？', { count: selectedObjects.value.length }),
    confirmLabel: t('删除'),
    destructive: true,
    action: performRemoveSelected
  })
}

async function performRemoveSelected(): Promise<void> {
  if (!currentBucket.value || !selectedObjects.value.length) return
  const done = await run(() =>
    window.ossBrowser.objects.remove(
      currentBucket.value!.name,
      selectedObjects.value.map((item) => item.name)
    )
  )
  if (done === undefined && errorMessage.value) return
  await loadObjects()
  showToast(t('删除成功'))
}

async function renameSelected(): Promise<void> {
  if (!currentBucket.value || selectedObjects.value.length !== 1) return
  const source = selectedObjects.value[0]
  const target = `${prefix.value}${form.target}${source.isDirectory ? '/' : ''}`
  const done = await run(async () => {
    await window.ossBrowser.objects.copy(currentBucket.value!.name, source.name, target)
    await window.ossBrowser.objects.remove(currentBucket.value!.name, [source.name])
  })
  if (done === undefined && errorMessage.value) return
  modal.value = null
  await loadObjects()
}

async function transferSelected(move: boolean): Promise<void> {
  if (!currentBucket.value || !selectedObjects.value.length) return
  const done = await run(() =>
    window.ossBrowser.objects.transfer(
      currentBucket.value!.name,
      JSON.parse(JSON.stringify(selectedObjects.value)),
      form.target,
      move
    )
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
  await loadObjects()
}

function copySelected(): void {
  if (!currentBucket.value || !selectedObjects.value.length) return
  copyBuffer.value = {
    bucket: currentBucket.value.name,
    prefix: prefix.value,
    items: selectedObjects.value.map((item) => ({
      ...item,
      restoreInfo: item.restoreInfo ? { ...item.restoreInfo } : undefined
    }))
  }
  closeActions()
}

async function pasteToCurrentDirectory(): Promise<void> {
  if (!currentBucket.value || !copyBuffer.value || !canPaste.value) return
  if (isSamePasteLocation.value) {
    if (copyBuffer.value.items.length !== 1) {
      errorMessage.value = t('原目录粘贴时请一次复制一个文件或文件夹')
      return
    }
    form.target = pasteSourceName.value
    modal.value = 'paste-copy'
    closeActions()
    return
  }
  const source = copyBuffer.value
  const done = await run(() =>
    window.ossBrowser.objects.transfer(
      source.bucket,
      source.items,
      `oss://${currentBucket.value!.name}/${prefix.value}`,
      false
    )
  )
  if (done === undefined && errorMessage.value) return
  copyBuffer.value = null
  await loadObjects()
  showToast(t('粘贴成功'))
}

async function pasteWithNewName(): Promise<void> {
  if (!currentBucket.value || !copyBuffer.value || copyBuffer.value.items.length !== 1) return
  const source = copyBuffer.value.items[0]
  const target = `${prefix.value}${form.target}${source.isDirectory ? '/' : ''}`
  const done = await run(() =>
    window.ossBrowser.objects.copy(currentBucket.value!.name, source.name, target)
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
  copyBuffer.value = null
  await loadObjects()
  showToast(t('粘贴成功'))
}

async function createSymlink(): Promise<void> {
  if (!currentBucket.value || selectedObjects.value.length !== 1) return
  const done = await run(() =>
    window.ossBrowser.objects.createSymlink(
      currentBucket.value!.name,
      `${prefix.value}${form.name}`,
      selectedObjects.value[0].name
    )
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
  await loadObjects()
}

async function restoreSelected(): Promise<void> {
  if (!currentBucket.value || !selectedObjects.value.length) return
  const done = await run(() =>
    window.ossBrowser.objects.restore(
      currentBucket.value!.name,
      selectedObjects.value.map((item) => item.name),
      Number(form.days)
    )
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
  await loadObjects()
}

async function showDetails(): Promise<void> {
  if (!currentBucket.value || selectedObjects.value.length !== 1) return
  const result = await cloudTask.run(() =>
    window.ossBrowser.objects.details(currentBucket.value!.name, selectedObjects.value[0].name)
  )
  if (!result) return
  objectDetails.value = result
  modal.value = 'details'
}

async function createGrantToken(): Promise<void> {
  if (!currentBucket.value) return
  const item = selectedObjects.value.length === 1 ? selectedObjects.value[0] : undefined
  const result = await run(() =>
    window.ossBrowser.grants.createToken({
      bucket: currentBucket.value!.name,
      key: item?.name || prefix.value,
      region: currentBucket.value!.region.replace(/^oss-/, ''),
      roleArn: form.roleArn,
      privilege: form.privilege,
      durationSeconds: Number(form.durationSeconds),
      isObject: Boolean(item && !item.isDirectory)
    })
  )
  if (!result) return
  grantToken.value = result.token
  grantExpiration.value = result.expiration
  await window.ossBrowser.system.writeClipboard(result.token)
}

async function openRamUsers(): Promise<void> {
  const result = await cloudTask.run(() => window.ossBrowser.ram.listUsers())
  if (!result) return
  ramUsers.value = result
  modal.value = 'ram-users'
}

function editRamUser(user?: RamUser): void {
  activeRamUser.value = user || null
  form.ramUserName = user?.userName || ''
  form.ramDisplayName = user?.displayName || ''
  form.ramComments = user?.comments || ''
  modal.value = 'ram-user'
}

async function saveRamUser(): Promise<void> {
  const done = await cloudTask.run(() =>
    window.ossBrowser.ram.saveUser(
      form.ramUserName,
      form.ramDisplayName,
      form.ramComments,
      activeRamUser.value?.userName
    )
  )
  if (done === undefined && errorMessage.value) return
  await openRamUsers()
}

function removeRamUser(user: RamUser): void {
  requestConfirmation({
    title: t('删除 RAM 用户'),
    description: t('确定删除 RAM 用户「{name}」及其 AccessKey 吗？', { name: user.userName }),
    confirmLabel: t('删除'),
    destructive: true,
    action: () => performRemoveRamUser(user)
  })
}

async function performRemoveRamUser(user: RamUser): Promise<void> {
  const done = await cloudTask.run(() => window.ossBrowser.ram.removeUser(user.userName))
  if (done === undefined && errorMessage.value) return
  await openRamUsers()
}

async function openRamKeys(user: RamUser): Promise<void> {
  const result = await cloudTask.run(() => window.ossBrowser.ram.listAccessKeys(user.userName))
  if (!result) return
  activeRamUser.value = user
  ramAccessKeys.value = result
  createdAccessKey.value = null
  modal.value = 'ram-keys'
}

async function createRamAccessKey(): Promise<void> {
  if (!activeRamUser.value) return
  const result = await cloudTask.run(() =>
    window.ossBrowser.ram.createAccessKey(activeRamUser.value!.userName)
  )
  if (!result) return
  createdAccessKey.value = result
  ramAccessKeys.value = await window.ossBrowser.ram.listAccessKeys(activeRamUser.value.userName)
}

function removeRamAccessKey(key: RamAccessKey): void {
  if (!activeRamUser.value) return
  requestConfirmation({
    title: t('删除 AccessKey'),
    description: t('确定删除 AccessKey「{name}」吗？删除后无法恢复。', {
      name: key.accessKeyId
    }),
    confirmLabel: t('删除'),
    destructive: true,
    action: () => performRemoveRamAccessKey(key)
  })
}

async function performRemoveRamAccessKey(key: RamAccessKey): Promise<void> {
  if (!activeRamUser.value) return
  const done = await cloudTask.run(() =>
    window.ossBrowser.ram.removeAccessKey(activeRamUser.value!.userName, key.accessKeyId)
  )
  if (done === undefined && errorMessage.value) return
  await openRamKeys(activeRamUser.value)
}

async function upload(kind: 'files' | 'folder'): Promise<void> {
  if (!currentBucket.value) return
  const paths = await window.ossBrowser.files.pickUpload(kind)
  if (!paths.length) return
  const done = await run(() =>
    window.ossBrowser.files.upload(currentBucket.value!.name, prefix.value, paths)
  )
  if (done === undefined && errorMessage.value) return
  await loadObjects()
  showToast(t('上传任务已完成'))
}

async function handleDrop(event: DragEvent): Promise<void> {
  resetDragState()
  if (!currentBucket.value || !event.dataTransfer?.files.length) return
  const paths = Array.from(event.dataTransfer.files)
    .map((file) => window.ossBrowser.files.getPathForFile(file))
    .filter(Boolean)
  if (!paths.length) return
  const done = await run(() =>
    window.ossBrowser.files.upload(currentBucket.value!.name, prefix.value, paths)
  )
  if (done === undefined && errorMessage.value) return
  await loadObjects()
  showToast(t('上传任务已完成'))
}

async function downloadSelected(): Promise<void> {
  if (!currentBucket.value || !selectedObjects.value.length) return
  const destination = await window.ossBrowser.files.pickDownloadFolder()
  if (!destination) return
  const done = await run(() =>
    window.ossBrowser.files.download(
      currentBucket.value!.name,
      JSON.parse(JSON.stringify(selectedObjects.value)),
      destination
    )
  )
  if (done === undefined && errorMessage.value) return
  showToast(t('下载任务已完成'))
}

async function applyAcl(): Promise<void> {
  if (!currentBucket.value || selectedObjects.value.length !== 1) return
  const done = await run(() =>
    window.ossBrowser.objects.setAcl(
      currentBucket.value!.name,
      selectedObjects.value[0].name,
      form.acl
    )
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
}

async function applyHeaders(): Promise<void> {
  if (!currentBucket.value || !selectedObjects.value.length) return
  const headers: Record<string, string> = {}
  if (form.cacheControl) headers['Cache-Control'] = form.cacheControl
  if (form.contentType) headers['Content-Type'] = form.contentType
  if (form.contentDisposition) headers['Content-Disposition'] = form.contentDisposition
  const done = await run(() =>
    Promise.all(
      selectedObjects.value.map((item) =>
        window.ossBrowser.objects.setHeaders(currentBucket.value!.name, item.name, headers)
      )
    ).then(() => undefined)
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
}

async function createShareLink(): Promise<void> {
  if (!currentBucket.value || selectedObjects.value.length !== 1) return
  const process = buildMediaProcess()
  const url = await run(() =>
    window.ossBrowser.objects.signedUrl(
      currentBucket.value!.name,
      selectedObjects.value[0].name,
      Number(form.expires),
      process || undefined
    )
  )
  if (!url) return
  const domain = form.customDomain || selectedDomain.value
  previewUrl.value = domain
    ? url.replace(/\/\/[^/]+\//, `//${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/`)
    : url
  if (selectedDomain.value && currentBucket.value) {
    localStorage.setItem(
      `oss-browser-domain:${profileId()}:${currentBucket.value.name}`,
      selectedDomain.value
    )
  }
  qrCodeUrl.value = await QRCode.toDataURL(previewUrl.value, { width: 220, margin: 1 })
  await window.ossBrowser.system.writeClipboard(previewUrl.value)
}

function buildMediaProcess(): string {
  if (mediaForm.mode === 'custom') return mediaForm.custom.trim().replace(/^x-oss-process=/, '')
  if (mediaForm.mode === 'video') {
    const options = [`t_${Math.max(0, mediaForm.videoTime)}`, `f_${mediaForm.format || 'jpg'}`]
    if (mediaForm.width > 0) options.push(`w_${mediaForm.width}`)
    if (mediaForm.height > 0) options.push(`h_${mediaForm.height}`)
    return `video/snapshot,${options.join(',')}`
  }
  if (mediaForm.mode === 'image') {
    const operations: string[] = []
    const resize = [`m_${mediaForm.resizeMode}`]
    if (mediaForm.width > 0) resize.push(`w_${mediaForm.width}`)
    if (mediaForm.height > 0) resize.push(`h_${mediaForm.height}`)
    if (resize.length > 1) operations.push(`resize,${resize.join(',')}`)
    if (mediaForm.quality > 0) operations.push(`quality,q_${mediaForm.quality}`)
    if (mediaForm.rotate) operations.push(`rotate,${mediaForm.rotate}`)
    if (mediaForm.format) operations.push(`format,${mediaForm.format}`)
    return operations.length ? `image/${operations.join('/')}` : ''
  }
  return ''
}

function shareByEmail(): Promise<void> {
  const subject = encodeURIComponent(
    t('OSS 文件：{name}', { name: selectedObjects.value[0]?.displayName || '' })
  )
  const body = encodeURIComponent(previewUrl.value)
  return window.ossBrowser.system.openExternal(`mailto:?subject=${subject}&body=${body}`)
}

async function openPreview(): Promise<void> {
  if (!currentBucket.value || selectedObjects.value.length !== 1) return
  const item = selectedObjects.value[0]
  if (previewType.value === 'text') {
    if (item.size > 5 * 1024 * 1024) {
      errorMessage.value = t('文本预览最大支持 5 MB')
      return
    }
    const content = await run(() =>
      window.ossBrowser.objects.readText(currentBucket.value!.name, item.name)
    )
    if (content === undefined) return
    previewText.value = content
  }
  const url = await run(() =>
    window.ossBrowser.objects.signedUrl(
      currentBucket.value!.name,
      item.name,
      3600,
      previewType.value === 'document' ? 'imm/previewdoc,copy_1' : undefined
    )
  )
  if (!url) return
  previewUrl.value = url
  modal.value = 'preview'
}

async function savePreviewText(): Promise<void> {
  if (!currentBucket.value || selectedObjects.value.length !== 1) return
  const done = await run(() =>
    window.ossBrowser.objects.saveText(
      currentBucket.value!.name,
      selectedObjects.value[0].name,
      previewText.value
    )
  )
  if (done === undefined && errorMessage.value) return
  modal.value = null
  await loadObjects()
}

async function openMultipart(bucket: BucketInfo): Promise<void> {
  bucketMenu.visible = false
  const result = await browserTask.run(() => window.ossBrowser.buckets.listMultipart(bucket.name))
  if (!result) return
  multipartBucket.value = bucket
  multipartUploads.value = result
  modal.value = 'multipart'
}

function abortMultipart(upload: MultipartUploadInfo): void {
  requestConfirmation({
    title: t('终止分片上传'),
    description: t('确定终止「{name}」的未完成分片上传吗？', { name: upload.name }),
    confirmLabel: t('终止'),
    destructive: true,
    action: () => performAbortMultipart(upload)
  })
}

async function performAbortMultipart(upload: MultipartUploadInfo): Promise<void> {
  if (!multipartBucket.value) return
  const bucket = multipartBucket.value
  const done = await run(() =>
    window.ossBrowser.buckets.abortMultipart(bucket.name, upload.name, upload.uploadId)
  )
  if (done === undefined && errorMessage.value) return
  await openMultipart(bucket)
  showToast(t('分片上传已终止'))
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`
  return `${(size / 1024 ** 3).toFixed(1)} GB`
}

function getFileExtension(name: string): string {
  const index = name.lastIndexOf('.')
  if (index === -1 || index === name.length - 1) return '-'
  const ext = name.slice(index + 1).toLowerCase()
  return ext.length <= 10 && /^[a-z0-9]+$/i.test(ext) ? ext : '-'
}

function cancelTransfer(id: string): Promise<void> {
  return window.ossBrowser.transfers.cancel(id)
}

function openProjectPage(): Promise<void> {
  return window.ossBrowser.system.openExternal('https://github.com/yulin96/oss-browser')
}

function openPreviewExternally(): Promise<void> {
  return window.ossBrowser.system.openExternal(previewUrl.value)
}

function clearSavedProfile(): void {
  requestConfirmation({
    title: t('清空已保存账号'),
    description: t('确定清空全部已保存账号吗？此操作无法撤销。'),
    confirmLabel: t('清空全部'),
    destructive: true,
    action: performClearSavedProfile
  })
}

async function performClearSavedProfile(): Promise<void> {
  await window.ossBrowser.profiles.clear()
  savedProfiles.value = []
  localStorage.removeItem('oss-browser-session')
}

async function useProfile(profile: SavedProfile): Promise<void> {
  if (loggedIn.value) {
    const result = await authTask.run(() => window.ossBrowser.auth.connect({ ...profile.config }))
    if (!result) {
      const message = errorMessage.value
      loggedIn.value = false
      resetAccountRuntimeState()
      errorMessage.value = message
      localStorage.removeItem('oss-browser-session')
    } else {
      resetAccountRuntimeState()
      auth.alias = profile.config.alias || ''
      Object.assign(auth, profile.config)
      buckets.value = result
      loadAccountPreferences()
      saveSession()
      await openInitialLocation(result, auth.presetPath || '')
    }
    return
  }
  permissionProbeGeneration += 1
  permissionResults.value = []
  permissionChecking.value = false
  auth.alias = profile.config.alias || ''
  Object.assign(auth, profile.config)
  modal.value = null
}

function changeLocale(event: Event): void {
  setLocale((event.target as HTMLSelectElement).value as AppLocale)
}

function removeProfile(profile: SavedProfile): void {
  requestConfirmation({
    title: t('删除已保存账号'),
    description: t('确定删除已保存账号「{name}」吗？', { name: profile.label }),
    confirmLabel: t('删除'),
    destructive: true,
    action: () => performRemoveProfile(profile)
  })
}

async function performRemoveProfile(profile: SavedProfile): Promise<void> {
  await window.ossBrowser.profiles.remove(profile.id)
  savedProfiles.value = await window.ossBrowser.profiles.list()
}

async function checkPermissions(): Promise<void> {
  const generation = ++permissionProbeGeneration
  permissionChecking.value = true
  errorMessage.value = ''
  try {
    const results = await window.ossBrowser.auth.probePermissions()
    if (generation === permissionProbeGeneration) permissionResults.value = results
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (generation === permissionProbeGeneration) permissionChecking.value = false
  }
}
</script>

<template>
  <main class="app-shell">
    <div v-if="anyPending" class="loading-bar" />
    <div v-if="toastMessage" class="success-toast">
      <CircleCheck :size="18" />
      <span>{{ toastMessage }}</span>
      <div role="button" tabindex="0" @click="toastMessage = ''"><X :size="15" /></div>
    </div>

    <section v-if="initializing" class="startup-page">
      <img :src="appIcon" alt="OSS Browser" />
    </section>

    <section v-else-if="!loggedIn" class="login-page">
      <div class="language-picker login-language">
        <Globe2 :size="16" />
        <select :value="locale" aria-label="Language" @change="changeLocale">
          <option value="zh-CN">简体中文</option>
          <option value="en-US">English</option>
          <option value="ja-JP">日本語</option>
        </select>
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
        <div class="auth-tabs">
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

        <template v-if="authMode === 'token'">
          <label class="field-label">{{ t('授权码') }}</label>
          <div class="textarea-wrap">
            <textarea v-model.trim="authToken" rows="7" :placeholder="t('粘贴 Base64 授权码')" />
          </div>
          <div v-if="errorMessage" class="error-box">{{ errorMessage }}</div>
          <AppButton
            class="token-connect-button"
            :label="t('使用授权码连接')"
            tone="primary"
            :disabled="!authToken || authTask.pending.value"
            @click="loginWithToken"
          />
        </template>

        <template v-else>
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

          <label class="field-label">{{ t('账号别名（可选）') }}</label>
          <div class="input-wrap">
            <input v-model.trim="auth.alias" :placeholder="t('例如：公司生产环境')" />
          </div>

          <label class="field-label">AccessKey Secret</label>
          <div class="input-wrap">
            <input v-model="auth.accessKeySecret" type="password" autocomplete="current-password" />
          </div>

          <template v-if="auth.accessKeyId.startsWith('STS.')">
            <label class="field-label">STS Token</label>
            <div class="input-wrap"><input v-model="auth.stsToken" type="password" /></div>
          </template>

          <label class="field-label">{{ t('预设路径（可选）') }}</label>
          <div class="input-wrap">
            <input v-model.trim="auth.presetPath" placeholder="oss://bucket/path/" />
          </div>

          <div class="login-options">
            <label><input v-model="auth.secure" type="checkbox" /> {{ t('使用 HTTPS') }}</label>
            <label><input v-model="auth.remember" type="checkbox" /> {{ t('记住登录信息') }}</label>
          </div>
          <div v-if="errorMessage" class="error-box">{{ errorMessage }}</div>
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
        <div
          v-if="savedProfiles.length"
          class="saved-profile-entry"
          role="button"
          tabindex="0"
          @click="modal = 'profiles'"
        >
          <KeyRound :size="15" />{{ t('使用已保存账号') }}
        </div>
      </div>
    </section>

    <template v-else>
      <AppHeader
        :app-version="appVersion"
        :locale="locale"
        :account-label="auth.alias?.trim() || auth.accessKeyId"
        :transfer-count="transfers.length"
        @locale-change="setLocale($event as AppLocale)"
        @favorites="modal = 'favorites'"
        @cache-refresh="openCacheRefresh()"
        @transfers="showTransfers = !showTransfers"
        @settings="openSettings"
        @logout="confirmLogout"
      />

      <div class="workspace-full">
        <BucketHome
          v-if="!currentBucket"
          v-model:search-text="bucketSearchText"
          :buckets="filteredBuckets"
          :menu="bucketMenu"
          :action-target="bucketActionTarget"
          @refresh="refreshBuckets"
          @create="openModal('create-bucket')"
          @open="openBucket"
          @open-menu="openBucketMenu"
          @close-menu="bucketMenu.visible = false"
          @acl="openBucketAcl"
          @multipart="openMultipart"
          @delete="deleteBucket"
        />

        <section
          v-else
          class="content"
          :class="{ 'drag-active': dragActive }"
          @contextmenu="openEmptyContextMenu"
          @dragenter.prevent="handleDragEnter"
          @dragover.prevent
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <div class="quick-nav">
            <AppTooltip :label="t('后退')">
              <div class="nav-icon" :class="{ disabled: navigationIndex <= 0 }" @click="goBack">
                <ArrowLeft :size="18" />
              </div>
            </AppTooltip>
            <AppTooltip :label="t('前进')">
              <div
                class="nav-icon"
                :class="{ disabled: navigationIndex >= navigationHistory.length - 1 }"
                @click="goForward"
              >
                <ArrowRight :size="18" />
              </div>
            </AppTooltip>
            <AppTooltip :label="t('上一级')">
              <div class="nav-icon" @click="goUp"><ArrowUp :size="18" /></div>
            </AppTooltip>
            <AppTooltip :label="t('刷新')">
              <div class="nav-icon" @click="loadObjects()"><RefreshCw :size="18" /></div>
            </AppTooltip>
            <AppTooltip :label="t('Bucket 首页')">
              <div class="nav-icon" @click="goHome"><Home :size="18" /></div>
            </AppTooltip>
            <div class="address-wrap">
              <input v-model="addressInput" @keydown.enter="goToAddress()" />
            </div>
            <AppTooltip :label="t('收藏当前目录')">
              <div
                class="nav-icon"
                :class="{ active: isCurrentFavorite() }"
                @click="toggleFavorite"
              >
                <Star :size="18" />
              </div>
            </AppTooltip>
            <AppTooltip :label="t(isCurrentHome() ? '取消首页' : '设为首页')">
              <div class="nav-icon" :class="{ active: isCurrentHome() }" @click="setCurrentAsHome">
                <HousePlus :size="18" />
              </div>
            </AppTooltip>
          </div>

          <div class="toolbar">
            <AppButton
              :label="t('上传文件')"
              :icon="Upload"
              tone="primary"
              @click="upload('files')"
            />
            <AppButton :label="t('上传文件夹')" :icon="FolderUp" @click="upload('folder')" />
            <AppButton
              :label="t('新建文件夹')"
              :icon="FolderPlus"
              @click="openModal('create-folder')"
            />
            <div class="toolbar-divider" />
            <AppButton
              :label="t('下载')"
              :icon="Download"
              :disabled="!selectedObjects.length"
              @click="downloadSelected"
            />
            <AppButton
              :label="t('复制')"
              :icon="Copy"
              :disabled="!selectedObjects.length"
              @click="copySelected"
            />
            <div v-if="copyBuffer" class="paste-group">
              <AppButton
                :label="t('粘贴到此处')"
                :icon="ClipboardPaste"
                tone="primary"
                :disabled="!canPaste"
                @click="pasteToCurrentDirectory"
              />
              <AppTooltip :label="t('取消复制')">
                <div class="paste-cancel" role="button" tabindex="0" @click="copyBuffer = null">
                  <X :size="16" />
                </div>
              </AppTooltip>
            </div>
            <div class="more-actions">
              <AppButton
                :label="t('更多')"
                :icon="MoreHorizontal"
                tone="ghost"
                @click="showMoreActions = !showMoreActions"
              />
              <ObjectActionMenu
                v-if="showMoreActions"
                :selected="selectedObjects"
                @select="handleObjectAction"
              />
            </div>
            <div class="toolbar-spacer" />
            <div class="page-counts">
              {{ t('{directories} 个文件夹，{files} 个文件', pageCounts) }}
            </div>
            <div class="search-wrap toolbar-search">
              <Search :size="15" /><input v-model="searchText" :placeholder="t('搜索当前目录')" />
            </div>
            <div class="view-switch" :aria-label="t('文件显示方式')">
              <AppTooltip :label="t('列表模式')">
                <div
                  :class="{ active: viewMode === 'list' }"
                  role="button"
                  tabindex="0"
                  @click="setViewMode('list')"
                >
                  <List :size="17" />
                </div>
              </AppTooltip>
              <AppTooltip :label="t('图标模式')">
                <div
                  :class="{ active: viewMode === 'grid' }"
                  role="button"
                  tabindex="0"
                  @click="setViewMode('grid')"
                >
                  <LayoutGrid :size="17" />
                </div>
              </AppTooltip>
            </div>
          </div>

          <div v-if="errorMessage" class="error-strip">{{ errorMessage }}</div>
          <div v-if="viewMode === 'list'" class="file-table">
            <div class="table-row table-head">
              <div>
                <input
                  type="checkbox"
                  :checked="
                    selectedNames.size === filteredObjects.length && filteredObjects.length > 0
                  "
                  @change="toggleAll"
                />
              </div>
              <div>{{ t('名称') }}</div>
              <div>{{ t('大小') }}</div>
              <div>{{ t('存储类型') }}</div>
              <div>{{ t('更新时间') }}</div>
            </div>
            <div
              v-for="item in filteredObjects"
              :key="item.name"
              class="table-row"
              :class="{ selected: selectedNames.has(item.name) }"
              @dblclick="openItem(item)"
              @contextmenu="openContextMenu($event, item)"
            >
              <div>
                <input
                  type="checkbox"
                  :checked="selectedNames.has(item.name)"
                  @change="toggleSelection(item)"
                />
              </div>
              <div class="file-name">
                <span class="file-icon" :class="getObjectVisual(item).kind">
                  <img
                    v-if="thumbnailUrls[item.name] && !failedThumbnailNames.has(item.name)"
                    :src="thumbnailUrls[item.name]"
                    @error="markThumbnailFailed(item.name)"
                  />
                  <component :is="getObjectVisual(item).icon" v-else :size="18" /> </span
                >{{ item.displayName }}
              </div>
              <div>{{ item.isDirectory ? '—' : formatSize(item.size) }}</div>
              <div>{{ item.storageClass || t('标准') }}</div>
              <div>
                {{ item.lastModified ? new Date(item.lastModified).toLocaleString() : '—' }}
              </div>
            </div>
            <div v-if="!filteredObjects.length && !fileBrowser.loading.value" class="empty-state">
              <div class="empty-icon"><Folder :size="42" /></div>
              <strong>{{ t('当前目录为空') }}</strong
              ><span>{{ t('上传文件或新建文件夹开始使用') }}</span>
            </div>
            <div
              v-if="hasMoreObjects && !searchText"
              class="load-more"
              role="button"
              tabindex="0"
              @click="loadObjects(true)"
            >
              {{ t('加载更多') }}
            </div>
          </div>
          <div v-else class="object-grid-scroll">
            <div v-if="filteredObjects.length" class="object-grid">
              <div
                v-for="item in filteredObjects"
                :key="item.name"
                class="object-card"
                :class="{ selected: selectedNames.has(item.name) }"
                role="button"
                tabindex="0"
                @click="toggleSelection(item)"
                @dblclick="openItem(item)"
                @contextmenu="openContextMenu($event, item)"
              >
                <div class="object-card-check" @click.stop>
                  <input
                    type="checkbox"
                    :checked="selectedNames.has(item.name)"
                    @change="toggleSelection(item)"
                  />
                </div>
                <div class="object-preview" :class="getObjectVisual(item).kind">
                  <img
                    v-if="thumbnailUrls[item.name] && !failedThumbnailNames.has(item.name)"
                    :src="thumbnailUrls[item.name]"
                    :alt="item.displayName"
                    loading="lazy"
                    @error="markThumbnailFailed(item.name)"
                  />
                  <component :is="getObjectVisual(item).icon" v-else :size="44" />
                </div>
                <div class="object-info">
                  <strong :title="item.displayName">{{ item.displayName }}</strong>
                  <span style="display: flex; align-items: center">
                    <template v-if="item.isDirectory">
                      <span>{{ t('文件夹') }}</span>
                    </template>
                    <template v-else>
                      <span>{{ formatSize(item.size) }}</span>
                      <span class="mx-1">·</span>
                      <span class="uppercase">{{ getFileExtension(item.name) }}</span>
                    </template>
                  </span>
                </div>
              </div>
            </div>
            <div v-else-if="!fileBrowser.loading.value" class="empty-state">
              <div class="empty-icon"><Folder :size="42" /></div>
              <strong>{{ t('当前目录为空') }}</strong
              ><span>{{ t('上传文件或新建文件夹开始使用') }}</span>
            </div>
            <div
              v-if="hasMoreObjects && !searchText"
              class="load-more"
              role="button"
              tabindex="0"
              @click="loadObjects(true)"
            >
              {{ t('加载更多') }}
            </div>
          </div>
          <div v-if="dragActive && currentBucket" class="drop-overlay">
            {{ t('释放后上传到当前目录') }}
          </div>
        </section>
      </div>

      <ObjectActionMenu
        v-if="contextMenu.visible"
        class="context-menu"
        :selected="selectedObjects"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @select="handleObjectAction"
      />

      <div
        v-if="emptyContextMenu.visible"
        class="more-menu context-menu empty-context-menu"
        :style="{ left: `${emptyContextMenu.x}px`, top: `${emptyContextMenu.y}px` }"
        @click="closeActions"
      >
        <div @click="upload('files')"><Upload :size="15" />{{ t('上传文件') }}</div>
        <div @click="openModal('create-folder')">
          <FolderPlus :size="15" />{{ t('新建文件夹') }}
        </div>
        <div :class="{ disabled: !canPaste }" @click="canPaste && pasteToCurrentDirectory()">
          <ClipboardPaste :size="15" />{{ t('粘贴') }}
        </div>
      </div>

      <aside v-if="showTransfers" class="transfer-panel">
        <div class="transfer-head">
          <strong>{{ t('传输任务') }}</strong>
          <AppTooltip :label="t('关闭')">
            <div class="icon-button" role="button" tabindex="0" @click="showTransfers = false">
              <X :size="18" />
            </div>
          </AppTooltip>
        </div>
        <div v-if="!transfers.length" class="transfer-empty">{{ t('暂无传输任务') }}</div>
        <div v-for="transfer in transfers" :key="transfer.id" class="transfer-item">
          <div class="transfer-line">
            <span
              ><Upload v-if="transfer.direction === 'upload'" :size="14" /><Download
                v-else
                :size="14"
              />
              {{ transfer.name }}</span
            ><b>{{
              transfer.status === 'done'
                ? t('完成')
                : transfer.status === 'error'
                  ? t('失败')
                  : transfer.status === 'cancelled'
                    ? t('已取消')
                    : `${Math.round(transfer.progress * 100)}%`
            }}</b>
            <AppButton
              v-if="transfer.status === 'running'"
              :label="t('取消')"
              tone="ghost"
              @click="cancelTransfer(transfer.id)"
            />
          </div>
          <div class="progress"><i :style="{ width: `${transfer.progress * 100}%` }" /></div>
          <div v-if="transfer.error" class="transfer-error">{{ transfer.error }}</div>
        </div>
      </aside>
    </template>

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

    <ModalShell
      v-if="modal === 'profiles'"
      :title="t('已保存账号')"
      size="large"
      @close="modal = null"
    >
      <div v-if="!savedProfiles.length" class="modal-empty">{{ t('暂无已保存账号') }}</div>
      <div v-for="profile in savedProfiles" :key="profile.id" class="profile-row">
        <div>
          <strong>{{ profile.label }}</strong>
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
        <AppButton :label="t('关闭')" @click="modal = null" />
      </template>
    </ModalShell>

    <ModalShell v-if="modal === 'cache'" :title="t('刷新 CDN 缓存')" @close="modal = null">
      <label class="field-label">{{ t('CDN 加速域名') }}</label>
      <div class="select-wrap">
        <select v-model="selectedCdnDomain" @change="updateCacheDomain">
          <option v-for="domain in cdnDomains" :key="domain" :value="domain">{{ domain }}</option>
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

    <ModalShell v-if="modal === 'create-bucket'" :title="t('新建 Bucket')" @close="modal = null">
      <label class="field-label">{{ t('Bucket 名称') }}</label>
      <div class="input-wrap">
        <input v-model.trim="form.name" :placeholder="t('全局唯一名称')" />
      </div>
      <label class="field-label">{{ t('地域') }}</label>
      <div class="select-wrap">
        <select v-model="form.region">
          <option v-for="item in OSS_REGIONS" :key="item.id" :value="item.id">
            {{ t(item.label) }} ({{ item.id }})
          </option>
        </select>
      </div>
      <label class="field-label">{{ t('读写权限') }}</label>
      <div class="select-wrap">
        <select v-model="form.acl">
          <option value="private">{{ t('私有') }}</option>
          <option value="public-read">{{ t('公共读') }}</option>
          <option value="public-read-write">{{ t('公共读写') }}</option>
        </select>
      </div>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('创建')"
          tone="primary"
          :disabled="!form.name"
          @click="createBucket"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'create-folder'" :title="t('新建文件夹')" @close="modal = null">
      <label class="field-label">{{ t('文件夹名称') }}</label>
      <div class="input-wrap"><input v-model.trim="form.name" @keydown.enter="createFolder" /></div>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('创建')"
          tone="primary"
          :disabled="!form.name"
          @click="createFolder"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'bucket-acl'" :title="t('设置 Bucket 权限')" @close="modal = null">
      <div class="select-wrap">
        <select v-model="form.acl">
          <option value="private">{{ t('私有') }}</option>
          <option value="public-read">{{ t('公共读') }}</option>
          <option value="public-read-write">{{ t('公共读写') }}</option>
        </select>
      </div>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('保存')"
          tone="primary"
          @click="applyBucketAcl"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'rename'" :title="t('重命名')" @close="modal = null">
      <label class="field-label">{{ t('目标名称') }}</label>
      <div class="input-wrap"><input v-model.trim="form.target" /></div>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('确定')"
          tone="primary"
          :disabled="!form.target"
          @click="renameSelected"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'paste-copy'" :title="t('粘贴副本')" @close="modal = null">
      <label class="field-label">{{ t('新名称') }}</label>
      <div class="input-wrap"><input v-model.trim="form.target" /></div>
      <p class="modal-hint">
        {{
          pasteTargetExists
            ? t('该名称已存在，请输入一个新名称。')
            : t('修改名称后，将在当前目录创建一个副本。')
        }}
      </p>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('创建副本')"
          tone="primary"
          :disabled="!form.target || pasteTargetExists"
          @click="pasteWithNewName"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'move'" :title="t('移动对象')" @close="modal = null">
      <label class="field-label">{{ t('目标 OSS 路径') }}</label>
      <div class="input-wrap">
        <input v-model.trim="form.target" placeholder="oss://bucket/path/" />
      </div>
      <p class="modal-hint">{{ t('支持其他目录和其他 Bucket。') }}</p>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('确定')"
          tone="primary"
          :disabled="!form.target.startsWith('oss://')"
          @click="transferSelected(true)"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'acl'" :title="t('设置对象权限')" @close="modal = null">
      <div class="select-wrap">
        <select v-model="form.acl">
          <option value="default">{{ t('继承 Bucket') }}</option>
          <option value="private">{{ t('私有') }}</option>
          <option value="public-read">{{ t('公共读') }}</option>
          <option value="public-read-write">{{ t('公共读写') }}</option>
        </select>
      </div>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('保存')"
          tone="primary"
          @click="applyAcl"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'headers'" :title="t('设置 HTTP 头')" @close="modal = null">
      <label class="field-label">Cache-Control</label>
      <div class="input-wrap">
        <input v-model.trim="form.cacheControl" placeholder="例如 max-age=3600" />
      </div>
      <label class="field-label">Content-Type</label>
      <div class="input-wrap">
        <input v-model.trim="form.contentType" placeholder="例如 image/png" />
      </div>
      <label class="field-label">Content-Disposition</label>
      <div class="input-wrap">
        <input v-model.trim="form.contentDisposition" placeholder="例如 attachment" />
      </div>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('保存')"
          tone="primary"
          @click="applyHeaders"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'share'" :title="t('获取地址')" size="large" @close="modal = null">
      <label class="field-label">{{ t('有效期（秒）') }}</label>
      <div class="input-wrap"><input v-model.number="form.expires" type="number" min="1" /></div>
      <label class="field-label">{{ t('访问域名') }}</label>
      <div class="select-wrap">
        <select v-model="selectedDomain">
          <option v-for="domain in domainOptions" :key="domain" :value="domain">
            {{ domain }}
          </option>
        </select>
      </div>
      <label class="field-label">{{ t('其他域名（可选）') }}</label>
      <div class="input-wrap">
        <input v-model.trim="form.customDomain" placeholder="static.example.com" />
      </div>
      <label class="field-label">{{ t('媒体处理') }}</label>
      <div class="select-wrap">
        <select v-model="mediaForm.mode">
          <option value="none">{{ t('不处理') }}</option>
          <option v-if="previewType === 'image'" value="image">{{ t('图片处理') }}</option>
          <option v-if="previewType === 'video'" value="video">{{ t('视频截帧') }}</option>
          <option value="custom">{{ t('自定义参数') }}</option>
        </select>
      </div>
      <div v-if="mediaForm.mode === 'image' || mediaForm.mode === 'video'" class="media-options">
        <label v-if="mediaForm.mode === 'image'"
          >{{ t('缩放方式') }}
          <div class="select-wrap">
            <select v-model="mediaForm.resizeMode">
              <option value="lfit">{{ t('等比缩放') }}</option>
              <option value="mfit">{{ t('等比缩放填充') }}</option>
              <option value="fill">{{ t('固定宽高') }}</option>
              <option value="pad">{{ t('缩放并留白') }}</option>
            </select>
          </div></label
        >
        <label
          >{{ t('宽度') }}
          <div class="input-wrap">
            <input v-model.number="mediaForm.width" type="number" min="0" /></div
        ></label>
        <label
          >{{ t('高度') }}
          <div class="input-wrap">
            <input v-model.number="mediaForm.height" type="number" min="0" /></div
        ></label>
        <label v-if="mediaForm.mode === 'image'"
          >{{ t('质量') }}
          <div class="input-wrap">
            <input v-model.number="mediaForm.quality" type="number" min="1" max="100" /></div
        ></label>
        <label v-if="mediaForm.mode === 'image'"
          >{{ t('旋转角度') }}
          <div class="input-wrap">
            <input v-model.number="mediaForm.rotate" type="number" min="0" max="360" /></div
        ></label>
        <label v-if="mediaForm.mode === 'video'"
          >{{ t('截帧时间（毫秒）') }}
          <div class="input-wrap">
            <input v-model.number="mediaForm.videoTime" type="number" min="0" /></div
        ></label>
        <label
          >{{ t('格式') }}
          <div class="select-wrap">
            <select v-model="mediaForm.format">
              <option value="">{{ t('保持原格式') }}</option>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
              <option v-if="mediaForm.mode === 'image'" value="webp">WebP</option>
              <option v-if="mediaForm.mode === 'image'" value="avif">AVIF</option>
            </select>
          </div></label
        >
      </div>
      <template v-if="mediaForm.mode === 'custom'">
        <label class="field-label">x-oss-process</label>
        <div class="input-wrap">
          <input v-model.trim="mediaForm.custom" placeholder="image/resize,w_800/quality,q_90" />
        </div>
      </template>
      <div v-if="previewUrl" class="share-url">{{ previewUrl }}</div>
      <div v-if="qrCodeUrl" class="share-qrcode">
        <img :src="qrCodeUrl" alt="QR code" /><AppButton
          :label="t('通过邮件发送')"
          @click="shareByEmail"
        />
      </div>
      <p class="modal-hint">{{ t('生成后会自动复制到剪贴板。') }}</p>
      <template #footer
        ><AppButton :label="t('关闭')" @click="modal = null" /><AppButton
          :label="t('生成并复制')"
          tone="primary"
          @click="createShareLink"
      /></template>
    </ModalShell>

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
        <iframe v-else-if="previewType === 'pdf' || previewType === 'document'" :src="previewUrl" />
        <div v-else-if="previewType === 'text'" class="text-preview">
          <textarea v-model="previewText" spellcheck="false" />
          <div class="text-preview-actions">
            <AppButton :label="t('保存修改')" tone="primary" @click="savePreviewText" />
          </div>
        </div>
        <div v-else class="preview-unknown">
          <span>{{ t('该格式暂不支持直接预览') }}</span
          ><AppButton :label="t('在浏览器中打开')" tone="primary" @click="openPreviewExternally" />
        </div>
      </div>
    </ModalShell>

    <ModalShell
      v-if="modal === 'multipart'"
      :title="t('未完成的分片上传')"
      width="720px"
      @close="modal = null"
    >
      <div v-if="!multipartUploads.length" class="modal-empty">
        {{ t('没有未完成的分片上传') }}
      </div>
      <div v-for="part in multipartUploads" :key="part.uploadId" class="multipart-row">
        <div>
          <strong>{{ part.name }}</strong
          ><span>{{ part.initiated || part.uploadId }}</span>
        </div>
        <AppButton :label="t('终止')" tone="danger" @click="abortMultipart(part)" />
      </div>
    </ModalShell>

    <ModalShell v-if="modal === 'symlink'" :title="t('创建软链接')" @close="modal = null">
      <label class="field-label">{{ t('软链接名称') }}</label>
      <div class="input-wrap"><input v-model.trim="form.name" /></div>
      <p class="modal-hint">
        {{ t('目标对象：{name}', { name: selectedObjects[0]?.name || '' }) }}
      </p>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('创建')"
          tone="primary"
          :disabled="!form.name"
          @click="createSymlink"
      /></template>
    </ModalShell>

    <ModalShell v-if="modal === 'restore'" :title="t('恢复归档对象')" @close="modal = null">
      <label class="field-label">{{ t('保持可读天数') }}</label>
      <div class="input-wrap">
        <input v-model.number="form.days" type="number" min="1" max="7" />
      </div>
      <p class="modal-hint">{{ t('适用于归档、冷归档和深度冷归档对象。') }}</p>
      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('提交恢复')"
          tone="primary"
          @click="restoreSelected"
      /></template>
    </ModalShell>

    <ModalShell
      v-if="modal === 'details'"
      :title="t('对象详情')"
      width="680px"
      @close="modal = null"
    >
      <div class="details-list">
        <div v-for="(value, key) in objectDetails?.headers" :key="key">
          <strong>{{ key }}</strong
          ><span>{{ value }}</span>
        </div>
        <div v-for="(value, key) in objectDetails?.metadata" :key="`meta-${key}`">
          <strong>x-oss-meta-{{ key }}</strong
          ><span>{{ value }}</span>
        </div>
      </div>
    </ModalShell>

    <ModalShell
      v-if="modal === 'grant'"
      :title="t('生成临时授权码')"
      width="620px"
      @close="modal = null"
    >
      <label class="field-label">RAM 角色 ARN</label>
      <div class="input-wrap">
        <input v-model.trim="form.roleArn" placeholder="acs:ram::123456789:role/example" />
      </div>
      <label class="field-label">{{ t('权限') }}</label>
      <div class="select-wrap">
        <select v-model="form.privilege">
          <option value="readOnly">{{ t('只读') }}</option>
          <option value="readWrite">{{ t('读写') }}</option>
          <option value="all">{{ t('全部权限') }}</option>
        </select>
      </div>
      <label class="field-label">{{ t('有效期（秒）') }}</label>
      <div class="input-wrap">
        <input v-model.number="form.durationSeconds" type="number" min="900" max="43200" />
      </div>
      <div v-if="grantToken" class="grant-result">
        <span>{{
          t('有效期至 {date}', { date: new Date(grantExpiration).toLocaleString() })
        }}</span>
        <textarea :value="grantToken" readonly />
      </div>
      <p class="modal-hint">{{ t('需要当前账号具备 AssumeRole 权限。生成后自动复制。') }}</p>
      <template #footer
        ><AppButton :label="t('关闭')" @click="modal = null" /><AppButton
          :label="t('生成并复制')"
          tone="primary"
          :disabled="!form.roleArn"
          @click="createGrantToken"
      /></template>
    </ModalShell>

    <ModalShell
      v-if="modal === 'ram-users'"
      :title="t('RAM 用户')"
      width="760px"
      @close="modal = null"
    >
      <div class="modal-toolbar">
        <AppButton :label="t('新建用户')" tone="primary" @click="editRamUser()" />
      </div>
      <div v-if="!ramUsers.length" class="modal-empty">{{ t('暂无 RAM 用户') }}</div>
      <div v-for="user in ramUsers" :key="user.userName" class="ram-row">
        <div>
          <strong>{{ user.userName }}</strong
          ><span>{{ user.displayName || user.comments || '—' }}</span>
        </div>
        <div class="ram-actions">
          <AppButton :label="t('编辑')" @click="editRamUser(user)" />
          <AppButton label="AccessKey" @click="openRamKeys(user)" />
          <AppButton :label="t('删除')" tone="danger" @click="removeRamUser(user)" />
        </div>
      </div>
    </ModalShell>

    <ModalShell
      v-if="modal === 'ram-user'"
      :title="activeRamUser ? t('编辑 RAM 用户') : t('新建 RAM 用户')"
      @close="modal = null"
    >
      <label class="field-label">{{ t('用户名') }}</label>
      <div class="input-wrap"><input v-model.trim="form.ramUserName" /></div>
      <label class="field-label">{{ t('显示名称') }}</label>
      <div class="input-wrap"><input v-model.trim="form.ramDisplayName" /></div>
      <label class="field-label">{{ t('备注') }}</label>
      <div class="input-wrap"><input v-model.trim="form.ramComments" /></div>
      <template #footer
        ><AppButton :label="t('取消')" @click="openRamUsers" /><AppButton
          :label="t('保存')"
          tone="primary"
          :disabled="!form.ramUserName"
          @click="saveRamUser"
      /></template>
    </ModalShell>

    <ModalShell
      v-if="modal === 'ram-keys'"
      :title="`AccessKey：${activeRamUser?.userName || ''}`"
      width="700px"
      @close="modal = null"
    >
      <div class="modal-toolbar">
        <AppButton :label="t('新建 AccessKey')" tone="primary" @click="createRamAccessKey" />
      </div>
      <div v-if="createdAccessKey" class="new-access-key">
        <strong>{{ t('请立即保存，Secret 仅显示一次') }}</strong>
        <span>AccessKey ID：{{ createdAccessKey.accessKeyId }}</span>
        <span>AccessKey Secret：{{ createdAccessKey.accessKeySecret }}</span>
      </div>
      <div v-for="key in ramAccessKeys" :key="key.accessKeyId" class="ram-row">
        <div>
          <strong>{{ key.accessKeyId }}</strong
          ><span>{{ key.status }} · {{ key.createDate }}</span>
        </div>
        <AppButton :label="t('删除')" tone="danger" @click="removeRamAccessKey(key)" />
      </div>
      <template #footer><AppButton :label="t('返回用户列表')" @click="openRamUsers" /></template>
    </ModalShell>

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
        </div>
        <AppButton
          :label="updateButtonLabel"
          :icon="RefreshCw"
          :disabled="
            isMac || updateState.status === 'checking' || updateState.status === 'downloading'
          "
          @click="handleUpdateAction"
        />
      </div>
      <div class="setting-row">
        <div>
          <strong>{{ t('外观主题') }}</strong
          ><span>{{ t('选择浅色、深色或跟随系统') }}</span>
        </div>
        <div class="select-wrap setting-select">
          <select v-model="themeDraft">
            <option value="system">{{ t('跟随系统') }}</option>
            <option value="light">{{ t('浅色') }}</option>
            <option value="dark">{{ t('深色') }}</option>
          </select>
        </div>
      </div>
      <div class="setting-row">
        <div>
          <strong>{{ t('连接安全') }}</strong
          ><span>{{ t('OSS 请求默认使用 HTTPS') }}</span>
        </div>
        <label><input v-model="secureDraft" type="checkbox" /> HTTPS</label>
      </div>
      <div class="setting-row">
        <div>
          <strong>{{ t('图片缩略图') }}</strong
          ><span>{{ t('在文件列表中显示图片预览') }}</span>
        </div>
        <label
          ><input v-model="settingsDraft.showImagePreview" type="checkbox" /> {{ t('显示') }}</label
        >
      </div>

      <div class="settings-section-title">{{ t('账号与权限') }}</div>
      <div class="setting-row">
        <div>
          <strong>{{ t('本地登录信息') }}</strong
          ><span>{{ t('仅保存在当前电脑') }}</span>
        </div>
        <AppButton :label="t('管理账号')" @click="modal = 'profiles'" />
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
            <input
              v-model.number="settingsDraft.maxUploadJobs"
              type="number"
              min="1"
              max="10"
            /></div
        ></label>
        <label
          >{{ t('同时下载任务') }}
          <div class="input-wrap">
            <input
              v-model.number="settingsDraft.maxDownloadJobs"
              type="number"
              min="1"
              max="10"
            /></div
        ></label>
        <label
          >{{ t('单任务并发分片') }}
          <div class="input-wrap">
            <input
              v-model.number="settingsDraft.multipartParallel"
              type="number"
              min="1"
              max="10"
            /></div
        ></label>
        <label
          >{{ t('上传分片大小（MB）') }}
          <div class="input-wrap">
            <input
              v-model.number="settingsDraft.partSizeMb"
              type="number"
              min="1"
              max="1024"
            /></div
        ></label>
        <label
          >{{ t('连接超时（秒）') }}
          <div class="input-wrap">
            <input v-model.number="settingsDraft.timeoutSeconds" type="number" min="10" /></div
        ></label>
        <label
          >{{ t('失败重试次数') }}
          <div class="input-wrap">
            <input v-model.number="settingsDraft.retryTimes" type="number" min="0" max="10" /></div
        ></label>
        <label
          >{{ t('每页对象数量') }}
          <div class="input-wrap">
            <input
              v-model.number="settingsDraft.listPageSize"
              type="number"
              min="10"
              max="1000"
            /></div
        ></label>
      </div>

      <template #footer
        ><AppButton :label="t('取消')" @click="modal = null" /><AppButton
          :label="t('保存设置')"
          tone="primary"
          @click="saveSettings"
      /></template>
    </ModalShell>

    <ConfirmDialog
      :open="Boolean(confirmation)"
      :title="confirmation?.title || ''"
      :description="confirmation?.description || ''"
      :confirm-label="confirmation?.confirmLabel || ''"
      :destructive="confirmation?.destructive"
      @update:open="!$event && (confirmation = null)"
      @confirm="confirmPendingAction"
    />
  </main>
</template>
