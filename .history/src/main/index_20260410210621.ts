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
const launcher = new Client()
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

// ── Minecraft 起動 ─────────────────────────────────────────────────────────
ipcMain.handle('launch-minecraft', async (event, options: LaunchOptions) => {
  try {
    const mcAuth = store.get('mc.auth') as MCAuthStore | null
    if (!mcAuth) return { success: false, error: 'MC認証が見つかりません。再ログインしてください。' }

    const authorization = mcAuth.isOffline
      ? Authenticator.getAuth(mcAuth.name)
      : { access_token: mcAuth.access_token, client_token: mcAuth.client_token, uuid: mcAuth.uuid, name: mcAuth.name, user_properties: {} }

    const loaderOpts: Record<string, unknown> = {}
    if (options.modLoader === 'forge' || options.modLoader === 'neoforge') {
      loaderOpts.forge = options.loaderVersion
    } else if (options.modLoader === 'fabric') {
      loaderOpts.fabric = options.loaderVersion
    } else if (options.modLoader === 'quilt') {
      loaderOpts.quiltLoader = options.loaderVersion
    }

    launcher.launch({
      authorization,
      root: options.gameDir,
      version: { number: options.mcVersion, type: 'release' },
      ...loaderOpts,
      memory: { max: options.maxMemory || '4G', min: options.minMemory || '2G' },
      javaPath: options.javaPath || undefined,
      customArgs: options.jvmArgs || []
    })

    launcher.on('progress', (e) => event.sender.send('launch-progress', e))
    launcher.on('data', (e) => event.sender.send('launch-log', e))
    launcher.on('close', (code) => {
      event.sender.send('game-closed', code)
      if (options.closeOnLaunch) app.quit()
    })

    store.set('stats.launches', ((store.get('stats.launches', 0) as number) + 1))
    store.set('stats.lastLaunch', new Date().toISOString())
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

// ── Java インストール ────────────────────────────────────────────────────────
ipcMain.handle('install-java', async (event) => {
  try {
    const apiRes = await axios.get(
      'https://api.adoptium.net/v3/assets/latest/17/hotspot?os=windows&arch=x64&image_type=jre',
      { timeout: 15000 }
    )
    const asset = apiRes.data[0]
    const downloadUrl: string = asset.binary.package.link
    const fileName: string = asset.binary.package.name

    const javaBaseDir = path.join(app.getPath('userData'), 'java')
    fs.mkdirSync(javaBaseDir, { recursive: true })
    const zipPath = path.join(javaBaseDir, fileName)

    const dlRes = await axios.get(downloadUrl, {
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
    const url = id === 'default'
      ? `${MODPACK_SERVER_URL}/modpack/info`
      : `${MODPACK_SERVER_URL}/modpack/${id}/info`
    const res = await axios.get(url, { timeout: 10000 })
    const serverVersion: string = res.data.version || ''
    return { hasUpdate: serverVersion !== localVersion, serverVersion, localVersion }
  } catch {
    return { hasUpdate: false, serverVersion: null, localVersion }
  }
})

ipcMain.handle('update-modpack-by-id', async (event, id: string, modpackDir: string) => {
  try {
    const url = id === 'default'
      ? `${MODPACK_SERVER_URL}/modpack/files`
      : `${MODPACK_SERVER_URL}/modpack/${id}/files`
    const res = await axios.get(url, { timeout: 30000 })
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
    store.set(`modpack.versions.${id}`, res.headers['x-modpack-version'] || 'unknown')
    return { success: true }
  } catch (err: unknown) {
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
      form.append('file', fs.createReadStream(file.localPath))
      form.append('path', file.relativePath)
      form.append('modpackId', id)
      await axios.post(`${MODPACK_SERVER_URL}/admin/modpacks/${id}/upload`, form, {
        headers: { ...form.getHeaders(), ...devHeaders() },
        timeout: 300000
      })

      const fileUrl = id === 'default'
        ? `${MODPACK_SERVER_URL}/modpack/files/download/${file.relativePath}`
        : `${MODPACK_SERVER_URL}/modpack/${id}/files/download/${file.relativePath}`

      manifest.push({ path: file.relativePath, url: fileUrl, hash })
      completed++
      event.sender.send('upload-progress', { current: completed, total: files.length, file: file.relativePath })
    }

    const manifestUrl = id === 'default'
      ? `${MODPACK_SERVER_URL}/admin/modpack/manifest`
      : `${MODPACK_SERVER_URL}/admin/modpacks/${id}/manifest`

    await axios.put(manifestUrl, { version, files: manifest }, {
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
    const url = modpackId === 'default'
      ? `${MODPACK_SERVER_URL}/admin/files`
      : `${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/files`
    const res = await axios.get(url, { headers: devHeaders(), timeout: 10000 })
    return { success: true, data: res.data }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-upload-file', async (_e, modpackId: string, localPath: string, serverPath: string) => {
  try {
    const form = new FormData()
    form.append('file', fs.createReadStream(localPath))
    form.append('path', serverPath)
    const url = modpackId === 'default'
      ? `${MODPACK_SERVER_URL}/admin/upload`
      : `${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/upload`
    await axios.post(url, form, {
      headers: { ...form.getHeaders(), ...devHeaders() },
      timeout: 120000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-delete-file', async (_e, modpackId: string, serverPath: string) => {
  try {
    const url = modpackId === 'default'
      ? `${MODPACK_SERVER_URL}/admin/files`
      : `${MODPACK_SERVER_URL}/admin/modpacks/${modpackId}/files`
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

ipcMain.handle('dev-get-news', async () => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/admin/news`, { headers: devHeaders(), timeout: 10000 })
    return { success: true, data: res.data }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-upload-modpack-dir', async (event, localDir: string, version: string) => {
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
      form.append('file', fs.createReadStream(file.localPath))
      form.append('path', file.relativePath)
      await axios.post(`${MODPACK_SERVER_URL}/admin/upload`, form, {
        headers: { ...form.getHeaders(), ...devHeaders() },
        timeout: 300000
      })

      manifest.push({
        path: file.relativePath,
        url: `${MODPACK_SERVER_URL}/modpack/files/download/${file.relativePath}`,
        hash
      })
      completed++
      event.sender.send('upload-progress', { current: completed, total: files.length, file: file.relativePath })
    }

    await axios.put(`${MODPACK_SERVER_URL}/admin/modpack/manifest`, { version, files: manifest }, {
      headers: { ...devHeaders(), 'Content-Type': 'application/json' },
      timeout: 15000
    })

    return { success: true }
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
