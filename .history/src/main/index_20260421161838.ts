import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { Client, Authenticator } from 'minecraft-launcher-core'
import Store from 'electron-store'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawnSync } from 'child_process'
import { Auth } from 'msmc'
import FormData from 'form-data'
import AdmZip from 'adm-zip'
import { spawn } from 'child_process'

const store = new Store()
const authManager = new Auth('select_account')

const MODPACK_SERVER_URL = 'https://mc-shouchan.jp'
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
  xuid?: string
  userType?: 'msa' | 'legacy'
}

const collectVersionLibrariesRecursive = (
  gameDir: string,
  versionId: string,
  visited: Set<string> = new Set()
): MojangLibrary[] => {
  if (visited.has(versionId)) return []
  visited.add(versionId)

  const current = loadLocalVersionJson(gameDir, versionId)
  if (!current) return []

  const inherited = current.inheritsFrom
    ? collectVersionLibrariesRecursive(gameDir, current.inheritsFrom, visited)
    : []

  return [...inherited, ...(current.libraries || [])]
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

interface MojangLibraryRule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string }
}

interface MojangLibraryDownload {
  path: string
  url: string
}

interface MojangLibrary {
  name: string
  rules?: MojangLibraryRule[]
  natives?: Record<string, string>
  downloads?: {
    artifact?: MojangLibraryDownload
    classifiers?: Record<string, MojangLibraryDownload>
  }
}

interface MojangVersionJson {
  id: string
  inheritsFrom?: string
  libraries?: MojangLibrary[]
  assetIndex?: {
    id: string
    url: string
  }
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

const getMojangOsName = (): 'windows' | 'linux' | 'osx' => {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'osx'
  return 'linux'
}

const isLibraryAllowed = (lib: MojangLibrary): boolean => {
  if (!lib.rules || lib.rules.length === 0) return true
  let allowed = false
  const osName = getMojangOsName()
  const arch = process.arch === 'x64' ? 'x64' : process.arch
  for (const rule of lib.rules) {
    const osMatch = !rule.os
      || ((!rule.os.name || rule.os.name === osName) && (!rule.os.arch || rule.os.arch === arch))
    if (!osMatch) continue
    allowed = rule.action === 'allow'
  }
  return allowed
}

const getNativeClassifier = (lib: MojangLibrary): string | null => {
  if (!lib.natives) return null
  const osName = getMojangOsName()
  const raw = lib.natives[osName]
  if (!raw) return null
  const arch = process.arch === 'x64' ? '64' : '32'
  return raw.replace('${arch}', arch)
}

const loadLocalVersionJson = (gameDir: string, versionId: string): MojangVersionJson | null => {
  const jsonPath = path.join(gameDir, 'versions', versionId, `${versionId}.json`)
  if (!fs.existsSync(jsonPath)) return null
  return JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as MojangVersionJson
}

const resolveAssetIndexInfo = (
  gameDir: string,
  versionId: string,
  visited: Set<string> = new Set()
): { id: string; url: string } | null => {
  if (visited.has(versionId)) return null
  visited.add(versionId)

  const versionJson = loadLocalVersionJson(gameDir, versionId)
  if (!versionJson) return null
  if (versionJson.assetIndex?.id && versionJson.assetIndex?.url) return versionJson.assetIndex
  if (!versionJson.inheritsFrom) return null
  return resolveAssetIndexInfo(gameDir, versionJson.inheritsFrom, visited)
}

const ensureMinecraftAssets = async (
  gameDir: string,
  versionId: string,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; assetIndexId?: string; error?: string }> => {
  try {
    const assetIndexInfo = resolveAssetIndexInfo(gameDir, versionId)
    if (!assetIndexInfo) {
      return { success: false, error: `assetIndex 情報が見つかりません: ${versionId}` }
    }

    const assetsDir = path.join(gameDir, 'assets')
    const indexesDir = path.join(assetsDir, 'indexes')
    const objectsDir = path.join(assetsDir, 'objects')
    const assetIndexPath = path.join(indexesDir, `${assetIndexInfo.id}.json`)

    fs.mkdirSync(indexesDir, { recursive: true })
    fs.mkdirSync(objectsDir, { recursive: true })

    if (!fs.existsSync(assetIndexPath)) {
      onProgress?.(`[Launcher] assets index を取得中: ${assetIndexInfo.id}`)
      const idxRes = await axios.get(assetIndexInfo.url, { responseType: 'arraybuffer', timeout: 60000 })
      fs.writeFileSync(assetIndexPath, Buffer.from(idxRes.data))
    }

    const indexJson = JSON.parse(fs.readFileSync(assetIndexPath, 'utf-8')) as {
      objects?: Record<string, { hash: string }>
    }
    const objects = indexJson.objects || {}
    const entries = Object.values(objects).filter((v) => typeof v?.hash === 'string' && v.hash.length >= 40)

    let done = 0
    const total = entries.length
    for (const entry of entries) {
      done++
      const hash = entry.hash
      const head = hash.slice(0, 2)
      const localPath = path.join(objectsDir, head, hash)
      if (fs.existsSync(localPath)) continue

      fs.mkdirSync(path.dirname(localPath), { recursive: true })
      const url = `https://resources.download.minecraft.net/${head}/${hash}`
      const objRes = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 })
      fs.writeFileSync(localPath, Buffer.from(objRes.data))

      if (done % 250 === 0 || done === total) {
        onProgress?.(`[Launcher] assets 取得: ${done}/${total}`)
      }
    }

