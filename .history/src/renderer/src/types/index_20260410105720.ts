export interface UserAccount {
  username: string
  uuid?: string
  token?: string
  autoLogin: boolean
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
}

export type LaunchStatus = 'idle' | 'updating' | 'launching' | 'running' | 'error'
export type ViewType = 'home' | 'settings' | 'logs'

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
      updateModpack: (
        dir: string,
        username: string
      ) => Promise<{ success: boolean; error?: string }>
      launchMinecraft: (options: unknown) => Promise<{ success: boolean; error?: string }>
      selectDirectory: () => Promise<string | null>
      getAppVersion: () => Promise<string>
      onModpackProgress: (
        cb: (data: { completed: number; total: number; file: string }) => void
      ) => () => void
      onLaunchProgress: (cb: (data: unknown) => void) => () => void
      onLaunchLog: (cb: (log: string) => void) => () => void
      onGameClosed: (cb: (code: number) => void) => () => void
    }
  }
}
