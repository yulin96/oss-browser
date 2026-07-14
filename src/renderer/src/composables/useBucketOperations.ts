import { ref, type Ref } from 'vue'

import type { BucketInfo, MultipartUploadInfo } from '../../../shared/types'
import type { ConfirmationRequest } from './useConfirmation'
import { t } from '../i18n'

type RunTask = <T>(task: () => Promise<T>) => Promise<T | undefined>

export function useBucketOperations(options: {
  form: { name: string; region: string; acl: string }
  run: RunTask
  runBrowserTask: RunTask
  requestConfirmation: (request: ConfirmationRequest) => void
  getCurrentBucket: () => BucketInfo | null
  clearCurrentBucket: () => void
  refreshBuckets: () => Promise<void>
  setModal: (modal: 'bucket-acl' | 'multipart' | null) => void
  closeBucketMenu: () => void
  invalidateAddressAccess: (bucket: string) => void
  getError: () => string
  showToast: (message: string) => void
}): {
  multipartUploads: Ref<MultipartUploadInfo[]>
  multipartBucket: Ref<BucketInfo | null>
  bucketActionTarget: Ref<BucketInfo | null>
  resetBucketOperations: () => void
  openBucketAcl: (bucket: BucketInfo) => Promise<void>
  createBucket: () => Promise<void>
  deleteBucket: (bucket: BucketInfo) => void
  applyBucketAcl: () => Promise<void>
  openMultipart: (bucket: BucketInfo) => Promise<void>
  abortMultipart: (upload: MultipartUploadInfo) => void
} {
  const multipartUploads = ref<MultipartUploadInfo[]>([])
  const multipartBucket = ref<BucketInfo | null>(null)
  const bucketActionTarget = ref<BucketInfo | null>(null)

  function resetBucketOperations(): void {
    multipartUploads.value = []
    multipartBucket.value = null
    bucketActionTarget.value = null
  }

  async function openBucketAcl(bucket: BucketInfo): Promise<void> {
    bucketActionTarget.value = bucket
    options.closeBucketMenu()
    const acl = await options.runBrowserTask(() => window.ossBrowser.buckets.getAcl(bucket.name))
    if (!acl) return
    options.form.acl = acl
    options.setModal('bucket-acl')
  }

  async function createBucket(): Promise<void> {
    const done = await options.run(() =>
      window.ossBrowser.buckets.create(options.form.name, options.form.region, options.form.acl)
    )
    if (done === undefined && options.getError()) return
    options.setModal(null)
    await options.refreshBuckets()
    options.showToast(t('Bucket 创建成功'))
  }

  function deleteBucket(bucket: BucketInfo): void {
    options.requestConfirmation({
      title: t('删除 Bucket'),
      description: t('确定删除 Bucket「{name}」吗？Bucket 必须为空。', { name: bucket.name }),
      confirmLabel: t('删除'),
      destructive: true,
      action: () => performDeleteBucket(bucket)
    })
  }

  async function performDeleteBucket(bucket: BucketInfo): Promise<void> {
    const done = await options.run(() => window.ossBrowser.buckets.remove(bucket.name))
    if (done === undefined && options.getError()) return
    if (options.getCurrentBucket()?.name === bucket.name) options.clearCurrentBucket()
    await options.refreshBuckets()
  }

  async function applyBucketAcl(): Promise<void> {
    if (!bucketActionTarget.value) return
    const bucketName = bucketActionTarget.value.name
    const done = await options.run(() =>
      window.ossBrowser.buckets.setAcl(bucketName, options.form.acl)
    )
    if (done === undefined && options.getError()) return
    options.invalidateAddressAccess(bucketName)
    options.setModal(null)
    await options.refreshBuckets()
    options.showToast(t('Bucket 权限已保存'))
  }

  async function openMultipart(bucket: BucketInfo): Promise<void> {
    options.closeBucketMenu()
    const result = await options.runBrowserTask(() =>
      window.ossBrowser.buckets.listMultipart(bucket.name)
    )
    if (!result) return
    multipartBucket.value = bucket
    multipartUploads.value = result
    options.setModal('multipart')
  }

  function abortMultipart(upload: MultipartUploadInfo): void {
    options.requestConfirmation({
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
    const done = await options.run(() =>
      window.ossBrowser.buckets.abortMultipart(bucket.name, upload.name, upload.uploadId)
    )
    if (done === undefined && options.getError()) return
    await openMultipart(bucket)
    options.showToast(t('分片上传已终止'))
  }

  return {
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
  }
}
