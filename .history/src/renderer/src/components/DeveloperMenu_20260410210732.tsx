import React, { useState, useEffect } from 'react'
import {
  Upload,
  Trash2,
  RefreshCw,
  Plus,
  Save,
  Package,
  Newspaper,
  AlertCircle,
  CheckCircle,
  FileText,
  FolderOpen,
  Zap,
  Loader2,
  Gamepad2,
  User,
  LogIn
} from 'lucide-react'
import { NewsItem, ServerModpack, ModLoader } from '../types'

type DevTab = 'files' | 'news' | 'modpacks' | 'mc-auth'

interface ServerFile {
  path: string
  size?: number
  url?: string
}

interface DeveloperMenuProps {
  mcUsername: string
  onMcUsernameChange: (username: string) => void
}

export default function DeveloperMenu({ mcUsername, onMcUsernameChange }: DeveloperMenuProps): React.JSX.Element {
  const [tab, setTab] = useState<DevTab>('modpacks')
  const [files, setFiles] = useState<ServerFile[]>([])
  const [selectedModpackForFiles, setSelectedModpackForFiles] = useState('')
  const [news, setNews] = useState<NewsItem[]>([])
  const [status, setStatus] = useState<{ msg: string; type: 'idle' | 'ok' | 'error' }>({ msg: '', type: 'idle' })
  const [uploading, setUploading] = useState(false)
  const [uploadDest, setUploadDest] = useState('mods/')
  const [loading, setLoading] = useState(false)
  const [modpacks, setModpacks] = useState<ServerModpack[]>([])
  const [selectedModpackForUpload, setSelectedModpackForUpload] = useState('')
  const [newMpForm, setNewMpForm] = useState({ name: '', version: '1.0.0', mcVersion: '1.20.1', modLoader: 'vanilla' as ModLoader, loaderVersion: '', description: '' })
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [mpLoading, setMpLoading] = useState(false)
  const [bulkDir, setBulkDir] = useState('')
  const [bulkVersion, setBulkVersion] = useState('')
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, file: '' })
  const [bulkDone, setBulkDone] = useState(false)
  const [msAuthLoading, setMsAuthLoading] = useState(false)
  const [msAuthError, setMsAuthError] = useState('')
  const [offlineName, setOfflineName] = useState('')
  const [offlineApplied, setOfflineApplied] = useState(false)

  const showStatus = (msg: string, type: 'ok' | 'error') => {
    setStatus({ msg, type })
    setTimeout(() => setStatus({ msg: '', type: 'idle' }), 4000)
  }

  const loadFiles = async (modpackId?: string) => {
    const id = modpackId ?? selectedModpackForFiles
    if (!id) return
    setLoading(true)
    const res = await window.api.devGetFiles(id)
    if (res.success && res.data) setFiles(res.data as ServerFile[])
    else showStatus(res.error || 'ファイル一覧の取得に失敗', 'error')
    setLoading(false)
  }

  const loadNews = async () => {
    const res = await window.api.devGetNews()
    if (res.success && res.data) setNews(res.data as NewsItem[])
    else {
      const fallback = await window.api.fetchNews()
      if (fallback.success && fallback.data) setNews(fallback.data)
    }
  }

  const loadModpacks = async () => {
    setMpLoading(true)
    const res = await window.api.devListModpacks()
    if (res.success && res.data) {
      setModpacks(res.data as ServerModpack[])
      if (!selectedModpackForUpload && res.data.length > 0) setSelectedModpackForUpload(res.data[0].id)
    } else showStatus(res.error || 'ModPack一覧の取得に失敗', 'error')
    setMpLoading(false)
  }

  const handleCreateModpack = async () => {
    if (!newMpForm.name.trim() || !newMpForm.version.trim() || !newMpForm.mcVersion.trim()) return
    const res = await window.api.devCreateModpack({
      name: newMpForm.name.trim(),
      version: newMpForm.version.trim(),
      mcVersion: newMpForm.mcVersion.trim(),
      modLoader: newMpForm.modLoader !== 'vanilla' ? newMpForm.modLoader : undefined,
      loaderVersion: newMpForm.loaderVersion.trim() || undefined,
      description: newMpForm.description.trim() || undefined
    })
    if (res.success) {
      showStatus(`ModPack「${newMpForm.name}」を作成しました`, 'ok')
      setNewMpForm({ name: '', version: '1.0.0', mcVersion: '1.20.1', modLoader: 'vanilla', loaderVersion: '', description: '' })
      setShowCreateForm(false)
      loadModpacks()
    } else showStatus(res.error || '作成失敗', 'error')
  }

  const handleDeleteModpack = async (id: string, name: string) => {
    if (!confirm(`ModPack「${name}」を削除しますか？\n関連するファイルもすべて削除されます。`)) return
    const res = await window.api.devDeleteModpack(id)
    if (res.success) {
      showStatus(`ModPack「${name}」を削除しました`, 'ok')
      if (selectedModpackForUpload === id) setSelectedModpackForUpload('')
      loadModpacks()
    } else showStatus(res.error || '削除失敗', 'error')
  }

  useEffect(() => {
    if (tab === 'files') {
      if (modpacks.length === 0) loadModpacks()
    }
    if (tab === 'news') loadNews()
    if (tab === 'modpacks') loadModpacks()
  }, [tab])

  const handleUpload = async () => {
    if (!selectedModpackForFiles) return
    const filePath = await window.api.selectFile()
    if (!filePath) return
    const fileName = filePath.split(/[\\/]/).pop() || 'file'
    setUploading(true)
    const serverPath = `${uploadDest.replace(/\/$/, '')}/${fileName}`
    const res = await window.api.devUploadFile(selectedModpackForFiles, filePath, serverPath)
    setUploading(false)
    if (res.success) {
      showStatus(`${serverPath} をアップロードしました`, 'ok')
      loadFiles()
    } else {
      showStatus(res.error || 'アップロード失敗', 'error')
    }
  }

  const handleDelete = async (filePath: string) => {
    if (!selectedModpackForFiles || !confirm(`${filePath} を削除しますか？`)) return
    const res = await window.api.devDeleteFile(selectedModpackForFiles, filePath)
    if (res.success) {
      showStatus(`${filePath} を削除しました`, 'ok')
      loadFiles()
    } else {
      showStatus(res.error || '削除失敗', 'error')
    }
  }

  const handleSaveNews = async () => {
    const res = await window.api.devUpdateNews(news)
    if (res.success) showStatus('ニュースを保存しました', 'ok')
    else showStatus(res.error || '保存失敗', 'error')
  }

  const addNewsItem = () => {
    setNews((prev) => [
      ...prev,
      { id: Date.now(), title: '', content: '', date: new Date().toISOString() }
    ])
  }

  const updateNewsItem = (id: number, patch: Partial<NewsItem>) => {
    setNews((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }

  const removeNewsItem = (id: number) => {
    setNews((prev) => prev.filter((n) => n.id !== id))
  }

  const handleMicrosoftAuth = async () => {
    setMsAuthLoading(true)
    setMsAuthError('')
    const res = await window.api.authMicrosoft()
    setMsAuthLoading(false)
    if (res.success && res.mcUsername) {
      onMcUsernameChange(res.mcUsername)
      showStatus(`Microsoftアカウントでログインしました: ${res.mcUsername}`, 'ok')
    } else {
      setMsAuthError(res.error || '認証に失敗しました')
    }
  }

  const handleOfflineApply = async () => {
    if (!offlineName.trim()) return
    await window.api.setStore('mc.offlineName', offlineName.trim())
    onMcUsernameChange(offlineName.trim())
    setOfflineApplied(true)
    showStatus(`オフライン名を「${offlineName.trim()}」に設定しました`, 'ok')
    setTimeout(() => setOfflineApplied(false), 2000)
  }

  const handleBulkUpload = async () => {
    if (!bulkDir || !bulkVersion.trim() || !selectedModpackForUpload) return
    setBulkUploading(true)
    setBulkDone(false)
    setBulkProgress({ current: 0, total: 0, file: '' })
    const cleanup = window.api.onUploadProgress((data) => setBulkProgress(data))
    const res = await window.api.devUploadModpackDirById(selectedModpackForUpload, bulkDir, bulkVersion.trim())
    cleanup()
    setBulkUploading(false)
    if (res.success) {
      setBulkDone(true)
      const mp = modpacks.find((m) => m.id === selectedModpackForUpload)
      showStatus(`${mp?.name || selectedModpackForUpload} v${bulkVersion} のアップロードが完了しました`, 'ok')
      loadModpacks()
    } else {
      showStatus(res.error || 'アップロード失敗', 'error')
    }
  }

  const tabs: { id: DevTab; label: string; icon: React.ReactNode }[] = [
    { id: 'modpacks', label: 'ModPack管理', icon: <Package size={14} /> },
    { id: 'mc-auth', label: 'MCアカウント', icon: <Gamepad2 size={14} /> },
    { id: 'files', label: 'ファイル管理', icon: <FolderOpen size={14} /> },
    { id: 'news', label: 'ニュース', icon: <Newspaper size={14} /> }
  ]

  return (
    <div className="flex flex-col h-full bg-[#111117] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-[#0d0d14] border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 font-bold text-sm">開発者メニュー</span>
          <span className="text-[10px] bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">DEV</span>
        </div>
        <div className="flex gap-1 ml-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id ? 'bg-yellow-500/20 text-yellow-300' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {status.msg && (
          <div className={`ml-auto flex items-center gap-1.5 text-xs ${status.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {status.type === 'ok' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
            {status.msg}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* ModPack management tab */}
        {tab === 'modpacks' && (
          <div className="flex flex-col gap-5 max-w-lg">

            {/* ModPack list */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">ModPack一覧</span>
                <div className="flex items-center gap-2">
                  <button onClick={loadModpacks} disabled={mpLoading}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-[#1a1a2e] border border-white/8 text-gray-400 hover:text-white transition-colors">
                    <RefreshCw size={11} className={mpLoading ? 'animate-spin' : ''} />
                    更新
                  </button>
                  <button onClick={() => setShowCreateForm(!showCreateForm)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-yellow-600/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-600/30 transition-colors">
                    <Plus size={11} />新規作成
                  </button>
                </div>
              </div>

              {modpacks.length === 0 && !mpLoading && (
                <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5 text-center text-gray-600 text-xs">
                  <Package size={22} className="mx-auto mb-2 opacity-30" />
                  <p>ModPackがありません。「新規作成」から作成してください。</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {modpacks.map((mp) => (
                  <div key={mp.id}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 border cursor-pointer transition-colors ${
                      selectedModpackForUpload === mp.id
                        ? 'bg-yellow-500/8 border-yellow-500/25'
                        : 'bg-[#1a1a2e] border-white/5 hover:border-white/15'
                    }`}
                    onClick={() => setSelectedModpackForUpload(mp.id)}>
                    <div className="h-8 w-8 rounded-lg bg-yellow-900/30 border border-yellow-700/30 flex items-center justify-center flex-shrink-0">
                      <Package size={14} className="text-yellow-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{mp.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-gray-500">v{mp.version}</span>
                        <span className="text-[10px] text-gray-600">·</span>
                        <span className="text-[10px] text-gray-500">MC {mp.mcVersion}</span>
                        {mp.modLoader && mp.modLoader !== 'vanilla' && <><span className="text-[10px] text-gray-600">·</span><span className="text-[10px] text-gray-500 capitalize">{mp.modLoader}{mp.loaderVersion ? ` ${mp.loaderVersion}` : ''}</span></>}
                        {mp.description && <><span className="text-[10px] text-gray-600">·</span><span className="text-[10px] text-gray-400 truncate max-w-24">{mp.description}</span></>}
                      </div>
                    </div>
                    {selectedModpackForUpload === mp.id && (
                      <span className="text-[10px] text-yellow-400 flex-shrink-0">選択中</span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteModpack(mp.id, mp.name) }}
                      className="flex-shrink-0 text-red-500/40 hover:text-red-400 transition-colors ml-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Create form */}
            {showCreateForm && (
              <div className="rounded-xl bg-[#1a1a2e] border border-yellow-500/20 p-4">
                <p className="text-xs text-gray-400 font-semibold mb-3">新規ModPack作成</p>
                <div className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">名前 *</label>
                      <input type="text" value={newMpForm.name} onChange={(e) => setNewMpForm({ ...newMpForm, name: e.target.value })}
                        placeholder="メインサーバー" className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">バージョン *</label>
                      <input type="text" value={newMpForm.version} onChange={(e) => setNewMpForm({ ...newMpForm, version: e.target.value })}
                        placeholder="1.0.0" className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">MCバージョン *</label>
                      <input type="text" value={newMpForm.mcVersion} onChange={(e) => setNewMpForm({ ...newMpForm, mcVersion: e.target.value })}
                        placeholder="1.20.1" className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 transition-colors" />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">ModLoader</label>
                      <select value={newMpForm.modLoader} onChange={(e) => setNewMpForm({ ...newMpForm, modLoader: e.target.value as ModLoader, loaderVersion: '' })}
                        className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-yellow-500/50 transition-colors">
                        <option value="vanilla">Vanilla（なし）</option>
                        <option value="forge">Forge</option>
                        <option value="neoforge">NeoForge</option>
                        <option value="fabric">Fabric</option>
                        <option value="quilt">Quilt</option>
                      </select>
                    </div>
                  </div>
                  {newMpForm.modLoader !== 'vanilla' && (
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-1">{newMpForm.modLoader === 'forge' ? 'Forgeバージョン' : newMpForm.modLoader === 'neoforge' ? 'NeoForgeバージョン' : newMpForm.modLoader === 'fabric' ? 'Fabricローダーバージョン' : 'Quiltローダーバージョン'}</label>
                      <input type="text" value={newMpForm.loaderVersion} onChange={(e) => setNewMpForm({ ...newMpForm, loaderVersion: e.target.value })}
                        placeholder="例: 47.2.0" className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 transition-colors" />
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">説明</label>
                    <input type="text" value={newMpForm.description} onChange={(e) => setNewMpForm({ ...newMpForm, description: e.target.value })}
                      placeholder="ModPackの説明（任意）" className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 transition-colors" />
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button onClick={handleCreateModpack} disabled={!newMpForm.name.trim() || !newMpForm.version.trim() || !newMpForm.mcVersion.trim()}
                      className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold transition-colors">
                      <Plus size={14} />作成
                    </button>
                    <button onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 rounded-lg bg-[#0d0d14] border border-white/8 text-sm text-gray-400 hover:text-white transition-colors">
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk upload for selected modpack */}
            {selectedModpackForUpload && (
              <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-4">
                <p className="text-xs text-gray-400 font-semibold mb-3">
                  一括アップロード
                  <span className="text-yellow-400 ml-1.5">— {modpacks.find((m) => m.id === selectedModpackForUpload)?.name}</span>
                </p>
                <div className="flex flex-col gap-2.5">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">ローカルフォルダ</label>
                    <div className="flex gap-2">
                      <input type="text" value={bulkDir} readOnly placeholder="フォルダを選択..."
                        className="flex-1 rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none" />
                      <button onClick={async () => { const d = await window.api.selectDirectory(); if (d) setBulkDir(d) }}
                        className="flex items-center gap-1.5 rounded-lg bg-[#252535] px-3 py-1.5 text-sm text-gray-300 hover:bg-[#303045] flex-shrink-0">
                        <FolderOpen size={13} />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">新バージョン番号</label>
                    <input type="text" value={bulkVersion} onChange={(e) => { setBulkVersion(e.target.value); setBulkDone(false) }} placeholder="例: 1.0.1"
                      className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 transition-colors" />
                  </div>
                  {bulkUploading && (
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span className="truncate max-w-xs">{bulkProgress.file || 'スキャン中...'}</span>
                        <span className="flex-shrink-0 ml-2">{bulkProgress.current}/{bulkProgress.total}</span>
                      </div>
                      <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-yellow-500 h-1.5 rounded-full transition-all" style={{ width: bulkProgress.total > 0 ? `${Math.round(bulkProgress.current / bulkProgress.total * 100)}%` : '0%' }} />
                      </div>
                    </div>
                  )}
                  {bulkDone && !bulkUploading && (
                    <div className="flex items-center gap-2 text-green-400 text-xs">
                      <CheckCircle size={13} />アップロード完了！マニフェストも更新しました。
                    </div>
                  )}
                  <button onClick={handleBulkUpload} disabled={!bulkDir || !bulkVersion.trim() || bulkUploading}
                    className="flex items-center justify-center gap-2 rounded-xl bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 px-5 py-2.5 text-sm font-bold transition-colors">
                    {bulkUploading ? <><Loader2 size={14} className="animate-spin" />アップロード中...</> : <><Zap size={14} />一括アップロード開始</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MC auth tab */}
        {tab === 'mc-auth' && (
          <div className="flex flex-col gap-5 max-w-md">
            {/* Current status */}
            <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-4">
              <p className="text-xs text-gray-500 mb-2">現在のMinecraftアカウント</p>
              {mcUsername ? (
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle size={15} />
                  <span className="text-sm font-semibold">{mcUsername}</span>
                  <span className="text-xs text-gray-500 ml-1">でログイン中</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-500">
                  <User size={15} />
                  <span className="text-sm">未ログイン</span>
                </div>
              )}
            </div>

            {/* Microsoft login */}
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5"><Gamepad2 size={11} />Microsoftアカウント</p>
              <button onClick={handleMicrosoftAuth} disabled={msAuthLoading}
                className="flex items-center justify-center gap-3 w-full rounded-xl bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-50 px-5 py-3 font-semibold transition-colors">
                {msAuthLoading
                  ? <><Loader2 size={16} className="animate-spin" /><span className="text-sm">認証中...</span></>
                  : <><svg width="16" height="16" viewBox="0 0 21 21" fill="none"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg><span className="text-sm">Microsoftでログイン</span></>
                }
              </button>
              {msAuthError && <p className="mt-2 text-xs text-red-400">{msAuthError}</p>}
            </div>

            {/* Offline mode */}
            <div>
              <p className="text-xs text-gray-500 mb-2 flex items-center gap-1.5"><User size={11} />オフラインモード（名前を都度変更）</p>
              <div className="flex gap-2">
                <input type="text" value={offlineName} onChange={(e) => setOfflineName(e.target.value)}
                  placeholder="Minecraft名（例: Steve）" onKeyDown={(e) => e.key === 'Enter' && handleOfflineApply()}
                  className="flex-1 rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors" />
                <button onClick={handleOfflineApply} disabled={!offlineName.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-[#252535] hover:bg-[#303045] disabled:opacity-40 px-4 py-2.5 text-sm text-gray-200 transition-colors flex-shrink-0">
                  {offlineApplied ? <><CheckCircle size={14} className="text-green-400" />適用済</> : <><LogIn size={14} />適用</>}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-gray-600">オフラインモードはMicrosoftログイン不要ですが、有料サーバーには参加できません。</p>
            </div>
          </div>
        )}

        {/* Files tab */}
        {tab === 'files' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">アップロード先ディレクトリ</label>
                <select
                  value={uploadDest}
                  onChange={(e) => setUploadDest(e.target.value)}
                  className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-yellow-500/50"
                >
                  <option value="mods/">mods/</option>
                  <option value="config/">config/</option>
                  <option value="resourcepacks/">resourcepacks/</option>
                  <option value="shaderpacks/">shaderpacks/</option>
                  <option value="">ルート</option>
                </select>
              </div>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex items-center gap-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold transition-colors"
              >
                <Upload size={14} />
                {uploading ? 'アップロード中...' : 'ファイルをアップロード'}
              </button>
              <button onClick={loadFiles} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="rounded-xl bg-[#1a1a2e] border border-white/5 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center text-gray-600 text-sm">読み込み中...</div>
              ) : files.length === 0 ? (
                <div className="p-8 text-center text-gray-600 text-sm">
                  <FileText size={32} className="mx-auto mb-2 opacity-30" />
                  ファイルがありません（サーバーが未設定の可能性があります）
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-xs text-gray-500">
                      <th className="text-left px-4 py-2">パス</th>
                      <th className="text-right px-4 py-2">サイズ</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((f, i) => (
                      <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/3">
                        <td className="px-4 py-2 text-gray-300 font-mono text-xs">{f.path}</td>
                        <td className="px-4 py-2 text-right text-gray-500 text-xs">
                          {f.size ? `${(f.size / 1024).toFixed(1)} KB` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleDelete(f.path)}
                            className="text-red-500/60 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Info tab */}
        {tab === 'info' && (
          <div className="flex flex-col gap-4 max-w-lg">
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'ModPack名', key: 'name' as const, placeholder: 'Shouchan Pack' },
                { label: 'バージョン', key: 'version' as const, placeholder: '1.0.0' },
                { label: 'Minecraftバージョン', key: 'mcVersion' as const, placeholder: '1.20.1' },
                { label: 'Forgeバージョン', key: 'forgeVersion' as const, placeholder: '47.2.0' }
              ] as { label: string; key: keyof ModpackInfo; placeholder: string }[]).map((field) => (
                <div key={field.key}>
                  <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                  <input
                    type="text"
                    value={(modpackInfo[field.key] as string) || ''}
                    onChange={(e) => setModpackInfo((p) => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">説明</label>
              <textarea
                value={modpackInfo.description || ''}
                onChange={(e) => setModpackInfo((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 resize-none"
              />
            </div>
            <button onClick={handleSaveInfo} className="flex items-center gap-2 self-start rounded-lg bg-yellow-600 hover:bg-yellow-500 px-4 py-2 text-sm font-semibold transition-colors">
              <Save size={14} /> 保存
            </button>
          </div>
        )}

        {/* News tab */}
        {tab === 'news' && (
          <div className="flex flex-col gap-4 max-w-2xl">
            {news.map((item) => (
              <div key={item.id} className="rounded-xl bg-[#1a1a2e] border border-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateNewsItem(item.id, { title: e.target.value })}
                    placeholder="タイトル"
                    className="flex-1 rounded-lg bg-[#111117] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 mr-2"
                  />
                  <button onClick={() => removeNewsItem(item.id)} className="text-red-500/60 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  value={item.content}
                  onChange={(e) => updateNewsItem(item.id, { content: e.target.value })}
                  rows={3}
                  placeholder="内容..."
                  className="w-full rounded-lg bg-[#111117] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 resize-none"
                />
                <input
                  type="datetime-local"
                  value={item.date ? item.date.slice(0, 16) : ''}
                  onChange={(e) => updateNewsItem(item.id, { date: new Date(e.target.value).toISOString() })}
                  className="mt-2 rounded-lg bg-[#111117] border border-white/10 px-3 py-1.5 text-xs text-gray-400 outline-none focus:border-yellow-500/50"
                />
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={addNewsItem} className="flex items-center gap-2 rounded-lg bg-[#1a1a2e] border border-white/10 px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors">
                <Plus size={14} /> 追加
              </button>
              <button onClick={handleSaveNews} className="flex items-center gap-2 rounded-lg bg-yellow-600 hover:bg-yellow-500 px-4 py-2 text-sm font-semibold transition-colors">
                <Save size={14} /> 保存
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