    onProgress?.(`[Launcher] assets 確認完了: ${assetIndexInfo.id} (${total}件)`)
    return { success: true, assetIndexId: assetIndexInfo.id }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

const ensureOfficialMinecraftLibraries = async (gameDir: string, mcVersion: string, onProgress?: (msg: string) => void): Promise<boolean> => {
  try {
    const visited = new Set<string>()
    const queue: string[] = [mcVersion]
    const libDir = path.join(gameDir, 'libraries')
    const downloadTargets = new Map<string, string>()

    while (queue.length > 0) {
      const currentVersion = queue.shift() as string
      if (visited.has(currentVersion)) continue
      visited.add(currentVersion)

      const versionJson = loadLocalVersionJson(gameDir, currentVersion)
      if (!versionJson) {
        onProgress?.(`[Launcher] ⚠️ version json が見つかりません: ${currentVersion}`)
        continue
      }

      if (versionJson.inheritsFrom && !visited.has(versionJson.inheritsFrom)) {
        queue.push(versionJson.inheritsFrom)
      }

      for (const lib of versionJson.libraries || []) {
        if (!isLibraryAllowed(lib)) continue

        const artifact = lib.downloads?.artifact
        if (artifact?.path && artifact?.url) {
          downloadTargets.set(artifact.path, artifact.url)
        }

        const classifier = getNativeClassifier(lib)
        if (classifier) {
          const nativeArtifact = lib.downloads?.classifiers?.[classifier]
          if (nativeArtifact?.path && nativeArtifact?.url) {
            downloadTargets.set(nativeArtifact.path, nativeArtifact.url)
          }
        }
      }
    }

    let done = 0
    const total = downloadTargets.size
    for (const [artifactPath, artifactUrl] of downloadTargets.entries()) {
      done++
      const localPath = path.join(libDir, artifactPath)
      if (fs.existsSync(localPath)) continue
      fs.mkdirSync(path.dirname(localPath), { recursive: true })
      const res = await axios.get(artifactUrl, { responseType: 'arraybuffer', timeout: 60000 })
      fs.writeFileSync(localPath, Buffer.from(res.data))
      if (done % 25 === 0 || done === total) {
        onProgress?.(`[Launcher] 公式libraries取得: ${done}/${total}`)
      }
    }

    onProgress?.(`[Launcher] 公式ランチャー準拠librariesの確認完了 (${total}件)`)
    return true
  } catch (err) {
    onProgress?.(`[Launcher] 公式libraries取得エラー: ${(err as Error).message}`)
    return false
  }
}

const resolveManifestUrl = (id: string, entry: ManifestFileEntry): string => {
  if (!entry.url) return modpackFileDownloadUrl(id, entry.path)
  if (/^https?:\/\//i.test(entry.url)) return entry.url
  return `${MODPACK_SERVER_URL}${entry.url.startsWith('/') ? '' : '/'}${entry.url}`
}

const detectJavaMajorVersion = (javaPath: string): number | undefined => {
  try {
    const out = spawnSync(javaPath, ['-version'], { encoding: 'utf8' })
    const text = `${out.stderr || ''}\n${out.stdout || ''}`
    const quoted = text.match(/version\s+"(\d+)(?:\.(\d+))?.*"/)
    if (quoted) {
      const first = Number(quoted[1])
      const second = Number(quoted[2] || '0')
      return first === 1 ? second : first
    }
    const simple = text.match(/(\d+)\./)
    return simple ? Number(simple[1]) : undefined
  } catch {
    return undefined
  }
}

const resolveForgeVersion = async (mcVersion: string): Promise<string | undefined> => {
  try {
    const res = await axios.get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json', { timeout: 10000 })
    const promos = (res.data?.promos || {}) as Record<string, string>
    const direct = promos[`${mcVersion}-recommended`] || promos[`${mcVersion}-latest`]
    if (direct) return direct

    const mcParts = mcVersion.split('.').map((n) => Number(n))
    const basePrefix = mcParts.length >= 2 ? `${mcParts[0]}.${mcParts[1]}.` : `${mcVersion}.`

    const candidates = Object.keys(promos)
      .filter((k) => k.endsWith('-recommended') || k.endsWith('-latest'))
      .map((k) => ({
        key: k,
        type: k.endsWith('-recommended') ? 'recommended' : 'latest',
        mc: k.replace(/-(recommended|latest)$/, '')
      }))
      .filter((x) => x.mc.startsWith(mcVersion) || x.mc.startsWith(basePrefix))

    if (candidates.length === 0) return undefined

    candidates.sort((a, b) => {
      const ap = a.mc.split('.').map((n) => Number(n))
      const bp = b.mc.split('.').map((n) => Number(n))
      for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        const av = ap[i] || 0
        const bv = bp[i] || 0
        if (av !== bv) return bv - av
      }
      if (a.type !== b.type) return a.type === 'recommended' ? -1 : 1
      return 0
    })

    return promos[candidates[0].key]
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

  // アップデート機能を初期化
  setupAutoUpdater(mainWindow)
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
      refreshToken,
      xuid: (mclcToken as unknown as { meta?: { xuid?: string }; xuid?: string }).meta?.xuid
        || (mclcToken as unknown as { xuid?: string }).xuid,
      userType: 'msa'
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
      refreshToken,
      xuid: (mclcToken as unknown as { meta?: { xuid?: string }; xuid?: string }).meta?.xuid
        || (mclcToken as unknown as { xuid?: string }).xuid,
      userType: 'msa'
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

// ── Java 21 自動ダウンロード (Fabric/Quilt用) ─────────────────────────────────
const ensureJava21 = async (onProgress?: (msg: string) => void): Promise<string | null> => {
  const java21Dir = path.join(app.getPath('userData'), 'java21')
  const javaExe = path.join(java21Dir, 'bin', 'java.exe')

  if (fs.existsSync(javaExe)) {
    return javaExe
  }

  onProgress?.(`[Launcher] Java 21をダウンロード中...`)

  try {
    fs.mkdirSync(java21Dir, { recursive: true })

    // Eclipse Temurin Java 21 for Windows x64
    const javaUrl = 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip'
    const zipPath = path.join(app.getPath('temp'), 'java21.zip')

    // Download
    const res = await axios.get(javaUrl, {
      responseType: 'arraybuffer',
      timeout: 300000, // 5 minutes
      onDownloadProgress: (progress) => {
        if (progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100)
          if (percent % 10 === 0) {
            onProgress?.(`[Launcher] Java 21ダウンロード: ${percent}%`)
          }
        }
      }
    })

    fs.writeFileSync(zipPath, Buffer.from(res.data))
    onProgress?.(`[Launcher] Java 21ダウンロード完了、解凍中...`)

    // Extract using adm-zip
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(java21Dir, true)
    fs.unlinkSync(zipPath)

    // Find the extracted directory (usually jdk-21.*)
    const extractedDirs = fs.readdirSync(java21Dir).filter(d =>
      fs.statSync(path.join(java21Dir, d)).isDirectory() && d.startsWith('jdk-21')
    )

    if (extractedDirs.length === 0) {
      onProgress?.(`[Launcher] Java 21解凍失敗`)
      return null
    }

    // Move contents from jdk-21.* to java21 root
    const extractedDir = path.join(java21Dir, extractedDirs[0])
    const files = fs.readdirSync(extractedDir)
    for (const file of files) {
      fs.renameSync(path.join(extractedDir, file), path.join(java21Dir, file))
    }
    fs.rmdirSync(extractedDir)

    if (fs.existsSync(javaExe)) {
      onProgress?.(`[Launcher] Java 21準備完了: ${javaExe}`)
      return javaExe
    }

    return null
  } catch (err) {
    onProgress?.(`[Launcher] Java 21ダウンロードエラー: ${(err as Error).message}`)
    return null
  }
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
  'https://maven.fabricmc.net',  // Fabric first
  'https://maven.quiltmc.org/repository/release',  // Quilt
  'https://repo1.maven.org/maven2'  // Maven Central last
]

// ── ライブラリダウンロード ───────────────────────────────────────────────────
const downloadLibrary = async (libDir: string, artifact: string, url?: string): Promise<boolean> => {
  try {
    const { path: mavenPath, name } = parseMavenPath(artifact)
    const libPath = path.join(libDir, mavenPath)

    if (fs.existsSync(libPath)) return true

    fs.mkdirSync(path.dirname(libPath), { recursive: true })

    // Validate helper - check if data is a valid JAR (starts with PK)
    const isValidJar = (data: Buffer): boolean => {
      return data.length > 1000 && data[0] === 0x50 && data[1] === 0x4B // PK (zip magic)
    }

    // Try provided URL first
    if (url) {
      try {
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 })
        const data = Buffer.from(res.data)
        if (isValidJar(data)) {
          fs.writeFileSync(libPath, data)
          return true
        }
      } catch {
        // Fall through to try repos
      }
    }

    // Try each maven repo
    for (const repo of MAVEN_REPOS) {
      try {
        const fullUrl = `${repo}/${mavenPath}`
        const res = await axios.get(fullUrl, { responseType: 'arraybuffer', timeout: 60000 })
        const data = Buffer.from(res.data)
        if (isValidJar(data)) {
          fs.writeFileSync(libPath, data)
          return true
        }
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

// ── JARダウンロード ──────────────────────────────────────────────────────────
const MIN_JAR_SIZE = 50000 // 50KB minimum for a valid loader jar

const downloadJar = async (url: string, destPath: string, minSize = MIN_JAR_SIZE): Promise<boolean> => {
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 })
    const data = Buffer.from(res.data)
    // Check PK magic bytes and minimum size
    if (data.length < minSize || data[0] !== 0x50 || data[1] !== 0x4B) return false
    fs.writeFileSync(destPath, data)
    return true
  } catch {
    return false
  }
}

// ── 追加ライブラリダウンロード (mods用) ─────────────────────────────────────────
const downloadAdditionalLibs = async (gameDir: string, onProgress?: (msg: string) => void): Promise<boolean> => {
  try {
    const libDir = path.join(gameDir, 'libraries')

    // slf4j-api (required by many mods)
    const slf4jApi = 'org.slf4j:slf4j-api:2.0.9'
    const slf4jApiPath = path.join(libDir, 'org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.jar')
    if (!fs.existsSync(slf4jApiPath)) {
      onProgress?.(`[Launcher] Downloading slf4j-api...`)
      await downloadLibrary(libDir, slf4jApi, 'https://repo1.maven.org/maven2')
    }

    // slf4j-simple (logging implementation)
    const slf4jSimple = 'org.slf4j:slf4j-simple:2.0.9'
    const slf4jSimplePath = path.join(libDir, 'org/slf4j/slf4j-simple/2.0.9/slf4j-simple-2.0.9.jar')
    if (!fs.existsSync(slf4jSimplePath)) {
      onProgress?.(`[Launcher] Downloading slf4j-simple...`)
      await downloadLibrary(libDir, slf4jSimple, 'https://repo1.maven.org/maven2')
    }

    // JOML (math library for Sodium)
    const joml = 'org.joml:joml:1.10.8'
    const jomlPath = path.join(libDir, 'org/joml/joml/1.10.8/joml-1.10.8.jar')
    if (!fs.existsSync(jomlPath)) {
      onProgress?.(`[Launcher] Downloading joml...`)
      await downloadLibrary(libDir, joml, 'https://repo1.maven.org/maven2')
    }

    // FastUtil (required by Minecraft and mods)
    const fastutil = 'it.unimi.dsi:fastutil:8.5.12'
    const fastutilPath = path.join(libDir, 'it/unimi/dsi/fastutil/8.5.12/fastutil-8.5.12.jar')
    if (!fs.existsSync(fastutilPath)) {
      onProgress?.(`[Launcher] Downloading fastutil...`)
      await downloadLibrary(libDir, fastutil, 'https://repo1.maven.org/maven2')
    }

    // Log4j (required by many mods for logging)
    const log4jApi = 'org.apache.logging.log4j:log4j-api:2.22.1'
    const log4jCore = 'org.apache.logging.log4j:log4j-core:2.22.1'
    const log4jApiPath = path.join(libDir, 'org/apache/logging/log4j/log4j-api/2.22.1/log4j-api-2.22.1.jar')
    const log4jCorePath = path.join(libDir, 'org/apache/logging/log4j/log4j-core/2.22.1/log4j-core-2.22.1.jar')
    if (!fs.existsSync(log4jApiPath)) {
      onProgress?.(`[Launcher] Downloading log4j-api...`)
      await downloadLibrary(libDir, log4jApi, 'https://repo1.maven.org/maven2')
    }
    if (!fs.existsSync(log4jCorePath)) {
      onProgress?.(`[Launcher] Downloading log4j-core...`)
      await downloadLibrary(libDir, log4jCore, 'https://repo1.maven.org/maven2')
    }

    // Google Guava (required by many mods)
    const guava = 'com.google.guava:guava:32.1.3-jre'
    const guavaPath = path.join(libDir, 'com/google/guava/guava/32.1.3-jre/guava-32.1.3-jre.jar')
    if (!fs.existsSync(guavaPath)) {
      onProgress?.(`[Launcher] Downloading guava...`)
      await downloadLibrary(libDir, guava, 'https://repo1.maven.org/maven2')
    }

    // Mojang Logging (required by Minecraft client bootstrap)
    const mojangLogging = 'com.mojang:logging:1.5.10'
    const mojangLoggingPath = path.join(libDir, 'com/mojang/logging/1.5.10/logging-1.5.10.jar')
    if (!fs.existsSync(mojangLoggingPath)) {
      onProgress?.(`[Launcher] Downloading mojang-logging...`)
      await downloadLibrary(libDir, mojangLogging, 'https://repo1.maven.org/maven2')
    }

    // Gson (required by Fabric ecosystem mods such as ImmediatelyFast)
    const gson = 'com.google.code.gson:gson:2.11.0'
    const gsonPath = path.join(libDir, 'com/google/code/gson/gson/2.11.0/gson-2.11.0.jar')
    if (!fs.existsSync(gsonPath)) {
      onProgress?.(`[Launcher] Downloading gson...`)
      await downloadLibrary(libDir, gson, 'https://repo1.maven.org/maven2')
    }

    // jopt-simple (required by mods)
    const jopt = 'net.sf.jopt-simple:jopt-simple:5.0.4'
    const joptPath = path.join(libDir, 'net/sf/jopt-simple/jopt-simple/5.0.4/jopt-simple-5.0.4.jar')
    if (!fs.existsSync(joptPath)) {
      onProgress?.(`[Launcher] Downloading jopt-simple...`)
      await downloadLibrary(libDir, jopt, 'https://repo1.maven.org/maven2')
    }

    // LWJGL (required by Minecraft and mods)
    const lwjglVersion = '3.3.3'
    const lwjglLibs = [
      `org.lwjgl:lwjgl:${lwjglVersion}`,
      `org.lwjgl:lwjgl-glfw:${lwjglVersion}`,
      `org.lwjgl:lwjgl-jemalloc:${lwjglVersion}`,
      `org.lwjgl:lwjgl-openal:${lwjglVersion}`,
      `org.lwjgl:lwjgl-opengl:${lwjglVersion}`,
      `org.lwjgl:lwjgl-stb:${lwjglVersion}`,
    ]
    for (const lib of lwjglLibs) {
      const { path: mavenPath, name } = parseMavenPath(lib)
      const libPath = path.join(libDir, mavenPath)
      if (!fs.existsSync(libPath)) {
        onProgress?.(`[Launcher] Downloading ${name}...`)
        await downloadLibrary(libDir, lib, 'https://repo1.maven.org/maven2')
      }
    }

    // LWJGL natives (DLL files for Windows)
    const lwjglNatives = [
      `org.lwjgl:lwjgl:${lwjglVersion}:natives-windows`,
      `org.lwjgl:lwjgl-glfw:${lwjglVersion}:natives-windows`,
      `org.lwjgl:lwjgl-jemalloc:${lwjglVersion}:natives-windows`,
      `org.lwjgl:lwjgl-openal:${lwjglVersion}:natives-windows`,
      `org.lwjgl:lwjgl-opengl:${lwjglVersion}:natives-windows`,
      `org.lwjgl:lwjgl-stb:${lwjglVersion}:natives-windows`,
    ]
    for (const lib of lwjglNatives) {
      const { path: mavenPath, name } = parseMavenPath(lib)
      const libPath = path.join(libDir, mavenPath)
      if (!fs.existsSync(libPath)) {
        onProgress?.(`[Launcher] Downloading ${name} (natives)...`)
        await downloadLibrary(libDir, lib, 'https://repo1.maven.org/maven2')
      }
    }

    return true
  } catch (err) {
    onProgress?.(`[Launcher] Error downloading additional libs: ${(err as Error).message}`)
    return false
  }
}

const downloadMinecraftClient = async (gameDir: string, mcVersion: string, onProgress?: (msg: string) => void): Promise<boolean> => {
  try {
    const mcJarDir = path.join(gameDir, 'versions', mcVersion)
    const mcJarPath = path.join(mcJarDir, `${mcVersion}.jar`)
    const mcVersionJsonPath = path.join(mcJarDir, `${mcVersion}.json`)

    if (fs.existsSync(mcJarPath) && fs.existsSync(mcVersionJsonPath)) return true

    onProgress?.(`[Launcher] Downloading Minecraft ${mcVersion} client...`)

    // Get version manifest
    const manifestRes = await axios.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { timeout: 30000 })
    const manifest = manifestRes.data as { versions: Array<{ id: string; url: string }> }
    const versionInfo = manifest.versions.find((v) => v.id === mcVersion)

    if (!versionInfo) {
      onProgress?.(`[Launcher] Minecraft version ${mcVersion} not found in manifest`)
      return false
    }

    // Get version details
    const versionRes = await axios.get(versionInfo.url, { timeout: 30000 })
    const versionData = versionRes.data as {
      downloads?: { client?: { url: string; sha1: string } }
      libraries?: Array<{ name: string }>
    }
    const clientUrl = versionData.downloads?.client?.url

    if (!clientUrl) {
      onProgress?.(`[Launcher] Client download URL not found`)
      return false
    }

    fs.mkdirSync(mcJarDir, { recursive: true })
    fs.writeFileSync(mcVersionJsonPath, JSON.stringify(versionData, null, 2))
    onProgress?.(`[Launcher] Saved version json: ${mcVersion}.json`)

    const success = await downloadJar(clientUrl, mcJarPath)

    if (success) {
      onProgress?.(`[Launcher] Minecraft client downloaded successfully`)
    } else {
      onProgress?.(`[Launcher] Failed to download Minecraft client`)
    }

    return success
  } catch (err) {
    onProgress?.(`[Launcher] Error downloading Minecraft: ${(err as Error).message}`)
    return false
  }
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
    const versionJarPath = path.join(versionDir, `${versionId}.jar`)
    const libDir = path.join(gameDir, 'libraries')

