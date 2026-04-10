import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Client, Authenticator } from 'minecraft-launcher-core'
import Store from 'electron-store'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { Auth } from 'msmc'
import FormData from 'form-data'
import AdmZip from 'adm-zip'

const store = new Store()
const launcher = new Client()
const authManager = new Auth('select_account')

const MODPACK_SERVER_URL = 'https://srgk.ddns.net'
// ↓ 配布前に変更してください。このコードを知っている人だけ開発者になれます。
const DEVELOPER_CODE = 'SHOUCHAN_DEV_2024'
// ↓ サーバー側の /admin/* エンドポイント保護トークン（サーバーと合わせること）
const DEV_ADMIN_TOKEN = 'shouchan-admin-secret'

interface MCAuthStore {
  access_token: string
  client_token: string
  uuid: string
  name: string
  isOffline: boolean
  refreshToken?: string
}

interface LaunchOptions {
  gameDir: string
  mcVersion: string
  forgeVersion?: string
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

    launcher.launch({
      authorization,
      root: options.gameDir,
      version: { number: options.mcVersion, type: 'release' },
      forge: options.forgeVersion,
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

// ── 開発者 API ─────────────────────────────────────────────────────────────
const devHeaders = () => ({ Authorization: `Bearer ${DEV_ADMIN_TOKEN}` })

ipcMain.handle('dev-get-files', async () => {
  try {
    const res = await axios.get(`${MODPACK_SERVER_URL}/admin/files`, { headers: devHeaders(), timeout: 10000 })
    return { success: true, data: res.data }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-upload-file', async (_e, localPath: string, serverPath: string) => {
  try {
    const form = new FormData()
    form.append('file', fs.createReadStream(localPath))
    form.append('path', serverPath)
    await axios.post(`${MODPACK_SERVER_URL}/admin/upload`, form, {
      headers: { ...form.getHeaders(), ...devHeaders() },
      timeout: 120000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-delete-file', async (_e, serverPath: string) => {
  try {
    await axios.delete(`${MODPACK_SERVER_URL}/admin/files`, {
      headers: devHeaders(),
      data: { path: serverPath },
      timeout: 10000
    })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message }
  }
})

ipcMain.handle('dev-update-info', async (_e, info: unknown) => {
  try {
    await axios.put(`${MODPACK_SERVER_URL}/admin/modpack/info`, info, {
      headers: { ...devHeaders(), 'Content-Type': 'application/json' },
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
