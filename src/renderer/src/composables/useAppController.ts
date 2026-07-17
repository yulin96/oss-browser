import {
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
  Presentation
} from '@lucide/vue'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
  type Directive
} from 'vue'
import type {
  AuthConfig,
  BucketInfo,
  CacheRefreshType,
  ObjectInfo,
  SavedProfile
} from '../../../shared/types'
import type { ObjectAction } from '../components/ObjectActionMenu.vue'
import { useAppSettings } from './useAppSettings'
import { useBucketOperations } from './useBucketOperations'
import { useCloudOperations } from './useCloudOperations'
import { useAppUpdates } from './useAppUpdates'
import { useAsyncTask } from './useAsyncTask'
import { useConfirmation } from './useConfirmation'
import { useFileBrowser } from './useFileBrowser'
import { useTransfers } from './useTransfers'
import { useUploadConflict } from './useUploadConflict'
import { setLocale, t, type AppLocale } from '../i18n'

// The inferred return type is the renderer's typed controller contract.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useAppController() {
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

  const imageProcessOptions = [
    { id: 'auto-orient', label: '自动方向', process: 'auto-orient,1' },
    { id: 'resize-50', label: '缩放 50%', process: 'resize,p_50' },
    { id: 'crop-300', label: '自定义裁剪 300 * 300', process: 'crop,w_300,h_300' },
    { id: 'rotate-90', label: '旋转 90°', process: 'rotate,90' },
    { id: 'quality-80', label: '质量 80%', process: 'quality,q_80' },
    { id: 'format-webp', label: '转 WebP', process: 'format,webp' }
  ]

  const videoProcessOptions = [{ id: 'snapshot', label: '截取首帧', process: 'snapshot,t_0,f_jpg' }]

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
  const showProfilesModal = ref(false)
  const showUploadActions = ref(false)
  const contextMenu = reactive({ visible: false, x: 0, y: 0 })
  const emptyContextMenu = reactive({ visible: false, x: 0, y: 0 })
  const bucketMenu = reactive({ visible: false, x: 0, y: 0 })
  const dragActive = ref(false)
  const previewUrl = ref('')
  const previewText = ref('')
  const shareNeedsExpiry = ref(true)
  const sharePreparing = ref(false)
  const shareCopied = ref(false)
  const savedProfiles = ref<SavedProfile[]>([])
  const copyBuffer = shallowRef<CopyBuffer | null>(null)
  const domainOptions = ref<string[]>([])
  const selectedDomain = ref('')
  const cdnDomains = ref<string[]>([])
  const selectedCdnDomain = ref('')

  const {
    confirmation,
    confirmationOpen,
    requestConfirmation,
    closeConfirmation,
    confirmPendingAction,
    finishConfirmationClose,
    resetConfirmation
  } = useConfirmation()
  const {
    uploadConflictOpen,
    currentUploadConflict,
    uploadConflictIndex,
    uploadConflictTotal,
    rememberUploadConflictChoice,
    resolveUploadConflicts,
    replaceUploadConflict,
    replaceAllUploadConflicts,
    skipUploadConflict,
    skipAllUploadConflicts,
    cancelUploadConflicts
  } = useUploadConflict()
  const {
    transfers,
    showTransfers,
    activeTransferTab,
    transferSummaries,
    activeTransferSummary,
    visibleTransfers,
    hasCompletedTransfers,
    hasVisibleTransfers,
    canResumeTransfers,
    canPauseTransfers,
    initializeTransfers,
    disposeTransfers,
    resetTransfers,
    clearCompletedTransferRecords,
    pauseAllTransfers,
    resumeAllTransfers,
    confirmDeleteAllTransfers,
    cancelTransfer
  } = useTransfers(requestConfirmation)

  const auth = reactive<AuthConfig>({
    alias: '',
    endpoint: 'oss-cn-hangzhou.aliyuncs.com',
    endpointMode: 'public',
    accessKeyId: '',
    accessKeySecret: '',
    stsToken: '',
    secure: true,
    remember: true,
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
  const bucketForm = reactive({
    name: '',
    region: 'oss-cn-hangzhou',
    acl: 'private'
  })
  const objectForm = reactive({
    name: '',
    target: '',
    acl: 'private',
    cacheControl: '',
    contentType: '',
    contentDisposition: '',
    expires: 3600,
    days: 1
  })
  const grantForm = reactive({
    roleArn: '',
    privilege: 'readOnly' as 'readOnly' | 'readWrite' | 'all',
    durationSeconds: 3600
  })
  const ramForm = reactive({
    ramUserName: '',
    ramDisplayName: '',
    ramComments: ''
  })
  const cacheForm = reactive({
    objectType: 'File' as CacheRefreshType,
    objectPath: '',
    force: false
  })
  const selectedMediaProcesses = ref<string[]>([])
  const mediaProcessOptions = computed(() =>
    previewType.value === 'image'
      ? imageProcessOptions
      : previewType.value === 'video'
        ? videoProcessOptions
        : []
  )
  const { settings, themeMode, initializeSettings, disposeSettings, openSettings } = useAppSettings(
    {
      auth,
      loggedIn,
      savedProfiles,
      profileId,
      run: settingsTask.run,
      taskError: settingsTask.error,
      openModal: () => {
        modal.value = modal.value === 'settings' ? null : 'settings'
      }
    }
  )

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
    bucketStorageStat,
    bucketStorageStatLoading,
    bucketStorageStatError,
    prefix,
    objects,
    hasMoreObjects,
    selectedNames,
    searchText,

    bucketSearchText,
    viewMode,
    sortField,
    sortDirection,
    addressInput,
    navigationHistory,
    navigationIndex,
    favorites,
    homeLocation,
    thumbnailUrls,
    imageDimensions,
    failedThumbnailNames,
    selectedObjects,
    filteredObjects,
    filteredBuckets,
    pageCounts,
    loadAccountPreferences,
    openInitialLocation,
    refreshBuckets,
    loadBucketStorageStat,
    openBucket,
    goToAddress,
    goBack,
    goForward,
    goUp,
    goBucketHome,
    goHome,
    toggleFavorite,
    isCurrentFavorite,
    openFavorite,
    removeFavorite,
    setCurrentAsHome,
    isCurrentHome,
    setSortField,
    setSortDirection,
    loadObjects,
    requestImageAssets,
    markThumbnailFailed,
    setViewMode,
    enterDirectory,
    toggleSelection,
    toggleAll
  } = fileBrowser

  const {
    multipartUploads,
    multipartBucket,
    bucketActionTarget,
    resetBucketOperations,
    openBucketAcl,
    createBucket,
    deleteBucket,
    applyBucketAcl,
    openMultipart,
    abortMultipart
  } = useBucketOperations({
    form: bucketForm,
    run,
    runBrowserTask: browserTask.run,
    requestConfirmation,
    getCurrentBucket: () => currentBucket.value,
    clearCurrentBucket: () => {
      currentBucket.value = null
    },
    refreshBuckets,
    setModal: (name) => {
      modal.value = name
    },
    closeBucketMenu: () => {
      bucketMenu.visible = false
    },
    invalidateAddressAccess: invalidateBucketAddressAccess,
    getError: () => errorMessage.value
  })

  const {
    grantToken,
    grantExpiration,
    ramUsers,
    ramAccessKeys,
    activeRamUser,
    createdAccessKey,
    objectDetails,
    permissionResults,
    permissionChecking,
    resetCloudOperations,
    showDetails,
    createGrantToken,
    openRamUsers,
    editRamUser,
    saveRamUser,
    removeRamUser,
    openRamKeys,
    createRamAccessKey,
    removeRamAccessKey,
    checkPermissions
  } = useCloudOperations({
    run,
    runCloudTask: cloudTask.run,
    requestConfirmation,
    getBucket: () => currentBucket.value,
    getSelectedObjects: () => selectedObjects.value,
    getPrefix: () => prefix.value,
    grantForm,
    ramForm,
    setModal: (name) => {
      modal.value = name
    },
    getError: () => errorMessage.value,
    setError: (message) => {
      errorMessage.value = message
    }
  })

  const thumbnailObserverRoots = new Map<
    Element,
    { observer: IntersectionObserver; elements: Set<Element> }
  >()
  const thumbnailRootByElement = new WeakMap<Element, Element>()
  const thumbnailItemByElement = new WeakMap<Element, ObjectInfo>()

  const vThumbnail: Directive<HTMLElement, ObjectInfo> = {
    mounted(element, binding) {
      const item = binding.value
      if (item.isDirectory || !/\.(png|jpe?g|gif|webp|bmp)$/i.test(item.name)) return
      const root = element.closest('.file-table, .object-grid-scroll')
      if (!root) return
      let state = thumbnailObserverRoots.get(root)
      if (!state) {
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (
                !entry.isIntersecting ||
                (!settings.showImagePreview && !settings.showImageResolution)
              )
                continue
              observer.unobserve(entry.target)
              const visibleItem = thumbnailItemByElement.get(entry.target)
              if (visibleItem) requestImageAssets(visibleItem)
            }
          },
          { root, rootMargin: '400px 0px' }
        )
        state = { observer, elements: new Set() }
        thumbnailObserverRoots.set(root, state)
      }
      state.elements.add(element)
      thumbnailRootByElement.set(element, root)
      thumbnailItemByElement.set(element, item)
      state.observer.observe(element)
    },
    unmounted(element) {
      const root = thumbnailRootByElement.get(element)
      if (!root) return
      const state = thumbnailObserverRoots.get(root)
      if (!state) return
      state.observer.unobserve(element)
      state.elements.delete(element)
      if (state.elements.size === 0) {
        state.observer.disconnect()
        thumbnailObserverRoots.delete(root)
      }
      thumbnailRootByElement.delete(element)
      thumbnailItemByElement.delete(element)
    }
  }

  watch(
    () => [settings.showImagePreview, settings.showImageResolution],
    ([showPreview, showResolution]) => {
      if (!showPreview && !showResolution) return
      for (const state of thumbnailObserverRoots.values()) {
        for (const element of state.elements) {
          state.observer.unobserve(element)
          state.observer.observe(element)
        }
      }
    }
  )

  const showFileLoading = ref(false)
  let fileLoadingTimer: ReturnType<typeof setTimeout> | undefined

  watch(
    () => fileBrowser.loading.value,
    (loading) => {
      if (fileLoadingTimer) clearTimeout(fileLoadingTimer)
      fileLoadingTimer = undefined
      if (!loading || objects.value.length) {
        showFileLoading.value = false
        return
      }
      fileLoadingTimer = setTimeout(() => {
        showFileLoading.value = fileBrowser.loading.value && objects.value.length === 0
        fileLoadingTimer = undefined
      }, 500)
    }
  )

  const {
    appVersion,
    updateState,
    updateDescription,
    updateButtonLabel,
    initializeUpdates,
    disposeUpdates,
    handleUpdateAction
  } = useAppUpdates(requestConfirmation)

  const canPaste = computed(() => Boolean(copyBuffer.value && currentBucket.value))
  const isSamePasteLocation = computed(
    () =>
      copyBuffer.value?.bucket === currentBucket.value?.name &&
      copyBuffer.value?.prefix === prefix.value
  )
  const pasteSourceName = computed(() => copyBuffer.value?.items[0]?.displayName || '')
  const pasteTargetExists = computed(() =>
    objects.value.some((item) => item.displayName === objectForm.target)
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

  let toastTimer: ReturnType<typeof setTimeout> | undefined
  let shareCopyTimer: ReturnType<typeof setTimeout> | undefined
  let dragDepth = 0
  const addressAccessCache = new Map<string, Promise<boolean>>()
  let domainOptionsBucket = ''
  let domainOptionsPromise: Promise<void> | undefined

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
      initializeTransfers()
      await restoreSession()
    } finally {
      initializing.value = false
    }
  })

  onBeforeUnmount(() => {
    disposeTransfers()
    disposeUpdates()
    disposeSettings()
    document.removeEventListener('pointerdown', closeFloatingMenus)
    document.removeEventListener('keydown', handleGlobalKeydown)
    document.removeEventListener('dragleave', handleDocumentDragLeave)
    window.removeEventListener('dragend', resetDragState)
    window.removeEventListener('drop', resetDragState)
    window.removeEventListener('blur', resetDragState)
    if (toastTimer) clearTimeout(toastTimer)
    if (shareCopyTimer) clearTimeout(shareCopyTimer)
    if (fileLoadingTimer) clearTimeout(fileLoadingTimer)
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
    resetTransfers()
    showUploadActions.value = false
    contextMenu.visible = false
    emptyContextMenu.visible = false
    bucketMenu.visible = false
    resetDragState()
    previewUrl.value = ''
    previewText.value = ''
    shareNeedsExpiry.value = true
    sharePreparing.value = false
    shareCopied.value = false
    resetBucketOperations()
    copyBuffer.value = null
    domainOptions.value = []
    domainOptionsBucket = ''
    domainOptionsPromise = undefined
    addressAccessCache.clear()
    selectedDomain.value = ''
    cdnDomains.value = []
    selectedCdnDomain.value = ''
    resetConfirmation()
    cancelUploadConflicts()
    resetCloudOperations()
    authToken.value = ''
    modal.value = null
    Object.assign(bucketForm, { name: '', region: 'oss-cn-hangzhou', acl: 'private' })
    Object.assign(objectForm, {
      name: '',
      target: '',
      acl: 'private',
      cacheControl: '',
      contentType: '',
      contentDisposition: '',
      expires: 3600,
      days: 1
    })
    Object.assign(grantForm, {
      roleArn: '',
      privilege: 'readOnly',
      durationSeconds: 3600
    })
    Object.assign(ramForm, {
      ramUserName: '',
      ramDisplayName: '',
      ramComments: ''
    })
    Object.assign(cacheForm, { objectType: 'File', objectPath: '', force: false })
    selectedMediaProcesses.value = []
  }

  function closeFloatingMenus(event: PointerEvent): void {
    const target = event.target as HTMLElement
    if (
      showTransfers.value &&
      !target.closest('.transfer-panel') &&
      !target.closest('.transfer-panel-trigger')
    ) {
      showTransfers.value = false
    }
    if (!target.closest('.more-actions') && !target.closest('.context-menu')) {
      showUploadActions.value = false
      contextMenu.visible = false
      emptyContextMenu.visible = false
      bucketMenu.visible = false
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      showUploadActions.value = false
      contextMenu.visible = false
      emptyContextMenu.visible = false
      bucketMenu.visible = false
    }
  }

  function openContextMenu(event: MouseEvent, item: ObjectInfo): void {
    event.preventDefault()
    if (!selectedNames.value.has(item.name)) selectedNames.value = new Set([item.name])
    if (!item.isDirectory) void prefetchAddressData(item)
    showUploadActions.value = false
    contextMenu.x = event.clientX
    contextMenu.y = event.clientY
    contextMenu.visible = true
    emptyContextMenu.visible = false
  }

  function openEmptyContextMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement
    if (target.closest('.object-card, .table-row, .toolbar, .quick-nav, .context-menu')) return
    event.preventDefault()
    showUploadActions.value = false

    contextMenu.visible = false
    selectedNames.value = new Set()
    emptyContextMenu.x = Math.min(event.clientX, window.innerWidth - 200)
    emptyContextMenu.y = Math.min(event.clientY, window.innerHeight - 190)
    emptyContextMenu.visible = true
  }

  function handleBlankClick(event: MouseEvent): void {
    const target = event.target as HTMLElement
    if (
      target.closest(
        '.object-card, .table-row, .object-card-check, input[type="checkbox"], .context-menu, .toolbar, .quick-nav'
      )
    ) {
      return
    }
    selectedNames.value = new Set()
  }

  function closeActions(): void {
    showUploadActions.value = false
    contextMenu.visible = false
    emptyContextMenu.visible = false
    bucketMenu.visible = false
  }

  function toggleUploadActions(): void {
    showUploadActions.value = !showUploadActions.value
  }

  function selectUpload(kind: 'files' | 'folder'): void {
    showUploadActions.value = false
    void upload(kind)
  }

  function openBucketMenu(event: MouseEvent, bucket: BucketInfo): void {
    event.preventDefault()
    event.stopPropagation()
    bucketActionTarget.value = bucket
    bucketMenu.x = Math.min(event.clientX, window.innerWidth - 200)
    bucketMenu.y = Math.min(event.clientY, window.innerHeight - 150)
    bucketMenu.visible = true
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

  let isOpeningItem = false

  async function openItem(item: ObjectInfo): Promise<void> {
    if (isOpeningItem) return
    isOpeningItem = true

    try {
      if (item.isDirectory) {
        await enterDirectory(item)
      } else {
        selectedNames.value = new Set([item.name])
        await openPreview()
      }
    } finally {
      isOpeningItem = false
    }
  }

  function openModal(name: ModalName): void {
    bucketForm.name = ''
    objectForm.name = ''
    objectForm.target =
      name === 'move'
        ? `oss://${currentBucket.value?.name || ''}/${prefix.value}`
        : selectedObjects.value[0]?.displayName || ''
    bucketForm.acl = 'private'
    objectForm.acl = 'private'
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
    shareCopied.value = false
    selectedMediaProcesses.value = []
    sharePreparing.value = true
    try {
      await loadDomainOptions()
      if (!currentBucket.value || selectedObjects.value.length !== 1) return
      const item = selectedObjects.value[0]
      const needsExpiry = await run(() =>
        getAddressNeedsExpiry(currentBucket.value!.name, item.name)
      )
      if (needsExpiry === undefined) return
      shareNeedsExpiry.value = needsExpiry
      if (!shareNeedsExpiry.value) await createShareLink()
    } finally {
      sharePreparing.value = false
    }
  }

  function addressAccessKey(bucket: string, name: string): string {
    return `${bucket}\0${name}`
  }

  function getAddressNeedsExpiry(bucket: string, name: string): Promise<boolean> {
    const key = addressAccessKey(bucket, name)
    const cached = addressAccessCache.get(key)
    if (cached) return cached

    const request = window.ossBrowser.objects
      .isPublic(bucket, name)
      .then((isPublic) => !isPublic)
      .catch((error) => {
        addressAccessCache.delete(key)
        throw error
      })
    addressAccessCache.set(key, request)
    return request
  }

  function invalidateBucketAddressAccess(bucket: string): void {
    const prefix = `${bucket}\0`
    for (const key of addressAccessCache.keys()) {
      if (key.startsWith(prefix)) addressAccessCache.delete(key)
    }
  }

  async function prefetchAddressData(item: ObjectInfo): Promise<void> {
    if (!currentBucket.value) return
    const bucket = currentBucket.value.name
    try {
      await Promise.all([loadDomainOptions(), getAddressNeedsExpiry(bucket, item.name)])
    } catch (error) {
      console.error('[share] Failed to prefetch address data', {
        bucket,
        object: item.name,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }

  function loadDomainOptions(): Promise<void> {
    if (!currentBucket.value) return Promise.resolve()
    const bucket = currentBucket.value
    if (domainOptionsBucket === bucket.name && domainOptions.value.length) return Promise.resolve()
    if (domainOptionsBucket === bucket.name && domainOptionsPromise) return domainOptionsPromise

    domainOptionsBucket = bucket.name
    domainOptions.value = []
    const request = (async () => {
      const standardDomain = `${bucket.name}.${bucket.region}.aliyuncs.com`
      const domains = await window.ossBrowser.objects.domains(bucket.name).catch(() => [])
      if (domainOptionsBucket !== bucket.name) return
      domainOptions.value = [standardDomain, ...(domains || [])].filter(
        (item, index, values) => values.indexOf(item) === index
      )
      const remembered = localStorage.getItem(`oss-browser-domain:${profileId()}:${bucket.name}`)
      selectedDomain.value =
        remembered && domainOptions.value.includes(remembered) ? remembered : standardDomain
    })()
    const promise = request.finally(() => {
      if (domainOptionsPromise === promise) domainOptionsPromise = undefined
    })
    domainOptionsPromise = promise
    return promise
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

  async function createFolder(): Promise<void> {
    if (!currentBucket.value) return
    const done = await run(() =>
      window.ossBrowser.objects.createFolder(
        currentBucket.value!.name,
        `${prefix.value}${objectForm.name}`
      )
    )
    if (done === undefined && errorMessage.value) return
    modal.value = null
    await loadObjects()
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
  }

  async function renameSelected(): Promise<void> {
    if (!currentBucket.value || selectedObjects.value.length !== 1) return
    const source = selectedObjects.value[0]
    const target = `${prefix.value}${objectForm.target}${source.isDirectory ? '/' : ''}`
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
        objectForm.target,
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
      objectForm.target = pasteSourceName.value
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
  }

  async function pasteWithNewName(): Promise<void> {
    if (!currentBucket.value || !copyBuffer.value || copyBuffer.value.items.length !== 1) return
    const source = copyBuffer.value.items[0]
    const target = `${prefix.value}${objectForm.target}${source.isDirectory ? '/' : ''}`
    const done = await run(() =>
      window.ossBrowser.objects.copy(currentBucket.value!.name, source.name, target)
    )
    if (done === undefined && errorMessage.value) return
    modal.value = null
    copyBuffer.value = null
    await loadObjects()
  }

  async function createSymlink(): Promise<void> {
    if (!currentBucket.value || selectedObjects.value.length !== 1) return
    const done = await run(() =>
      window.ossBrowser.objects.createSymlink(
        currentBucket.value!.name,
        `${prefix.value}${objectForm.name}`,
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
        Number(objectForm.days)
      )
    )
    if (done === undefined && errorMessage.value) return
    modal.value = null
    await loadObjects()
  }

  async function uploadPaths(paths: string[]): Promise<void> {
    if (!currentBucket.value || !paths.length) return
    const bucketName = currentBucket.value.name
    const targetPrefix = prefix.value
    let skipNames: string[] = []

    if (settings.uploadConflictPolicy !== 'replace') {
      const conflicts = await run(() =>
        window.ossBrowser.files.findUploadConflicts(bucketName, targetPrefix, paths)
      )
      if (conflicts === undefined) return
      if (settings.uploadConflictPolicy === 'skip') {
        skipNames = conflicts.map((conflict) => conflict.name)
      } else if (conflicts.length) {
        const resolution = await resolveUploadConflicts(conflicts)
        if (!resolution) return
        skipNames = resolution.skipNames
        if (resolution.rememberedPolicy) {
          settings.uploadConflictPolicy = resolution.rememberedPolicy
        }
      }
    }

    const done = await run(() =>
      window.ossBrowser.files.upload(bucketName, targetPrefix, paths, { skipNames })
    )
    if (done) await loadObjects()
  }

  async function upload(kind: 'files' | 'folder'): Promise<void> {
    if (!currentBucket.value) return
    const paths = await window.ossBrowser.files.pickUpload(kind)
    await uploadPaths(paths)
  }

  async function handleDrop(event: DragEvent): Promise<void> {
    resetDragState()
    if (!currentBucket.value || !event.dataTransfer?.files.length) return
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.ossBrowser.files.getPathForFile(file))
      .filter(Boolean)
    if (!paths.length) return
    await uploadPaths(paths)
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
    if (!done) return
  }

  async function applyAcl(): Promise<void> {
    if (!currentBucket.value || selectedObjects.value.length !== 1) return
    const bucketName = currentBucket.value.name
    const objectName = selectedObjects.value[0].name
    const done = await run(() =>
      window.ossBrowser.objects.setAcl(bucketName, objectName, objectForm.acl)
    )
    if (done === undefined && errorMessage.value) return
    addressAccessCache.delete(addressAccessKey(bucketName, objectName))
    modal.value = null
  }

  async function applyHeaders(): Promise<void> {
    if (!currentBucket.value || !selectedObjects.value.length) return
    const headers: Record<string, string> = {}
    if (objectForm.cacheControl) headers['Cache-Control'] = objectForm.cacheControl
    if (objectForm.contentType) headers['Content-Type'] = objectForm.contentType
    if (objectForm.contentDisposition)
      headers['Content-Disposition'] = objectForm.contentDisposition
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
    let url = ''
    if (shareNeedsExpiry.value) {
      const signedUrl = await run(() =>
        window.ossBrowser.objects.signedUrl(
          currentBucket.value!.name,
          selectedObjects.value[0].name,
          Number(objectForm.expires),
          process || undefined
        )
      )
      if (!signedUrl) return
      url = signedUrl
    } else {
      const objectPath = selectedObjects.value[0].name
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/')
      url = `${auth.secure ? 'https' : 'http'}://${selectedDomain.value}/${objectPath}`
      if (process) url += `?x-oss-process=${process}`
    }
    const domain = selectedDomain.value
    previewUrl.value = domain
      ? url.replace(/\/\/[^/]+\//, `//${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/`)
      : url
    shareCopied.value = false
    if (selectedDomain.value && currentBucket.value) {
      localStorage.setItem(
        `oss-browser-domain:${profileId()}:${currentBucket.value.name}`,
        selectedDomain.value
      )
    }
  }

  function buildMediaProcess(): string {
    const operations = mediaProcessOptions.value
      .filter((option) => selectedMediaProcesses.value.includes(option.id))
      .map((option) => option.process)
    if (!operations.length) return ''
    return `${previewType.value === 'video' ? 'video' : 'image'}/${operations.join('/')}`
  }

  async function toggleMediaProcess(id: string): Promise<void> {
    selectedMediaProcesses.value = selectedMediaProcesses.value.includes(id)
      ? selectedMediaProcesses.value.filter((item) => item !== id)
      : [...selectedMediaProcesses.value, id]
    if (previewUrl.value || !shareNeedsExpiry.value) await createShareLink()
  }

  async function copyShareUrl(): Promise<void> {
    if (!previewUrl.value) return
    await window.ossBrowser.system.writeClipboard(previewUrl.value)
    shareCopied.value = true
    if (shareCopyTimer) clearTimeout(shareCopyTimer)
    shareCopyTimer = setTimeout(() => {
      shareCopied.value = false
    }, 1600)
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

  function isFavoriteDirectory(item: ObjectInfo): boolean {
    return (
      item.isDirectory &&
      Boolean(currentBucket.value) &&
      favorites.value.some(
        (favorite) => favorite.bucket === currentBucket.value!.name && favorite.prefix === item.name
      )
    )
  }

  function isHomeDirectory(item: ObjectInfo): boolean {
    const home = homeLocation.value
    if (!item.isDirectory || !home) return false
    return home.bucket === currentBucket.value?.name && (home.prefix || '') === item.name
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
        showProfilesModal.value = false
        modal.value = null
        await openInitialLocation(result, auth.presetPath || '')
      }
      return
    }
    resetCloudOperations()
    auth.alias = profile.config.alias || ''
    Object.assign(auth, profile.config)
    showProfilesModal.value = false
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

  return {
    objectIconRules,
    imageProcessOptions,
    videoProcessOptions,
    getObjectVisual,
    loggedIn,
    initializing,
    authMode,
    authToken,
    directError,
    toastMessage,
    modal,
    showProfilesModal,
    transfers,
    showTransfers,
    activeTransferTab,
    showUploadActions,
    contextMenu,
    emptyContextMenu,
    bucketMenu,
    dragActive,
    previewUrl,
    previewText,
    shareNeedsExpiry,
    sharePreparing,
    shareCopied,
    grantToken,
    grantExpiration,
    ramUsers,
    ramAccessKeys,
    activeRamUser,
    createdAccessKey,
    multipartUploads,
    multipartBucket,
    bucketActionTarget,
    objectDetails,
    savedProfiles,
    copyBuffer,
    domainOptions,
    selectedDomain,
    cdnDomains,
    selectedCdnDomain,
    permissionResults,
    permissionChecking,
    confirmation,
    confirmationOpen,
    requestConfirmation,
    closeConfirmation,
    confirmPendingAction,
    finishConfirmationClose,
    uploadConflictOpen,
    currentUploadConflict,
    uploadConflictIndex,
    uploadConflictTotal,
    rememberUploadConflictChoice,
    replaceUploadConflict,
    replaceAllUploadConflicts,
    skipUploadConflict,
    skipAllUploadConflicts,
    cancelUploadConflicts,
    auth,
    authTask,
    browserTask,
    operationTask,
    cloudTask,
    settingsTask,
    anyPending,
    transferSummaries,
    activeTransferSummary,
    visibleTransfers,
    hasCompletedTransfers,
    hasVisibleTransfers,
    canResumeTransfers,
    canPauseTransfers,
    errorMessage,
    run,
    clearAsyncErrors,
    OSS_REGIONS,
    bucketForm,
    objectForm,
    grantForm,
    ramForm,
    cacheForm,
    selectedMediaProcesses,
    mediaProcessOptions,
    settings,
    themeMode,
    initializeSettings,
    disposeSettings,
    openSettings,
    fileBrowser,
    buckets,
    currentBucket,
    bucketStorageStat,
    bucketStorageStatLoading,
    bucketStorageStatError,
    prefix,
    objects,
    hasMoreObjects,
    selectedNames,
    searchText,
    bucketSearchText,
    viewMode,
    sortField,
    sortDirection,
    addressInput,
    navigationHistory,
    navigationIndex,
    favorites,
    homeLocation,
    thumbnailUrls,
    imageDimensions,
    failedThumbnailNames,
    selectedObjects,
    filteredObjects,
    filteredBuckets,
    pageCounts,
    loadAccountPreferences,
    openInitialLocation,
    refreshBuckets,
    loadBucketStorageStat,
    openBucket,
    goToAddress,
    goBack,
    goForward,
    goUp,
    goBucketHome,
    goHome,
    toggleFavorite,
    isCurrentFavorite,
    openFavorite,
    removeFavorite,
    setCurrentAsHome,
    isCurrentHome,
    setSortField,
    setSortDirection,
    loadObjects,
    requestImageAssets,
    markThumbnailFailed,
    setViewMode,
    enterDirectory,
    toggleSelection,
    toggleAll,
    thumbnailObserverRoots,
    thumbnailRootByElement,
    thumbnailItemByElement,
    vThumbnail,
    showFileLoading,
    fileLoadingTimer,
    appVersion,
    updateState,
    updateDescription,
    updateButtonLabel,
    initializeUpdates,
    disposeUpdates,
    handleUpdateAction,
    canPaste,
    isSamePasteLocation,
    pasteSourceName,
    pasteTargetExists,

    previewType,
    toastTimer,
    shareCopyTimer,
    dragDepth,
    addressAccessCache,
    domainOptionsBucket,
    domainOptionsPromise,
    clearCompletedTransferRecords,
    pauseAllTransfers,
    resumeAllTransfers,
    confirmDeleteAllTransfers,
    handleDragEnter,
    handleDragLeave,
    handleDocumentDragLeave,
    resetDragState,
    resetAccountRuntimeState,
    closeFloatingMenus,
    handleGlobalKeydown,
    openContextMenu,
    openEmptyContextMenu,
    handleBlankClick,
    closeActions,
    toggleUploadActions,
    selectUpload,
    openBucketMenu,
    openBucketAcl,
    login,
    restoreSession,
    saveSession,
    profileId,
    loginWithToken,
    logout,
    confirmLogout,
    isOpeningItem,
    openItem,
    openModal,
    handleObjectAction,
    prepareAddressModal,
    addressAccessKey,
    getAddressNeedsExpiry,
    invalidateBucketAddressAccess,
    prefetchAddressData,
    loadDomainOptions,
    prepareCacheRefresh,
    openCacheRefresh,
    updateCacheDomain,
    submitCacheRefresh,
    confirmCacheRefresh,
    createBucket,
    deleteBucket,
    createFolder,
    applyBucketAcl,
    removeSelected,
    performRemoveSelected,
    renameSelected,
    transferSelected,
    copySelected,
    pasteToCurrentDirectory,
    pasteWithNewName,
    createSymlink,
    restoreSelected,
    showDetails,
    createGrantToken,
    openRamUsers,
    editRamUser,
    saveRamUser,
    removeRamUser,
    openRamKeys,
    createRamAccessKey,
    removeRamAccessKey,
    upload,
    handleDrop,
    downloadSelected,
    applyAcl,
    applyHeaders,
    createShareLink,
    buildMediaProcess,
    toggleMediaProcess,
    copyShareUrl,
    openPreview,
    savePreviewText,
    openMultipart,
    abortMultipart,
    formatSize,
    getFileExtension,
    isFavoriteDirectory,
    isHomeDirectory,
    cancelTransfer,
    openProjectPage,
    openPreviewExternally,
    clearSavedProfile,
    performClearSavedProfile,
    useProfile,
    changeLocale,
    removeProfile,
    performRemoveProfile,
    checkPermissions
  }
}

export type AppController = ReturnType<typeof useAppController>