    // Download version JSON if not exists
    if (!fs.existsSync(versionJsonPath)) {
      onProgress?.(`[Fabric] Loading profile for ${loaderVersion}...`)
      const res = await axios.get(
        `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`,
        { timeout: 30000 }
      )
      fs.mkdirSync(versionDir, { recursive: true })
      fs.writeFileSync(versionJsonPath, JSON.stringify(res.data, null, 2))
    }

    // Download the loader jar from Fabric Maven
    const loaderUrl = `https://maven.fabricmc.net/net/fabricmc/fabric-loader/${loaderVersion}/fabric-loader-${loaderVersion}.jar`
    if (fs.existsSync(versionJarPath)) {
      const existing = fs.readFileSync(versionJarPath)
      // Fabric loader jar should be at least 500KB (typical size is 1.5-2MB)
      if (existing.length < MIN_JAR_SIZE || existing[0] !== 0x50 || existing[1] !== 0x4B) {
        onProgress?.(`[Fabric] Removing corrupt loader jar (${existing.length} bytes), re-downloading...`)
        fs.unlinkSync(versionJarPath)
      }
    }
    if (!fs.existsSync(versionJarPath)) {
      onProgress?.(`[Fabric] Downloading loader jar...`)
      const success = await downloadJar(loaderUrl, versionJarPath)
      if (!success) {
        onProgress?.(`[Fabric] Failed to download loader jar from version dir, will rely on libraries/`)
      }
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
    const versionJarPath = path.join(versionDir, `${versionId}.jar`)
    const libDir = path.join(gameDir, 'libraries')

    // Download version JSON if not exists
    if (!fs.existsSync(versionJsonPath)) {
      onProgress?.(`[Quilt] Loading profile for ${loaderVersion}...`)
      const res = await axios.get(
        `https://meta.quiltmc.org/v3/versions/loader/${mcVersion}/${loaderVersion}/profile/json`,
        { timeout: 30000 }
      )
      fs.mkdirSync(versionDir, { recursive: true })
      fs.writeFileSync(versionJsonPath, JSON.stringify(res.data, null, 2))
    }

    // Download the loader jar from Quilt Maven
    if (!fs.existsSync(versionJarPath)) {
      onProgress?.(`[Quilt] Downloading loader jar...`)
      const loaderUrl = `https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-loader/${loaderVersion}/quilt-loader-${loaderVersion}.jar`
      const success = await downloadJar(loaderUrl, versionJarPath)
      if (!success) {
        onProgress?.(`[Quilt] Failed to download loader jar`)
      }
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
    const storedAuth = store.get('mc.auth') as MCAuthStore | null
    if (!storedAuth) return { success: false, error: 'MC認証が見つかりません。再ログインしてください。' }

    let mcAuth = storedAuth
    if (!mcAuth.isOffline) {
      if (!mcAuth.refreshToken) {
        return { success: false, error: 'Microsoft認証情報の有効期限が切れている可能性があります。再ログインしてください。' }
      }
      try {
        event.sender.send('launch-log', '[Launcher] Microsoftトークンを更新中...')
        const xbox = await authManager.refresh(mcAuth.refreshToken)
        const mc = await xbox.getMinecraft()
        const mclcToken = mc.mclc()
        const refreshToken = xbox.save()
        mcAuth = {
          access_token: mclcToken.access_token,
          client_token: mclcToken.client_token || mcAuth.client_token || 'shouchan-client',
          uuid: mclcToken.uuid,
          name: mclcToken.name || mcAuth.name,
          isOffline: false,
          refreshToken,
          xuid: (mclcToken as unknown as { meta?: { xuid?: string }; xuid?: string }).meta?.xuid
            || (mclcToken as unknown as { xuid?: string }).xuid
        }
        store.set('mc.auth', mcAuth)
        event.sender.send('launch-log', '[Launcher] Microsoftトークン更新完了')
      } catch {
        return { success: false, error: 'Microsoftトークンの更新に失敗しました。再ログインしてください。' }
      }
    } else {
      event.sender.send('launch-log', '[Launcher] オフライン認証です。online-modeサーバーには接続できません。')
    }

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
      ? await Authenticator.getAuth(mcAuth.name)
      : {
          access_token: mcAuth.access_token,
          client_token: mcAuth.client_token,
          uuid: mcAuth.uuid,
          name: mcAuth.name,
          user_properties: {},
          xuid: mcAuth.xuid,
          user_type: 'msa'
        }

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
      event.sender.send('launch-log', `[Launcher] Forgeバージョン自動解決: ${resolvedLoaderVersion}`)
    }

    if (options.modLoader === 'neoforge' && !resolvedLoaderVersion) {
      resolvedLoaderVersion = await resolveNeoForgeVersion(options.mcVersion)
      if (!resolvedLoaderVersion) {
        return { success: false, error: `NeoForgeバージョンを取得できませんでした (MC ${options.mcVersion})` }
      }
      event.sender.send('launch-log', `[Launcher] NeoForgeバージョン自動解決: ${resolvedLoaderVersion}`)
    }

    const mcDownloaded = await downloadMinecraftClient(
      options.gameDir,
      options.mcVersion,
      (msg) => event.sender.send('launch-log', msg)
    )
    if (!mcDownloaded) {
      return { success: false, error: `Minecraft ${options.mcVersion} client のダウンロードに失敗しました` }
    }

    const officialLibsReady = await ensureOfficialMinecraftLibraries(
      options.gameDir,
      options.mcVersion,
      (msg) => event.sender.send('launch-log', msg)
    )
    if (!officialLibsReady) {
      return { success: false, error: '公式librariesの取得に失敗しました' }
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
      // Download additional libs required by mods (slf4j)
      await downloadAdditionalLibs(options.gameDir, (msg) => event.sender.send('launch-log', msg))
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
      // Download additional libs required by mods (slf4j)
      await downloadAdditionalLibs(options.gameDir, (msg) => event.sender.send('launch-log', msg))
      loaderOpts.version = {
        number: `quilt-loader-${options.mcVersion}-${resolvedLoaderVersion}`,
        type: 'release'
      }
    }

    const launchVersionId = loaderOpts.version?.number || options.mcVersion

    const assetsReady = await ensureMinecraftAssets(
      options.gameDir,
      launchVersionId,
      (msg) => event.sender.send('launch-log', msg)
    )
    if (!assetsReady.success) {
      return { success: false, error: `assets の取得に失敗しました: ${assetsReady.error || 'unknown error'}` }
    }
    const assetIndexId = assetsReady.assetIndexId || options.mcVersion

    // Launch using direct Java spawn (MCLC doesn't work well with Fabric)
    event.sender.send('launch-log', `[Launcher] 起動準備完了 - version: ${launchVersionId}`)
    event.sender.send('launch-log', `[Launcher] gameDir: ${options.gameDir}`)

    // For Fabric/Quilt, use Java 21 (not Java 25) for compatibility
    let javaPath: string
    if (options.modLoader === 'fabric' || options.modLoader === 'quilt') {
      const java21Path = await ensureJava21((msg) => event.sender.send('launch-log', msg))
      if (java21Path) {
        javaPath = java21Path
        event.sender.send('launch-log', `[Launcher] 使用するJava: Java 21 (Fabric/Quilt対応)`)
      } else {
        javaPath = options.javaPath || getAutoJavaPath() || 'java'
        event.sender.send('launch-log', `[Launcher] ⚠️ Java 21取得失敗、フォールバック: ${javaPath}`)
      }
    } else {
      javaPath = options.javaPath || getAutoJavaPath() || 'java'
      event.sender.send('launch-log', `[Launcher] 使用するJava: ${javaPath}`)
    }

    event.sender.send('launch-log', `[Launcher] 直接Java起動を開始...`)

    await new Promise<void>(async (resolve, reject) => {
      const versionId = launchVersionId
      const versionDir = path.join(options.gameDir, 'versions', versionId)
      const versionJsonPath = path.join(versionDir, `${versionId}.json`)

      // Read version JSON
      let versionJson: {
        mainClass?: string
        libraries?: Array<{ name: string; downloads?: { artifact?: { path: string; url: string; sha1: string } } }>
        minecraftArguments?: string
        arguments?: { game?: unknown[]; jvm?: unknown[] }
        type?: string
      }
      try {
        versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf-8'))
      } catch {
        reject(new Error(`Version JSON読み込み失敗: ${versionJsonPath}`))
        return
      }

      // Build classpath - ORDER MATTERS! Loader must be first
      const libDir = path.join(options.gameDir, 'libraries')
      const classpath: string[] = []

      // 1. Add version jar FIRST (Fabric/Quilt loader must be at beginning)
      const versionJar = path.join(versionDir, `${versionId}.jar`)
      if (fs.existsSync(versionJar)) {
        classpath.push(versionJar)
        event.sender.send('launch-log', `[Launcher] Added version jar (FIRST): ${versionJar}`)
      } else {
        event.sender.send('launch-log', `[Launcher] ⚠️ Version jar not found: ${versionJar}`)
      }

      // 2. Add Minecraft client jar
      const mcVersion = options.mcVersion
      const mcJar = path.join(options.gameDir, 'versions', mcVersion, `${mcVersion}.jar`)
      if (fs.existsSync(mcJar)) {
        classpath.push(mcJar)
        event.sender.send('launch-log', `[Launcher] Added MC jar: ${mcJar}`)
      } else {
        event.sender.send('launch-log', `[Launcher] ⚠️ MC jar not found: ${mcJar}`)
      }

      // 3. Add libraries from profile + inherited/base Minecraft versions
      // Skip the loader jar as it's already added as versionJar
      let allLibraries: MojangLibrary[] =
        collectVersionLibrariesRecursive(options.gameDir, versionId)
      event.sender.send('launch-log', `[Launcher] Libraries merged (inherits 포함): ${allLibraries.length}`)

      // 重複除去（後勝ち）
      const byName = new Map<string, MojangLibrary>()
      for (const lib of allLibraries) {
        if (lib?.name) byName.set(lib.name, lib)
      }
      allLibraries = Array.from(byName.values())

      // Use a Set to avoid duplicate classpath entries
      const classpathSet = new Set<string>(classpath)

      let libCount = 0
      let missingLibs: string[] = []
      for (const lib of allLibraries) {
        if (lib.name) {
          // Skip fabric-loader and quilt-loader as they're already added as versionJar
          if (lib.name.startsWith('net.fabricmc:fabric-loader:') ||
              lib.name.startsWith('org.quiltmc:quilt-loader:')) {
            event.sender.send('launch-log', `[Launcher] Skipping duplicate loader lib: ${lib.name}`)
            continue
          }

          const artifactPath = lib.downloads?.artifact?.path
          const fallbackMavenPath = parseMavenPath(lib.name).path
          const libPath = path.join(libDir, artifactPath || fallbackMavenPath)

          if (!fs.existsSync(libPath)) {
            if (artifactPath && lib.downloads?.artifact?.url) {
              try {
                fs.mkdirSync(path.dirname(libPath), { recursive: true })
                const res = await axios.get(lib.downloads.artifact.url, { responseType: 'arraybuffer', timeout: 60000 })
                fs.writeFileSync(libPath, Buffer.from(res.data))
              } catch {
                await downloadLibrary(libDir, lib.name, lib.downloads?.artifact?.url)
              }
            } else {
              await downloadLibrary(libDir, lib.name, lib.downloads?.artifact?.url)
            }
          }

          if (fs.existsSync(libPath)) {
            if (!classpathSet.has(libPath)) {
              classpath.push(libPath)
              classpathSet.add(libPath)
              libCount++
            }
          } else {
            missingLibs.push(lib.name)
          }
        }
      }

      // Report missing libraries
      if (missingLibs.length > 0) {
        event.sender.send('launch-log', `[Launcher] ⚠️ Missing ${missingLibs.length} libraries:`)
        for (const lib of missingLibs.slice(0, 5)) {
          event.sender.send('launch-log', `[Launcher]   - ${lib}`)
        }
        if (missingLibs.length > 5) {
          event.sender.send('launch-log', `[Launcher]   ... and ${missingLibs.length - 5} more`)
        }
      }

      // 4. Add slf4j libraries (required by mods)
      // Use bootstrap classpath so Fabric's KnotClassLoader can find them
      const slf4jApiPath = path.join(libDir, 'org/slf4j/slf4j-api/2.0.9/slf4j-api-2.0.9.jar')
      const slf4jSimplePath = path.join(libDir, 'org/slf4j/slf4j-simple/2.0.9/slf4j-simple-2.0.9.jar')
      let bootClasspath: string[] = []
      if (fs.existsSync(slf4jApiPath)) {
        bootClasspath.push(slf4jApiPath)
        event.sender.send('launch-log', `[Launcher] Added slf4j to boot classpath: ${path.basename(slf4jApiPath)}`)
      }
      if (fs.existsSync(slf4jSimplePath)) {
        bootClasspath.push(slf4jSimplePath)
        event.sender.send('launch-log', `[Launcher] Added slf4j to boot classpath: ${path.basename(slf4jSimplePath)}`)
      }

      // 5. Add JOML (math library for Sodium)
      const jomlPath = path.join(libDir, 'org/joml/joml/1.10.8/joml-1.10.8.jar')
      if (fs.existsSync(jomlPath)) {
        classpath.push(jomlPath)
        libCount++
        event.sender.send('launch-log', `[Launcher] Added JOML: joml-1.10.8.jar`)
      }

      // 6. Add FastUtil (required by Minecraft and mods)
      const fastutilPath = path.join(libDir, 'it/unimi/dsi/fastutil/8.5.12/fastutil-8.5.12.jar')
      if (fs.existsSync(fastutilPath)) {
        classpath.push(fastutilPath)
        libCount++
        event.sender.send('launch-log', `[Launcher] Added FastUtil: fastutil-8.5.12.jar`)
      }

      // 7. Add Log4j (required by many mods)
      const log4jApiPath = path.join(libDir, 'org/apache/logging/log4j/log4j-api/2.22.1/log4j-api-2.22.1.jar')
      const log4jCorePath = path.join(libDir, 'org/apache/logging/log4j/log4j-core/2.22.1/log4j-core-2.22.1.jar')
      if (fs.existsSync(log4jApiPath)) {
        classpath.push(log4jApiPath)
        libCount++
        event.sender.send('launch-log', `[Launcher] Added Log4j: log4j-api-2.22.1.jar`)
      }
      if (fs.existsSync(log4jCorePath)) {
        classpath.push(log4jCorePath)
        libCount++
        event.sender.send('launch-log', `[Launcher] Added Log4j: log4j-core-2.22.1.jar`)
      }

      // 8. Add Google Guava (required by many mods)
      const guavaPath = path.join(libDir, 'com/google/guava/guava/32.1.3-jre/guava-32.1.3-jre.jar')
      if (fs.existsSync(guavaPath)) {
        classpath.push(guavaPath)
        libCount++
        event.sender.send('launch-log', `[Launcher] Added Guava: guava-32.1.3-jre.jar`)
      }

      // 8.5 Add Gson (required by Fabric ecosystem mods)
      const gsonPath = path.join(libDir, 'com/google/code/gson/gson/2.11.0/gson-2.11.0.jar')
      if (fs.existsSync(gsonPath)) {
        classpath.push(gsonPath)
        libCount++
        event.sender.send('launch-log', `[Launcher] Added Gson: gson-2.11.0.jar`)
      }

      // 8.6 Add Mojang Logging (required by Minecraft)
      const mojangLoggingPath = path.join(libDir, 'com/mojang/logging/1.5.10/logging-1.5.10.jar')
      if (fs.existsSync(mojangLoggingPath)) {
        classpath.push(mojangLoggingPath)
        libCount++
        event.sender.send('launch-log', `[Launcher] Added Mojang Logging: logging-1.5.10.jar`)
      }

      // 9. Add jopt-simple (required by mods)
      const joptPath = path.join(libDir, 'net/sf/jopt-simple/jopt-simple/5.0.4/jopt-simple-5.0.4.jar')
      if (fs.existsSync(joptPath)) {
        classpath.push(joptPath)
        libCount++
        event.sender.send('launch-log', `[Launcher] Added jopt-simple: jopt-simple-5.0.4.jar`)
      }

      // 10. Add LWJGL (required by Minecraft and mods)
      const lwjglVersion = '3.3.3'
      const lwjglLibs = [
        `org.lwjgl:lwjgl:${lwjglVersion}`,
        `org.lwjgl:lwjgl-glfw:${lwjglVersion}`,
        `org.lwjgl:lwjgl-jemalloc:${lwjglVersion}`,
        `org.lwjgl:lwjgl-openal:${lwjglVersion}`,
        `org.lwjgl:lwjgl-opengl:${lwjglVersion}`,
        `org.lwjgl:lwjgl-stb:${lwjglVersion}`,
      ]
      for (const lib of lwjglLibs) {
        const { path: mavenPath, name } = parseMavenPath(lib)
        const libPath = path.join(libDir, mavenPath)
        if (fs.existsSync(libPath)) {
          classpath.push(libPath)
          libCount++
          event.sender.send('launch-log', `[Launcher] Added LWJGL: ${name}`)
        }
      }

      // 10. Setup native libraries (extract from LWJGL natives jars)
      const nativesDir = path.join(versionDir, `${versionId}-natives`)
      event.sender.send('launch-log', `[Launcher] Setting up native libraries at ${nativesDir}...`)
      
      // Always recreate natives directory to ensure clean state
      if (fs.existsSync(nativesDir)) {
        fs.rmSync(nativesDir, { recursive: true })
      }
      fs.mkdirSync(nativesDir, { recursive: true })
      
      // LWJGL natives jars to extract
      const nativeLibs = [
        `org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar`,
        `org/lwjgl/lwjgl-glfw/3.3.3/lwjgl-glfw-3.3.3-natives-windows.jar`,
        `org/lwjgl/lwjgl-jemalloc/3.3.3/lwjgl-jemalloc-3.3.3-natives-windows.jar`,
        `org/lwjgl/lwjgl-openal/3.3.3/lwjgl-openal-3.3.3-natives-windows.jar`,
        `org/lwjgl/lwjgl-opengl/3.3.3/lwjgl-opengl-3.3.3-natives-windows.jar`,
        `org/lwjgl/lwjgl-stb/3.3.3/lwjgl-stb-3.3.3-natives-windows.jar`,
      ]
      
      let extractedCount = 0
      for (const nativeJar of nativeLibs) {
        const nativePath = path.join(libDir, nativeJar)
        event.sender.send('launch-log', `[Launcher] Checking native jar: ${nativeJar}`)
        
        // Validate and re-download if needed
        let validJar = false
        if (fs.existsSync(nativePath)) {
          const data = fs.readFileSync(nativePath)
          // Check if it's a valid JAR (starts with PK and has reasonable size)
          if (data.length > 10000 && data[0] === 0x50 && data[1] === 0x4B) {
            validJar = true
          } else {
            event.sender.send('launch-log', `[Launcher] ⚠️ Invalid native jar (${data.length} bytes), re-downloading...`)
            fs.unlinkSync(nativePath)
          }
        }
        
        // Download if missing or invalid
        if (!validJar) {
          const artifact = nativeJar.replace(/\//g, ':').replace('.jar', '').replace('org:lwjgl:', 'org.lwjgl:')
          event.sender.send('launch-log', `[Launcher] Downloading ${artifact}...`)
          await downloadLibrary(libDir, artifact, 'https://repo1.maven.org/maven2')
        }
        
        // Now extract
        if (fs.existsSync(nativePath)) {
          try {
            const zip = new AdmZip(nativePath)
            zip.extractAllTo(nativesDir, true)
            extractedCount++
            event.sender.send('launch-log', `[Launcher] ✓ Extracted natives from ${path.basename(nativeJar)}`)
          } catch (err) {
            event.sender.send('launch-log', `[Launcher] ✗ Failed to extract ${nativeJar}: ${(err as Error).message}`)
          }
        } else {
          event.sender.send('launch-log', `[Launcher] ✗ Native jar not found: ${nativePath}`)
        }
      }
      
      // Flatten natives - move all DLLs to root directory
      // Java's java.library.path doesn't search subdirectories
      event.sender.send('launch-log', `[Launcher] Flattening native libraries...`)
      const flattenDir = (dir: string): void => {
        const files = fs.readdirSync(dir, { withFileTypes: true })
        for (const file of files) {
          const fullPath = path.join(dir, file.name)
          if (file.isDirectory()) {
            flattenDir(fullPath)
            // Remove empty directory
            try {
              fs.rmdirSync(fullPath)
            } catch {}
          } else if (file.name.endsWith('.dll')) {
            const destPath = path.join(nativesDir, file.name)
            if (fullPath !== destPath) {
              try {
                fs.renameSync(fullPath, destPath)
              } catch {}
            }
          }
        }
      }
      flattenDir(nativesDir)

      // List extracted files
      try {
        const extractedFiles = fs.readdirSync(nativesDir)
        event.sender.send('launch-log', `[Launcher] Extracted ${extractedCount} native jars, ${extractedFiles.length} files in natives dir`)
        const dllFiles = extractedFiles.filter(f => f.endsWith('.dll'))
        event.sender.send('launch-log', `[Launcher] Found ${dllFiles.length} DLL files: ${dllFiles.slice(0, 5).join(', ')}${dllFiles.length > 5 ? '...' : ''}`)
      } catch {
        event.sender.send('launch-log', `[Launcher] ⚠️ Could not list natives directory`)
      }

      if (classpath.length === 0) {
        reject(new Error('Classpath is empty - libraries not downloaded'))
        return
      }

      event.sender.send('launch-log', `[Launcher] Classpath entries: ${classpath.length} (loader: 1, mc: 1, libs: ${libCount})`)

      // Debug: Print all classpath entries
      event.sender.send('launch-log', `[Launcher] === Classpath Debug ===`)
      for (let i = 0; i < Math.min(classpath.length, 15); i++) {
        event.sender.send('launch-log', `[Launcher] [${i}] ${path.basename(classpath[i])}`)
      }
      if (classpath.length > 15) {
        event.sender.send('launch-log', `[Launcher] ... and ${classpath.length - 15} more`)
      }

      // Build Java command
      const separator = process.platform === 'win32' ? ';' : ':'
      const cp = classpath.join(separator)
      const mainClass = versionJson.mainClass || 'net.fabricmc.loader.impl.launch.knot.KnotClient'

      // Build bootstrap classpath for slf4j
      const bootCp = bootClasspath.join(separator)

      // Set environment with natives in PATH for Windows DLL loading
      const env = {
        ...process.env,
        PATH: process.platform === 'win32' 
          ? `${nativesDir}${path.delimiter}${process.env.PATH}`
          : process.env.PATH
      }

      const jvmArgs = [
        `-Xmx${options.maxMemory || '4G'}`,
        `-Xms${options.minMemory || '2G'}`,
        `-Djava.library.path=${nativesDir}`, // Native libraries for LWJGL
        ...(bootCp ? [`-Xbootclasspath/a:${bootCp}`] : []), // slf4j for mods
        '-cp', cp,
        // Java 21 module system compatibility
        '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
        '--add-opens', 'java.base/java.util=ALL-UNNAMED',
        '--add-opens', 'java.base/java.io=ALL-UNNAMED',
        '--add-opens', 'java.base/java.net=ALL-UNNAMED',
        '--add-opens', 'java.base/java.nio=ALL-UNNAMED',
        '--add-opens', 'java.base/java.lang.reflect=ALL-UNNAMED',
        '--add-opens', 'java.base/java.text=ALL-UNNAMED',
        '--add-opens', 'java.desktop/java.awt.font=ALL-UNNAMED',
        ...(options.jvmArgs || [])
      ]

      const gameArgs = [
        '--username', authorization.name,
        '--uuid', authorization.uuid || '',
        '--accessToken', authorization.access_token || '',
        '--userType', mcAuth.isOffline ? 'legacy' : 'msa',
        '--userProperties', '{}',
        ...(!mcAuth.isOffline && (authorization as { xuid?: string }).xuid ? ['--xuid', (authorization as { xuid?: string }).xuid as string] : []),
        ...(!mcAuth.isOffline && (authorization as { client_token?: string }).client_token ? ['--clientId', (authorization as { client_token?: string }).client_token as string] : []),
        '--versionType', 'release',
        '--gameDir', options.gameDir,
        '--assetsDir', path.join(options.gameDir, 'assets'),
        '--assetIndex', assetIndexId,
        '--version', versionId
      ]

      const cmd = [javaPath, ...jvmArgs, mainClass, ...gameArgs]
      event.sender.send('launch-log', `[Launcher] コマンド: ${cmd.slice(0, 6).join(' ')} ... (省略)`)

      // Spawn process
      const mc = spawn(javaPath, [...jvmArgs, mainClass, ...gameArgs], {
        cwd: options.gameDir,
        env: env // Use env with natives PATH
      })

      let resolved = false
      const TIMEOUT_MS = 300000
      const timeout = setTimeout(() => {
        if (!resolved) {
          mc.kill()
          reject(new Error('起動タイムアウト (5分)'))
        }
      }, TIMEOUT_MS)

      mc.stdout.on('data', (data: Buffer) => {
        const str = data.toString()
        event.sender.send('launch-log', str)
        if (!resolved && (str.includes('Setting user:') || str.includes('Backend library'))) {
          resolved = true
          clearTimeout(timeout)
          resolve()
        }
      })

      mc.stderr.on('data', (data: Buffer) => {
        event.sender.send('launch-log', `[STDERR] ${data.toString()}`)
      })

      mc.on('error', (err) => {
        if (!resolved) {
          clearTimeout(timeout)
          reject(err)
        }
        event.sender.send('launch-log', `[Launcher] プロセスエラー: ${err.message}`)
      })

      mc.on('close', (code) => {
        if (!resolved && code !== 0) {
          clearTimeout(timeout)
          reject(new Error(`Minecraft exited with code ${code}`))
        }
        event.sender.send('game-closed', code ?? 0)
        if (options.closeOnLaunch) app.quit()
      })

      event.sender.send('launch-log', `[Launcher] Javaプロセス開始: PID=${mc.pid}`)
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
const formatAccountApiError = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    if (err.response) {
      const status = err.response.status
      const data = err.response.data as { error?: string; message?: string }
      return data?.error || data?.message || `サーバーエラー (${status})`
    }
    if (err.request) return 'サーバーに接続できませんでした'
    return err.message
  }
  if (err instanceof Error) return err.message
  return fallback
}

ipcMain.handle('account-register-start', async (_e, { username, email, password }: { username: string; email: string; password: string }) => {
  try {
    const normalizedEmail = email.trim().toLowerCase()
    const res = await axios.post(`${MODPACK_SERVER_URL}/account/register/start`, {
      username,
      email: normalizedEmail,
      password
    }, { timeout: 10000 })
    if (normalizedEmail) store.set('auth.pendingRegisterEmail', normalizedEmail)
    return { success: true, pendingToken: res.data.pendingToken as string }
  } catch (err: unknown) {
    return { success: false, error: formatAccountApiError(err, '認証コード送信に失敗しました') }
  }
})

ipcMain.handle('account-register-verify', async (_e, { pendingToken, code }: { pendingToken: string; code: string }) => {
  try {
    const res = await axios.post(`${MODPACK_SERVER_URL}/account/register/verify`, { pendingToken, code }, { timeout: 10000 })
    const fallbackEmail = (store.get('auth.pendingRegisterEmail') as string) || ''
    const account = {
      id: res.data.id,
      username: res.data.username,
      email: (res.data.email as string) || fallbackEmail,
      role: (res.data.role as 'developer' | 'player') || 'player',
      createdAt: (res.data.createdAt as string) || new Date().toISOString(),
      token: res.data.token
    }
    store.set('launcherAccount', account)
    store.delete('auth.pendingRegisterEmail')
    return { success: true, account }
  } catch (err: unknown) {
    return { success: false, error: formatAccountApiError(err, '認証コードの確認に失敗しました') }
  }
})

ipcMain.handle('account-login-start', async (_e, { email, password }: { email: string; password: string }) => {
  try {
    const normalizedEmail = email.trim().toLowerCase()
    const res = await axios.post(`${MODPACK_SERVER_URL}/account/login/start`, { email: normalizedEmail, password }, { timeout: 10000 })
    if (normalizedEmail) store.set('auth.pendingLoginEmail', normalizedEmail)
    return { success: true, pendingToken: res.data.pendingToken as string }
  } catch (err: unknown) {
    return { success: false, error: formatAccountApiError(err, '認証コード送信に失敗しました') }
  }
})

ipcMain.handle('account-login-verify', async (_e, { pendingToken, code }: { pendingToken: string; code: string }) => {
  try {
    const res = await axios.post(`${MODPACK_SERVER_URL}/account/login/verify`, { pendingToken, code }, { timeout: 10000 })
    const fallbackEmail = (store.get('auth.pendingLoginEmail') as string) || ''
    const account = {
      id: res.data.id,
      username: res.data.username,
      email: (res.data.email as string) || fallbackEmail,
      role: (res.data.role as 'developer' | 'player') || 'player',
      createdAt: res.data.createdAt,
      token: res.data.token
    }
    store.set('launcherAccount', account)
    store.delete('auth.pendingLoginEmail')
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
    return { success: false, error: formatAccountApiError(err, '認証コードの確認に失敗しました') }
  }
})

ipcMain.handle('account-register', async (_e, { username, email, password }: { username: string; email: string; password: string }) => {
  try {
    const res = await axios.post(`${MODPACK_SERVER_URL}/account/register`, { username, email, password }, { timeout: 10000 })
    const account = { id: res.data.id, username, email, role: res.data.role || 'player', createdAt: res.data.createdAt || new Date().toISOString(), token: res.data.token }
    store.set('launcherAccount', account)
    return { success: true, account }
  } catch (err: unknown) {
    let msg = '登録に失敗しました'
    if (axios.isAxiosError(err)) {
      if (err.response) {
        const status = err.response.status
        const data = err.response.data as { error?: string; message?: string }
        msg = data?.error || data?.message || `サーバーエラー (${status})`
      } else if (err.request) {
        msg = 'サーバーに接続できませんでした'
      } else {
        msg = err.message
      }
    } else if (err instanceof Error) {
      msg = err.message
    }
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
    let msg = 'ログインに失敗しました'
    if (axios.isAxiosError(err)) {
      if (err.response) {
        const status = err.response.status
        const data = err.response.data as { error?: string; message?: string }
        msg = data?.error || data?.message || `サーバーエラー (${status})`
      } else if (err.request) {
        msg = 'サーバーに接続できませんでした'
      } else {
        msg = err.message
      }
    } else if (err instanceof Error) {
      msg = err.message
    }
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

// ── キャッシュクリア ─────────────────────────────────────────────────────────
ipcMain.handle('clear-cache', async (_e, type: 'versions' | 'libraries' | 'all') => {
  try {
    const gameDir = store.get('settings.gameDir') as string
    if (!gameDir) return { success: false, error: 'ゲームディレクトリが設定されていません' }

    let cleared: string[] = []

    if (type === 'versions' || type === 'all') {
      const versionsDir = path.join(gameDir, 'versions')
      if (fs.existsSync(versionsDir)) {
        const entries = fs.readdirSync(versionsDir)
        for (const entry of entries) {
          const entryPath = path.join(versionsDir, entry)
          const stat = fs.statSync(entryPath)
          if (stat.isDirectory() && entry.includes('fabric')) {
            // Remove the entire fabric loader version directory
            fs.rmSync(entryPath, { recursive: true, force: true })
            cleared.push(`versions/${entry}`)
          }
        }
      }
    }

    if (type === 'libraries' || type === 'all') {
      const libDir = path.join(gameDir, 'libraries')
      if (fs.existsSync(libDir)) {
        // Remove Fabric-related libraries
        const fabricPaths = [
          path.join(libDir, 'net/fabricmc'),
          path.join(libDir, 'net/ornithemc'),
          path.join(libDir, 'net/minecraft/fabric-loader')
        ]
        for (const fp of fabricPaths) {
          if (fs.existsSync(fp)) {
            fs.rmSync(fp, { recursive: true, force: true })
            cleared.push(fp.replace(gameDir + path.sep, ''))
          }
        }
      }
    }

    return { success: true, cleared }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── アップデート機能 ─────────────────────────────────────────────────────────
let updateWindow: BrowserWindow | null = null
let updateCheckTimer: NodeJS.Timeout | null = null

// 開発環境ではアップデートチェックをスキップ（デバッグ用）
const isDev = is.dev

// アップデート状態
interface UpdateState {
  checking: boolean
  available: boolean
  downloaded: boolean
  version?: string
  error?: string
  progress?: number
}

let updateState: UpdateState = {
  checking: false,
  available: false,
  downloaded: false
}

// レンダラーにアップデート状態を送信
const sendUpdateState = (win: BrowserWindow | null, state: Partial<UpdateState>): void => {
  if (!win || win.isDestroyed()) return
  updateState = { ...updateState, ...state }
  win.webContents.send('update-status', updateState)
}

// アップデートイベント設定
const setupAutoUpdater = (mainWindow: BrowserWindow): void => {
  // 開発環境ではチェックしない
  if (isDev) {
    console.log('[Updater] 開発環境のためアップデートチェックをスキップします')
    return
  }

  // アップデートサーバー設定（必要に応じて）
  // autoUpdater.setFeedURL({
  //   provider: 'github',
  //   owner: 'your-username',
  //   repo: 'your-repo'
  // })

  // アップデートチェック開始
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] アップデートを確認中...')
    sendUpdateState(mainWindow, { checking: true, error: undefined })
  })

  // アップデートあり
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] アップデートあり:', info.version)
    sendUpdateState(mainWindow, {
      checking: false,
      available: true,
      version: info.version,
      downloaded: false
    })
    // 自動ダウンロードは行う（silent: true相当）
    // ユーザー通知はUI側で表示
  })

  // アップデートなし
  autoUpdater.on('update-not-available', () => {
    console.log('[Updater] アップデートはありません')
    sendUpdateState(mainWindow, { checking: false, available: false })
  })

  // ダウンロード進行状況
  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] ダウンロード: ${Math.round(progress.percent)}%`)
    sendUpdateState(mainWindow, { progress: progress.percent })
  })

  // ダウンロード完了
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] アップデートダウンロード完了:', info.version)
    sendUpdateState(mainWindow, {
      checking: false,
      available: true,
      downloaded: true,
      version: info.version
    })
  })

  // エラー
  autoUpdater.on('error', (err) => {
    console.error('[Updater] エラー:', err.message)
    sendUpdateState(mainWindow, { checking: false, error: err.message })
  })

  // 起動時にチェック
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // エラーは無視（オフラインなど）
    })
  }, 5000)

  // 1時間ごとにチェック
  updateCheckTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // エラーは無視
    })
  }, 60 * 60 * 1000)
}

// IPCハンドラー: アップデート関連
ipcMain.handle('check-for-updates', async () => {
  if (isDev) return { success: false, error: '開発環境ではアップデートチェックできません' }
  try {
    await autoUpdater.checkForUpdates()
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('install-update', async () => {
  if (isDev) return { success: false, error: '開発環境ではアップデートできません' }
  try {
    autoUpdater.quitAndInstall(false, true)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// メインウィンドウ作成時にアップデート設定を初期化
const originalCreateWindow = createWindow
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createWindowWithUpdater(): void {
  originalCreateWindow()
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    setupAutoUpdater(wins[0])
  }
}
