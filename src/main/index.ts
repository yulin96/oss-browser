import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { OssService } from './oss-service'
import { ProfileStore } from './profile-store'
import { UpdateService } from './update-service'
import type {
  AppSettings,
  AuthConfig,
  CacheRefreshRequest,
  GrantOptions,
  ObjectInfo,
  SavedProfile,
  TransferItem
} from '../shared/types'

app.setPath('userData', join(app.getPath('appData'), 'oss-browser'))
app.setName('OSS Browser')

let mainWindow: BrowserWindow | null = null
const oss = new OssService((item: TransferItem) => {
  mainWindow?.webContents.send('transfer:progress', item)
})
const profiles = new ProfileStore()
const updates = new UpdateService(() => mainWindow)

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
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
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
  ipcMain.handle('auth:connect', (_event, config: AuthConfig) => oss.connect(config))
  ipcMain.handle('auth:disconnect', () => oss.disconnect())
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
    const result = await dialog.showOpenDialog(mainWindow!, { title: '选择上传内容', properties })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle('files:pickDownloadFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择下载位置',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('files:upload', (_event, bucket: string, prefix: string, paths: string[]) =>
    oss.upload(bucket, prefix, paths)
  )
  ipcMain.handle(
    'files:download',
    (_event, bucket: string, items: ObjectInfo[], destination: string) =>
      oss.download(bucket, items, destination)
  )
  ipcMain.handle('transfers:cancel', (_event, id: string) => oss.cancelTransfer(id))

  ipcMain.handle('system:getVersion', () => app.getVersion())
  ipcMain.handle('system:openExternal', (_event, url: string) => shell.openExternal(url))
  ipcMain.handle('system:revealFile', (_event, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('system:writeClipboard', (_event, text: string) => clipboard.writeText(text))
  ipcMain.handle('updates:getState', () => updates.getState())
  ipcMain.handle('updates:check', () => updates.check())
  ipcMain.handle('updates:download', () => updates.download())
  ipcMain.handle('updates:install', () => updates.install())
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.yulin96.ossbrowser')
  if (process.platform === 'darwin') app.dock?.setIcon(icon)
  Menu.setApplicationMenu(null)
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerIpc()
  createWindow()
  updates.initialize()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
