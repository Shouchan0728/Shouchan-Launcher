import React, { useState, useEffect } from 'react'
import {
  Play,
  RefreshCw,
  Globe,
  LogOut,
  CheckCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  Plus,
  Trash2,
  FolderOpen,
  X,
  Gamepad2,
  Zap,
  Package,
  User
} from 'lucide-react'
import { LauncherAccount, Stats, NewsItem, LaunchStatus, ServerModpack } from '../types'

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
  const [modpackList, setModpackList] = useState<ServerModpack[]>([])
  const [selectedModpackId, setSelectedModpackId] = useState<string>('default')
  const [modpackDirs, setModpackDirs] = useState<Record<string, string>>({})
  const [news, setNews] = useState<NewsItem[]>([])
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [serverVersion, setServerVersion] = useState<string | null>(null)
  const [showModpackModal, setShowModpackModal] = useState(false)

  const selectedModpack = modpackList.find((m) => m.id === selectedModpackId) || modpackList[0]

  useEffect(() => {
    const init = async () => {
      const storedId = (await window.api.getStore('selectedModpackId')) as string || 'default'
      const storedDirs = (await window.api.getStore('modpackDirs')) as Record<string, string> || {}
      setSelectedModpackId(storedId)
      setModpackDirs(storedDirs)

      const [serverResult, newsResult, listResult] = await Promise.allSettled([
        window.api.checkServerStatus(SERVER_URL),
        window.api.fetchNews(),
        window.api.fetchModpackList()
      ])

      if (serverResult.status === 'fulfilled') setServerOnline(serverResult.value.online)
      if (newsResult.status === 'fulfilled' && newsResult.value.success) setNews(newsResult.value.data || [])
      if (listResult.status === 'fulfilled' && listResult.value.success) {
        const list = listResult.value.data || []
        setModpackList(list)
        const effectiveId = list.find((m) => m.id === storedId) ? storedId : list[0]?.id || 'default'
        setSelectedModpackId(effectiveId)
        const updateResult = await window.api.checkModpackUpdateById(effectiveId)
        setUpdateAvailable(updateResult.hasUpdate)
        setServerVersion(updateResult.serverVersion)
      }
    }
    init()

    const cleanup = window.api.onModpackProgress(({ completed, total, file }) => {
      setProgress(Math.round((completed / total) * 100))
      setStatusMessage(`ダウンロード中: ${file} (${completed}/${total})`)
    })
    const cleanupGame = window.api.onGameClosed((code) => {
      setLaunchStatus('idle')
      setStatusMessage(`ゲームが終了しました (コード: ${code})`)
      setTimeout(() => setStatusMessage(''), 3000)
    })
    return () => { cleanup(); cleanupGame() }
  }, [])

  const handleSelectModpack = async (id: string) => {
    setSelectedModpackId(id)
    await window.api.setStore('selectedModpackId', id)
    setShowModpackModal(false)
    const updateResult = await window.api.checkModpackUpdateById(id)
    setUpdateAvailable(updateResult.hasUpdate)
    setServerVersion(updateResult.serverVersion)
  }

  const handleUpdateModpack = async () => {
    if (!selectedModpack) return
    let dir = modpackDirs[selectedModpackId] || ''
    if (!dir) {
      const selectedDir = await window.api.selectDirectory()
      if (!selectedDir) return
      dir = selectedDir
      const updated = { ...modpackDirs, [selectedModpackId]: dir }
      setModpackDirs(updated)
      await window.api.setStore('modpackDirs', updated)
    }
    setLaunchStatus('updating')
    setProgress(0)
    setStatusMessage('ModPackを更新しています...')
    const result = await window.api.updateModpackById(selectedModpackId, dir)
    if (result.success) {
      onStatsUpdate({ modpackVersion: serverVersion || selectedModpack.version })
      setUpdateAvailable(false)
      setStatusMessage('ModPackの更新が完了しました')
      setLaunchStatus('idle')
    } else {
      setStatusMessage(`更新エラー: ${result.error}`)
      setLaunchStatus('error')
    }
    setTimeout(() => { if (launchStatus !== 'running') setLaunchStatus('idle') }, 3000)
  }

  const handleLaunch = async () => {
    if (launchStatus === 'running' || !selectedModpack) return
    let dir = modpackDirs[selectedModpackId] || ''
    if (!dir) {
      const selectedDir = await window.api.selectDirectory()
      if (!selectedDir) return
      dir = selectedDir
      const updated = { ...modpackDirs, [selectedModpackId]: dir }
      setModpackDirs(updated)
      await window.api.setStore('modpackDirs', updated)
    }
    const maxMem = ((await window.api.getStore('settings.maxMemory')) as string) || '4G'
    const minMem = ((await window.api.getStore('settings.minMemory')) as string) || '2G'
    const javaPath = ((await window.api.getStore('settings.javaPath')) as string) || ''
    const closeOnLaunch = ((await window.api.getStore('settings.closeOnLaunch')) as boolean) ?? false
    setLaunchStatus('launching')
    setStatusMessage('Minecraftを起動しています...')
    const result = await window.api.launchMinecraft({
      gameDir: dir,
      mcVersion: selectedModpack.mcVersion || '1.20.1',
      forgeVersion: selectedModpack.forgeVersion,
      maxMemory: maxMem,
      minMemory: minMem,
      javaPath: javaPath || undefined,
      closeOnLaunch
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
    <div className="flex flex-col h-full bg-[#111117] text-white overflow-hidden">

      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-white/5 bg-[#0d0d14] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-xs flex-shrink-0">
            {(launcherAccount?.username || mcUsername || '?')[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">
              ようこそ、{launcherAccount?.username || mcUsername}さん
            </p>
            {launcherAccount?.role === 'developer' && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 rounded leading-tight">DEV</span>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
            serverOnline === null ? 'bg-gray-500/10 border-gray-500/20 text-gray-500'
            : serverOnline ? 'bg-green-500/10 border-green-500/25 text-green-400'
            : 'bg-red-500/10 border-red-500/25 text-red-400'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              serverOnline === null ? 'bg-gray-500' : serverOnline ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <Globe size={11} />
            <span className="hidden sm:inline">{MC_SERVER_HOST}</span>
            <span>{serverOnline === null ? '確認中' : serverOnline ? 'オンライン' : 'オフライン'}</span>
          </div>

          {mcUsername ? (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#1a1a2e] border border-white/10 text-gray-300">
              <Gamepad2 size={11} />
              <span>{mcUsername}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#1a1a2e] border border-white/10 text-gray-500">
              <User size={11} />
              <span>未ログイン</span>
            </div>
          )}

          <button onClick={onLogout}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
            <LogOut size={12} />
            ログアウト
          </button>
        </div>
      </div>

      {/* ── Main scrollable content ── */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

        {/* Update alert */}
        {updateAvailable && (
          <div className="flex items-center gap-3 rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-amber-300">ModPackの更新があります</span>
              <span className="text-xs text-amber-400/70 ml-2">v{serverVersion}</span>
            </div>
          </div>
        )}

        {/* ── Launch card ── */}
        <div className="rounded-2xl bg-gradient-to-br from-[#0d1f0d] via-[#0a160a] to-[#080d08] border border-green-900/40 p-5 shadow-xl shadow-black/40">

          {/* ModPack info row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-green-900/50 border border-green-700/40 flex items-center justify-center flex-shrink-0">
                <Package size={18} className="text-green-400" />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{modpackInfo?.name || 'Shouchan ModPack'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {modpackInfo?.version && (
                    <span className="text-[10px] bg-green-900/60 text-green-400 border border-green-700/50 px-1.5 py-0.5 rounded-full">
                      v{modpackInfo.version}
                    </span>
                  )}
                  {modpackInfo?.mcVersion && (
                    <span className="text-[10px] text-gray-500">MC {modpackInfo.mcVersion}</span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={handleUpdateModpack} disabled={isLaunching || launchStatus === 'running'}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-black/30 border border-white/8 text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-40 transition-colors flex-shrink-0">
              <RefreshCw size={11} className={launchStatus === 'updating' ? 'animate-spin' : ''} />
              更新確認
            </button>
          </div>

          {/* Profile selector */}
          <button onClick={() => setShowProfileModal(true)}
            className="w-full flex items-center gap-2.5 rounded-xl bg-black/25 border border-white/8 px-4 py-2.5 mb-3 hover:bg-black/40 hover:border-white/15 transition-colors">
            <span className="text-sm">📦</span>
            <span className="text-sm font-medium flex-1 text-left">{activeProfile?.name || 'Default'}</span>
            <ChevronDown size={13} className="text-gray-500 flex-shrink-0" />
          </button>

          {/* Launch button */}
          <button onClick={handleLaunch}
            disabled={isLaunching || launchStatus === 'running' || updateAvailable}
            className={`w-full flex items-center justify-center gap-3 rounded-xl py-4 text-base font-bold transition-all select-none ${
              launchStatus === 'running'
                ? 'bg-green-800/80 cursor-not-allowed'
                : isLaunching
                  ? 'bg-green-800/60 cursor-not-allowed'
                  : updateAvailable
                    ? 'bg-[#1a1a2e] border border-white/8 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-500 active:scale-[0.985] shadow-lg shadow-green-950/60'
            }`}>
            {isLaunching ? (
              <><RefreshCw size={18} className="animate-spin" />{statusMessage || '処理中...'}</>
            ) : launchStatus === 'running' ? (
              <><Gamepad2 size={18} />プレイ中...</>
            ) : updateAvailable ? (
              <><AlertTriangle size={18} />先に更新してください</>
            ) : (
              <><Play size={18} fill="currentColor" />Minecraft を起動する</>
            )}
          </button>

          {/* Progress bar */}
          {(launchStatus === 'updating' && progress > 0) && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span className="truncate max-w-xs">{statusMessage}</span>
                <span className="flex-shrink-0 ml-2">{progress}%</span>
              </div>
              <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                <div className="bg-green-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Status message (non-progress) */}
          {statusMessage && launchStatus !== 'updating' && (
            <p className="mt-2 text-center text-xs text-gray-500">{statusMessage}</p>
          )}
        </div>

        {/* ── Bottom grid: Stats + News ── */}
        <div className="grid grid-cols-5 gap-4 flex-1">

          {/* Stats card */}
          <div className="col-span-2 rounded-xl bg-[#13131e] border border-white/5 p-4 flex flex-col gap-3">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest">統計</h3>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Zap size={12} />起動回数
                </div>
                <span className="text-sm font-bold">{stats.launches}<span className="text-xs font-normal text-gray-500 ml-0.5">回</span></span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Clock size={12} />プレイ時間
                </div>
                <span className="text-sm font-bold">{formatPlayTime(stats.playTimeMinutes)}</span>
              </div>
              {stats.lastLaunch && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock size={12} />最終起動
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(stats.lastLaunch)}</span>
                </div>
              )}
              {stats.modpackVersion && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Package size={12} />ModPack
                  </div>
                  <span className="text-xs text-green-400">v{stats.modpackVersion}</span>
                </div>
              )}
            </div>

            <div className="mt-auto pt-3 border-t border-white/5">
              {mcUsername ? (
                <div className="flex items-center gap-2 text-xs text-green-400">
                  <CheckCircle size={12} className="flex-shrink-0" />
                  <span className="truncate">{mcUsername}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <User size={12} className="flex-shrink-0" />
                  <span>未連携</span>
                </div>
              )}
            </div>
          </div>

          {/* News card */}
          <div className="col-span-3 rounded-xl bg-[#13131e] border border-white/5 p-4 flex flex-col gap-3 min-h-0">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-widest flex-shrink-0">最新ニュース</h3>
            <div className="flex flex-col gap-2 overflow-y-auto flex-1">
              {news.length === 0 ? (
                <p className="text-xs text-gray-600">ニュースを読み込んでいます...</p>
              ) : news.map((item) => (
                <div key={item.id} className="rounded-lg bg-[#0d0d14] border border-white/5 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded uppercase tracking-wider">NEWS</span>
                    <span className="text-xs font-medium text-gray-200 truncate">{item.title}</span>
                    <span className="text-[10px] text-gray-600 flex-shrink-0 ml-auto">{item.date}</span>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-pre-line leading-relaxed">{item.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Profile Modal ── */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowProfileModal(false)}>
          <div className="w-[380px] rounded-2xl bg-[#13131e] border border-white/10 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm">ModPackプロファイル</h3>
              <button onClick={() => setShowProfileModal(false)} className="text-gray-500 hover:text-white transition-colors"><X size={15} /></button>
            </div>

            <div className="flex flex-col gap-1.5 mb-4 max-h-52 overflow-y-auto">
              {profiles.map((p) => (
                <div key={p.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                    p.id === activeProfileId ? 'bg-green-600/15 border border-green-500/30' : 'bg-[#0d0d14] border border-white/5 hover:border-white/15'
                  }`}
                  onClick={() => handleSwitchProfile(p.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-gray-500 truncate">{p.gameDir || '(ディレクトリ未設定)'}</p>
                  </div>
                  {p.id === activeProfileId && <CheckCircle size={13} className="text-green-400 flex-shrink-0" />}
                  {profiles.length > 1 && p.id !== activeProfileId && (
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id) }}
                      className="text-red-500/40 hover:text-red-400 flex-shrink-0 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-white/5 pt-4">
              <p className="text-xs text-gray-500 mb-2.5">新規プロファイル</p>
              <div className="flex flex-col gap-2">
                <input type="text" value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="プロファイル名" onKeyDown={(e) => e.key === 'Enter' && handleAddProfile()}
                  className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-green-500/50 transition-colors" />
                <div className="flex gap-2">
                  <input type="text" value={newProfileDir} onChange={(e) => setNewProfileDir(e.target.value)}
                    placeholder="ゲームディレクトリ（任意）"
                    className="flex-1 rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-green-500/50 transition-colors" />
                  <button onClick={async () => { const d = await window.api.selectDirectory(); if (d) setNewProfileDir(d) }}
                    className="rounded-lg bg-[#252535] px-3 py-2 text-gray-400 hover:text-white transition-colors flex-shrink-0">
                    <FolderOpen size={14} />
                  </button>
                </div>
                <button onClick={handleAddProfile} disabled={!newProfileName.trim()}
                  className="flex items-center justify-center gap-2 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold transition-colors">
                  <Plus size={14} />追加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
