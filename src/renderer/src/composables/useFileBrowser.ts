import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue'
import type { AppSettings, BucketInfo, ObjectInfo } from '../../../shared/types'
import { t } from '../i18n'

interface Favorite {
  bucket: string
  prefix: string
}

interface HomeLocation {
  bucket?: string
  prefix?: string
}

export type ObjectSortField = 'name' | 'modified' | 'type' | 'size'
export type SortDirection = 'asc' | 'desc'

export function useFileBrowser(options: {
  settings: AppSettings
  profileId: () => string
  saveSession: () => void
  closeModal: () => void
  runBrowserTask: <T>(task: () => Promise<T>) => Promise<T | undefined>
}): {
  buckets: Ref<BucketInfo[]>
  currentBucket: Ref<BucketInfo | null>
  prefix: Ref<string>
  objects: Ref<ObjectInfo[]>
  hasMoreObjects: Ref<boolean>
  selectedNames: Ref<Set<string>>
  searchText: Ref<string>
  bucketSearchText: Ref<string>
  viewMode: Ref<'list' | 'grid'>
  sortField: Ref<ObjectSortField>
  sortDirection: Ref<SortDirection>
  addressInput: Ref<string>
  navigationHistory: Ref<string[]>
  navigationIndex: Ref<number>
  favorites: Ref<Favorite[]>
  homeLocation: Ref<HomeLocation | null>
  thumbnailUrls: Record<string, string>
  failedThumbnailNames: Ref<Set<string>>
  loading: Ref<boolean>
  error: Ref<string>
  selectedObjects: ComputedRef<ObjectInfo[]>
  filteredObjects: ComputedRef<ObjectInfo[]>
  filteredBuckets: ComputedRef<BucketInfo[]>
  pageCounts: ComputedRef<{ directories: number; files: number }>
  reset: () => void
  loadAccountPreferences: () => void
  openInitialLocation: (availableBuckets: BucketInfo[], presetPath: string) => Promise<void>
  refreshBuckets: () => Promise<void>
  openBucket: (bucket: BucketInfo) => Promise<void>
  visit: (bucket: BucketInfo, path: string, record?: boolean) => Promise<void>
  goToAddress: (record?: boolean) => Promise<void>
  goBack: () => Promise<void>
  goForward: () => Promise<void>
  goUp: () => Promise<void>
  goHome: () => Promise<void>
  toggleFavorite: () => void
  isCurrentFavorite: () => boolean
  openFavorite: (favorite: Favorite) => Promise<void>
  removeFavorite: (favorite: Favorite) => void
  setCurrentAsHome: () => void
  isCurrentHome: () => boolean
  loadObjects: (append?: boolean) => Promise<void>
  requestThumbnail: (item: ObjectInfo) => void
  markThumbnailFailed: (name: string) => void
  setViewMode: (mode: 'list' | 'grid') => void
  setSortField: (field: ObjectSortField) => void
  setSortDirection: (direction: SortDirection) => void
  enterDirectory: (item: ObjectInfo) => Promise<void>
  toggleSelection: (item: ObjectInfo) => void
  toggleAll: () => void
} {
  const buckets = ref<BucketInfo[]>([])
  const currentBucket = ref<BucketInfo | null>(null)
  const prefix = ref('')
  const objects = ref<ObjectInfo[]>([])
  const nextMarker = ref<string>()
  const hasMoreObjects = ref(false)
  const selectedNames = ref(new Set<string>())
  const searchText = ref('')
  const bucketSearchText = ref('')
  const viewMode = ref<'list' | 'grid'>(
    localStorage.getItem('oss-browser-view-mode') === 'grid' ? 'grid' : 'list'
  )
  const sortField = ref<ObjectSortField>('name')
  const sortDirection = ref<SortDirection>('asc')
  const addressInput = ref('')
  const navigationHistory = ref<string[]>([])
  const navigationIndex = ref(-1)
  const favorites = ref<Favorite[]>([])
  const homeLocation = ref<HomeLocation | null>(null)
  const thumbnailUrls = reactive<Record<string, string>>({})
  const failedThumbnailNames = ref(new Set<string>())
  const loading = ref(false)
  const error = ref('')
  const thumbnailQueue: Array<{
    item: ObjectInfo
    bucketName: string
    generation: number
  }> = []
  const pendingThumbnailGenerations = new Map<string, number>()
  let activeThumbnailJobs = 0
  let loadGeneration = 0
  let thumbnailGeneration = 0
  let bucketGeneration = 0

  const selectedObjects = computed(() =>
    objects.value.filter((item) => selectedNames.value.has(item.name))
  )
  const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  const filteredObjects = computed(() => {
    const keyword = searchText.value.trim().toLowerCase()
    const visibleObjects = keyword
      ? objects.value.filter((item) => item.displayName.toLowerCase().includes(keyword))
      : objects.value
    const direction = sortDirection.value === 'asc' ? 1 : -1

    return [...visibleObjects].sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1

      let result = 0
      if (sortField.value === 'name') {
        result = nameCollator.compare(left.displayName, right.displayName)
      } else if (sortField.value === 'modified') {
        result =
          (left.lastModified ? new Date(left.lastModified).getTime() : 0) -
          (right.lastModified ? new Date(right.lastModified).getTime() : 0)
      } else if (sortField.value === 'type') {
        const leftType = left.displayName.includes('.')
          ? left.displayName.slice(left.displayName.lastIndexOf('.') + 1)
          : ''
        const rightType = right.displayName.includes('.')
          ? right.displayName.slice(right.displayName.lastIndexOf('.') + 1)
          : ''
        result = nameCollator.compare(leftType, rightType)
      } else {
        result = left.size - right.size
      }

      return (result || nameCollator.compare(left.displayName, right.displayName)) * direction
    })
  })
  const filteredBuckets = computed(() => {
    const keyword = bucketSearchText.value.trim().toLowerCase()
    return keyword
      ? buckets.value.filter((bucket) => bucket.name.toLowerCase().includes(keyword))
      : buckets.value
  })
  const pageCounts = computed(() => ({
    directories: objects.value.filter((item) => item.isDirectory).length,
    files: objects.value.filter((item) => !item.isDirectory).length
  }))

  function homeStorageKey(): string {
    return `oss-browser-home:${options.profileId()}`
  }

  function favoriteStorageKey(): string {
    return `oss-browser-favorites:${options.profileId()}`
  }

  function sortStorageKey(): string {
    return `oss-browser-sort:${options.profileId()}`
  }

  function loadAccountPreferences(): void {
    try {
      favorites.value = JSON.parse(localStorage.getItem(favoriteStorageKey()) || '[]')
    } catch {
      favorites.value = []
      localStorage.removeItem(favoriteStorageKey())
    }
    try {
      const raw = localStorage.getItem(homeStorageKey())
      homeLocation.value = raw ? (JSON.parse(raw) as HomeLocation) : null
    } catch {
      homeLocation.value = null
      localStorage.removeItem(homeStorageKey())
    }
    try {
      const preference = JSON.parse(localStorage.getItem(sortStorageKey()) || '{}') as {
        field?: ObjectSortField
        direction?: SortDirection
      }
      sortField.value =
        preference.field === 'modified' ||
        preference.field === 'type' ||
        preference.field === 'size'
          ? preference.field
          : 'name'
      sortDirection.value = preference.direction === 'desc' ? 'desc' : 'asc'
    } catch {
      sortField.value = 'name'
      sortDirection.value = 'asc'
      localStorage.removeItem(sortStorageKey())
    }
  }

  function reset(): void {
    loadGeneration += 1
    thumbnailGeneration += 1
    bucketGeneration += 1
    loading.value = false
    error.value = ''
    buckets.value = []
    currentBucket.value = null
    prefix.value = ''
    objects.value = []
    nextMarker.value = undefined
    hasMoreObjects.value = false
    selectedNames.value = new Set()
    searchText.value = ''
    bucketSearchText.value = ''
    sortField.value = 'name'
    sortDirection.value = 'asc'
    addressInput.value = ''
    navigationHistory.value = []
    navigationIndex.value = -1
    favorites.value = []
    homeLocation.value = null
    for (const name of Object.keys(thumbnailUrls)) delete thumbnailUrls[name]
    failedThumbnailNames.value = new Set()
    thumbnailQueue.length = 0
    pendingThumbnailGenerations.clear()
  }

  async function openInitialLocation(
    availableBuckets: BucketInfo[],
    presetPath: string
  ): Promise<void> {
    const configuredMatch = /^oss:\/\/([^/]+)\/?(.*)$/.exec(presetPath || '')
    const home =
      homeLocation.value ||
      (configuredMatch ? { bucket: configuredMatch[1], prefix: configuredMatch[2] } : null)
    if (!home?.bucket) return
    const bucket = availableBuckets.find((item) => item.name === home.bucket)
    if (!bucket) return
    let homePrefix = home.prefix || ''
    if (homePrefix && !homePrefix.endsWith('/')) homePrefix += '/'
    await visit(bucket, homePrefix)
  }

  async function refreshBuckets(): Promise<void> {
    const generation = ++bucketGeneration
    const result = await options.runBrowserTask(() => window.ossBrowser.buckets.list())
    if (result && generation === bucketGeneration) buckets.value = result
  }

  async function visit(bucket: BucketInfo, path: string, record = true): Promise<void> {
    currentBucket.value = bucket
    prefix.value = path
    addressInput.value = `oss://${bucket.name}/${path}`
    if (record) {
      navigationHistory.value = navigationHistory.value.slice(0, navigationIndex.value + 1)
      navigationHistory.value.push(addressInput.value)
      navigationIndex.value = navigationHistory.value.length - 1
    }
    await loadObjects()
    options.saveSession()
  }

  async function goToAddress(record = true): Promise<void> {
    const match = /^oss:\/\/([^/]+)\/?(.*)$/.exec(addressInput.value.trim())
    if (!match) {
      error.value = t('请输入正确的 OSS 路径，例如 oss://bucket/path/')
      return
    }
    const bucket = buckets.value.find((item) => item.name === match[1])
    if (!bucket) {
      error.value = t('未找到 Bucket：{name}', { name: match[1] })
      return
    }
    const path = match[2] && !match[2].endsWith('/') ? `${match[2]}/` : match[2]
    await visit(bucket, path, record)
  }

  async function goBack(): Promise<void> {
    if (navigationIndex.value <= 0) return
    navigationIndex.value -= 1
    addressInput.value = navigationHistory.value[navigationIndex.value]
    await goToAddress(false)
  }

  async function goForward(): Promise<void> {
    if (navigationIndex.value >= navigationHistory.value.length - 1) return
    navigationIndex.value += 1
    addressInput.value = navigationHistory.value[navigationIndex.value]
    await goToAddress(false)
  }

  function leaveBucket(): void {
    loadGeneration += 1
    loading.value = false
    currentBucket.value = null
    prefix.value = ''
    objects.value = []
    selectedNames.value = new Set()
    addressInput.value = ''
  }

  async function goUp(): Promise<void> {
    if (!currentBucket.value) return
    const parts = prefix.value.split('/').filter(Boolean)
    if (!parts.length) return leaveBucket()
    parts.pop()
    await visit(currentBucket.value, parts.length ? `${parts.join('/')}/` : '')
  }

  async function goHome(): Promise<void> {
    const home = homeLocation.value
    const bucket = home?.bucket
      ? buckets.value.find((item) => item.name === home.bucket)
      : undefined
    if (bucket) return visit(bucket, home?.prefix || '')
    leaveBucket()
  }

  function toggleFavorite(): void {
    if (!currentBucket.value) return
    const index = favorites.value.findIndex(
      (item) => item.bucket === currentBucket.value!.name && item.prefix === prefix.value
    )
    if (index === -1)
      favorites.value.push({ bucket: currentBucket.value.name, prefix: prefix.value })
    else favorites.value.splice(index, 1)
    localStorage.setItem(favoriteStorageKey(), JSON.stringify(favorites.value))
  }

  function isCurrentFavorite(): boolean {
    return Boolean(
      currentBucket.value &&
      favorites.value.some(
        (item) => item.bucket === currentBucket.value!.name && item.prefix === prefix.value
      )
    )
  }

  async function openFavorite(favorite: Favorite): Promise<void> {
    const bucket = buckets.value.find((item) => item.name === favorite.bucket)
    if (!bucket) return
    options.closeModal()
    await visit(bucket, favorite.prefix)
  }

  function removeFavorite(favorite: Favorite): void {
    favorites.value = favorites.value.filter(
      (item) => item.bucket !== favorite.bucket || item.prefix !== favorite.prefix
    )
    localStorage.setItem(favoriteStorageKey(), JSON.stringify(favorites.value))
  }

  function setCurrentAsHome(): void {
    if (!currentBucket.value) return
    if (isCurrentHome()) {
      homeLocation.value = null
      localStorage.removeItem(homeStorageKey())
      return
    }
    homeLocation.value = { bucket: currentBucket.value.name, prefix: prefix.value }
    localStorage.setItem(homeStorageKey(), JSON.stringify(homeLocation.value))
  }

  function isCurrentHome(): boolean {
    return Boolean(
      currentBucket.value &&
      homeLocation.value?.bucket === currentBucket.value.name &&
      (homeLocation.value.prefix || '') === prefix.value
    )
  }

  async function loadObjects(append = false): Promise<void> {
    if (!currentBucket.value) return
    const generation = ++loadGeneration
    const bucketName = currentBucket.value.name
    const requestedPrefix = prefix.value
    const marker = append ? nextMarker.value : undefined
    if (!append) {
      thumbnailGeneration += 1
      objects.value = []
      nextMarker.value = undefined
      hasMoreObjects.value = false
      selectedNames.value = new Set()
      Object.keys(thumbnailUrls).forEach((key) => delete thumbnailUrls[key])
      failedThumbnailNames.value = new Set()
      thumbnailQueue.length = 0
      pendingThumbnailGenerations.clear()
    }
    loading.value = true
    error.value = ''
    let result
    try {
      result = await window.ossBrowser.objects.list(bucketName, requestedPrefix, marker)
    } catch (reason) {
      if (generation === loadGeneration) {
        error.value = reason instanceof Error ? reason.message : String(reason)
      }
      return
    } finally {
      if (generation === loadGeneration) loading.value = false
    }
    if (
      generation !== loadGeneration ||
      currentBucket.value?.name !== bucketName ||
      prefix.value !== requestedPrefix
    )
      return
    objects.value = append ? [...objects.value, ...result.objects] : result.objects
    nextMarker.value = result.nextMarker
    hasMoreObjects.value = result.isTruncated
    selectedNames.value = new Set()
  }

  function requestThumbnail(item: ObjectInfo): void {
    if (
      !options.settings.showImagePreview ||
      item.isDirectory ||
      !/\.(png|jpe?g|gif|webp|bmp)$/i.test(item.name) ||
      thumbnailUrls[item.name] ||
      failedThumbnailNames.value.has(item.name) ||
      !currentBucket.value ||
      pendingThumbnailGenerations.get(item.name) === thumbnailGeneration
    )
      return

    const generation = thumbnailGeneration
    pendingThumbnailGenerations.set(item.name, generation)
    thumbnailQueue.push({ item, bucketName: currentBucket.value.name, generation })
    runThumbnailQueue()
  }

  function runThumbnailQueue(): void {
    while (activeThumbnailJobs < 8 && thumbnailQueue.length) {
      const job = thumbnailQueue.shift()!
      activeThumbnailJobs += 1
      void window.ossBrowser.objects
        .signedUrl(
          job.bucketName,
          job.item.name,
          3600,
          'image/resize,m_lfit,w_320,h_200/quality,q_80'
        )
        .then((url) => {
          if (
            job.generation !== thumbnailGeneration ||
            currentBucket.value?.name !== job.bucketName
          )
            return
          thumbnailUrls[job.item.name] = url
          failedThumbnailNames.value.delete(job.item.name)
        })
        .catch((reason) => {
          if (
            job.generation !== thumbnailGeneration ||
            currentBucket.value?.name !== job.bucketName
          )
            return
          console.error('[thumbnails] Failed to generate thumbnail URL', {
            bucket: job.bucketName,
            object: job.item.name,
            reason
          })
          failedThumbnailNames.value.add(job.item.name)
        })
        .finally(() => {
          if (pendingThumbnailGenerations.get(job.item.name) === job.generation)
            pendingThumbnailGenerations.delete(job.item.name)
          activeThumbnailJobs -= 1
          runThumbnailQueue()
        })
    }
  }

  function toggleSelection(item: ObjectInfo): void {
    const next = new Set(selectedNames.value)
    if (next.has(item.name)) next.delete(item.name)
    else next.add(item.name)
    selectedNames.value = next
  }

  return {
    buckets,
    currentBucket,
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
    failedThumbnailNames,
    loading,
    error,
    selectedObjects,
    filteredObjects,
    filteredBuckets,
    pageCounts,
    reset,
    loadAccountPreferences,
    openInitialLocation,
    refreshBuckets,
    openBucket: (bucket) => visit(bucket, ''),
    visit,
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
    requestThumbnail,
    markThumbnailFailed: (name) => failedThumbnailNames.value.add(name),
    setViewMode: (mode) => {
      viewMode.value = mode
      localStorage.setItem('oss-browser-view-mode', mode)
    },
    setSortField: (field) => {
      sortField.value = field
      localStorage.setItem(
        sortStorageKey(),
        JSON.stringify({ field, direction: sortDirection.value })
      )
    },
    setSortDirection: (direction) => {
      sortDirection.value = direction
      localStorage.setItem(sortStorageKey(), JSON.stringify({ field: sortField.value, direction }))
    },
    enterDirectory: (item) => visit(currentBucket.value!, item.name),
    toggleSelection,
    toggleAll: () => {
      selectedNames.value =
        selectedNames.value.size === filteredObjects.value.length
          ? new Set()
          : new Set(filteredObjects.value.map((item) => item.name))
    }
  }
}
