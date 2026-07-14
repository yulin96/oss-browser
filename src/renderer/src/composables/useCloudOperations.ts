import { ref, type Ref } from 'vue'

import type {
  BucketInfo,
  ObjectDetails,
  ObjectInfo,
  PermissionProbeItem,
  RamAccessKey,
  RamUser
} from '../../../shared/types'
import type { ConfirmationRequest } from './useConfirmation'
import { t } from '../i18n'

type RunTask = <T>(task: () => Promise<T>) => Promise<T | undefined>

export function useCloudOperations(options: {
  run: RunTask
  runCloudTask: RunTask
  requestConfirmation: (request: ConfirmationRequest) => void
  getBucket: () => BucketInfo | null
  getSelectedObjects: () => ObjectInfo[]
  getPrefix: () => string
  grantForm: {
    roleArn: string
    privilege: 'readOnly' | 'readWrite' | 'all'
    durationSeconds: number
  }
  ramForm: { ramUserName: string; ramDisplayName: string; ramComments: string }
  setModal: (modal: 'details' | 'ram-users' | 'ram-user' | 'ram-keys' | null) => void
  getError: () => string
  setError: (message: string) => void
}): {
  grantToken: Ref<string>
  grantExpiration: Ref<string>
  ramUsers: Ref<RamUser[]>
  ramAccessKeys: Ref<RamAccessKey[]>
  activeRamUser: Ref<RamUser | null>
  createdAccessKey: Ref<RamAccessKey | null>
  objectDetails: Ref<ObjectDetails | null>
  permissionResults: Ref<PermissionProbeItem[]>
  permissionChecking: Ref<boolean>
  resetCloudOperations: () => void
  showDetails: () => Promise<void>
  createGrantToken: () => Promise<void>
  openRamUsers: () => Promise<void>
  editRamUser: (user?: RamUser) => void
  saveRamUser: () => Promise<void>
  removeRamUser: (user: RamUser) => void
  openRamKeys: (user: RamUser) => Promise<void>
  createRamAccessKey: () => Promise<void>
  removeRamAccessKey: (key: RamAccessKey) => void
  checkPermissions: () => Promise<void>
} {
  const grantToken = ref('')
  const grantExpiration = ref('')
  const ramUsers = ref<RamUser[]>([])
  const ramAccessKeys = ref<RamAccessKey[]>([])
  const activeRamUser = ref<RamUser | null>(null)
  const createdAccessKey = ref<RamAccessKey | null>(null)
  const objectDetails = ref<ObjectDetails | null>(null)
  const permissionResults = ref<PermissionProbeItem[]>([])
  const permissionChecking = ref(false)
  let permissionProbeGeneration = 0

  function resetCloudOperations(): void {
    grantToken.value = ''
    grantExpiration.value = ''
    ramUsers.value = []
    ramAccessKeys.value = []
    activeRamUser.value = null
    createdAccessKey.value = null
    objectDetails.value = null
    permissionProbeGeneration += 1
    permissionResults.value = []
    permissionChecking.value = false
  }

  async function showDetails(): Promise<void> {
    const bucket = options.getBucket()
    const selected = options.getSelectedObjects()
    if (!bucket || selected.length !== 1) return
    const result = await options.runCloudTask(() =>
      window.ossBrowser.objects.details(bucket.name, selected[0].name)
    )
    if (!result) return
    objectDetails.value = result
    options.setModal('details')
  }

  async function createGrantToken(): Promise<void> {
    const bucket = options.getBucket()
    if (!bucket) return
    const selected = options.getSelectedObjects()
    const item = selected.length === 1 ? selected[0] : undefined
    const result = await options.run(() =>
      window.ossBrowser.grants.createToken({
        bucket: bucket.name,
        key: item?.name || options.getPrefix(),
        region: bucket.region.replace(/^oss-/, ''),
        roleArn: options.grantForm.roleArn,
        privilege: options.grantForm.privilege,
        durationSeconds: Number(options.grantForm.durationSeconds),
        isObject: Boolean(item && !item.isDirectory)
      })
    )
    if (!result) return
    grantToken.value = result.token
    grantExpiration.value = result.expiration
    await window.ossBrowser.system.writeClipboard(result.token)
  }

  async function openRamUsers(): Promise<void> {
    const result = await options.runCloudTask(() => window.ossBrowser.ram.listUsers())
    if (!result) return
    ramUsers.value = result
    options.setModal('ram-users')
  }

  function editRamUser(user?: RamUser): void {
    activeRamUser.value = user || null
    options.ramForm.ramUserName = user?.userName || ''
    options.ramForm.ramDisplayName = user?.displayName || ''
    options.ramForm.ramComments = user?.comments || ''
    options.setModal('ram-user')
  }

  async function saveRamUser(): Promise<void> {
    const done = await options.runCloudTask(() =>
      window.ossBrowser.ram.saveUser(
        options.ramForm.ramUserName,
        options.ramForm.ramDisplayName,
        options.ramForm.ramComments,
        activeRamUser.value?.userName
      )
    )
    if (done === undefined && options.getError()) return
    await openRamUsers()
  }

  function removeRamUser(user: RamUser): void {
    options.requestConfirmation({
      title: t('删除 RAM 用户'),
      description: t('确定删除 RAM 用户「{name}」及其 AccessKey 吗？', { name: user.userName }),
      confirmLabel: t('删除'),
      destructive: true,
      action: () => performRemoveRamUser(user)
    })
  }

  async function performRemoveRamUser(user: RamUser): Promise<void> {
    const done = await options.runCloudTask(() => window.ossBrowser.ram.removeUser(user.userName))
    if (done === undefined && options.getError()) return
    await openRamUsers()
  }

  async function openRamKeys(user: RamUser): Promise<void> {
    const result = await options.runCloudTask(() =>
      window.ossBrowser.ram.listAccessKeys(user.userName)
    )
    if (!result) return
    activeRamUser.value = user
    ramAccessKeys.value = result
    createdAccessKey.value = null
    options.setModal('ram-keys')
  }

  async function createRamAccessKey(): Promise<void> {
    if (!activeRamUser.value) return
    const result = await options.runCloudTask(() =>
      window.ossBrowser.ram.createAccessKey(activeRamUser.value!.userName)
    )
    if (!result) return
    createdAccessKey.value = result
    ramAccessKeys.value = await window.ossBrowser.ram.listAccessKeys(activeRamUser.value.userName)
  }

  function removeRamAccessKey(key: RamAccessKey): void {
    if (!activeRamUser.value) return
    options.requestConfirmation({
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
    const done = await options.runCloudTask(() =>
      window.ossBrowser.ram.removeAccessKey(activeRamUser.value!.userName, key.accessKeyId)
    )
    if (done === undefined && options.getError()) return
    await openRamKeys(activeRamUser.value)
  }

  async function checkPermissions(): Promise<void> {
    const generation = ++permissionProbeGeneration
    permissionChecking.value = true
    options.setError('')
    try {
      const results = await window.ossBrowser.auth.probePermissions()
      if (generation === permissionProbeGeneration) permissionResults.value = results
    } catch (error) {
      options.setError(error instanceof Error ? error.message : String(error))
    } finally {
      if (generation === permissionProbeGeneration) permissionChecking.value = false
    }
  }

  return {
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
  }
}
