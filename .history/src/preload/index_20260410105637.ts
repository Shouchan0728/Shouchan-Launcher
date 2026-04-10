import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),

  getStore: (key: string) => ipcRenderer.invoke('get-store', key),
  setStore: (key: string, value: unknown) => ipcRenderer.invoke('set-store', key, value),
  deleteStore: (key: string) => ipcRenderer.invoke('delete-store', key),

  checkServerStatus: (serverUrl: string) =>
    ipcRenderer.invoke('check-server-status', serverUrl),
  fetchModpackInfo: () => ipcRenderer.invoke('fetch-modpack-info'),
  fetchNews: () => ipcRenderer.invoke('fetch-news'),
  updateModpack: (modpackDir: string, username: string) =>
    ipcRenderer.invoke('update-modpack', modpackDir, username),
  launchMinecraft: (options: unknown) => ipcRenderer.invoke('launch-minecraft', options),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  onModpackProgress: (
    callback: (data: { completed: number; total: number; file: string }) => void
  ) => {
    ipcRenderer.on('modpack-progress', (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('modpack-progress')
  },
  onLaunchProgress: (callback: (data: unknown) => void) => {
    ipcRenderer.on('launch-progress', (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('launch-progress')
  },
  onLaunchLog: (callback: (log: string) => void) => {
    ipcRenderer.on('launch-log', (_event, log) => callback(log))
    return () => ipcRenderer.removeAllListeners('launch-log')
  },
  onGameClosed: (callback: (code: number) => void) => {
    ipcRenderer.on('game-closed', (_event, code) => callback(code))
    return () => ipcRenderer.removeAllListeners('game-closed')
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
