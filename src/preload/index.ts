import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { OssBrowserApi, TransferItem, UpdateState } from '../shared/types'

const api: OssBrowserApi = {
  auth: {
    connect: (config) => ipcRenderer.invoke('auth:connect', config),
    disconnect: () => ipcRenderer.invoke('auth:disconnect'),
    setSecure: (secure) => ipcRenderer.invoke('auth:setSecure', secure),
    probePermissions: () => ipcRenderer.invoke('auth:probePermissions')
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    save: (profile) => ipcRenderer.invoke('profiles:save', profile),
    remove: (id) => ipcRenderer.invoke('profiles:remove', id),
    clear: () => ipcRenderer.invoke('profiles:clear')
  },
  settings: {
    update: (settings) => ipcRenderer.invoke('settings:update', settings)
  },
  grants: {
    createToken: (options) => ipcRenderer.invoke('grants:createToken', options)
  },
  ram: {
    listUsers: () => ipcRenderer.invoke('ram:listUsers'),
    saveUser: (userName, displayName, comments, originalName) =>
      ipcRenderer.invoke('ram:saveUser', userName, displayName, comments, originalName),
    removeUser: (userName) => ipcRenderer.invoke('ram:removeUser', userName),
    listAccessKeys: (userName) => ipcRenderer.invoke('ram:listAccessKeys', userName),
    createAccessKey: (userName) => ipcRenderer.invoke('ram:createAccessKey', userName),
    removeAccessKey: (userName, accessKeyId) =>
      ipcRenderer.invoke('ram:removeAccessKey', userName, accessKeyId)
  },
  buckets: {
    list: () => ipcRenderer.invoke('buckets:list'),
    getAcl: (name) => ipcRenderer.invoke('buckets:getAcl', name),
    create: (name, region, acl) => ipcRenderer.invoke('buckets:create', name, region, acl),
    remove: (name) => ipcRenderer.invoke('buckets:remove', name),
    setAcl: (name, acl) => ipcRenderer.invoke('buckets:setAcl', name, acl),
    listMultipart: (name) => ipcRenderer.invoke('buckets:listMultipart', name),
    abortMultipart: (bucket, name, uploadId) =>
      ipcRenderer.invoke('buckets:abortMultipart', bucket, name, uploadId)
  },
  objects: {
    list: (bucket, prefix, marker) => ipcRenderer.invoke('objects:list', bucket, prefix, marker),
    createFolder: (bucket, path) => ipcRenderer.invoke('objects:createFolder', bucket, path),
    remove: (bucket, names) => ipcRenderer.invoke('objects:remove', bucket, names),
    copy: (bucket, source, target) => ipcRenderer.invoke('objects:copy', bucket, source, target),
    transfer: (bucket, items, targetPath, move) =>
      ipcRenderer.invoke('objects:transfer', bucket, items, targetPath, move),
    isPublic: (bucket, name) => ipcRenderer.invoke('objects:isPublic', bucket, name),
    setAcl: (bucket, name, acl) => ipcRenderer.invoke('objects:setAcl', bucket, name, acl),
    setHeaders: (bucket, name, headers) =>
      ipcRenderer.invoke('objects:setHeaders', bucket, name, headers),
    signedUrl: (bucket, name, expires, process) =>
      ipcRenderer.invoke('objects:signedUrl', bucket, name, expires, process),
    readText: (bucket, name) => ipcRenderer.invoke('objects:readText', bucket, name),
    saveText: (bucket, name, content) =>
      ipcRenderer.invoke('objects:saveText', bucket, name, content),
    createSymlink: (bucket, name, target) =>
      ipcRenderer.invoke('objects:createSymlink', bucket, name, target),
    restore: (bucket, names, days) => ipcRenderer.invoke('objects:restore', bucket, names, days),
    details: (bucket, name) => ipcRenderer.invoke('objects:details', bucket, name),
    domains: (bucket) => ipcRenderer.invoke('objects:domains', bucket)
  },
  cache: {
    domains: () => ipcRenderer.invoke('cache:domains'),
    refresh: (request) => ipcRenderer.invoke('cache:refresh', request)
  },
  files: {
    getPathForFile: (file) => webUtils.getPathForFile(file),
    pickUpload: (kind) => ipcRenderer.invoke('files:pickUpload', kind),
    pickDownloadFolder: () => ipcRenderer.invoke('files:pickDownloadFolder'),
    upload: (bucket, prefix, paths) => ipcRenderer.invoke('files:upload', bucket, prefix, paths),
    download: (bucket, items, destination) =>
      ipcRenderer.invoke('files:download', bucket, items, destination)
  },
  transfers: {
    cancel: (id) => ipcRenderer.invoke('transfers:cancel', id),
    pauseAll: (direction) => ipcRenderer.invoke('transfers:pauseAll', direction),
    resumeAll: (direction) => ipcRenderer.invoke('transfers:resumeAll', direction),
    cancelAll: (direction) => ipcRenderer.invoke('transfers:cancelAll', direction)
  },
  system: {
    getVersion: () => ipcRenderer.invoke('system:getVersion'),
    openExternal: (url) => ipcRenderer.invoke('system:openExternal', url),
    revealFile: (path) => ipcRenderer.invoke('system:revealFile', path),
    writeClipboard: (text) => ipcRenderer.invoke('system:writeClipboard', text)
  },
  updates: {
    getState: () => ipcRenderer.invoke('updates:getState'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install')
  },
  onTransfer: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, item: TransferItem): void => listener(item)
    ipcRenderer.on('transfer:progress', handler)
    return () => ipcRenderer.removeListener('transfer:progress', handler)
  },
  onUpdate: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on('update:status', handler)
    return () => ipcRenderer.removeListener('update:status', handler)
  }
}

contextBridge.exposeInMainWorld('ossBrowser', api)
