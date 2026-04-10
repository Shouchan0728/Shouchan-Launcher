import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { Client, Authenticator } from 'minecraft-launcher-core'
import Store from 'electron-store'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'

const store = new Store()
const launcher = new Client()

const MODPACK_SERVER_URL = 'https://srgk.ddns.net'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 680,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: join(__dirname, '../../resources/icon.png')
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

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
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.on('window-close', () => mainWindow.close())
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('net.shouchan.launcher')
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('get-store', (_event, key: string) => {
  return store.get(key)
})

ipcMain.handle('set-store', (_event, key: string, value: unknown) => {
  store.set(key, value)
})

ipcMain.handle('delete-store', (_event, key: string) => {
  store.delete(key)
})

ipcMain.handle('check-server-status', async (_event, serverUrl: string) => {
  try {
    const response = await axios.get(`${serverUrl}/status`, { timeout: 5000 })
    return { online: true, data: response.data }
  } catch {
    return { online: false }
  }
})

ipcMain.handle('fetch-modpack-info', async () => {
  try {
    const response = await axios.get(`${MODPACK_SERVER_URL}/modpack/info`, { timeout: 10000 })
    return { success: true, data: response.data }
  } catch {
    return { success: false, error: 'サーバーに接続できませんでした' }
  }
})

ipcMain.handle('fetch-news', async () => {
  try {
    const response = await axios.get(`${MODPACK_SERVER_URL}/news`, { timeout: 10000 })
    return { success: true, data: response.data }
  } catch {
    return {
      success: true,
      data: [
        {
          id: 1,
          title: '最新情報',
          content:
            'Shouchan Launcherへようこそ！\nModPackを更新して最新の内容をお楽しみください。\n問題が発生した場合は、ログアウト後に再ログインしてください。',
          date: new Date().toISOString()
        }
      ]
    }
  }
})

ipcMain.handle(
  'update-modpack',
  async (event, modpackDir: string, username: string) => {
    try {
      const response = await axios.get(`${MODPACK_SERVER_URL}/modpack/files`, { timeout: 30000 })
      const files: Array<{ path: string; url: string; hash: string }> = response.data

      let completed = 0
      for (const file of files) {
        const filePath = path.join(modpackDir, file.path)
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }

        const fileResponse = await axios.get(file.url, { responseType: 'arraybuffer', timeout: 60000 })
        fs.writeFileSync(filePath, Buffer.from(fileResponse.data))

        completed++
        event.sender.send('modpack-progress', {
          completed,
          total: files.length,
          file: file.path
        })
      }

      store.set('modpack.version', response.headers['x-modpack-version'] || 'unknown')
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return { success: false, error: message }
    }
  }
)

ipcMain.handle('launch-minecraft', async (event, options: LaunchOptions) => {
  try {
    const launchOptions = {
      authorization: Authenticator.getAuth(options.username),
      root: options.gameDir,
      version: {
        number: options.mcVersion,
        type: 'release'
      },
      forge: options.forgeVersion,
      memory: {
        max: options.maxMemory || '4G',
        min: options.minMemory || '2G'
      },
      javaPath: options.javaPath || undefined,
      customArgs: options.jvmArgs || []
    }

    launcher.launch(launchOptions)

    launcher.on('progress', (e: { task: number; total: number; type: string }) => {
      event.sender.send('launch-progress', e)
    })

    launcher.on('data', (e: string) => {
      event.sender.send('launch-log', e)
    })

    launcher.on('close', (code: number) => {
      event.sender.send('game-closed', code)
    })

    const launches = (store.get('stats.launches', 0) as number) + 1
    store.set('stats.launches', launches)
    store.set('stats.lastLaunch', new Date().toISOString())

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, error: message }
  }
})

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

interface LaunchOptions {
  username: string
  gameDir: string
  mcVersion: string
  forgeVersion?: string
  maxMemory?: string
  minMemory?: string
  javaPath?: string
  jvmArgs?: string[]
}
