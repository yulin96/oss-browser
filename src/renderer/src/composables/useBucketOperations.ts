import { computed, ref, type ComputedRef, type Ref } from 'vue'

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
  abortOldMultipart: () => void
  oldMultipartCount: ComputedRef<number>
  multipartBusy: Ref<boolean>
  multipartResult: Ref<string>
} {
  const multipartUploads = ref<MultipartUploadInfo[]>([])
  const multipartBucket = ref<BucketInfo | null>(null)
  const bucketActionTarget = ref<BucketInfo | null>(null)
  const multipartBusy = ref(false)
  const multipartResult = ref('')
  const oldMultipartCount = computed(
    () =>
      multipartUploads.value.filter(
        (upload) => Date.parse(upload.initiated || '') < Date.now() - 60 * 60 * 1000
      ).length
  )

  function resetBucketOperations(): void {
    multipartUploads.value = []
    multipartBucket.value = null
    bucketActionTarget.value = null
    multipartResult.value = ''
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
  }

  async function openMultipart(bucket: BucketInfo): Promise<void> {
    options.closeBucketMenu()
    const result = await options.runBrowserTask(() =>
      window.ossBrowser.buckets.listMultipart(bucket.name)
    )
    if (!result) return
    multipartBucket.value = bucket
    multipartUploads.value = result
    multipartResult.value = ''
    options.setModal('multipart')
  }

  function abortMultipart(upload: MultipartUploadInfo): void {
    if (multipartBusy.value) return
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
  }

  function abortOldMultipart(): void {
    const bucket = multipartBucket.value
    if (!bucket || multipartBusy.value) return
    const cutoff = Date.now() - 60 * 60 * 1000
    const uploads = multipartUploads.value.filter(
      (upload) => Date.parse(upload.initiated || '') < cutoff
    )
    if (!uploads.length) return
    options.requestConfirmation({
      title: t('批量终止分片上传'),
      description: t(
        '确定终止 {count} 个创建超过 1 小时的分片上传吗？最近 1 小时及创建时间未知的记录不会被终止。',
        { count: uploads.length }
      ),
      confirmLabel: t('终止'),
      destructive: true,
      action: async () => {
        if (multipartBusy.value) return
        multipartBusy.value = true
        try {
          const result = await options.run(() =>
            window.ossBrowser.buckets.abortMultipartBatch(bucket.name, uploads)
          )
          if (!result || multipartBucket.value?.name !== bucket.name) return
          const remaining = await options.run(() =>
            window.ossBrowser.buckets.listMultipart(bucket.name)
          )
          if (multipartBucket.value?.name !== bucket.name) return
          if (remaining) multipartUploads.value = remaining
          multipartResult.value = t('已终止 {aborted} 个，跳过 {skipped} 个，失败 {failed} 个', {
            aborted: result.aborted,
            skipped: result.skipped,
            failed: result.failed.length
          })
          if (result.failed.length)
            multipartResult.value +=
              '\n' + result.failed.map((item) => `${item.name}: ${item.error}`).join('\n')
        } finally {
          multipartBusy.value = false
        }
      }
    })
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
    abortMultipart,
    abortOldMultipart,
    oldMultipartCount,
    multipartBusy,
    multipartResult
  }
}
