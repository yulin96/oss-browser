import CdnModule, {
  DescribeUserDomainsRequest,
  RefreshObjectCachesRequest
} from '@alicloud/cdn20180510'
import { $OpenApiUtil } from '@alicloud/openapi-core'
import RamClient, {
  CreateAccessKeyRequest,
  CreateUserRequest,
  DeleteAccessKeyRequest,
  DeleteUserRequest,
  DetachPolicyFromUserRequest,
  ListAccessKeysRequest,
  ListPoliciesForUserRequest,
  ListUsersRequest,
  UpdateUserRequest
} from '@alicloud/ram20150501'
import StsClient, { AssumeRoleRequest } from '@alicloud/sts20150401'
import OSS from 'ali-oss'
import { app, nativeImage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import type {
  AppSettings,
  AuthConfig,
  BucketInfo,
  BucketStorageStat,
  CacheRefreshRequest,
  GrantOptions,
  GrantResult,
  ImageDimensions,
  MultipartUploadInfo,
  ObjectDetails,
  ObjectInfo,
  ObjectListResult,
  PermissionProbeItem,
  RamAccessKey,
  RamUser,
  TransferItem,
  UploadConflict,
  UploadOptions,
  UploadPreparation
} from '../shared/types'

type TransferReporter = (item: TransferItem) => void
type OssClient = InstanceType<typeof OSS>
type TransferDirection = TransferItem['direction']
interface UploadEntry {
  localPath: string
  relativePath: string
  isDirectory: boolean
  name: string
}
interface PreparedUpload {
  bucket: string
  prefix: string
  paths: string[]
  entries: UploadEntry[]
}
interface DownloadRange {
  start: number
  end: number
}
interface DownloadCheckpoint {
  version: 1
  total: number
  etag: string
  partSize: number
  completed: DownloadRange[]
}
type TransferBatch = {
  id: string
  direction: TransferDirection
  total: number
  done: number
  failed: Set<string>
  cancelled: boolean
  hidden: boolean
}
type ActiveTransfer = Omit<TransferItem, 'batchId' | 'batchTotal' | 'batchDone'> & {
  generation: number
  batch: TransferBatch
  cancelRequested: boolean
  cancelOperation: () => void
  lastProgressReportAt: number
}

export class OssService {
  private auth: AuthConfig | null = null
  private settings: AppSettings = {
    maxUploadJobs: 3,
    maxDownloadJobs: 3,
    multipartParallel: 5,
    partSizeMb: 10,
    timeoutSeconds: 60,
    retryTimes: 5,
    listPageSize: 500,
    showImagePreview: true,
    showImageResolution: false,
    uploadConflictPolicy: 'ask'
  }
  private readonly activeTransfers = new Map<string, ActiveTransfer>()
  private readonly transferBatches = new Map<string, TransferBatch>()
  private readonly retryTransfers = new Map<
    string,
    { direction: TransferDirection; run: () => Promise<void> }
  >()
  private readonly localMediaPreviews = new Map<string, { localPath: string; expiresAt: number }>()
  private readonly preparedUploads = new Map<string, PreparedUpload>()
  private readonly pausedDirections = new Set<TransferDirection>()
  private readonly pauseWaiters: Record<TransferDirection, Array<() => void>> = {
    upload: [],
    download: []
  }
  private transferGeneration = 0
  private readonly bucketRegions = new Map<string, string>()

  constructor(private readonly reportTransfer: TransferReporter) {}

  async connect(config: AuthConfig): Promise<BucketInfo[]> {
    this.resetActiveTransfers()
    this.preparedUploads.clear()
    this.auth = config
    try {
      if (config.presetPath) {
        const { bucket, prefix } = this.parseOssPath(config.presetPath)
        if (config.endpointMode === 'public') {
          try {
            const buckets = await this.listBuckets()
            const matchedBucket = buckets.find((item) => item.name === bucket)
            if (matchedBucket?.region) this.bucketRegions.set(bucket, matchedBucket.region)
          } catch {
            await this.discoverPublicBucketRegion(bucket)
          }
        }
        await this.bucketClient(bucket).list({ prefix, 'max-keys': 1 })
        return [{ name: bucket, region: this.bucketRegions.get(bucket) || '' }]
      }
      return await this.listBuckets()
    } catch (error) {
      this.auth = null
      this.bucketRegions.clear()
      throw error
    }
  }

  disconnect(): void {
    this.resetActiveTransfers()
    this.auth = null
    this.bucketRegions.clear()
    this.preparedUploads.clear()
  }

  setSecure(secure: boolean): void {
    if (!this.auth) throw new Error('请先登录')
    this.auth.secure = secure
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings
  }

  getUploadConflictPolicy(): AppSettings['uploadConflictPolicy'] {
    return this.settings.uploadConflictPolicy
  }

  async probePermissions(): Promise<PermissionProbeItem[]> {
    if (!this.auth) throw new Error('请先登录')
    const probe = async (
      service: PermissionProbeItem['service'],
      permission: string,
      task: () => Promise<string | undefined>
    ): Promise<PermissionProbeItem> => {
      try {
        return { service, permission, status: 'accessible', detail: await task() }
      } catch (error) {
        const value = error as { code?: string; name?: string; message?: string }
        const message = value.code || value.name || value.message || String(error)
        const denied = /AccessDenied|Forbidden|NoPermission|Unauthorized/i.test(message)
        return { service, permission, status: denied ? 'denied' : 'error', detail: message }
      }
    }

    return Promise.all([
      probe('OSS', 'oss:ListBuckets', async () => {
        const result = await this.client().listBuckets()
        return `${result.buckets?.length || 0}`
      }),
      probe('CDN', 'cdn:DescribeUserDomains', async () => {
        const result = await this.cdnClient().describeUserDomains(
          new DescribeUserDomainsRequest({ pageNumber: 1, pageSize: 1 })
        )
        return `${result.body?.totalCount || 0}`
      }),
      probe('RAM', 'ram:ListUsers', async () => {
        const result = await this.ramClient().listUsers(new ListUsersRequest({ maxItems: 1 }))
        return `${result.body?.users?.user?.length || 0}`
      }),
      probe('STS', 'sts:GetCallerIdentity', async () => {
        const result = await this.stsClient().getCallerIdentity()
        return result.body?.identityType || result.body?.arn
      })
    ])
  }

  async createGrantToken(options: GrantOptions): Promise<GrantResult> {
    if (!this.auth) throw new Error('请先登录')
    const actions =
      options.privilege === 'readOnly'
        ? ['oss:Get*', 'oss:List*']
        : options.privilege === 'readWrite'
          ? ['oss:Get*', 'oss:List*', 'oss:Put*', 'oss:DeleteObject', 'oss:AbortMultipartUpload']
          : ['oss:*']
    const policy = {
      Version: '1',
      Statement: [
        {
          Effect: 'Allow',
          Action: ['oss:ListObjects'],
          Resource: [`acs:oss:*:*:${options.bucket}`],
          Condition: { StringLike: { 'oss:Prefix': `${options.key}*` } }
        },
        {
          Effect: 'Allow',
          Action: actions,
          Resource: [`acs:oss:*:*:${options.bucket}/${options.key}${options.isObject ? '' : '*'}`]
        }
      ]
    }
    const config = new $OpenApiUtil.Config({
      accessKeyId: this.auth.accessKeyId,
      accessKeySecret: this.auth.accessKeySecret,
      securityToken: this.auth.stsToken,
      regionId: options.region || 'cn-hangzhou',
      endpoint: 'sts.aliyuncs.com'
    })
    const response = await new StsClient(config).assumeRole(
      new AssumeRoleRequest({
        roleArn: options.roleArn,
        roleSessionName: `oss-browser-${Date.now()}`,
        policy: JSON.stringify(policy),
        durationSeconds: options.durationSeconds
      })
    )
    const credentials = response.body?.credentials
    if (
      !credentials?.accessKeyId ||
      !credentials.accessKeySecret ||
      !credentials.securityToken ||
      !credentials.expiration
    ) {
      throw new Error('STS 未返回完整的临时凭证')
    }
    const token = Buffer.from(
      JSON.stringify({
        id: credentials.accessKeyId,
        secret: credentials.accessKeySecret,
        stoken: credentials.securityToken,
        expiration: credentials.expiration,
        region: options.region,
        osspath: `oss://${options.bucket}/${options.key}`,
        privilege: options.privilege,
        eptpl:
          this.auth.endpointMode === 'public'
            ? `${this.auth.secure ? 'https' : 'http'}://{region}.aliyuncs.com`
            : `${this.auth.secure ? 'https' : 'http'}://${this.auth.endpoint}`
      })
    ).toString('base64')
    return { token, expiration: credentials.expiration }
  }

  async listRamUsers(): Promise<RamUser[]> {
    const response = await this.ramClient().listUsers(new ListUsersRequest({ maxItems: 1000 }))
    return (response.body?.users?.user || []).map((user) => ({
      userName: user.userName || '',
      displayName: user.displayName,
      comments: user.comments,
      createDate: user.createDate
    }))
  }

  async saveRamUser(
    userName: string,
    displayName: string,
    comments: string,
    originalName?: string
  ): Promise<void> {
    const client = this.ramClient()
    if (originalName) {
      await client.updateUser(
        new UpdateUserRequest({
          userName: originalName,
          newUserName: userName,
          newDisplayName: displayName,
          newComments: comments
        })
      )
    } else {
      await client.createUser(new CreateUserRequest({ userName, displayName, comments }))
    }
  }

  async listRamAccessKeys(userName: string): Promise<RamAccessKey[]> {
    const response = await this.ramClient().listAccessKeys(new ListAccessKeysRequest({ userName }))
    return (response.body?.accessKeys?.accessKey || []).map((key) => ({
      accessKeyId: key.accessKeyId || '',
      status: key.status,
      createDate: key.createDate
    }))
  }

  async createRamAccessKey(userName: string): Promise<RamAccessKey> {
    const response = await this.ramClient().createAccessKey(
      new CreateAccessKeyRequest({ userName })
    )
    const key = response.body?.accessKey
    if (!key?.accessKeyId || !key.accessKeySecret) throw new Error('RAM 未返回完整的 AccessKey')
    return {
      accessKeyId: key.accessKeyId,
      accessKeySecret: key.accessKeySecret,
      status: key.status,
      createDate: key.createDate
    }
  }

  async removeRamAccessKey(userName: string, accessKeyId: string): Promise<void> {
    await this.ramClient().deleteAccessKey(
      new DeleteAccessKeyRequest({ userName, userAccessKeyId: accessKeyId })
    )
  }

  async removeRamUser(userName: string): Promise<void> {
    const client = this.ramClient()
    const policies = await client.listPoliciesForUser(new ListPoliciesForUserRequest({ userName }))
    for (const policy of policies.body?.policies?.policy || []) {
      if (policy.policyName && policy.policyType) {
        await client.detachPolicyFromUser(
          new DetachPolicyFromUserRequest({
            userName,
            policyName: policy.policyName,
            policyType: policy.policyType
          })
        )
      }
    }
    for (const key of await this.listRamAccessKeys(userName)) {
      await this.removeRamAccessKey(userName, key.accessKeyId)
    }
    await client.deleteUser(new DeleteUserRequest({ userName }))
  }

  async listBuckets(): Promise<BucketInfo[]> {
    const result = await this.client().listBuckets()
    const buckets = (result.buckets || []).map((bucket) => ({
      name: bucket.name,
      region: bucket.region,
      creationDate: bucket.creationDate,
      storageClass: bucket.storageClass
    }))
    this.bucketRegions.clear()
    for (const bucket of buckets) {
      if (bucket.region) this.bucketRegions.set(bucket.name, bucket.region)
    }
    return buckets
  }

  async getBucketStorageStat(name: string): Promise<BucketStorageStat> {
    const client = this.bucketClient(name) as unknown as {
      getBucketStat: (
        bucket: string,
        options: Record<string, never>
      ) => Promise<{ stat: Record<string, string | number | undefined> }>
    }
    const { stat: bucketStat } = await client.getBucketStat(name, {})
    const numberValue = (...keys: string[]): number => {
      const value = keys.map((key) => bucketStat[key]).find((item) => item !== undefined)
      return Number(value || 0)
    }

    return {
      storage: numberValue('Storage'),
      objectCount: numberValue('ObjectCount'),
      standardStorage: numberValue('StandardStorage'),
      standardObjectCount: numberValue('StandardObjectCount'),
      infrequentAccessStorage: numberValue(
        'InfrequentAccessRealStorage',
        'InfrequentAccessStorage'
      ),
      infrequentAccessObjectCount: numberValue('InfrequentAccessObjectCount'),
      archiveStorage: numberValue('ArchiveRealStorage', 'ArchiveStorage'),
      archiveObjectCount: numberValue('ArchiveObjectCount'),
      coldArchiveStorage: numberValue('ColdArchiveRealStorage', 'ColdArchiveStorage'),
      coldArchiveObjectCount: numberValue('ColdArchiveObjectCount'),
      deepColdArchiveStorage: numberValue('DeepColdArchiveRealStorage', 'DeepColdArchiveStorage'),
      deepColdArchiveObjectCount: numberValue('DeepColdArchiveObjectCount'),
      lastModifiedTime: numberValue('LastModifiedTime')
    }
  }

  async createBucket(name: string, region: string, acl: string): Promise<void> {
    const client = this.client() as unknown as {
      putBucket: (name: string, options: Record<string, string>) => Promise<unknown>
      putBucketACL: (name: string, acl: string) => Promise<unknown>
    }
    await client.putBucket(name, { region })
    if (acl) await client.putBucketACL(name, acl)
  }

  async getBucketAcl(name: string): Promise<string> {
    const result = await this.bucketClient(name).getBucketACL(name)
    return result.acl
  }

  async removeBucket(name: string): Promise<void> {
    await this.bucketClient(name).deleteBucket(name)
  }

  async setBucketAcl(name: string, acl: string): Promise<void> {
    await this.bucketClient(name).putBucketACL(name, acl)
  }

  async listObjects(bucket: string, prefix: string, marker?: string): Promise<ObjectListResult> {
    const result = await this.bucketClient(bucket).list({
      prefix,
      delimiter: '/',
      marker,
      'max-keys': this.settings.listPageSize
    })
    const directories: ObjectInfo[] = (result.prefixes || []).map((name) => ({
      name,
      displayName: name.slice(prefix.length).replace(/\/$/, ''),
      size: 0,
      isDirectory: true
    }))
    const files: ObjectInfo[] = (result.objects || [])
      .filter((object) => object.name !== prefix)
      .map((object) => ({
        name: object.name,
        displayName: object.name.slice(prefix.length),
        size: object.size,
        lastModified: object.lastModified,
        etag: object.etag,
        storageClass: object.storageClass,
        isDirectory: object.name.endsWith('/'),
        restoreInfo: object.restoreInfo
      }))

    return {
      objects: [...directories, ...files],
      nextMarker: result.nextMarker,
      isTruncated: Boolean(result.isTruncated)
    }
  }

  async createFolder(bucket: string, path: string): Promise<void> {
    await this.bucketClient(bucket).put(path.endsWith('/') ? path : `${path}/`, Buffer.alloc(0))
  }

  async removeObjects(bucket: string, names: string[]): Promise<void> {
    const client = this.bucketClient(bucket)
    const expanded: string[] = []
    for (const name of names) {
      if (name.endsWith('/')) expanded.push(...(await this.listAllObjectNames(client, name)))
      else expanded.push(name)
    }
    for (let index = 0; index < expanded.length; index += 1000) {
      await client.deleteMulti(expanded.slice(index, index + 1000), { quiet: true })
    }
  }

  async copyObject(bucket: string, source: string, target: string): Promise<void> {
    const client = this.bucketClient(bucket)
    if (source === target) throw new Error('源路径和目标路径不能相同')

    try {
      if (!source.endsWith('/')) {
        await client.copy(target, source, {
          headers: { 'x-oss-forbid-overwrite': 'true' }
        })
        return
      }
      const names = await this.listAllObjectNames(client, source)
      for (const name of names)
        await client.copy(`${target}${name.slice(source.length)}`, name, {
          headers: { 'x-oss-forbid-overwrite': 'true' }
        })
    } catch (error) {
      if ((error as { code?: string }).code === 'FileAlreadyExists')
        throw new Error('目标对象已存在，不能覆盖')
      throw error
    }
  }

  async transferObjects(
    sourceBucket: string,
    items: ObjectInfo[],
    targetPath: string,
    move: boolean
  ): Promise<void> {
    const { bucket: targetBucket, prefix: rawTargetPrefix } = this.parseOssPath(targetPath)
    const targetPrefix =
      rawTargetPrefix && !rawTargetPrefix.endsWith('/') ? `${rawTargetPrefix}/` : rawTargetPrefix
    const sourceClient = this.bucketClient(sourceBucket)
    const targetClient = this.bucketClient(targetBucket)

    for (const item of items) {
      const sourceNames = item.isDirectory
        ? await this.listAllObjectNames(sourceClient, item.name)
        : [item.name]
      const baseName = item.displayName.replace(/\/$/, '')
      for (const sourceName of sourceNames) {
        const suffix = item.isDirectory ? sourceName.slice(item.name.length) : ''
        const targetName = item.isDirectory
          ? `${targetPrefix}${baseName}/${suffix}`
          : `${targetPrefix}${baseName}`
        if (sourceBucket === targetBucket && sourceName === targetName) {
          throw new Error('源路径和目标路径不能相同')
        }
        await targetClient.copy(targetName, sourceName, sourceBucket)
      }
    }

    if (move)
      await this.removeObjects(
        sourceBucket,
        items.map((item) => item.name)
      )
  }

  async createSymlink(bucket: string, name: string, target: string): Promise<void> {
    await this.bucketClient(bucket).putSymlink(name, target)
  }

  async restoreObjects(bucket: string, names: string[], days: number): Promise<void> {
    const client = this.bucketClient(bucket)
    for (const name of names) {
      if (!name.endsWith('/')) await client.restore(name, { Days: days, type: 'Archive' })
    }
  }

  async getObjectDetails(bucket: string, name: string): Promise<ObjectDetails> {
    const result = await this.bucketClient(bucket).head(name)
    return {
      headers: Object.fromEntries(
        Object.entries(result.res.headers || {}).map(([key, value]) => [key, String(value)])
      ),
      metadata: Object.fromEntries(
        Object.entries(result.meta || {}).map(([key, value]) => [key, String(value)])
      )
    }
  }

  async listCnameDomains(bucket: string): Promise<string[]> {
    const client = this.bucketClient(bucket) as unknown as {
      request: (params: Record<string, unknown>) => Promise<{ data: unknown }>
      parseXML: (
        data: unknown
      ) => Promise<{ Cname?: Array<{ Domain?: string }> | { Domain?: string } }>
    }
    const result = await client.request({
      method: 'GET',
      bucket,
      subres: 'cname',
      successStatuses: [200]
    })
    const parsed = await client.parseXML(result.data)
    const records = parsed.Cname
      ? Array.isArray(parsed.Cname)
        ? parsed.Cname
        : [parsed.Cname]
      : []
    return records.map((record) => record.Domain || '').filter(Boolean)
  }

  async refreshCdnCache(request: CacheRefreshRequest): Promise<string> {
    const response = await this.cdnClient().refreshObjectCaches(
      new RefreshObjectCachesRequest({
        objectPath: request.objectPath,
        objectType: request.objectType,
        force: request.force
      })
    )
    return response.body?.refreshTaskId || response.body?.requestId || ''
  }

  async listCdnDomains(): Promise<string[]> {
    const domains: string[] = []
    let pageNumber = 1
    let totalCount = 0
    let fetchedCount = 0
    do {
      const response = await this.cdnClient().describeUserDomains(
        new DescribeUserDomainsRequest({ pageNumber, pageSize: 50 })
      )
      const body = response.body
      const pageData = body?.domains?.pageData || []
      fetchedCount += pageData.length
      domains.push(
        ...pageData
          .filter((item) => item.domainStatus === 'online')
          .map((item) => item.domainName || '')
          .filter(Boolean)
      )
      totalCount = body?.totalCount || 0
      pageNumber += 1
    } while (fetchedCount < totalCount)
    return domains
  }

  private cdnClient(): CdnModule {
    if (!this.auth) throw new Error('请先登录')
    const CdnClient = (CdnModule as unknown as { default: typeof CdnModule }).default
    return new CdnClient(
      new $OpenApiUtil.Config({
        accessKeyId: this.auth.accessKeyId,
        accessKeySecret: this.auth.accessKeySecret,
        securityToken: this.auth.stsToken,
        endpoint: 'cdn.aliyuncs.com'
      })
    )
  }

  async setObjectAcl(bucket: string, name: string, acl: string): Promise<void> {
    await this.bucketClient(bucket).putACL(name, acl)
  }

  async isObjectPublic(bucket: string, name: string): Promise<boolean> {
    const region = this.bucketRegions.get(bucket)
    if (!region) return false
    const objectPath = name
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')
    const protocol = this.auth?.secure === false ? 'http' : 'https'
    try {
      const response = await fetch(`${protocol}://${bucket}.${region}.aliyuncs.com/${objectPath}`, {
        headers: { Range: 'bytes=0-1', 'Cache-Control': 'no-cache' }
      })
      return response.ok
    } catch {
      return false
    }
  }

  async setObjectHeaders(
    bucket: string,
    name: string,
    headers: Record<string, string>
  ): Promise<void> {
    await this.bucketClient(bucket).copy(name, name, { headers })
  }

  signedUrl(bucket: string, name: string, expires: number, process?: string): string {
    return this.bucketClient(bucket).signatureUrl(name, { expires, process })
  }

  async getImageDimensions(bucket: string, name: string): Promise<ImageDimensions> {
    const result = await this.bucketClient(bucket).get(name, { process: 'image/info' })
    const info = JSON.parse(result.content.toString('utf8')) as {
      ImageWidth?: { value?: string }
      ImageHeight?: { value?: string }
    }
    const width = Number(info.ImageWidth?.value)
    const height = Number(info.ImageHeight?.value)
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error('OSS 未返回有效的图片分辨率')
    }
    return { width, height }
  }

  async readText(bucket: string, name: string): Promise<string> {
    const result = await this.bucketClient(bucket).get(name)
    return result.content.toString('utf8')
  }

  async saveText(bucket: string, name: string, content: string): Promise<void> {
    await this.bucketClient(bucket).put(name, Buffer.from(content, 'utf8'))
  }

  async listMultipart(bucket: string): Promise<MultipartUploadInfo[]> {
    const result = await this.bucketClient(bucket).listUploads({ 'max-uploads': 1000 })
    return (result.uploads || []).map((upload) => ({
      name: upload.name,
      uploadId: upload.uploadId,
      initiated: upload.initiated
    }))
  }

  async abortMultipart(bucket: string, name: string, uploadId: string): Promise<void> {
    await this.bucketClient(bucket).abortMultipartUpload(name, uploadId)
  }

  async findUploadConflicts(
    bucket: string,
    prefix: string,
    paths: string[]
  ): Promise<UploadPreparation> {
    this.localMediaPreviews.clear()
    const entries = await this.prepareUploadEntries(prefix, paths)
    const files = entries.filter((entry) => !entry.isDirectory)
    const client = this.bucketClient(bucket)
    const conflictNames = new Set<string>()
    const directFiles: UploadEntry[] = []
    const directoryFiles = new Map<string, UploadEntry[]>()
    for (const file of files) {
      const separatorIndex = file.relativePath.indexOf(sep)
      if (separatorIndex === -1) {
        directFiles.push(file)
        continue
      }
      const rootName = file.relativePath.slice(0, separatorIndex)
      const rootPrefix = `${prefix}${rootName}/`
      const group = directoryFiles.get(rootPrefix) || []
      group.push(file)
      directoryFiles.set(rootPrefix, group)
    }

    const conflictConcurrency = Math.min(10, Math.max(2, this.settings.maxUploadJobs * 2))
    const checks: Array<() => Promise<void>> = directFiles.map((file) => async () => {
      const result = await client.list({ prefix: file.name, 'max-keys': 1 })
      if ((result.objects || []).some((object) => object.name === file.name)) {
        conflictNames.add(file.name)
      }
    })
    checks.push(
      ...[...directoryFiles].map(([rootPrefix, group]) => async () => {
        const existingNames = new Set(await this.listAllObjectNames(client, rootPrefix))
        for (const file of group) {
          if (existingNames.has(file.name)) conflictNames.add(file.name)
        }
      })
    )
    await this.runPool(checks, conflictConcurrency, async (check) => {
      await check()
    })
    const returnedNames = new Set<string>()
    const conflicts = files.flatMap((file) => {
      if (!conflictNames.has(file.name) || returnedNames.has(file.name)) return []
      returnedNames.add(file.name)
      const conflict: UploadConflict = { name: file.name, displayName: file.relativePath }
      if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) {
        const image = nativeImage.createFromPath(file.localPath)
        if (!image.isEmpty()) {
          const { width, height } = image.getSize()
          const scale = Math.min(480 / width, 320 / height, 1)
          const preview =
            scale < 1
              ? image.resize({
                  width: Math.max(1, Math.round(width * scale)),
                  height: Math.max(1, Math.round(height * scale)),
                  quality: 'good'
                })
              : image
          conflict.incomingPreviewUrl = preview.toDataURL()
          conflict.previewType = 'image'
          conflict.existingPreviewUrl = client.signatureUrl(file.name, {
            expires: 300,
            process: 'image/resize,m_lfit,w_480,h_320/quality,q_80'
          })
        }
      } else if (/\.(mp4|mov|mkv|webm|avi|m4v|flv|wmv|mpeg|mpg)$/i.test(file.name)) {
        const previewToken = randomUUID()
        this.localMediaPreviews.set(previewToken, {
          localPath: file.localPath,
          expiresAt: Date.now() + 60 * 60 * 1000
        })
        conflict.previewType = 'video'
        conflict.existingPreviewUrl = client.signatureUrl(file.name, { expires: 3600 })
        conflict.incomingPreviewUrl = `oss-browser-media://upload/${previewToken}`
      }
      return [conflict]
    })
    const id = randomUUID()
    this.preparedUploads.set(id, { bucket, prefix, paths: [...paths], entries })
    return { id, conflicts }
  }

  discardUploadPreparation(id: string): void {
    this.preparedUploads.delete(id)
  }

  resolveLocalMediaPreview(token: string): string | undefined {
    const preview = this.localMediaPreviews.get(token)
    if (!preview) return undefined
    if (preview.expiresAt <= Date.now()) {
      this.localMediaPreviews.delete(token)
      return undefined
    }
    return preview.localPath
  }

  async upload(
    bucket: string,
    prefix: string,
    paths: string[],
    options: UploadOptions = {},
    onBatchCreated?: (batchId: string) => void
  ): Promise<boolean> {
    const skippedNames = new Set(options.skipNames || [])
    const prepared = options.preparationId
      ? this.preparedUploads.get(options.preparationId)
      : undefined
    if (options.preparationId) this.preparedUploads.delete(options.preparationId)
    if (
      prepared &&
      (prepared.bucket !== bucket ||
        prepared.prefix !== prefix ||
        prepared.paths.length !== paths.length ||
        prepared.paths.some((path, index) => path !== paths[index]))
    ) {
      throw new Error('上传准备结果与当前任务不匹配')
    }
    const entries = prepared?.entries || (await this.prepareUploadEntries(prefix, paths))
    const files = entries.filter((file) => !skippedNames.has(file.name))
    if (!files.length) return true
    const batch = this.newTransferBatch('upload', files.length)
    onBatchCreated?.(batch.id)

    await this.runPool(
      files,
      this.settings.maxUploadJobs,
      async ({ localPath, isDirectory, name }) => {
        const transfer = this.newTransfer('upload', name, batch)
        const client = this.bucketClient(bucket)
        if (isDirectory) {
          await this.runControlledTransfer(transfer, client, async () => {
            await client.put(name, Buffer.alloc(0))
          })
          return
        }
        const checkpointPath = this.checkpointPath(bucket, name, localPath)
        await this.runControlledTransfer(transfer, client, async () => {
          const fileSize = (await stat(localPath)).size
          if (fileSize <= this.settings.partSizeMb * 1024 * 1024) {
            await client.put(name, localPath)
            await rm(checkpointPath, { force: true })
            return
          }
          const checkpoint = await this.readCheckpoint(checkpointPath)
          await client.multipartUpload(name, localPath, {
            checkpoint,
            parallel: this.settings.multipartParallel,
            partSize: this.settings.partSizeMb * 1024 * 1024,
            progress: async (progress: number, nextCheckpoint: unknown) => {
              this.updateTransfer(transfer, progress, 'running')
              if (nextCheckpoint) await writeFile(checkpointPath, JSON.stringify(nextCheckpoint))
            }
          })
          await rm(checkpointPath, { force: true })
        })
      }
    )
    if (batch.cancelled) return false
    if (batch.failed.size) return false
    return true
  }

  async download(bucket: string, items: ObjectInfo[], destination: string): Promise<boolean> {
    const listClient = this.bucketClient(bucket)
    const objects: Array<{ name: string; relativePath: string }> = []
    for (const item of items) {
      if (item.isDirectory) {
        const folderName = item.displayName.replace(/\/$/, '')
        for (const name of await this.listAllObjectNames(listClient, item.name)) {
          if (!name.endsWith('/')) {
            const subPath = name.slice(item.name.length)
            objects.push({ name, relativePath: `${folderName}/${subPath}` })
          }
        }
      } else {
        objects.push({ name: item.name, relativePath: item.displayName })
      }
    }
    const batch = this.newTransferBatch('download', objects.length)

    await this.runPool(objects, this.settings.maxDownloadJobs, async (object) => {
      const localPath = join(destination, ...object.relativePath.split('/'))
      const pathFromDestination = relative(destination, localPath)
      if (
        pathFromDestination === '..' ||
        pathFromDestination.startsWith(`..${sep}`) ||
        isAbsolute(pathFromDestination)
      ) {
        throw new Error('下载文件路径无效，检测到越界穿越风险')
      }
      const partialPath = `${localPath}.ossbrowser.part`
      const checkpointPath = `${partialPath}.json`
      const transfer = this.newTransfer('download', object.name, batch)
      const client = this.bucketClient(bucket)
      await this.runControlledTransfer(transfer, client, async () => {
        await mkdir(join(localPath, '..'), { recursive: true })
        const metadata = await client.getObjectMeta(object.name)
        const total = Number(metadata.res.headers['content-length'] || 0)
        const etag = String(metadata.res.headers.etag || '')
        if (!Number.isSafeInteger(total) || total < 0) throw new Error('OSS 返回的对象大小无效')
        if (!etag) throw new Error('OSS 未返回对象 ETag，无法安全执行并行下载')

        if (total === 0) {
          await writeFile(partialPath, '')
          await rm(checkpointPath, { force: true })
          await rm(localPath, { force: true })
          await rename(partialPath, localPath)
          return
        }

        let partialSize = 0
        try {
          partialSize = (await stat(partialPath)).size
        } catch {
          partialSize = 0
        }

        let checkpointExists = false
        let checkpoint: DownloadCheckpoint | undefined
        try {
          checkpointExists = true
          const parsed = JSON.parse(await readFile(checkpointPath, 'utf8')) as DownloadCheckpoint
          const maxCompletedEnd = Array.isArray(parsed.completed)
            ? parsed.completed.reduce((maximum, range) => Math.max(maximum, range.end), 0)
            : 0
          const validRanges =
            Array.isArray(parsed.completed) &&
            parsed.completed.every(
              (range) =>
                Number.isSafeInteger(range.start) &&
                Number.isSafeInteger(range.end) &&
                range.start >= 0 &&
                range.start < range.end &&
                range.end <= total
            )
          if (
            parsed.version === 1 &&
            parsed.total === total &&
            parsed.etag === etag &&
            Number.isSafeInteger(parsed.partSize) &&
            parsed.partSize > 0 &&
            validRanges &&
            partialSize >= maxCompletedEnd
          ) {
            checkpoint = parsed
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') checkpointExists = false
        }

        if (!checkpoint) {
          if (checkpointExists || partialSize > 0) {
            await rm(partialPath, { force: true })
            partialSize = 0
          }
          checkpoint = {
            version: 1,
            total,
            etag,
            partSize: Math.max(this.settings.partSizeMb * 1024 * 1024, Math.ceil(total / 10_000)),
            completed: []
          }
        }

        const completed = [...checkpoint.completed].sort((a, b) => a.start - b.start)
        for (let index = 1; index < completed.length; index += 1) {
          if (completed[index].start < completed[index - 1].end) {
            await rm(partialPath, { force: true })
            completed.splice(0, completed.length)
            break
          }
        }
        checkpoint.completed = completed
        await writeFile(checkpointPath, JSON.stringify(checkpoint))
        try {
          await stat(partialPath)
        } catch {
          await writeFile(partialPath, Buffer.alloc(0))
        }

        const pending: DownloadRange[] = []
        const appendPending = (start: number, end: number): void => {
          for (let offset = start; offset < end; offset += checkpoint.partSize) {
            pending.push({ start: offset, end: Math.min(end, offset + checkpoint.partSize) })
          }
        }
        let cursor = 0
        for (const range of completed) {
          if (cursor < range.start) appendPending(cursor, range.start)
          cursor = range.end
        }
        if (cursor < total) appendPending(cursor, total)

        let completedBytes = completed.reduce((sum, range) => sum + range.end - range.start, 0)
        this.updateTransfer(transfer, completedBytes / total, 'running')
        const activeBytes = new Map<number, number>()
        const activeStreams = new Set<{ destroy: (error?: Error) => void }>()
        let abortError: Error | undefined
        transfer.cancelOperation = () => {
          abortError = new Error('cancel')
          abortError.name = 'CancelError'
          for (const stream of activeStreams) stream.destroy(abortError)
        }

        const file = await open(partialPath, 'r+')
        let checkpointWrite = Promise.resolve()
        const persistCheckpoint = (): Promise<void> => {
          checkpointWrite = checkpointWrite.then(() =>
            writeFile(
              checkpointPath,
              JSON.stringify({
                ...checkpoint,
                completed: [...completed].sort((a, b) => a.start - b.start)
              })
            )
          )
          return checkpointWrite
        }
        const queue = [...pending]
        let workerFailed = false
        let workerError: unknown
        const stopWorkers = (error: unknown): void => {
          if (workerFailed) return
          workerFailed = true
          workerError = error
          const streamError = error instanceof Error ? error : new Error(String(error))
          for (const stream of activeStreams) stream.destroy(streamError)
        }

        try {
          const workers = Array.from(
            { length: Math.min(this.settings.multipartParallel, queue.length) },
            async () => {
              while (queue.length && !workerFailed) {
                const range = queue.shift()
                if (!range) return
                if (abortError) {
                  stopWorkers(abortError)
                  return
                }
                try {
                  const result = await client.getStream(object.name, {
                    headers: {
                      Range: `bytes=${range.start}-${range.end - 1}`,
                      ...(etag ? { 'If-Match': etag } : {})
                    }
                  })
                  const stream = result.stream as typeof result.stream & AsyncIterable<Buffer>
                  activeStreams.add(stream)
                  if (abortError) stream.destroy(abortError)
                  let position = range.start
                  activeBytes.set(range.start, 0)
                  try {
                    for await (const chunk of stream) {
                      let written = 0
                      while (written < chunk.length) {
                        const result = await file.write(
                          chunk,
                          written,
                          chunk.length - written,
                          position + written
                        )
                        if (!result.bytesWritten) throw new Error('下载文件写入未取得进展')
                        written += result.bytesWritten
                      }
                      position += chunk.length
                      activeBytes.set(range.start, position - range.start)
                      const activeDownloaded = [...activeBytes.values()].reduce(
                        (sum, value) => sum + value,
                        0
                      )
                      this.updateTransfer(
                        transfer,
                        Math.min(1, (completedBytes + activeDownloaded) / total),
                        'running'
                      )
                    }
                  } finally {
                    activeStreams.delete(stream)
                    activeBytes.delete(range.start)
                  }
                  if (position !== range.end) throw new Error('下载分片长度与预期不一致')
                  completed.push(range)
                  completedBytes += range.end - range.start
                  await persistCheckpoint()
                } catch (error) {
                  stopWorkers(error)
                }
              }
            }
          )
          await Promise.all(workers)
          if (workerFailed) throw workerError
          if (completedBytes !== total) throw new Error('下载文件分片不完整')
        } finally {
          await file.close()
        }

        if ((await stat(partialPath)).size !== total) throw new Error('下载文件大小与预期不一致')
        await rm(checkpointPath, { force: true })
        await rm(localPath, { force: true })
        await rename(partialPath, localPath)
      })
    })
    if (batch.cancelled) return false
    if (batch.failed.size) return false
    return true
  }

  private client(bucket?: string): OssClient {
    if (!this.auth) throw new Error('请先登录')
    const endpoint =
      this.auth.endpointMode === 'public' && bucket && this.bucketRegions.has(bucket)
        ? `${this.bucketRegions.get(bucket)}.aliyuncs.com`
        : this.auth.endpoint.replace(/^https?:\/\//, '')
    return new OSS({
      accessKeyId: this.auth.accessKeyId,
      accessKeySecret: this.auth.accessKeySecret,
      stsToken: this.auth.stsToken,
      endpoint,
      secure: this.auth.secure,
      cname: this.auth.endpointMode === 'cname',
      timeout: this.settings.timeoutSeconds * 1000,
      retryMax: this.settings.retryTimes,
      bucket
    })
  }

  private ramClient(): RamClient {
    if (!this.auth) throw new Error('请先登录')
    return new RamClient(
      new $OpenApiUtil.Config({
        accessKeyId: this.auth.accessKeyId,
        accessKeySecret: this.auth.accessKeySecret,
        securityToken: this.auth.stsToken,
        endpoint: 'ram.aliyuncs.com'
      })
    )
  }

  private stsClient(): StsClient {
    if (!this.auth) throw new Error('请先登录')
    return new StsClient(
      new $OpenApiUtil.Config({
        accessKeyId: this.auth.accessKeyId,
        accessKeySecret: this.auth.accessKeySecret,
        securityToken: this.auth.stsToken,
        endpoint: 'sts.aliyuncs.com'
      })
    )
  }

  private parseOssPath(path: string): { bucket: string; prefix: string } {
    const match = /^oss:\/\/([^/]+)\/?(.*)$/.exec(path.trim())
    if (!match) throw new Error('预设 OSS 路径格式不正确')
    return { bucket: match[1], prefix: match[2] }
  }

  private bucketClient(bucket: string): OssClient {
    return this.client(bucket)
  }

  private async discoverPublicBucketRegion(bucket: string): Promise<void> {
    if (!this.auth) throw new Error('请先登录')
    const endpoint = this.auth.endpoint.replace(/^https?:\/\//, '')
    const response = await fetch(
      `${this.auth.secure ? 'https' : 'http'}://${bucket}.${endpoint}/?location`
    )
    const body = await response.text()
    const endpointMatch = /<Endpoint>([^<]+)<\/Endpoint>/.exec(body)
    if (!endpointMatch) return
    const region = endpointMatch[1].replace(/\.aliyuncs\.com$/, '')
    if (region) this.bucketRegions.set(bucket, region)
  }

  private async listAllObjectNames(client: OssClient, prefix: string): Promise<string[]> {
    const names: string[] = []
    let marker: string | undefined
    do {
      const result = await client.list({ prefix, marker, 'max-keys': 1000 })
      names.push(...(result.objects || []).map((object) => object.name))
      marker = result.isTruncated ? result.nextMarker : undefined
    } while (marker)
    return names
  }

  private async expandLocalPaths(
    paths: string[]
  ): Promise<Array<{ localPath: string; relativePath: string; isDirectory: boolean }>> {
    const files: Array<{ localPath: string; relativePath: string; isDirectory: boolean }> = []
    for (const path of paths) {
      const pathStat = await stat(path)
      if (pathStat.isFile())
        files.push({ localPath: path, relativePath: basename(path), isDirectory: false })
      else {
        const children = await this.walk(path)
        files.push(
          ...children.map((entry) => ({
            localPath: entry.path,
            relativePath: join(basename(path), relative(path, entry.path)),
            isDirectory: entry.isDirectory
          }))
        )
      }
    }
    return files
  }

  private async prepareUploadEntries(prefix: string, paths: string[]): Promise<UploadEntry[]> {
    return (await this.expandLocalPaths(paths)).map((file) => ({
      ...file,
      name: `${prefix}${file.relativePath.split(sep).join('/')}${file.isDirectory ? '/' : ''}`
    }))
  }

  private async walk(directory: string): Promise<Array<{ path: string; isDirectory: boolean }>> {
    const entries = await readdir(directory, { withFileTypes: true })
    if (!entries.length) return [{ path: directory, isDirectory: true }]
    const files: Array<{ path: string; isDirectory: boolean }> = []
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) files.push(...(await this.walk(path)))
      else if (entry.isFile()) files.push({ path, isDirectory: false })
    }
    return files
  }

  private async runPool<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>
  ): Promise<void> {
    const queue = [...items]
    const workers = Array.from(
      { length: Math.min(Math.max(concurrency, 1), queue.length) },
      async () => {
        while (queue.length) {
          const item = queue.shift()
          if (item !== undefined) await worker(item)
        }
      }
    )
    await Promise.all(workers)
  }

  cancelTransfer(id: string): void {
    const transfer = this.activeTransfers.get(id)
    if (!transfer) return
    transfer.cancelRequested = true
    transfer.cancelOperation()
  }

  pauseAllTransfers(direction: TransferDirection): void {
    this.pausedDirections.add(direction)
    for (const transfer of this.activeTransfers.values()) {
      if (transfer.direction === direction) transfer.cancelOperation()
    }
  }

  resumeAllTransfers(direction: TransferDirection): void {
    this.pausedDirections.delete(direction)
    this.wakeDirection(direction)
    const retries = [...this.retryTransfers.entries()].filter(
      ([, retry]) => retry.direction === direction
    )
    for (const [id] of retries) this.retryTransfers.delete(id)
    const concurrency =
      direction === 'upload' ? this.settings.maxUploadJobs : this.settings.maxDownloadJobs
    void this.runPool(retries, concurrency, async ([, retry]) => retry.run()).catch((error) => {
      console.error(`[transfers] Failed to resume ${direction} tasks`, error)
    })
  }

  cancelAllTransfers(direction: TransferDirection): void {
    for (const batch of this.transferBatches.values()) {
      if (batch.direction !== direction) continue
      batch.cancelled = true
      batch.hidden = true
    }
    for (const [id, retry] of this.retryTransfers) {
      if (retry.direction === direction) this.retryTransfers.delete(id)
    }
    this.pausedDirections.delete(direction)
    this.wakeDirection(direction)
    for (const transfer of this.activeTransfers.values()) {
      if (transfer.direction === direction) transfer.cancelOperation()
    }
  }

  private resetActiveTransfers(): void {
    this.transferGeneration += 1
    for (const batch of this.transferBatches.values()) {
      batch.cancelled = true
      batch.hidden = true
    }
    this.pausedDirections.clear()
    this.wakeDirection('upload')
    this.wakeDirection('download')
    for (const transfer of this.activeTransfers.values()) transfer.cancelOperation()
    this.activeTransfers.clear()
    this.retryTransfers.clear()
    this.transferBatches.clear()
  }

  private checkpointPath(bucket: string, name: string, localPath: string): string {
    const hash = createHash('sha256').update(`${bucket}\n${name}\n${localPath}`).digest('hex')
    return join(app.getPath('userData'), 'upload-checkpoints', `${hash}.json`)
  }

  private async readCheckpoint(path: string): Promise<unknown> {
    await mkdir(join(path, '..'), { recursive: true })
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch {
      return undefined
    }
  }

  private isCancelError(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'name' in error &&
      (error.name === 'CancelError' || error.name === 'cancel')
    )
  }

  private newTransferBatch(direction: TransferDirection, total: number): TransferBatch {
    const batch: TransferBatch = {
      id: randomUUID(),
      direction,
      total,
      done: 0,
      failed: new Set(),
      cancelled: false,
      hidden: false
    }
    this.transferBatches.set(batch.id, batch)
    return batch
  }

  private async runControlledTransfer(
    transfer: ActiveTransfer,
    client: OssClient,
    operation: () => Promise<void>
  ): Promise<void> {
    while (!transfer.batch.cancelled) {
      await this.waitWhilePaused(transfer.direction)
      if (transfer.batch.cancelled) return
      transfer.cancelRequested = false
      transfer.error = undefined
      if (transfer.status !== 'running') {
        this.updateTransfer(transfer, transfer.progress, 'running')
      }
      transfer.cancelOperation = () => client.cancel()
      this.activeTransfers.set(transfer.id, transfer)
      try {
        await operation()
        transfer.batch.failed.delete(transfer.id)
        this.retryTransfers.delete(transfer.id)
        this.updateTransfer(transfer, 1, 'done')
        return
      } catch (error) {
        if (this.isCancelError(error)) {
          if (transfer.batch.cancelled) return
          if (transfer.cancelRequested) {
            this.updateTransfer(transfer, transfer.progress, 'cancelled')
            return
          }
          if (this.pausedDirections.has(transfer.direction)) {
            this.updateTransfer(transfer, transfer.progress, 'paused')
            continue
          }
        }
        this.failTransfer(transfer, error)
        this.retryTransfers.set(transfer.id, {
          direction: transfer.direction,
          run: () => this.runControlledTransfer(transfer, client, operation)
        })
        return
      } finally {
        this.activeTransfers.delete(transfer.id)
      }
    }
  }

  private async waitWhilePaused(direction: TransferDirection): Promise<void> {
    if (!this.pausedDirections.has(direction)) return
    await new Promise<void>((resolve) => this.pauseWaiters[direction].push(resolve))
  }

  private wakeDirection(direction: TransferDirection): void {
    const waiters = this.pauseWaiters[direction].splice(0)
    for (const resolve of waiters) resolve()
  }

  private newTransfer(
    direction: TransferItem['direction'],
    name: string,
    batch: TransferBatch
  ): ActiveTransfer {
    const transfer: ActiveTransfer = {
      id: randomUUID(),
      direction,
      name,
      progress: 0,
      status: 'running',
      generation: this.transferGeneration,
      batch,
      cancelRequested: false,
      cancelOperation: () => undefined,
      lastProgressReportAt: Date.now()
    }
    this.reportActiveTransfer(transfer)
    return transfer
  }

  private updateTransfer(
    transfer: ActiveTransfer,
    progress: number,
    status: TransferItem['status']
  ): void {
    const statusChanged = transfer.status !== status
    if (status === 'done' && transfer.status !== 'done') transfer.batch.done += 1
    transfer.progress = progress
    transfer.status = status
    const now = Date.now()
    if (status === 'running' && !statusChanged && now - transfer.lastProgressReportAt < 100) return
    transfer.lastProgressReportAt = now
    this.reportActiveTransfer(transfer)
  }

  private failTransfer(transfer: ActiveTransfer, error: unknown): void {
    transfer.batch.failed.add(transfer.id)
    transfer.status = 'error'
    transfer.error = error instanceof Error ? error.message : String(error)
    this.reportActiveTransfer(transfer)
  }

  private reportActiveTransfer(transfer: ActiveTransfer): void {
    if (transfer.generation !== this.transferGeneration || transfer.batch.hidden) return
    this.reportTransfer({
      id: transfer.id,
      batchId: transfer.batch.id,
      batchTotal: transfer.batch.total,
      batchDone: transfer.batch.done,
      direction: transfer.direction,
      name: transfer.name,
      progress: transfer.progress,
      status: transfer.status,
      error: transfer.error
    })
  }
}
