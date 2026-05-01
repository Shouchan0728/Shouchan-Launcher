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
  X,
  Gamepad2,
  Zap,
  Package,
  User
} from 'lucide-react'
import { LauncherAccount, Stats, NewsItem, LaunchStatus, ServerModpack } from '../types'

const SERVER_URL = 'https://mc-shouchan.jp/api'
const MC_SERVER_HOST = 'mc-shouchan.jp'

interface HomeViewProps {
  mcUsername: string
  launcherAccount: LauncherAccount | null
  stats: Stats
  onLogout: () => void
  onStatsUpdate: (stats: Partial<Stats>) => void
  launchStatus: LaunchStatus
  setLaunchStatus: (status: LaunchStatus) => void
}

export default function HomeView({
  mcUsername,
  launcherAccount,
  stats,
  onLogout,
  onStatsUpdate,
  launchStatus,
  setLaunchStatus
}: HomeViewProps): React.JSX.Element {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)
  const [modpackList, setModpackList] = useState<ServerModpack[]>([])
  const [selectedModpackId, setSelectedModpackId] = useState<string>('default')
  const [news, setNews] = useState<NewsItem[]>([])
  const [statusMessage, setStatusMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [serverVersion, setServerVersion] = useState<string | null>(null)
  const [showModpackModal, setShowModpackModal] = useState(false)

  const selectedModpack = modpackList.find((m) => m.id === selectedModpackId) || modpackList[0]

  useEffect(() => {
    const init = async () => {
      const storedId = (await window.api.getStore('selectedModpackId')) as string || 'default'
      setSelectedModpackId(storedId)

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
    return () => { cleanup() }
  }, [])

  const getInstanceDir = async (modpack: ServerModpack) => {
    const gameDir = ((await window.api.getStore('settings.gameDir')) as string || '').trim()
    if (!gameDir) return null
    const safeName = (modpack.name || modpack.id || 'modpack').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim()
    const base = gameDir.replace(/[\\/]+$/, '')
    return `${base}/instances/${safeName || modpack.id}`
  }

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
    const dir = await getInstanceDir(selectedModpack)
    if (!dir) {
      setLaunchStatus('error')
      setStatusMessage('設定タブでゲームディレクトリを設定してください')
      setTimeout(() => setLaunchStatus('idle'), 3000)
      return
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
    if (launchStatus === 'running' || launchStatus === 'launching' || !selectedModpack) return
    const dir = await getInstanceDir(selectedModpack)
    if (!dir) {
      setLaunchStatus('error')
      setStatusMessage('設定タブでゲームディレクトリを設定してください')
      setTimeout(() => setLaunchStatus('idle'), 3000)
      return
    }
    const maxMem = ((await window.api.getStore('settings.maxMemory')) as string) || '4G'
    const minMem = ((await window.api.getStore('settings.minMemory')) as string) || '2G'
    const javaPath = ((await window.api.getStore('settings.javaPath')) as string) || ''
    const closeOnLaunch = ((await window.api.getStore('settings.closeOnLaunch')) as boolean) ?? false

    const launchInfoRes = await window.api.fetchModpackLaunchInfo(selectedModpackId)
    const launchInfo = launchInfoRes.success && launchInfoRes.data ? launchInfoRes.data : selectedModpack

    setLaunchStatus('launching')
    setStatusMessage('Minecraftを起動しています...')
    const result = await window.api.launchMinecraft({
      gameDir: dir,
      mcVersion: launchInfo.mcVersion || '1.20.1',
      modLoader: launchInfo.modLoader,
      loaderVersion: launchInfo.loaderVersion,
      maxMemory: maxMem,
      minMemory: minMem,
      javaPath: javaPath || undefined,
      closeOnLaunch,
      modpackId: selectedModpackId
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

          {/* ModPack selector button */}
          <button onClick={() => setShowModpackModal(true)}
            className="w-full flex items-center gap-2.5 rounded-xl bg-black/25 border border-white/8 px-4 py-3 mb-3 hover:bg-black/40 hover:border-white/15 transition-colors">
            <div className="h-8 w-8 rounded-lg bg-green-900/50 border border-green-700/40 flex items-center justify-center flex-shrink-0">
              <Package size={15} className="text-green-400" />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{selectedModpack?.name || 'ModPackを読み込み中...'}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {selectedModpack?.version && (
                  <span className="text-[10px] bg-green-900/50 text-green-400 border border-green-700/40 px-1.5 py-0 rounded-full">v{selectedModpack.version}</span>
                )}
                {selectedModpack?.mcVersion && (
                  <span className="text-[10px] text-gray-600">MC {selectedModpack.mcVersion}</span>
                )}
                {modpackList.length > 1 && (
                  <span className="text-[10px] text-gray-600">{modpackList.length}個利用可能</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={(e) => { e.stopPropagation(); handleUpdateModpack() }}
                disabled={isLaunching || launchStatus === 'running'}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-black/40 border border-white/8 text-gray-400 hover:text-white hover:border-white/20 disabled:opacity-40 transition-colors">
                <RefreshCw size={10} className={launchStatus === 'updating' ? 'animate-spin' : ''} />
                更新
              </button>
              <ChevronDown size={13} className="text-gray-500" />
            </div>
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
                    <span className="text-[10px] text-gray-600 flex-shrink-0 ml-auto">{formatNewsDate(item.date)}</span>
                  </div>
                  <p className="text-xs text-gray-400 whitespace-pre-line leading-relaxed">{renderNewsContent(item.content)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── ModPack Selector Modal ── */}
      {showModpackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setShowModpackModal(false)}>
          <div className="w-[400px] rounded-2xl bg-[#13131e] border border-white/10 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm">ModPack を選択</h3>
                <p className="text-xs text-gray-500 mt-0.5">サーバーが提供するModPackから選んでください</p>
              </div>
              <button onClick={() => setShowModpackModal(false)} className="text-gray-500 hover:text-white transition-colors"><X size={15} /></button>
            </div>

            {modpackList.length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-sm">
                <Package size={28} className="mx-auto mb-2 opacity-30" />
                <p>ModPackが見つかりません</p>
                <p className="text-xs mt-1">サーバーへの接続を確認してください</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {modpackList.map((mp) => (
                  <div key={mp.id}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-colors ${
                      mp.id === selectedModpackId
                        ? 'bg-green-600/15 border border-green-500/30'
                        : 'bg-[#0d0d14] border border-white/5 hover:border-white/15'
                    }`}
                    onClick={() => handleSelectModpack(mp.id)}>
                    <div className="h-8 w-8 rounded-lg bg-green-900/40 border border-green-800/40 flex items-center justify-center flex-shrink-0">
                      <Package size={14} className="text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{mp.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-gray-500">v{mp.version}</span>
                        <span className="text-[10px] text-gray-600">·</span>
                        <span className="text-[10px] text-gray-500">MC {mp.mcVersion}</span>
                        {mp.description && (
                          <><span className="text-[10px] text-gray-600">·</span>
                          <span className="text-[10px] text-gray-500 truncate">{mp.description}</span></>
                        )}
                      </div>
                    </div>
                    {mp.id === selectedModpackId && <CheckCircle size={14} className="text-green-400 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-white/5">
              <p className="text-xs text-gray-600">
                ModPackの追加・管理は開発者メニューから行えます
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
