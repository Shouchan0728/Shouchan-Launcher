import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Client, Authenticator } from 'minecraft-launcher-core'
import Store from 'electron-store'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { Auth } from 'msmc'
import FormData from 'form-data'
import AdmZip from 'adm-zip'

const store = new Store()
const authManager = new Auth('select_account')

const MODPACK_SERVER_URL = 'https://srgk.ddns.net'
// ↓ 配布前に変更してください。このコードを知っている人だけ開発者になれます。
const DEVELOPER_CODE = 'SHOUCHAN_DEV_2026_0728'
// ↓ サーバー側の /admin/* エンドポイント保護トークン（サーバーと合わせること）
const DEV_ADMIN_TOKEN = 'shouchan-admin-secret-2026-0728'

interface MCAuthStore {
  access_token: string
  client_token: string
  uuid: string
  name: string
  isOffline: boolean
  refreshToken?: string
}

type ModLoader = 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt'

interface LaunchOptions {
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

interface ManifestFileEntry {
  path: string
  url?: string
  hash?: string
}

const normalizePath = (p: string): string => p.replace(/\\/g, '/').replace(/^\/+/, '')

const modpackInfoUrl = (id: string): string => `${MODPACK_SERVER_URL}/modpack/${encodeURIComponent(id)}/info`
const modpackFilesUrl = (id: string): string => `${MODPACK_SERVER_URL}/modpack/${encodeURIComponent(id)}/files`
const modpackFileDownloadUrl = (id: string, filePath: string): string => {
  const encodedPath = normalizePath(filePath)
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
  return `${MODPACK_SERVER_URL}/modpack/${encodeURIComponent(id)}/files/download/${encodedPath}`
}

const resolveManifestUrl = (id: string, entry: ManifestFileEntry): string => {
  if (!entry.url) return modpackFileDownloadUrl(id, entry.path)
  if (/^https?:\/\//i.test(entry.url)) return entry.url
  return `${MODPACK_SERVER_URL}${entry.url.startsWith('/') ? '' : '/'}${entry.url}`
}

const resolveForgeVersion = async (mcVersion: string): Promise<string | undefined> => {
  try {
    const res = await axios.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', { timeout: 10000 })
    const promos = (res.data?.promos || {}) as Record<string, string>
    return promos[`${mcVersion}-recommended`] || promos[`${mcVersion}-latest`]
  } catch {
    return undefined
  }
}

const parseMavenMetadataVersions = (xml: string): string[] => {
  const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)]
  return matches.map((m) => m[1]).filter(Boolean)
}

const resolveNeoForgeVersion = async (mcVersion: string): Promise<string | undefined> => {
  try {
    const res = await axios.get('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml', {
      timeout: 10000,
      responseType: 'text'
    })
    const versions = parseMavenMetadataVersions(String(res.data))

    const m = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?$/)
    if (!m) return versions[versions.length - 1]

    const mcMajor = m[1]
    const mcMinor = m[2] || '0'
    const prefix = `${mcMajor}.${mcMinor}.`

    const matched = versions.filter((v) => v.startsWith(prefix))
    if (matched.length > 0) return matched[matched.length - 1]

    const fallback = versions.filter((v) => v.startsWith(`${mcMajor}.`))
    return fallback[fallback.length - 1] || versions[versions.length - 1]
  } catch {
    return undefined
  }
}

