export interface LauncherAccount {
  id?: string
  username: string
  email: string
  role: 'developer' | 'player'
  createdAt: string
  token?: string
  avatar?: string // data URL（ユーザーアイコン、ローカル保存）
  linkedMicrosoft?: { name: string; uuid: string } // Shouchanアカウントに紐付けたMicrosoftアカウント
}

export interface AccountOtpStartResult {
  success: boolean
  pendingToken?: string
  error?: string
}

export interface AccountOtpVerifyResult {
  success: boolean
  account?: LauncherAccount
  error?: string
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

export type ModLoader = 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt'

export interface ServerModpack {
  id: string
  name: string
  version: string
  mcVersion: string
  modLoader?: ModLoader
  loaderVersion?: string
  description?: string
  downloadTargets?: string[]
  icon?: string // data URL
}

export type LaunchStatus = 'idle' | 'updating' | 'launching' | 'running' | 'error'
export type ViewType = 'home' | 'settings' | 'logs' | 'developer' | 'account'
export type AppState = 'loading' | 'setup' | 'login' | 'reauth' | 'main'

export interface UpdateState {
  checking: boolean
  available: boolean
  downloaded: boolean
  version?: string
  error?: string
  progress?: number
}

export interface LaunchMinecraftOptions {
  gameDir: string
  mcVersion: string
  modLoader?: ModLoader
  loaderVersion?: string
  maxMemory?: string
  minMemory?: string
  javaPath?: string
  jvmArgs?: string[]
  closeOnLaunch?: boolean
  modpackId?: string
}

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
      launchMinecraft: (options: LaunchMinecraftOptions) => Promise<{ success: boolean; error?: string }>
      selectDirectory: () => Promise<string | null>
      selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
      getAppVersion: () => Promise<string>

      authMicrosoft: () => Promise<{ success: boolean; mcUsername?: string; error?: string }>
      authRefresh: () => Promise<{ success: boolean; mcUsername?: string; error?: string }>
      logoutMC: () => Promise<void>

      verifyDevCode: (code: string) => Promise<boolean>
      checkModpackUpdate: () => Promise<{ hasUpdate: boolean; serverVersion: string | null; localVersion: string }>

      installJava: () => Promise<{ success: boolean; javaPath?: string; error?: string }>

      accountRegisterStart: (data: { username: string; email: string; password: string }) => Promise<AccountOtpStartResult>
      accountRegisterVerify: (data: { pendingToken: string; code: string }) => Promise<AccountOtpVerifyResult>
      accountLoginStart: (data: { email: string; password: string }) => Promise<AccountOtpStartResult>
      accountLoginVerify: (data: { pendingToken: string; code: string }) => Promise<AccountOtpVerifyResult>
      accountSyncSettings: (settings: Partial<AppSettings>) => Promise<{ success: boolean; error?: string }>
      accountVerifyToken: () => Promise<{ success: boolean; role?: 'developer' | 'player'; error?: string }>
      accountAvatarSync: (avatar: string | null) => Promise<{ success: boolean; error?: string }>

      fetchModpackList: () => Promise<{ success: boolean; data?: ServerModpack[]; error?: string }>
      fetchModpackLaunchInfo: (id: string) => Promise<{ success: boolean; data?: ServerModpack; error?: string }>
      checkModpackUpdateById: (id: string) => Promise<{ hasUpdate: boolean; serverVersion: string | null; localVersion: string }>
      updateModpackById: (id: string, dir: string) => Promise<{ success: boolean; error?: string }>

      devListModpacks: () => Promise<{ success: boolean; data?: ServerModpack[]; error?: string }>
      devCreateModpack: (info: Omit<ServerModpack, 'id'>) => Promise<{ success: boolean; id?: string; error?: string }>
      devUpdateModpack: (id: string, info: Partial<ServerModpack>) => Promise<{ success: boolean; error?: string }>
      devDeleteModpack: (id: string) => Promise<{ success: boolean; error?: string }>
      devUploadModpackDirById: (id: string, localDir: string, version: string) => Promise<{ success: boolean; error?: string }>
      devUploadModpackIcon: (id: string, localPath: string) => Promise<{ success: boolean; iconUrl?: string; error?: string }>
      onUploadProgress: (cb: (data: { current: number; total: number; file: string }) => void) => () => void

      devGetFiles: (modpackId: string) => Promise<{ success: boolean; data?: unknown[]; error?: string }>
      devUploadFile: (modpackId: string, localPath: string, serverPath: string) => Promise<{ success: boolean; error?: string }>
      devUploadDirectory: (modpackId: string, localDir: string, serverBasePath: string) => Promise<{ success: boolean; count?: number; error?: string }>
      devDeleteFile: (modpackId: string, serverPath: string) => Promise<{ success: boolean; error?: string }>
      devGetModpackDownloadTargets: (modpackId: string) => Promise<{ success: boolean; data?: string[]; error?: string }>
      devSaveModpackDownloadTargets: (modpackId: string, paths: string[]) => Promise<{ success: boolean; count?: number; error?: string }>
      devGetNews: () => Promise<{ success: boolean; data?: NewsItem[]; error?: string }>
      devUpdateNews: (news: NewsItem[]) => Promise<{ success: boolean; error?: string }>

      clearCache: (type: 'versions' | 'libraries' | 'all') => Promise<{ success: boolean; cleared?: string[]; error?: string }>

      openPath: (target: string) => Promise<{ success: boolean; error?: string }>
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
      saveLogFile: (content: string) => Promise<{ success: boolean; error?: string }>
      getRecommendedGameDir: () => Promise<string>

      isLaunchingMinecraft: () => Promise<boolean>

      setLauncherIcon: (sourcePath: string) => Promise<{ success: boolean; iconPath?: string; error?: string }>
      resetLauncherIcon: () => Promise<{ success: boolean; error?: string }>
      getLauncherIcon: () => Promise<{ success: boolean; iconPath: string | null }>

      readImageAsDataUrl: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>

      // アップデート機能
      checkForUpdates: () => Promise<{ success: boolean; error?: string }>
      installUpdate: () => Promise<{ success: boolean; error?: string }>
      onUpdateStatus: (cb: (state: UpdateState) => void) => () => void

      onModpackProgress: (cb: (data: { completed: number; total: number; file: string }) => void) => () => void
      onLaunchProgress: (cb: (data: unknown) => void) => () => void
      onLaunchLog: (cb: (log: string) => void) => () => void
      onGameClosed: (cb: (data: { code: number; addedMinutes: number }) => void) => () => void
      onJavaDownloadProgress: (cb: (data: { completed: number; total: number }) => void) => () => void
    }
  }
}
