import React, { useState, useEffect } from 'react'
import {
  Play,
  RefreshCw,
  Globe,
  LogOut,
  CheckCircle,
  Clock,
  ChevronRight,
  AlertTriangle,
  ChevronDown,
  Plus,
  Trash2,
  FolderOpen,
  X
} from 'lucide-react'
import { LauncherAccount, Stats, NewsItem, ModpackInfo, LaunchStatus, ModpackProfile } from '../types'

const SERVER_URL = 'https://srgk.ddns.net'
const MC_SERVER_HOST = 'srgk.ddns.net'

interface HomeViewProps {
  mcUsername: string
  launcherAccount: LauncherAccount | null
  stats: Stats
  onLogout: () => void
  onStatsUpdate: (stats: Partial<Stats>) => void
}

export default function HomeView({
  mcUsername,
  launcherAccount,
  stats,
  onLogout,
  onStatsUpdate
}: HomeViewProps): React.JSX.Element {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)
  const [modpackInfo, setModpackInfo] = useState<ModpackInfo | null>(null)
  const [news, setNews] = useState<NewsItem[]>([])
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [gameDir, setGameDir] = useState<string>('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [serverVersion, setServerVersion] = useState<string | null>(null)

  const [profiles, setProfiles] = useState<ModpackProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string>('default')
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileDir, setNewProfileDir] = useState('')

  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0]

  useEffect(() => {
    const init = async () => {
      const loadedProfiles = await window.api.getProfiles()
      const storedProfileId = (await window.api.getStore('activeProfileId')) as string || 'default'
      if (loadedProfiles.length > 0) {
        setProfiles(loadedProfiles)
        setActiveProfileId(storedProfileId)
        const active = loadedProfiles.find((p) => p.id === storedProfileId) || loadedProfiles[0]
        if (active?.gameDir) setGameDir(active.gameDir)
      } else {
        const dir = (await window.api.getStore('settings.gameDir')) as string
        if (dir) setGameDir(dir)
      }

      const [serverResult, newsResult, modpackResult, updateResult] = await Promise.allSettled([
        window.api.checkServerStatus(SERVER_URL),
        window.api.fetchNews(),
        window.api.fetchModpackInfo(),
        window.api.checkModpackUpdate()
      ])

      if (serverResult.status === 'fulfilled') {
        setServerOnline(serverResult.value.online)
      }
      if (newsResult.status === 'fulfilled' && newsResult.value.success) {
        setNews(newsResult.value.data || [])
      }
      if (modpackResult.status === 'fulfilled' && modpackResult.value.success) {
        setModpackInfo(modpackResult.value.data || null)
      }
      if (updateResult.status === 'fulfilled') {
        setUpdateAvailable(updateResult.value.hasUpdate)
        setServerVersion(updateResult.value.serverVersion)
      }
    }
    init()

    const cleanup = window.api.onModpackProgress(({ completed, total, file }) => {
      const pct = Math.round((completed / total) * 100)
      setProgress(pct)
      setStatusMessage(`ダウンロード中: ${file} (${completed}/${total})`)
    })

    const cleanupGame = window.api.onGameClosed((code) => {
      setLaunchStatus('idle')
      setStatusMessage(`ゲームが終了しました (コード: ${code})`)
      setTimeout(() => setStatusMessage(''), 3000)
    })

    return () => {
      cleanup()
      cleanupGame()
    }
  }, [])

  const handleUpdateModpack = async () => {
    if (!gameDir) {
      const dir = await window.api.selectDirectory()
      if (!dir) return
      setGameDir(dir)
      await window.api.setStore('settings.gameDir', dir)
    }

    setLaunchStatus('updating')
    setProgress(0)
    setStatusMessage('ModPackを更新しています...')

    const result = await window.api.updateModpack(gameDir)
    if (result.success) {
      const newVersion = serverVersion || modpackInfo?.version || 'latest'
      onStatsUpdate({ modpackVersion: newVersion })
      await window.api.setStore('modpack.version', newVersion)
      setUpdateAvailable(false)
      setStatusMessage('ModPackの更新が完了しました')
      setLaunchStatus('idle')
    } else {
      setStatusMessage(`更新エラー: ${result.error}`)
      setLaunchStatus('error')
    }
    setTimeout(() => {
      if (launchStatus !== 'running') setLaunchStatus('idle')
    }, 3000)
  }

  const handleLaunch = async () => {
    if (launchStatus === 'running') return

    let dir = gameDir
    if (!dir) {
      const selectedDir = await window.api.selectDirectory()
      if (!selectedDir) return
      dir = selectedDir
      setGameDir(dir)
      await window.api.setStore('settings.gameDir', dir)
    }

    const maxMem = ((await window.api.getStore('settings.maxMemory')) as string) || '4G'
    const minMem = ((await window.api.getStore('settings.minMemory')) as string) || '2G'
    const javaPath = ((await window.api.getStore('settings.javaPath')) as string) || ''

    setLaunchStatus('launching')
    setStatusMessage('Minecraftを起動しています...')

    const result = await window.api.launchMinecraft({
      gameDir: dir,
      mcVersion: modpackInfo?.mcVersion || '1.20.1',
      forgeVersion: modpackInfo?.forgeVersion,
      maxMemory: maxMem,
      minMemory: minMem,
      javaPath: javaPath || undefined,
      closeOnLaunch: (await window.api.getStore('settings.closeOnLaunch')) as boolean || false
    })

    if (result.success) {
      setLaunchStatus('running')
      setStatusMessage('ゲームを起動中...')
      const newLaunches = stats.launches + 1
      onStatsUpdate({ launches: newLaunches, lastLaunch: new Date().toISOString() })
      await window.api.setStore('stats.launches', newLaunches)
      await window.api.setStore('stats.lastLaunch', new Date().toISOString())
    } else {
      setLaunchStatus('error')
      setStatusMessage(`起動エラー: ${result.error}`)
      setTimeout(() => setLaunchStatus('idle'), 3000)
    }
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const formatPlayTime = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}時間${m}分`
  }

  const isLaunching = launchStatus === 'launching' || launchStatus === 'updating'

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-3 flex items-center gap-2 text-gray-300">
          <span className="text-sm">ようこそ、{mcUsername || launcherAccount?.username}さん</span>
        </div>

        {updateAvailable && (
          <div className="mb-4 flex items-start gap-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3">
            <AlertTriangle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-300">ModPackの更新があります</p>
              <p className="text-xs text-yellow-400/70 mt-0.5">バージョン {serverVersion} が利用可能です。更新後にゲームを起動できます。</p>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-xl bg-gradient-to-br from-[#1a2a1a] to-[#0d1a0d] border border-green-900/30 p-6">
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleLaunch}
              disabled={isLaunching || launchStatus === 'running' || updateAvailable}
              className={`flex w-80 items-center justify-center gap-3 rounded-lg py-4 text-lg font-bold transition-all ${
                launchStatus === 'running'
                  ? 'bg-green-700 cursor-not-allowed opacity-80'
                  : isLaunching
                    ? 'bg-green-800 cursor-not-allowed opacity-60'
                    : updateAvailable
                      ? 'bg-gray-700 cursor-not-allowed opacity-50'
                      : 'bg-green-500 hover:bg-green-400 active:scale-95 cursor-pointer shadow-lg shadow-green-900/40'
              }`}
            >
              <Play size={20} fill="white" />
              {launchStatus === 'running'
                ? 'ゲーム起動中...'
                : launchStatus === 'launching'
                  ? '起動中...'
                  : updateAvailable
                    ? '更新が必要です'
                    : 'LAUNCH GAME'}
            </button>

            <button
              onClick={handleUpdateModpack}
              disabled={isLaunching || launchStatus === 'running'}
              className="flex w-80 items-center justify-center gap-2 rounded-lg bg-[#1a1a2e] border border-white/10 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-[#252535] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={isLaunching ? 'animate-spin' : ''} />
              MODPACK更新
            </button>

            {(statusMessage || launchStatus === 'updating') && (
              <div className="w-80">
                {launchStatus === 'updating' && (
                  <div className="mb-1.5 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full progress-bar"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
                <p className="text-center text-xs text-gray-400">{statusMessage}</p>
              </div>
            )}
          </div>
        </div>

        <h2 className="mb-3 text-sm font-bold tracking-wider text-white uppercase">Latest News</h2>
        <div className="flex flex-col gap-3">
          {news.length === 0 ? (
            <div className="rounded-lg bg-[#1a1a2e] border border-white/5 p-4 text-sm text-gray-500">
              ニュースを読み込んでいます...
            </div>
          ) : (
            news.map((item) => (
              <div
                key={item.id}
                className="rounded-lg bg-[#1a1a2e] border border-white/5 p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-blue-600/30 px-2 py-0.5 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                    NEWS
                  </span>
                  <span className="text-xs text-gray-400">{item.title}</span>
                </div>
                <p className="whitespace-pre-line text-sm text-gray-300 leading-relaxed">
                  {item.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="w-56 flex-shrink-0 overflow-y-auto border-l border-white/5 p-4 flex flex-col gap-4">
        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wider text-gray-300 uppercase">
            Server Status
          </h3>
          <div className="rounded-lg bg-[#1a1a2e] border border-white/5 p-3">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full flex-shrink-0 ${
                  serverOnline === null
                    ? 'bg-gray-500'
                    : serverOnline
                      ? 'bg-green-400 shadow-sm shadow-green-400'
                      : 'bg-red-400 shadow-sm shadow-red-400'
                }`}
              />
              <Globe size={13} className="text-gray-400" />
              <span className="text-xs text-gray-300 truncate">
                {MC_SERVER_HOST}
                {' - '}
                {serverOnline === null
                  ? '確認中'
                  : serverOnline
                    ? 'オンライン'
                    : 'オフライン'}
              </span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wider text-gray-300 uppercase">
            Account
          </h3>
          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600/80 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-500"
          >
            <LogOut size={14} />
            ログアウト
          </button>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-wider text-gray-300 uppercase">
            Statistics
          </h3>
          <div className="rounded-lg bg-[#1a1a2e] border border-white/5 p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <ChevronRight size={12} className="text-gray-500" />
              起動回数: {stats.launches}回
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <Clock size={12} className="text-gray-500" />
              プレイ時間: {formatPlayTime(stats.playTimeMinutes)}
            </div>
            {stats.modpackVersion && (
              <div className="flex items-center gap-1.5 text-xs text-gray-300">
                <CheckCircle size={12} className="text-green-500" />
                ModPack: {stats.modpackVersion}
              </div>
            )}
            {stats.lastLaunch && (
              <div className="flex items-center gap-1.5 text-xs text-gray-300">
                <Clock size={12} className="text-gray-500" />
                最終起動: {formatDate(stats.lastLaunch)}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-[#1a1a2e] border border-white/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={13} className="text-green-400" />
            <span className="text-xs text-gray-300">ログイン中: {mcUsername}</span>
          </div>
          <p className="text-[11px] text-gray-500">楽しいマイクラライフを！</p>
          <div className="mt-2 h-1 w-full rounded-full bg-green-500/30 overflow-hidden">
            <div className="h-full w-3/4 rounded-full bg-green-500/60" />
          </div>
        </div>
      </div>
    </div>
  )
}