const resolveQuiltVersion = async (mcVersion: string): Promise<string | undefined> => {
  try {
    const res = await axios.get(`https://meta.quiltmc.org/v3/versions/loader/${mcVersion}`, { timeout: 10000 })
    const loaders = res.data as Array<{ version: string }>
    return loaders?.[0]?.version
  } catch {
    return undefined
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 680,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#111117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: join(__dirname, '../../resources/icon.png')
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ipcMain.on('window-minimize', () => mainWindow.minimize())
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.on('window-close', () => mainWindow.close())
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('net.shouchan.launcher')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Store ──────────────────────────────────────────────────────────────────
ipcMain.handle('get-store', (_e, key: string) => store.get(key))
ipcMain.handle('set-store', (_e, key: string, value: unknown) => store.set(key, value))
ipcMain.handle('delete-store', (_e, key: string) => store.delete(key))

// ── Microsoft 認証 ─────────────────────────────────────────────────────────
ipcMain.handle('auth-microsoft', async () => {
  try {
    const xbox = await authManager.launch('electron')
    const mc = await xbox.getMinecraft()
    const mclcToken = mc.mclc()
    const refreshToken = xbox.save()

    const authData: MCAuthStore = {
      access_token: mclcToken.access_token,
      client_token: mclcToken.client_token || 'shouchan-client',
      uuid: mclcToken.uuid,
      name: mclcToken.name || mc.profile?.name || 'Unknown',
      isOffline: false,
      refreshToken
    }
    store.set('mc.auth', authData)
    return { success: true, mcUsername: authData.name }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('fetch-modpack-launch-info', async (_e, id: string) => {
  try {
    const res = await axios.get(modpackInfoUrl(id), { timeout: 10000 })
    return { success: true, data: res.data }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('auth-refresh', async () => {
  try {
    const stored = store.get('mc.auth') as MCAuthStore | null
    if (!stored?.refreshToken) return { success: false, error: 'リフレッシュトークンがありません' }

    const xbox = await authManager.refresh(stored.refreshToken)
    const mc = await xbox.getMinecraft()
    const mclcToken = mc.mclc()
    const refreshToken = xbox.save()

    const authData: MCAuthStore = {
      access_token: mclcToken.access_token,
      client_token: mclcToken.client_token || 'shouchan-client',
      uuid: mclcToken.uuid,
      name: mclcToken.name || stored.name,
      isOffline: false,
      refreshToken
    }
    store.set('mc.auth', authData)
    return { success: true, mcUsername: authData.name }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('logout-mc', () => {
  store.delete('mc.auth')
})

// ── 開発者コード検証 ───────────────────────────────────────────────────────
ipcMain.handle('verify-dev-code', (_e, code: string) => {
  return code === DEVELOPER_CODE
})

// ── サーバー状態 ────────────────────────────────────────────────────────────
ipcMain.handle('check-server-status', async (_e, serverUrl: string) => {
  try {
    const res = await axios.get(`${serverUrl}/status`, { timeout: 5000 })
    return { online: true, data: res.data }
  } catch {
    return { online: false }
  }
})

// ── ModPack 情報 ────────────────────────────────────────────────────────────
ipcMain.handle('fetch-modpack-info', async () => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/modpack/info`, { timeout: 10000 })
    return { success: true, data: res.data }
  } catch {
    return { success: false, error: 'サーバーに接続できませんでした' }
  }
})

ipcMain.handle('fetch-news', async () => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/news`, { timeout: 10000 })
    return { success: true, data: res.data }
  } catch {
    return {
      success: true,
      data: [{ id: 1, title: '最新情報', content: 'Shouchan Launcherへようこそ！\n現在はベータ版です。', date: new Date().toISOString() }]
    }
  }
})

// ── ModPack 更新確認 ────────────────────────────────────────────────────────
ipcMain.handle('check-modpack-update', async () => {
  const localVersion = (store.get('modpack.version', '') as string) || ''
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/modpack/info`, { timeout: 10000 })
    const serverVersion: string = res.data.version || ''
    return { hasUpdate: serverVersion !== localVersion, serverVersion, localVersion }
  } catch {
    return { hasUpdate: false, serverVersion: null, localVersion }
  }
})

// ── ModPack ダウンロード ────────────────────────────────────────────────────
ipcMain.handle('update-modpack', async (event, modpackDir: string) => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/modpack/files`, { timeout: 30000 })
    const files: Array<{ path: string; url: string; hash: string }> = res.data

    let completed = 0
    for (const file of files) {
      const filePath = path.join(modpackDir, file.path)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      const fileRes = await axios.get(file.url, { responseType: 'arraybuffer', timeout: 120000 })
      fs.writeFileSync(filePath, Buffer.from(fileRes.data))
      completed++
      event.sender.send('modpack-progress', { completed, total: files.length, file: file.path })
    }

    store.set('modpack.version', res.headers['x-modpack-version'] || 'unknown')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── Java 自動検出 (userData/java/) ──────────────────────────────────────────
const getAutoJavaPath = (): string | undefined => {
  const javaBaseDir = path.join(app.getPath('userData'), 'java')
  if (!fs.existsSync(javaBaseDir)) return undefined
  const dirs = fs.readdirSync(javaBaseDir).filter((d) =>
    fs.statSync(path.join(javaBaseDir, d)).isDirectory()
  )
  for (const dir of dirs) {
    const javaExe = path.join(javaBaseDir, dir, 'bin', 'java.exe')
    if (fs.existsSync(javaExe)) return javaExe
  }
  return undefined
}

// ── ファイル検証 ───────────────────────────────────────────────────────────
const verifyModpackFiles = async (modpackDir: string, id: string): Promise<{ valid: boolean; missingFiles: string[] }> => {
  try {
    const res = await axios.get(modpackFilesUrl(id), { timeout: 10000 })
    const files: ManifestFileEntry[] = res.data
    if (!Array.isArray(files) || files.length === 0) {
      return { valid: false, missingFiles: ['manifest'] }
    }

    const missingFiles: string[] = []
    for (const file of files) {
      const filePath = path.join(modpackDir, normalizePath(file.path))
      if (!fs.existsSync(filePath)) {
        missingFiles.push(file.path)
      }
    }

    return { valid: missingFiles.length === 0, missingFiles }
  } catch {
    return { valid: false, missingFiles: ['manifest'] }
  }
}

// ── Maven ライブラリパス変換 ─────────────────────────────────────────────────
const parseMavenPath = (artifact: string): { path: string; name: string; ext: string } => {
  const [group, name, version, classifier] = artifact.split(':')
  const ext = classifier?.startsWith('@') ? classifier.slice(1) : 'jar'
  const classifierPart = classifier && !classifier.startsWith('@') ? `-${classifier}` : ''
  const path = `${group.replace(/\./g, '/')}/${name}/${version}/${name}-${version}${classifierPart}.${ext}`
  return { path, name, ext }
}

const MAVEN_REPOS = [
  'https://repo1.maven.org/maven2',
  'https://maven.fabricmc.net',
  'https://maven.quiltmc.org/repository/release'
]

// ── ライブラリダウンロード ───────────────────────────────────────────────────
const downloadLibrary = async (libDir: string, artifact: string, url?: string): Promise<boolean> => {
  try {
    const { path: mavenPath, name } = parseMavenPath(artifact)
    const libPath = path.join(libDir, mavenPath)

    if (fs.existsSync(libPath)) return true

    fs.mkdirSync(path.dirname(libPath), { recursive: true })

    // Try provided URL first
    if (url) {
      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 })
        fs.writeFileSync(libPath, Buffer.from(res.data))
        return true
      } catch {
        // Fall through to try repos
      }
    }

    // Try each maven repo
    for (const repo of MAVEN_REPOS) {
      try {
        const fullUrl = `${repo}/${mavenPath}`
        const res = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 60000 })
        fs.writeFileSync(libPath, Buffer.from(res.data))
        return true
      } catch {
        continue
      }
    }

    return false
  } catch {
    return false
  }
}

// ── Fabric/Quilt Loader 自動インストール ─────────────────────────────────────
interface FabricLibrary {
  name: string
  url?: string
}

const installFabricLoader = async (
  gameDir: string,
  mcVersion: string,
  loaderVersion: string,
  onProgress?: (msg: string) => void
): Promise<boolean> => {
  try {
    const versionId = `fabric-loader-${mcVersion}-${loaderVersion}`
    const versionDir = path.join(gameDir, 'versions', versionId)
    const versionJsonPath = path.join(versionDir, `${versionId}.json`)
    const libDir = path.join(gameDir, 'libraries')

    if (!fs.existsSync(versionJsonPath)) {
      onProgress?.(`[Fabric] Loading profile for ${loaderVersion}...`)
      const res = await axios.get(
        `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`,
        { timeout: 30000 }
      )
      fs.mkdirSync(versionDir, { recursive: true })
      fs.writeFileSync(versionJsonPath, JSON.stringify(res.data, null, 2))
    }

    // Download libraries from profile
    const profile = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
    const libraries: FabricLibrary[] = profile.libraries || []

    const total = libraries.length
    let downloaded = 0

    for (const lib of libraries) {
      downloaded++
      onProgress?.(`[Fabric] Downloading libraries (${downloaded}/${total}): ${lib.name.split(':')[1]}`)
      const success = await downloadLibrary(libDir, lib.name, lib.url)
      if (!success) {
        onProgress?.(`[Fabric] Failed to download: ${lib.name}`)
      }
    }

    return true
  } catch {
    return false
  }
}

const installQuiltLoader = async (
  gameDir: string,
  mcVersion: string,
  loaderVersion: string,
  onProgress?: (msg: string) => void
): Promise<boolean> => {
  try {
    const versionId = `quilt-loader-${mcVersion}-${loaderVersion}`
    const versionDir = path.join(gameDir, 'versions', versionId)
    const versionJsonPath = path.join(versionDir, `${versionId}.json`)
    const libDir = path.join(gameDir, 'libraries')

    if (!fs.existsSync(versionJsonPath)) {
      onProgress?.(`[Quilt] Loading profile for ${loaderVersion}...`)
      const res = await axios.get(
        `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}/${loaderVersion}/profile/json`,
        { timeout: 30000 }
      )
      fs.mkdirSync(versionDir, { recursive: true })
      fs.writeFileSync(versionJsonPath, JSON.stringify(res.data, null, 2))
    }

    // Download libraries from profile
    const profile = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
    const libraries: FabricLibrary[] = profile.libraries || []

    const total = libraries.length
    let downloaded = 0

    for (const lib of libraries) {
      downloaded++
      onProgress?.(`[Quilt] Downloading libraries (${downloaded}/${total}): ${lib.name.split(':')[1]}`)
      const success = await downloadLibrary(libDir, lib.name, lib.url)
      if (!success) {
        onProgress?.(`[Quilt] Failed to download: ${lib.name}`)
      }
    }

    return true
  } catch {
    return false
  }
}

// ── Minecraft 起動 ─────────────────────────────────────────────────────────
ipcMain.handle('launch-minecraft', async (event, options: LaunchOptions) => {
  try {
    const mcAuth = store.get('mc.auth') as MCAuthStore | null
    if (!mcAuth) return { success: false, error: 'MC認証が見つかりません。再ログインしてください。' }

    // ファイル検証（未更新のModPackは起動できないように）
    if (options.modpackId) {
      event.sender.send('launch-log', `[Launcher] ファイルを検証中...`)
      const verification = await verifyModpackFiles(options.gameDir, options.modpackId)
      if (!verification.valid) {
        if (verification.missingFiles.includes('manifest')) {
          return { success: false, error: '配布対象ファイルが設定されていません。開発者メニューでファイルを選択・保存してください。' }
        }
        return { success: false, error: `ModPackが更新されていません。先に「更新」ボタンを押してください。（不足: ${verification.missingFiles.length}ファイル）` }
      }
      event.sender.send('launch-log', `[Launcher] ファイル検証完了`)
    }

    const authorization = mcAuth.isOffline
      ? Authenticator.getAuth(mcAuth.name)
      : { access_token: mcAuth.access_token, client_token: mcAuth.client_token, uuid: mcAuth.uuid, name: mcAuth.name, user_properties: {} }

    const loaderOpts: Record<string, unknown> & { version?: { number: string; type: string } } = {}
    let resolvedLoaderVersion = options.loaderVersion

    if (options.modLoader === 'fabric' && !resolvedLoaderVersion) {
      try {
        const fabricRes = await axios.get(`https://meta.fabricmc.net/v2/versions/loader/${options.mcVersion}`, { timeout: 10000 })
        resolvedLoaderVersion = fabricRes.data?.[0]?.loader?.version as string | undefined
      } catch {
        resolvedLoaderVersion = undefined
      }
      if (!resolvedLoaderVersion) {
        return { success: false, error: `Fabricバージョンを取得できませんでした (MC ${options.mcVersion})` }
      }
    }

    if (options.modLoader === 'quilt' && !resolvedLoaderVersion) {
      resolvedLoaderVersion = await resolveQuiltVersion(options.mcVersion)
      if (!resolvedLoaderVersion) {
        return { success: false, error: `Quiltバージョンを取得できませんでした (MC ${options.mcVersion})` }
      }
    }

    if (options.modLoader === 'forge' && !resolvedLoaderVersion) {
      resolvedLoaderVersion = await resolveForgeVersion(options.mcVersion)
      if (!resolvedLoaderVersion) {
        return { success: false, error: `Forgeバージョンを取得できませんでした (MC ${options.mcVersion})` }
      }
    }

    if (options.modLoader === 'neoforge' && !resolvedLoaderVersion) {
      resolvedLoaderVersion = await resolveNeoForgeVersion(options.mcVersion)
      if (!resolvedLoaderVersion) {
        return { success: false, error: `NeoForgeバージョンを取得できませんでした (MC ${options.mcVersion})` }
      }
    }

    // minecraft-launcher-core requires "mcVersion-loaderVersion" format for Forge/NeoForge
    // For Fabric/Quilt, we need to install the loader manually before launching
    if (options.modLoader === 'forge' || options.modLoader === 'neoforge') {
      loaderOpts.forge = resolvedLoaderVersion ? `${options.mcVersion}-${resolvedLoaderVersion}` : undefined
    } else if (options.modLoader === 'fabric' && resolvedLoaderVersion) {
      const installed = await installFabricLoader(
        options.gameDir,
        options.mcVersion,
        resolvedLoaderVersion,
        (msg) => event.sender.send('launch-log', msg)
      )
      if (!installed) {
        return { success: false, error: `Fabric Loader ${resolvedLoaderVersion} のインストールに失敗しました` }
      }
      loaderOpts.version = {
        number: `fabric-loader-${options.mcVersion}-${resolvedLoaderVersion}`,
        type: 'release'
      }
    } else if (options.modLoader === 'quilt' && resolvedLoaderVersion) {
      const installed = await installQuiltLoader(
        options.gameDir,
        options.mcVersion,
        resolvedLoaderVersion,
        (msg) => event.sender.send('launch-log', msg)
      )
      if (!installed) {
        return { success: false, error: `Quilt Loader ${resolvedLoaderVersion} のインストールに失敗しました` }
      }
      loaderOpts.version = {
        number: `quilt-loader-${options.mcVersion}-${resolvedLoaderVersion}`,
        type: 'release'
      }
    }

    // Launch and wait for initial start - Create NEW Client instance each time!
    event.sender.send('launch-log', `[Launcher] 起動準備完了 - version: ${loaderOpts.version?.number || options.mcVersion}`)
    event.sender.send('launch-log', `[Launcher] gameDir: ${options.gameDir}`)
    event.sender.send('launch-log', `[Launcher] javaPath: ${options.javaPath || getAutoJavaPath() || 'auto'}`)
    event.sender.send('launch-log', `[Launcher] Clientを新規作成...`)

    const launcher = new Client()
    event.sender.send('launch-log', `[Launcher] Client作成完了`)

    await new Promise<void>((resolve, reject) => {
      const TIMEOUT_MS = 300000 // 5 minutes for first launch (downloads take time)
      let progressCount = 0
      let dataCount = 0

      event.sender.send('launch-log', `[Launcher] Promise開始 - タイムアウト: ${TIMEOUT_MS/1000}秒`)

      const timeout = setTimeout(() => {
        event.sender.send('launch-log', `[Launcher] ⚠️ タイムアウト発生! progress: ${progressCount}回, data: ${dataCount}回`)
        reject(new Error('起動タイムアウト (5分)'))
      }, TIMEOUT_MS)

      let resolved = false

      const cleanup = () => {
        clearTimeout(timeout)
        resolved = true
      }

      launcher.on('progress', (e: { type: string; task: number; total: number }) => {
        progressCount++
        if (progressCount <= 5 || progressCount % 50 === 0) {
          event.sender.send('launch-log', `[Launcher] progressイベント #${progressCount}: ${e.type} ${e.task}/${e.total}`)
        }
        event.sender.send('launch-progress', e)
      })

      launcher.on('data', (data: Buffer | string) => {
        dataCount++
        const str = typeof data === 'string' ? data : data.toString()

        if (dataCount <= 10 || str.includes('Error') || str.includes('Exception') || str.includes('Failed')) {
          event.sender.send('launch-log', str)
        }

        // Resolve when game starts loading (earlier than before)
        if (!resolved && (
          str.includes('Launching') ||
          str.includes('Setting user:') ||
          str.includes('LWJGL Version') ||
          str.includes('OpenGL') ||
          str.includes('Minecraft main thread')
        )) {
          event.sender.send('launch-log', `[Launcher] ✅ 起動検出! (${dataCount}回目のdataイベント)`)
          cleanup()
          resolve()
        }
      })

      launcher.on('error', (err: Error) => {
        event.sender.send('launch-log', `[Launcher] ❌ errorイベント: ${err.message}`)
        if (!resolved) {
          cleanup()
          reject(err)
        }
      })

      launcher.on('close', (code: number) => {
        event.sender.send('launch-log', `[Launcher] closeイベント: code=${code}`)
        if (!resolved && code !== 0) {
          cleanup()
          reject(new Error(`Minecraft exited with code ${code}`))
        }
        event.sender.send('game-closed', code)
        if (options.closeOnLaunch) app.quit()
      })

      event.sender.send('launch-log', `[Launcher] launcher.launch()を呼び出し中...`)
      try {
        launcher.launch({
          authorization,
          root: options.gameDir,
          version: loaderOpts.version || { number: options.mcVersion, type: 'release' },
          ...loaderOpts,
          memory: { max: options.maxMemory || '4G', min: options.minMemory || '2G' },
          javaPath: options.javaPath || getAutoJavaPath() || undefined,
          customArgs: options.jvmArgs || []
        })
        event.sender.send('launch-log', `[Launcher] launcher.launch()呼び出し完了`)
      } catch (launchErr) {
        event.sender.send('launch-log', `[Launcher] ❌ launcher.launch()例外: ${(launchErr as Error).message}`)
        reject(launchErr)
      }
    })

    store.set('stats.launches', ((store.get('stats.launches', 0) as number) + 1))
    store.set('stats.lastLaunch', new Date().toISOString())
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── Java インストール (GraalVM CE JDK 25) ────────────────────────────────────
ipcMain.handle('install-java', async (event) => {
  try {
    const javaBaseDir = path.join(app.getPath('userData'), 'java')

    // すでにインストール済みなら再ダウンロードしない
    const existing = getAutoJavaPath()
    if (existing) return { success: true, javaPath: existing }

    // GitHub releases から最新の GraalVM CE JDK 25 を取得
    const releasesRes = await axios.get(
      'https://api.github.com/repos/graalvm/graalvm-ce-builds/releases?per_page=30',
      { timeout: 20000, headers: { 'User-Agent': 'ShouchanLauncher' } }
    )
    const release = (releasesRes.data as Array<{ tag_name: string; prerelease: boolean; assets: Array<{ name: string; browser_download_url: string }> }>)
      .find((r) => r.tag_name.startsWith('jdk-25') && !r.prerelease)
    if (!release) return { success: false, error: 'GraalVM JDK 25 のリリースが見つかりません' }

    const asset = release.assets.find(
      (a) => a.name.includes('windows-x64') && a.name.endsWith('.zip') && !a.name.includes('symbols')
    )
    if (!asset) return { success: false, error: 'Windows x64 の zip アセットが見つかりません' }

    fs.mkdirSync(javaBaseDir, { recursive: true })
    const zipPath = path.join(javaBaseDir, asset.name)

    const dlRes = await axios.get(asset.browser_download_url, {
      responseType: 'arraybuffer',
      timeout: 600000,
      onDownloadProgress: (p) => {
        event.sender.send('java-download-progress', { completed: p.loaded, total: p.total || 0 })
      }
    })
    fs.writeFileSync(zipPath, Buffer.from(dlRes.data))

    const zip = new AdmZip(zipPath)
    zip.extractAllTo(javaBaseDir, true)
    fs.unlinkSync(zipPath)

    const extractedDir = fs.readdirSync(javaBaseDir).find((d) =>
      fs.statSync(path.join(javaBaseDir, d)).isDirectory()
    )
    if (!extractedDir) return { success: false, error: '展開ディレクトリが見つかりません' }

    const javaExe = path.join(javaBaseDir, extractedDir, 'bin', 'java.exe')
    if (!fs.existsSync(javaExe)) return { success: false, error: 'java.exe が見つかりません' }

    return { success: true, javaPath: javaExe }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── ファイル選択ダイアログ ──────────────────────────────────────────────────
ipcMain.handle('select-directory', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return res.canceled ? null : res.filePaths[0]
})

ipcMain.handle('select-file', async (_e, filters?: Electron.FileFilter[]) => {
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: filters || [] })
  return res.canceled ? null : res.filePaths[0]
})

ipcMain.handle('get-app-version', () => app.getVersion())

// ── Shouchan アカウント API ────────────────────────────────────────────────
ipcMain.handle('account-register', async (_e, { username, email, password }: { username: string; email: string; password: string }) => {
  try {
    const res = await axios.post(`${MODPACK_SERVER_URL}/account/register`, { username, email, password }, { timeout: 10000 })
    const account = { id: res.data.id, username, email, role: res.data.role || 'player', createdAt: res.data.createdAt || new Date().toISOString(), token: res.data.token }
    store.set('launcherAccount', account)
    return { success: true, account }
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message
    return { success: false, error: msg }
  }
})

ipcMain.handle('account-login', async (_e, { email, password }: { email: string; password: string }) => {
  try {
    const res = await axios.post(`${MODPACK_SERVER_URL}/account/login`, { email, password }, { timeout: 10000 })
    const account = { id: res.data.id, username: res.data.username, email, role: res.data.role || 'player', createdAt: res.data.createdAt, token: res.data.token }
    store.set('launcherAccount', account)
    if (res.data.settings) {
      const s = res.data.settings
      if (s.gameDir) store.set('settings.gameDir', s.gameDir)
      if (s.maxMemory) store.set('settings.maxMemory', s.maxMemory)
      if (s.minMemory) store.set('settings.minMemory', s.minMemory)
      if (s.javaPath) store.set('settings.javaPath', s.javaPath)
      if (s.closeOnLaunch !== undefined) store.set('settings.closeOnLaunch', s.closeOnLaunch)
    }
    return { success: true, account }
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || (err as Error).message
    return { success: false, error: msg }
  }
})

ipcMain.handle('account-sync-settings', async () => {
  try {
    const account = store.get('launcherAccount') as { token?: string } | null
    if (!account?.token) return { success: false, error: 'Not logged in' }
    const settings = {
      gameDir: store.get('settings.gameDir'),
      maxMemory: store.get('settings.maxMemory'),
      minMemory: store.get('settings.minMemory'),
      javaPath: store.get('settings.javaPath'),
      closeOnLaunch: store.get('settings.closeOnLaunch')
    }
    await axios.put(`${MODPACK_SERVER_URL}/account/settings`, { settings }, {
      headers: { Authorization: `Bearer ${account.token}` },
      timeout: 10000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('account-verify-token', async () => {
  try {
    const account = store.get('launcherAccount') as { token?: string; role?: string } | null
    if (!account?.token) return { success: false, error: 'No token' }
    const res = await axios.get(`${MODPACK_SERVER_URL}/account/profile`, {
      headers: { Authorization: `Bearer ${account.token}` },
      timeout: 8000
    })
    const updatedAccount = { ...account, role: res.data.role }
    store.set('launcherAccount', updatedAccount)
    return { success: true, role: res.data.role as 'developer' | 'player' }
  } catch {
    return { success: false, error: 'Token invalid or server unreachable' }
  }
})

// ── 複数 ModPack API ────────────────────────────────────────────────────────
ipcMain.handle('fetch-modpack-list', async () => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/modpack/list`, { timeout: 10000 })
    return { success: true, data: res.data }
  } catch {
    try {
      const res = await axios.get(`${MODPACK_SERVER_URL}/modpack/info`, { timeout: 10000 })
      return { success: true, data: [{ id: 'default', ...res.data }] }
    } catch {
      return { success: false, data: [] }
    }
  }
})

ipcMain.handle('check-modpack-update-by-id', async (_e, id: string) => {
  const localVersion = (store.get(`modpack.versions.${id}`, '') as string) || ''
  try {
    const infoRes = await axios.get(modpackInfoUrl(id), { timeout: 10000 })
    const serverVersion: string = infoRes.data.version || ''
    if (serverVersion === localVersion) return { hasUpdate: false, serverVersion, localVersion }

    try {
      await axios.get(modpackFilesUrl(id), { timeout: 8000 })
    } catch {
      return { hasUpdate: false, serverVersion, localVersion }
    }

    return { hasUpdate: true, serverVersion, localVersion }
  } catch {
    return { hasUpdate: false, serverVersion: null, localVersion }
  }
})

ipcMain.handle('update-modpack-by-id', async (event, id: string, modpackDir: string) => {
  try {
    const res = await axios.get(modpackFilesUrl(id), { timeout: 30000 })
    const files: ManifestFileEntry[] = res.data
    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, error: '配布対象ファイルがありません。開発者メニューのファイル管理で配布対象を選択して保存してください。' }
    }

    let completed = 0
    for (const file of files) {
      const relativePath = normalizePath(file.path)
      const filePath = path.join(modpackDir, relativePath)
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      try {
        const fileRes = await axios.get(resolveManifestUrl(id, file), { responseType: 'arraybuffer', timeout: 120000 })
        fs.writeFileSync(filePath, Buffer.from(fileRes.data))
      } catch (fileErr: unknown) {
        const status = (fileErr as { response?: { status?: number } }).response?.status
        if (status === 404) {
          return { success: false, error: `ファイルが見つかりません: ${relativePath}\nサーバーのnginx設定を確認してください。` }
        }
        throw fileErr
      }

      completed++
      event.sender.send('modpack-progress', { completed, total: files.length, file: relativePath })
    }

    store.set(`modpack.versions.${id}`, res.headers['x-modpack-version'] || 'unknown')
    return { success: true }
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) {
      return { success: false, error: 'ModPackファイルがサーバーに存在しません。開発者メニューから一括アップロードを行ってください。' }
    }
    return { success: false, error: (err as Error).message }
  }
})

// ── 開発者 ModPack CRUD ─────────────────────────────────────────────────────
const devHeaders = () => ({ Authorization: `Bearer ${DEV_ADMIN_TOKEN}` })

ipcMain.handle('dev-list-modpacks', async () => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/admin/modpacks`, { headers: devHeaders(), timeout: 10000 })
    return { success: true, data: res.data }
  } catch {
    try {
      const res = await axios.get(`${MODPACK_SERVER_URL}/modpack/info`, { timeout: 10000 })
      return { success: true, data: [{ id: 'default', ...res.data }] }
    } catch (err: unknown) {
      return { success: false, error: (err as Error).message }
    }
  }
})

ipcMain.handle('dev-create-modpack', async (_e, info: unknown) => {
  try {
    const res = await axios.post(`${MODPACK_SERVER_URL}/admin/modpacks`, info, {
      headers: { ...devHeaders(), 'Content-Type': 'application/json' },
      timeout: 10000
    })
    return { success: true, id: res.data.id }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-update-modpack', async (_e, id: string, info: unknown) => {
  try {
    await axios.put(`${MODPACK_SERVER_URL}/admin/modpacks/${id}`, info, {
      headers: { ...devHeaders(), 'Content-Type': 'application/json' },
      timeout: 10000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-delete-modpack', async (_e, id: string) => {
  try {
    await axios.delete(`${MODPACK_SERVER_URL}/admin/modpacks/${id}`, {
      headers: devHeaders(),
      timeout: 10000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-upload-modpack-dir-by-id', async (event, id: string, localDir: string, version: string) => {
  try {
    const files: Array<{ localPath: string; relativePath: string }> = []
    function scanDir(dir: string, base: string = '') {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry)
        const rel = base ? `${base}/${entry}` : entry
        if (fs.statSync(full).isDirectory()) scanDir(full, rel)
        else files.push({ localPath: full, relativePath: rel })
      }
    }
    scanDir(localDir)

    const manifest: Array<{ path: string; url: string; hash: string }> = []
    let completed = 0

    for (const file of files) {
      const content = fs.readFileSync(file.localPath)
      const hash = crypto.createHash('sha256').update(content).digest('hex')

      const form = new FormData()
      form.append('path', file.relativePath)
      form.append('modpackId', id)
      form.append('file', fs.createReadStream(file.localPath))
      await axios.post(`${MODPACK_SERVER_URL}/admin/modpacks/${id}/upload`, form, {
        headers: { ...form.getHeaders(), ...devHeaders() },
        timeout: 300000
      })

      const fileUrl = modpackFileDownloadUrl(id, file.relativePath)
      manifest.push({ path: file.relativePath, url: fileUrl, hash })
      completed++
      event.sender.send('upload-progress', { current: completed, total: files.length, file: file.relativePath })
    }

    await axios.put(`${MODPACK_SERVER_URL}/admin/modpacks/${id}/manifest`, { version, files: manifest }, {
      headers: { ...devHeaders(), 'Content-Type': 'application/json' },
      timeout: 15000
    })

    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── 開発者 API ─────────────────────────────────────────────────────────────

ipcMain.handle('dev-get-files', async (_e, modpackId: string) => {
  try {
    const url = `${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/files`
    const res = await axios.get(url, { headers: devHeaders(), timeout: 10000 })
    return { success: true, data: res.data }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-upload-file', async (_e, modpackId: string, localPath: string, serverPath: string) => {
  try {
    const form = new FormData()
    form.append('path', serverPath)
    form.append('file', fs.createReadStream(localPath))
    const url = `${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/upload`
    await axios.post(url, form, {
      headers: { ...form.getHeaders(), ...devHeaders() },
      timeout: 120000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-upload-directory', async (event, modpackId: string, localDir: string, serverBasePath: string) => {
  try {
    const files: Array<{ localPath: string; relativePath: string }> = []
    function scanDir(dir: string, base: string = '') {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry)
        const rel = base ? `${base}/${entry}` : entry
        if (fs.statSync(full).isDirectory()) scanDir(full, rel)
        else files.push({ localPath: full, relativePath: rel })
      }
    }
    scanDir(localDir)
    const uploadUrl = `${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/upload`
    let completed = 0
    for (const file of files) {
      const serverPath = serverBasePath ? `${serverBasePath}/${file.relativePath}` : file.relativePath
      const form = new FormData()
      form.append('path', serverPath)
      form.append('file', fs.createReadStream(file.localPath))
      await axios.post(uploadUrl, form, { headers: { ...form.getHeaders(), ...devHeaders() }, timeout: 300000 })
      completed++
      event.sender.send('upload-progress', { current: completed, total: files.length, file: serverPath })
    }
    return { success: true, count: files.length }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-delete-file', async (_e, modpackId: string, serverPath: string) => {
  try {
    const url = `${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/files`
    await axios.delete(url, {
      headers: devHeaders(),
      data: { path: serverPath },
      timeout: 10000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-get-modpack-download-targets', async (_e, modpackId: string) => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/admin/modpacks`, { headers: devHeaders(), timeout: 10000 })
    const modpack = (res.data as Array<{ id: string; downloadTargets?: string[] }>).find((m) => m.id === modpackId)
    return { success: true, data: Array.isArray(modpack?.downloadTargets) ? modpack?.downloadTargets : [] }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-save-modpack-download-targets', async (_e, modpackId: string, paths: string[]) => {
  try {
    const cleaned = Array.from(new Set((paths || []).map(normalizePath).filter(Boolean)))

    const fileRes = await axios.get(`${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/files`, {
      headers: devHeaders(),
      timeout: 15000
    })
    const available = new Set(
      (fileRes.data as Array<{ path: string }>).map((f) => normalizePath(f.path))
    )
    const selected = cleaned.filter((p) => available.has(p))

    const infoRes = await axios.get(modpackInfoUrl(modpackId), { timeout: 10000 })
    const version = (infoRes.data?.version as string) || '1.0.0'
    const manifest = selected.map((p) => ({ path: p, url: modpackFileDownloadUrl(modpackId, p), hash: '' }))

    await axios.put(`${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/manifest`, {
      version,
      files: manifest
    }, {
      headers: { ...devHeaders(), 'Content-Type': 'application/json' },
      timeout: 15000
    })

    await axios.put(`${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}`, {
      downloadTargets: selected
    }, {
      headers: { ...devHeaders(), 'Content-Type': 'application/json' },
      timeout: 10000
    })

    return { success: true, count: selected.length }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-get-news', async () => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/admin/news`, { headers: devHeaders(), timeout: 10000 })
    return { success: true, data: res.data }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-update-news', async (_e, news: unknown) => {
  try {
    await axios.put(`${MODPACK_SERVER_URL}/admin/news`, news, {
      headers: { ...devHeaders(), 'Content-Type': 'application/json' },
      timeout: 10000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})
