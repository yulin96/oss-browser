import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  type IpcMainInvokeEvent,
  Menu,
  shell
} from 'electron'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import icon from '../../resources/icon.png?asset'
import type {
  AppSettings,
  AuthConfig,
  CacheRefreshRequest,
  GrantOptions,
  ObjectInfo,
  SavedProfile,
  TransferItem,
  UploadOptions
} from '../shared/types'
import { OssService } from './oss-service'
import { FloatingUploadManager } from './floating-upload-manager'
import { FloatingUploadStore } from './floating-upload-store'
import { ProfileStore } from './profile-store'
import { UpdateService } from './update-service'

app.setPath('userData', join(app.getPath('appData'), is.dev ? 'oss-browser-dev' : 'oss-browser'))
app.setName('OSS Browser')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'oss-browser-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null
let isQuitting = false
const oss = new OssService((item: TransferItem) => {
  mainWindow?.webContents.send('transfer:progress', item)
  floatingUpload?.handleTransfer(item)
})
const profiles = new ProfileStore()
const floatingUploadStore = new FloatingUploadStore()
const updates = new UpdateService(() => mainWindow)
let lastUploadDirectory: string | undefined
let lastDownloadDirectory: string | undefined

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function quitApplication(): void {
  isQuitting = true
  app.quit()
}

const floatingUpload = new FloatingUploadManager(
  oss,
  floatingUploadStore,
  () => mainWindow,
  showMainWindow,
  quitApplication
)

