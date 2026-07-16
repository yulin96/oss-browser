export type EndpointMode = 'public' | 'custom' | 'cname' | 'private'

export interface AuthConfig {
  alias?: string
  endpoint: string
  endpointMode: EndpointMode
  accessKeyId: string
  accessKeySecret: string
  stsToken?: string
  secure: boolean
  remember: boolean
  presetPath?: string
}

export interface BucketInfo {
  name: string
  region: string
  creationDate?: string
  storageClass?: string
  acl?: string
}

export interface BucketStorageStat {
  storage: number
  objectCount: number
  standardStorage: number
  standardObjectCount: number
  infrequentAccessStorage: number
  infrequentAccessObjectCount: number
  archiveStorage: number
  archiveObjectCount: number
  coldArchiveStorage: number
  coldArchiveObjectCount: number
  deepColdArchiveStorage: number
  deepColdArchiveObjectCount: number
  lastModifiedTime: number
}

export interface SavedProfile {
  id: string
  label: string
  config: AuthConfig
}

export interface AppSettings {
  maxUploadJobs: number
  maxDownloadJobs: number
  multipartParallel: number
  partSizeMb: number
  timeoutSeconds: number
  retryTimes: number
  listPageSize: number
  showImagePreview: boolean
}

export type CacheRefreshType = 'File' | 'Directory' | 'Regex'

export interface CacheRefreshRequest {
  objectPath: string
  objectType: CacheRefreshType
  force: boolean
}

export interface GrantOptions {
  bucket: string
  key: string
  region: string
  roleArn: string
  privilege: 'readOnly' | 'readWrite' | 'all'
  durationSeconds: number
  isObject: boolean
}

export interface GrantResult {
  token: string
  expiration: string
}

export interface RamUser {
  userName: string
  displayName?: string
  comments?: string
  createDate?: string
}

export interface RamAccessKey {
  accessKeyId: string
  accessKeySecret?: string
  status?: string
  createDate?: string
}

export interface PermissionProbeItem {
  service: 'OSS' | 'CDN' | 'RAM' | 'STS'
  permission: string
  status: 'accessible' | 'denied' | 'error'
  detail?: string
}

export interface ObjectInfo {
  name: string
  displayName: string
  size: number
  lastModified?: string
  etag?: string
  storageClass?: string
  isDirectory: boolean
  restoreInfo?: {
    ongoingRequest?: boolean
    expiryDate?: string
  }
}

export interface ObjectDetails {
  headers: Record<string, string>
  metadata: Record<string, string>
}

export interface ObjectListResult {
  objects: ObjectInfo[]
  nextMarker?: string
  isTruncated: boolean
}

export interface TransferItem {
  id: string
  batchId: string
  batchTotal: number
  batchDone: number
  direction: 'upload' | 'download'
  name: string
  progress: number
  status: 'running' | 'paused' | 'done' | 'error' | 'cancelled'
  error?: string
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error'
  | 'unsupported'

export interface UpdateState {
  status: UpdateStatus
  version?: string
  percent?: number
  message?: string
}

export interface MultipartUploadInfo {
  name: string
  uploadId: string
  initiated?: string
}

export type AppPlatform = 'darwin' | 'win32' | 'linux'

export interface OssBrowserApi {
  auth: {
    connect: (config: AuthConfig) => Promise<BucketInfo[]>
    disconnect: () => Promise<void>
    setSecure: (secure: boolean) => Promise<void>
    probePermissions: () => Promise<PermissionProbeItem[]>
  }
  profiles: {
    list: () => Promise<SavedProfile[]>
    save: (profile: SavedProfile) => Promise<void>
    remove: (id: string) => Promise<void>
    clear: () => Promise<void>
  }
  settings: {
    update: (settings: AppSettings) => Promise<void>
  }
  grants: {
    createToken: (options: GrantOptions) => Promise<GrantResult>
  }
  ram: {
    listUsers: () => Promise<RamUser[]>
    saveUser: (
      userName: string,
      displayName: string,
      comments: string,
      originalName?: string
    ) => Promise<void>
    removeUser: (userName: string) => Promise<void>
    listAccessKeys: (userName: string) => Promise<RamAccessKey[]>
    createAccessKey: (userName: string) => Promise<RamAccessKey>
    removeAccessKey: (userName: string, accessKeyId: string) => Promise<void>
  }
  buckets: {
    list: () => Promise<BucketInfo[]>
    getStorageStat: (name: string) => Promise<BucketStorageStat>
    getAcl: (name: string) => Promise<string>
    create: (name: string, region: string, acl: string) => Promise<void>
    remove: (name: string) => Promise<void>
    setAcl: (name: string, acl: string) => Promise<void>
    listMultipart: (name: string) => Promise<MultipartUploadInfo[]>
    abortMultipart: (bucket: string, name: string, uploadId: string) => Promise<void>
  }
  objects: {
    list: (bucket: string, prefix: string, marker?: string) => Promise<ObjectListResult>
    createFolder: (bucket: string, path: string) => Promise<void>
    remove: (bucket: string, names: string[]) => Promise<void>
    copy: (bucket: string, source: string, target: string) => Promise<void>
    transfer: (
      bucket: string,
      items: ObjectInfo[],
      targetPath: string,
      move: boolean
    ) => Promise<void>
    isPublic: (bucket: string, name: string) => Promise<boolean>
    setAcl: (bucket: string, name: string, acl: string) => Promise<void>
    setHeaders: (bucket: string, name: string, headers: Record<string, string>) => Promise<void>
    signedUrl: (bucket: string, name: string, expires: number, process?: string) => Promise<string>
    readText: (bucket: string, name: string) => Promise<string>
    saveText: (bucket: string, name: string, content: string) => Promise<void>
    createSymlink: (bucket: string, name: string, target: string) => Promise<void>
    restore: (bucket: string, names: string[], days: number) => Promise<void>
    details: (bucket: string, name: string) => Promise<ObjectDetails>
    domains: (bucket: string) => Promise<string[]>
  }
  cache: {
    domains: () => Promise<string[]>
    refresh: (request: CacheRefreshRequest) => Promise<string>
  }
  files: {
    getPathForFile: (file: File) => string
    pickUpload: (kind: 'files' | 'folder') => Promise<string[]>
    pickDownloadFolder: () => Promise<string | null>
    upload: (bucket: string, prefix: string, paths: string[]) => Promise<boolean>
    download: (bucket: string, items: ObjectInfo[], destination: string) => Promise<boolean>
  }
  transfers: {
    cancel: (id: string) => Promise<void>
    pauseAll: (direction: TransferItem['direction']) => Promise<void>
    resumeAll: (direction: TransferItem['direction']) => Promise<void>
    cancelAll: (direction: TransferItem['direction']) => Promise<void>
  }
  system: {
    platform: AppPlatform
    getVersion: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    revealFile: (path: string) => Promise<void>
    writeClipboard: (text: string) => Promise<void>
  }
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<boolean>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizeChange: (listener: (maximized: boolean) => void) => () => void
  }
  updates: {
    getState: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    download: () => Promise<void>
    install: () => Promise<void>
  }
  onTransfer: (listener: (item: TransferItem) => void) => () => void
  onUpdate: (listener: (state: UpdateState) => void) => () => void
}
