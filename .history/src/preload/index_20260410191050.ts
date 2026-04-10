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

  accountRegister: (data: { username: string; email: string; password: string }) =>
    ipcRenderer.invoke('account-register', data),
  accountLogin: (data: { email: string; password: string }) =>
    ipcRenderer.invoke('account-login', data),
  accountSyncSettings: (settings: unknown) =>
    ipcRenderer.invoke('account-sync-settings', settings),
  accountVerifyToken: () => ipcRenderer.invoke('account-verify-token'),

  devGetFiles: () => ipcRenderer.invoke('dev-get-files'),
  devUploadFile: (localPath: string, serverPath: string) =>
    ipcRenderer.invoke('dev-upload-file', localPath, serverPath),
  devDeleteFile: (serverPath: string) => ipcRenderer.invoke('dev-delete-file', serverPath),
  devUpdateInfo: (info: unknown) => ipcRenderer.invoke('dev-update-info', info),
  devGetNews: () => ipcRenderer.invoke('dev-get-news'),
  devUpdateNews: (news: unknown) => ipcRenderer.invoke('dev-update-news', news),

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