function registerLocalMediaProtocol(): void {
  protocol.handle('oss-browser-media', (request) => {
    const url = new URL(request.url)
    const token = url.hostname === 'upload' ? url.pathname.slice(1) : ''
    const localPath =
      token && !token.includes('/') ? oss.resolveLocalMediaPreview(token) : undefined
    if (!localPath) return new Response(null, { status: 404 })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405 })
    }
    const range = request.headers.get('range')
    return net.fetch(pathToFileURL(localPath).toString(), {
      method: request.method,
      headers: range ? { range } : undefined
    })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f6f8fb',
    title: 'OSS Browser',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hidden' } : { frame: false }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonPosition({ x: 14, y: 19 })
  }

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximize-change', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximize-change', false))
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    if (floatingUpload.isVisible()) {
      mainWindow?.hide()
      return
    }
    quitApplication()
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  const senderWindow = (event: IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(event.sender)

  ipcMain.handle('auth:connect', async (_event, config: AuthConfig) => {
    try {
      const buckets = await oss.connect(config)
      await floatingUpload.setAccount(`${config.endpoint}|${config.accessKeyId}`)
      return buckets
    } catch (error) {
      await floatingUpload.setAccount(null)
      throw error
    }
  })
  ipcMain.handle('auth:disconnect', async () => {
    oss.disconnect()
    await floatingUpload.setAccount(null)
  })
  ipcMain.handle('auth:setSecure', (_event, secure: boolean) => oss.setSecure(secure))
  ipcMain.handle('auth:probePermissions', () => oss.probePermissions())
  ipcMain.handle('profiles:list', () => profiles.list())
  ipcMain.handle('profiles:save', (_event, profile: SavedProfile) => profiles.save(profile))
  ipcMain.handle('profiles:remove', (_event, id: string) => profiles.remove(id))
  ipcMain.handle('profiles:clear', () => profiles.clear())
  ipcMain.handle('settings:update', (_event, settings: AppSettings) => oss.updateSettings(settings))
  ipcMain.handle('grants:createToken', (_event, options: GrantOptions) =>
    oss.createGrantToken(options)
  )
  ipcMain.handle('ram:listUsers', () => oss.listRamUsers())
  ipcMain.handle(
    'ram:saveUser',
    (_event, userName: string, displayName: string, comments: string, originalName?: string) =>
      oss.saveRamUser(userName, displayName, comments, originalName)
  )
  ipcMain.handle('ram:removeUser', (_event, userName: string) => oss.removeRamUser(userName))
  ipcMain.handle('ram:listAccessKeys', (_event, userName: string) =>
    oss.listRamAccessKeys(userName)
  )
  ipcMain.handle('ram:createAccessKey', (_event, userName: string) =>
    oss.createRamAccessKey(userName)
  )
  ipcMain.handle('ram:removeAccessKey', (_event, userName: string, accessKeyId: string) =>
    oss.removeRamAccessKey(userName, accessKeyId)
  )

  ipcMain.handle('buckets:list', () => oss.listBuckets())
  ipcMain.handle('buckets:getStorageStat', (_event, name: string) => oss.getBucketStorageStat(name))
  ipcMain.handle('buckets:getAcl', (_event, name: string) => oss.getBucketAcl(name))
  ipcMain.handle('buckets:create', (_event, name: string, region: string, acl: string) =>
    oss.createBucket(name, region, acl)
  )
  ipcMain.handle('buckets:remove', (_event, name: string) => oss.removeBucket(name))
  ipcMain.handle('buckets:setAcl', (_event, name: string, acl: string) =>
    oss.setBucketAcl(name, acl)
  )
  ipcMain.handle('buckets:listMultipart', (_event, name: string) => oss.listMultipart(name))
  ipcMain.handle(
    'buckets:abortMultipart',
    (_event, bucket: string, name: string, uploadId: string) =>
      oss.abortMultipart(bucket, name, uploadId)
  )

  ipcMain.handle('objects:list', (_event, bucket: string, prefix: string, marker?: string) =>
    oss.listObjects(bucket, prefix, marker)
  )
  ipcMain.handle('objects:createFolder', (_event, bucket: string, path: string) =>
    oss.createFolder(bucket, path)
  )
  ipcMain.handle('objects:remove', (_event, bucket: string, names: string[]) =>
    oss.removeObjects(bucket, names)
  )
  ipcMain.handle('objects:copy', (_event, bucket: string, source: string, target: string) =>
    oss.copyObject(bucket, source, target)
  )
  ipcMain.handle(
    'objects:transfer',
    (_event, bucket: string, items: ObjectInfo[], targetPath: string, move: boolean) =>
      oss.transferObjects(bucket, items, targetPath, move)
  )
  ipcMain.handle('objects:setAcl', (_event, bucket: string, name: string, acl: string) =>
    oss.setObjectAcl(bucket, name, acl)
  )
  ipcMain.handle('objects:isPublic', (_event, bucket: string, name: string) =>
    oss.isObjectPublic(bucket, name)
  )
  ipcMain.handle(
    'objects:setHeaders',
    (_event, bucket: string, name: string, headers: Record<string, string>) =>
      oss.setObjectHeaders(bucket, name, headers)
  )
  ipcMain.handle(
    'objects:signedUrl',
    (_event, bucket: string, name: string, expires: number, process?: string) =>
      oss.signedUrl(bucket, name, expires, process)
  )
  ipcMain.handle('objects:imageDimensions', (_event, bucket: string, name: string) =>
    oss.getImageDimensions(bucket, name)
  )
  ipcMain.handle('objects:readText', (_event, bucket: string, name: string) =>
    oss.readText(bucket, name)
  )
  ipcMain.handle('objects:saveText', (_event, bucket: string, name: string, content: string) =>
    oss.saveText(bucket, name, content)
  )
  ipcMain.handle('objects:createSymlink', (_event, bucket: string, name: string, target: string) =>
    oss.createSymlink(bucket, name, target)
  )
  ipcMain.handle('objects:restore', (_event, bucket: string, names: string[], days: number) =>
    oss.restoreObjects(bucket, names, days)
  )
  ipcMain.handle('objects:details', (_event, bucket: string, name: string) =>
    oss.getObjectDetails(bucket, name)
  )
  ipcMain.handle('objects:domains', (_event, bucket: string) => oss.listCnameDomains(bucket))
  ipcMain.handle('cache:domains', () => oss.listCdnDomains())
  ipcMain.handle('cache:refresh', (_event, request: CacheRefreshRequest) =>
    oss.refreshCdnCache(request)
  )

  ipcMain.handle('files:pickUpload', async (_event, kind: 'files' | 'folder') => {
    const properties: Electron.OpenDialogOptions['properties'] =
      kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections']
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择上传内容',
      defaultPath: lastUploadDirectory,
      properties
    })
    if (result.canceled) return []
    lastUploadDirectory = kind === 'folder' ? result.filePaths[0] : dirname(result.filePaths[0])
    return result.filePaths
  })
  ipcMain.handle('files:pickDownloadFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择下载位置',
      defaultPath: lastDownloadDirectory,
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled) return null
    lastDownloadDirectory = result.filePaths[0]
    return lastDownloadDirectory
  })
  ipcMain.handle(
    'files:findUploadConflicts',
    (_event, bucket: string, prefix: string, paths: string[]) =>
      oss.findUploadConflicts(bucket, prefix, paths)
  )
  ipcMain.handle(
    'files:upload',
    (_event, bucket: string, prefix: string, paths: string[], options?: UploadOptions) =>
      oss.upload(bucket, prefix, paths, options)
  )
  ipcMain.handle(
    'files:download',
    (_event, bucket: string, items: ObjectInfo[], destination: string) =>
      oss.download(bucket, items, destination)
  )
  ipcMain.handle('transfers:cancel', (_event, id: string) => oss.cancelTransfer(id))
  ipcMain.handle('transfers:pauseAll', (_event, direction: TransferItem['direction']) =>
    oss.pauseAllTransfers(direction)
  )
  ipcMain.handle('transfers:resumeAll', (_event, direction: TransferItem['direction']) =>
    oss.resumeAllTransfers(direction)
  )
  ipcMain.handle('transfers:cancelAll', (_event, direction: TransferItem['direction']) =>
    oss.cancelAllTransfers(direction)
  )

  ipcMain.handle('floating-upload:getState', () => floatingUpload.getState())
  ipcMain.handle('floating-upload:toggle', (_event, suggestedTarget) =>
    floatingUpload.toggle(suggestedTarget)
  )
  ipcMain.handle('floating-upload:setTarget', (_event, target) => floatingUpload.setTarget(target))
  ipcMain.handle('floating-upload:close', () => floatingUpload.close())
  ipcMain.handle('floating-upload:showMenu', (_event, suggestedTarget) =>
    floatingUpload.showMenu(suggestedTarget)
  )
  ipcMain.handle('floating-upload:setExpanded', (_event, expanded: boolean) =>
    floatingUpload.setExpanded(expanded)
  )
  ipcMain.handle('floating-upload:getPosition', () => floatingUpload.getPosition())
  ipcMain.handle('floating-upload:moveTo', (_event, position) => floatingUpload.moveTo(position))
  ipcMain.handle('floating-upload:finishMove', () => floatingUpload.finishMove())
  ipcMain.handle('floating-upload:upload', (_event, paths: string[]) =>
    floatingUpload.upload(paths)
  )
  ipcMain.handle('floating-upload:resolveRequest', (_event, skipNames: string[] | null) =>
    floatingUpload.resolveRequest(skipNames)
  )

  ipcMain.handle('system:getVersion', () => app.getVersion())
  ipcMain.handle('system:openExternal', (_event, url: string) => shell.openExternal(url))
  ipcMain.handle('system:revealFile', (_event, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('system:writeClipboard', (_event, text: string) => clipboard.writeText(text))
  ipcMain.handle('window:minimize', (event) => senderWindow(event)?.minimize())
  ipcMain.handle('window:toggleMaximize', (event) => {
    const window = senderWindow(event)
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })
  ipcMain.handle('window:close', (event) => senderWindow(event)?.close())
  ipcMain.handle('window:isMaximized', (event) => senderWindow(event)?.isMaximized() ?? false)
  ipcMain.handle('updates:getState', () => updates.getState())
  ipcMain.handle('updates:check', () => updates.check())
  ipcMain.handle('updates:download', () => updates.download())
  ipcMain.handle('updates:install', () => updates.install())
}

const hasSingleInstanceLock = is.dev || app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

app.on('second-instance', () => {
  showMainWindow()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.yulin96.ossbrowser')
  Menu.setApplicationMenu(null)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerLocalMediaProtocol()
  registerIpc()
  createWindow()
  updates.initialize()

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
