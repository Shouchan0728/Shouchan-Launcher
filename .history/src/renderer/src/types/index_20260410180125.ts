export interface LauncherAccount {
  username: string
  role: 'developer' | 'player'
  createdAt: string
}

export interface MCAuthStore {
  access_token: string
  client_token: string
  uuid: string
  name: string
  isOffline: boolean
  refreshToken?: string
}

export interface UserAccount {
  username: string
  uuid?: string
  isOffline: boolean
}

export interface ModpackInfo {
  version: string
  mcVersion: string
  forgeVersion?: string
  name: string
  description?: string
}

export interface NewsItem {
  id: number
  title: string
  content: string
  date: string
}

export interface Stats {
  launches: number
  playTimeMinutes: number
  lastLaunch?: string
  modpackVersion?: string
}

export interface AppSettings {
  gameDir: string
  maxMemory: string
  minMemory: string
  javaPath: string
  jvmArgs: string
  closeOnLaunch: boolean
}

export type LaunchStatus = 'idle' | 'updating' | 'launching' | 'running' | 'error'
export type ViewType = 'home' | 'settings' | 'logs' | 'developer'
export type AppState = 'loading' | 'setup' | 'reauth' | 'main'

declare global {
  interface Window {
    api: {
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void

      getStore: (key: string) => Promise<unknown>
      setStore: (key: string, value: unknown) => Promise<void>
      deleteStore: (key: string) => Promise<void>

      checkServerStatus: (url: string) => Promise<{ online: boolean; data?: unknown }>
      fetchModpackInfo: () => Promise<{ success: boolean; data?: ModpackInfo; error?: string }>
      fetchNews: () => Promise<{ success: boolean; data?: NewsItem[]; error?: string }>
      updateModpack: (dir: string) => Promise<{ success: boolean; error?: string }>
      launchMinecraft: (options: unknown) => Promise<{ success: boolean; error?: string }>
      selectDirectory: () => Promise<string | null>
      selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
      getAppVersion: () => Promise<string>

      authMicrosoft: () => Promise<{ success: boolean; mcUsername?: string; error?: string }>
      authRefresh: () => Promise<{ success: boolean; mcUsername?: string; error?: string }>
      logoutMC: () => Promise<void>

      verifyDevCode: (code: string) => Promise<boolean>
      checkModpackUpdate: () => Promise<{ hasUpdate: boolean; serverVersion: string | null; localVersion: string }>

      installJava: () => Promise<{ success: boolean; javaPath?: string; error?: string }>

      devGetFiles: () => Promise<{ success: boolean; data?: unknown[]; error?: string }>
      devUploadFile: (localPath: string, serverPath: string) => Promise<{ success: boolean; error?: string }>
      devDeleteFile: (serverPath: string) => Promise<{ success: boolean; error?: string }>
      devUpdateInfo: (info: ModpackInfo) => Promise<{ success: boolean; error?: string }>
      devGetNews: () => Promise<{ success: boolean; data?: NewsItem[]; error?: string }>
      devUpdateNews: (news: NewsItem[]) => Promise<{ success: boolean; error?: string }>

      onModpackProgress: (cb: (data: { completed: number; total: number; file: string }) => void) => () => void
      onLaunchProgress: (cb: (data: unknown) => void) => () => void
      onLaunchLog: (cb: (log: string) => void) => () => void
      onGameClosed: (cb: (code: number) => void) => () => void
      onJavaDownloadProgress: (cb: (data: { completed: number; total: number }) => void) => () => void
    }
  }
}
