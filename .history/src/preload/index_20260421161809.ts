import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),

  getStore: (key: string) => ipcRenderer.invoke('get-store', key),
  setStore: (key: string, value: unknown) => ipcRenderer.invoke('set-store', key, value),
  deleteStore: (key: string) => ipcRenderer.invoke('delete-store', key),

  checkServerStatus: (serverUrl: string) => ipcRenderer.invoke('check-server-status', serverUrl),
  fetchModpackInfo: () => ipcRenderer.invoke('fetch-modpack-info'),
  fetchNews: () => ipcRenderer.invoke('fetch-news'),
  updateModpack: (modpackDir: string) => ipcRenderer.invoke('update-modpack', modpackDir),
  launchMinecraft: (options: unknown) => ipcRenderer.invoke('launch-minecraft', options),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('select-file', filters),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  authMicrosoft: () => ipcRenderer.invoke('auth-microsoft'),
  authRefresh: () => ipcRenderer.invoke('auth-refresh'),
  logoutMC: () => ipcRenderer.invoke('logout-mc'),

  verifyDevCode: (code: string) => ipcRenderer.invoke('verify-dev-code', code),
  checkModpackUpdate: () => ipcRenderer.invoke('check-modpack-update'),

  installJava: () => ipcRenderer.invoke('install-java'),

  accountRegisterStart: (data: { username: string; email: string; password: string }) =>
    ipcRenderer.invoke('account-register-start', data),
  accountRegisterVerify: (data: { pendingToken: string; code: string }) =>
    ipcRenderer.invoke('account-register-verify', data),
  accountLoginStart: (data: { email: string; password: string }) =>
    ipcRenderer.invoke('account-login-start', data),
  accountLoginVerify: (data: { pendingToken: string; code: string }) =>
    ipcRenderer.invoke('account-login-verify', data),

  accountRegister: (data: { username: string; email: string; password: string }) =>
    ipcRenderer.invoke('account-register', data),
  accountLogin: (data: { email: string; password: string }) =>
    ipcRenderer.invoke('account-login', data),
  accountSyncSettings: (settings: unknown) =>
    ipcRenderer.invoke('account-sync-settings', settings),
  accountVerifyToken: () => ipcRenderer.invoke('account-verify-token'),

  fetchModpackList: () => ipcRenderer.invoke('fetch-modpack-list'),
  fetchModpackLaunchInfo: (id: string) => ipcRenderer.invoke('fetch-modpack-launch-info', id),
  checkModpackUpdateById: (id: string) => ipcRenderer.invoke('check-modpack-update-by-id', id),
  updateModpackById: (id: string, dir: string) => ipcRenderer.invoke('update-modpack-by-id', id, dir),

  devListModpacks: () => ipcRenderer.invoke('dev-list-modpacks'),
  devCreateModpack: (info: unknown) => ipcRenderer.invoke('dev-create-modpack', info),
  devUpdateModpack: (id: string, info: unknown) => ipcRenderer.invoke('dev-update-modpack', id, info),
  devDeleteModpack: (id: string) => ipcRenderer.invoke('dev-delete-modpack', id),
  devUploadModpackDirById: (id: string, localDir: string, version: string) =>
    ipcRenderer.invoke('dev-upload-modpack-dir-by-id', id, localDir, version),

  devGetFiles: (modpackId: string) => ipcRenderer.invoke('dev-get-files', modpackId),
  devUploadFile: (modpackId: string, localPath: string, serverPath: string) =>
    ipcRenderer.invoke('dev-upload-file', modpackId, localPath, serverPath),
  devUploadDirectory: (modpackId: string, localDir: string, serverBasePath: string) =>
    ipcRenderer.invoke('dev-upload-directory', modpackId, localDir, serverBasePath),
  devDeleteFile: (modpackId: string, serverPath: string) =>
    ipcRenderer.invoke('dev-delete-file', modpackId, serverPath),
  devGetModpackDownloadTargets: (modpackId: string) =>
    ipcRenderer.invoke('dev-get-modpack-download-targets', modpackId),
  devSaveModpackDownloadTargets: (modpackId: string, paths: string[]) =>
    ipcRenderer.invoke('dev-save-modpack-download-targets', modpackId, paths),
  devGetNews: () => ipcRenderer.invoke('dev-get-news'),
  devUpdateNews: (news: unknown) => ipcRenderer.invoke('dev-update-news', news),

  clearCache: (type: 'versions' | 'libraries' | 'all') => ipcRenderer.invoke('clear-cache', type),

  // アップデート機能
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback: (state: {
    checking: boolean
    available: boolean
    downloaded: boolean
    version?: string
    error?: string
    progress?: number
  }) => void) => {
    ipcRenderer.on('update-status', (_e, state) => callback(state))
    return () => ipcRenderer.removeAllListeners('update-status')
  },

  onModpackProgress: (callback: (data: { completed: number; total: number; file: string }) => void) => {
    ipcRenderer.on('modpack-progress', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('modpack-progress')
  },
  onLaunchProgress: (callback: (data: unknown) => void) => {
    ipcRenderer.on('launch-progress', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('launch-progress')
  },
  onLaunchLog: (callback: (log: string) => void) => {
    ipcRenderer.on('launch-log', (_e, log) => callback(log))
    return () => ipcRenderer.removeAllListeners('launch-log')
  },
  onGameClosed: (callback: (code: number) => void) => {
    ipcRenderer.on('game-closed', (_e, code) => callback(code))
    return () => ipcRenderer.removeAllListeners('game-closed')
  },
  onJavaDownloadProgress: (callback: (data: { completed: number; total: number }) => void) => {
    ipcRenderer.on('java-download-progress', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('java-download-progress')
  },
  onUploadProgress: (callback: (data: { current: number; total: number; file: string }) => void) => {
    ipcRenderer.on('upload-progress', (_e, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('upload-progress')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
