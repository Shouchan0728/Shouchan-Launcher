import React, { useState, useEffect } from 'react'
import {
  Upload, Trash2, RefreshCw, Plus, Save, Package, Newspaper,
  AlertCircle, CheckCircle, FileText, FolderOpen, Folder, Zap,
  Loader2, Gamepad2, User, LogIn, ChevronRight, File, ArrowUp, X
} from 'lucide-react'
import { NewsItem, ServerModpack, ModLoader } from '../types'

type DevTab = 'modpacks' | 'files' | 'news' | 'mc-auth'

interface ServerFile {
  path: string
  size?: number
  url?: string
}

interface DeveloperMenuProps {
  mcUsername: string
  onMcUsernameChange: (username: string) => void
}

const INPUT = 'w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 transition-colors'
const SELECT = 'w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-yellow-500/50 transition-colors'

export default function DeveloperMenu({ mcUsername, onMcUsernameChange }: DeveloperMenuProps): React.JSX.Element {
  const [tab, setTab] = useState<DevTab>('modpacks')
  const [status, setStatus] = useState<{ msg: string; type: 'idle' | 'ok' | 'error' }>({ msg: '', type: 'idle' })
  const [modpacks, setModpacks] = useState<ServerModpack[]>([])

  // ── ModPack管理 ─────────────────────────────────────────────────────────────
  const [mpLoading, setMpLoading] = useState(false)
  const [selectedMpId, setSelectedMpId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<Omit<ServerModpack, 'id'>>({
    name: '', version: '1.0.0', mcVersion: '1.20.1', modLoader: 'vanilla', loaderVersion: '', description: ''
  })
  const [bulkDir, setBulkDir] = useState('')
  const [bulkVersion, setBulkVersion] = useState('')
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, file: '' })
  const [bulkDone, setBulkDone] = useState(false)

  // ── ファイル管理 ─────────────────────────────────────────────────────────────
  const [filesMpId, setFilesMpId] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<ServerFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [folderUploading, setFolderUploading] = useState(false)
  const [folderProgress, setFolderProgress] = useState({ current: 0, total: 0, file: '' })
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(null)

  // ── ニュース ─────────────────────────────────────────────────────────────────
  const [news, setNews] = useState<NewsItem[]>([])

  // ── MCアカウント ──────────────────────────────────────────────────────────────
  const [msAuthLoading, setMsAuthLoading] = useState(false)
  const [msAuthError, setMsAuthError] = useState('')
  const [offlineName, setOfflineName] = useState('')
  const [offlineApplied, setOfflineApplied] = useState(false)

  const ok = (msg: string) => { setStatus({ msg, type: 'ok' }); setTimeout(() => setStatus({ msg: '', type: 'idle' }), 4000) }
  const err = (msg: string) => { setStatus({ msg, type: 'error' }); setTimeout(() => setStatus({ msg: '', type: 'idle' }), 5000) }

  // ── データ読み込み ────────────────────────────────────────────────────────────
  const loadModpacks = async () => {
    setMpLoading(true)
    const res = await window.api.devListModpacks()
    if (res.success && res.data) {
      setModpacks(res.data)
      if (!selectedMpId && res.data.length > 0) setSelectedMpId(res.data[0].id)
    } else err(res.error || 'ModPack一覧の取得に失敗')
    setMpLoading(false)
  }

  const loadFiles = async (id?: string) => {
    const mpId = id ?? filesMpId
    if (!mpId) return
    setFilesLoading(true)
    const res = await window.api.devGetFiles(mpId)
    if (res.success && res.data) setFiles(res.data as ServerFile[])
    else err(res.error || 'ファイル一覧の取得に失敗')
    setFilesLoading(false)
  }

  const loadNews = async () => {
    const res = await window.api.devGetNews()
    if (res.success && res.data) { setNews(res.data); return }
    const fallback = await window.api.fetchNews()
    if (fallback.success && fallback.data) setNews(fallback.data)
  }

  useEffect(() => {
    if (tab === 'modpacks') loadModpacks()
    if (tab === 'files' && modpacks.length === 0) loadModpacks()
    if (tab === 'news') loadNews()
  }, [tab])

  // ── ModPack CRUD ──────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.version.trim() || !createForm.mcVersion.trim()) return
    const res = await window.api.devCreateModpack({
      name: createForm.name.trim(),
      version: createForm.version.trim(),
      mcVersion: createForm.mcVersion.trim(),
      modLoader: createForm.modLoader !== 'vanilla' ? createForm.modLoader : undefined,
      loaderVersion: createForm.loaderVersion?.trim() || undefined,
      description: createForm.description?.trim() || undefined
    })
    if (res.success) {
      ok(`「${createForm.name}」を作成しました`)
      setCreateForm({ name: '', version: '1.0.0', mcVersion: '1.20.1', modLoader: 'vanilla', loaderVersion: '', description: '' })
      setShowCreate(false)
      loadModpacks()
    } else err(res.error || '作成失敗')
  }

  const handleDeleteModpack = async (id: string, name: string) => {
    const res = await window.api.devDeleteModpack(id)
    setConfirmDeleteId(null)
    if (res.success) {
      ok(`「${name}」を削除しました`)
      if (selectedMpId === id) setSelectedMpId('')
      loadModpacks()
    } else err(res.error || '削除失敗')
  }

  // ── 一括アップロード ──────────────────────────────────────────────────────────
  const handleBulkUpload = async () => {
    if (!selectedMpId || !bulkDir || !bulkVersion.trim()) return
    setBulkUploading(true)
    setBulkDone(false)
    setBulkProgress({ current: 0, total: 0, file: '' })
    const cleanup = window.api.onUploadProgress((d) => setBulkProgress(d))
    const res = await window.api.devUploadModpackDirById(selectedMpId, bulkDir, bulkVersion.trim())
    cleanup()
    setBulkUploading(false)
    if (res.success) {
      setBulkDone(true)
      ok(`v${bulkVersion} のアップロードが完了しました`)
      loadModpacks()
    } else err(res.error || 'アップロード失敗')
  }

  // ── ファイル管理操作 ──────────────────────────────────────────────────────────
  const handleFileUpload = async () => {
    if (!filesMpId) return
    const localPath = await window.api.selectFile()
    if (!localPath) return
    const name = localPath.replace(/\\/g, '/').split('/').pop() || 'file'
    const serverPath = currentPath ? `${currentPath}/${name}` : name
    setFileUploading(true)
    const res = await window.api.devUploadFile(filesMpId, localPath, serverPath)
    setFileUploading(false)
    if (res.success) { ok(`${serverPath} をアップロードしました`); loadFiles() }
    else err(res.error || 'アップロード失敗')
  }

  const handleFolderUpload = async () => {
    if (!filesMpId) return
    const dir = await window.api.selectDirectory()
    if (!dir) return
    const folderName = dir.replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'folder'
    const serverBase = currentPath ? `${currentPath}/${folderName}` : folderName
    setFolderUploading(true)
    setFolderProgress({ current: 0, total: 0, file: '' })
    const cleanup = window.api.onUploadProgress((d) => setFolderProgress(d))
    const res = await window.api.devUploadDirectory(filesMpId, dir, serverBase)
    cleanup()
    setFolderUploading(false)
    if (res.success) { ok(`「${folderName}」を ${serverBase}/ にアップロード (${res.count}ファイル)`); loadFiles() }
    else err(res.error || 'アップロード失敗')
  }

  const handleDeleteFile = async (filePath: string) => {
    if (!filesMpId) return
    const res = await window.api.devDeleteFile(filesMpId, filePath)
    setConfirmDeletePath(null)
    if (res.success) { ok(`${filePath} を削除しました`); loadFiles() }
    else err(res.error || '削除失敗')
  }

  const navigateUp = () => setCurrentPath(currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '')

  // ── MCアカウント ──────────────────────────────────────────────────────────────
  const handleMsAuth = async () => {
    setMsAuthLoading(true)
    setMsAuthError('')
    const res = await window.api.authMicrosoft()
    setMsAuthLoading(false)
    if (res.success && res.mcUsername) {
      onMcUsernameChange(res.mcUsername)
      ok(`${res.mcUsername} でログインしました`)
    } else setMsAuthError(res.error || '認証に失敗しました')
  }

  const handleOfflineApply = async () => {
    const name = offlineName.trim()
    if (!name) return
    await window.api.setStore('mc.auth', {
      access_token: '', client_token: 'offline',
      uuid: `offline-${name}`, name, isOffline: true
    })
    onMcUsernameChange(name)
    setOfflineApplied(true)
    ok(`オフライン名を「${name}」に設定しました`)
    setTimeout(() => setOfflineApplied(false), 2000)
  }

  // ── ファイル管理ヘルパー ──────────────────────────────────────────────────────
  const selectedMp = modpacks.find((m) => m.id === selectedMpId)
  const prefix = currentPath ? currentPath + '/' : ''
  const folderSet = new Set<string>()
  const filesHere: ServerFile[] = []
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue
    const rest = f.path.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash === -1) filesHere.push(f)
    else folderSet.add(rest.slice(0, slash))
  }
  const visibleFolders = Array.from(folderSet).sort()
  filesHere.sort((a, b) => a.path.localeCompare(b.path))
  const getExt = (p: string) => p.split('.').pop()?.toLowerCase() ?? ''
  const KIND: Record<string, string> = { jar: 'Jar', json: 'JSON', toml: 'TOML', cfg: '設定', properties: 'プロパティ', png: 'PNG', txt: 'テキスト', zip: 'ZIP', log: 'ログ' }
  const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`
  const FileIcon = ({ ext }: { ext: string }) =>
    ext === 'jar' ? <Package size={14} className="text-blue-400/80 flex-shrink-0" /> :
    ['json', 'toml', 'cfg', 'properties', 'txt'].includes(ext) ? <FileText size={14} className="text-green-400/80 flex-shrink-0" /> :
    ext === 'log' ? <FileText size={14} className="text-yellow-400/50 flex-shrink-0" /> :
    <File size={14} className="text-gray-400/60 flex-shrink-0" />

  const LOADERS: { v: ModLoader; label: string }[] = [
    { v: 'vanilla', label: 'Vanilla（なし）' },
    { v: 'fabric', label: 'Fabric' },
    { v: 'forge', label: 'Forge' },
    { v: 'neoforge', label: 'NeoForge' },
    { v: 'quilt', label: 'Quilt' }
  ]

  const TABS: { id: DevTab; label: string }[] = [
    { id: 'modpacks', label: 'ModPack管理' },
    { id: 'files', label: 'ファイル管理' },
    { id: 'news', label: 'ニュース' },
    { id: 'mc-auth', label: 'MCアカウント' }
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
                    {selectedModpackForUpload === mp.id && confirmDeleteId !== mp.id && (
                      <span className="text-[10px] text-yellow-400 flex-shrink-0">選択中</span>
                    )}
                    {confirmDeleteId === mp.id ? (
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-red-400">削除?</span>
                        <button onClick={() => handleDeleteModpack(mp.id, mp.name)}
                          className="text-[10px] px-2 py-0.5 bg-red-600 hover:bg-red-500 rounded text-white transition-colors">はい</button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] px-2 py-0.5 bg-[#252535] hover:bg-[#303045] rounded text-gray-300 transition-colors">いいえ</button>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(mp.id) }}
                        className="flex-shrink-0 text-red-500/40 hover:text-red-400 transition-colors ml-1">
                        <Trash2 size={13} />
                      </button>
                    )}
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

        {/* Files tab — Explorer style */}
        {tab === 'files' && (() => {
          const prefix = currentPath ? currentPath + '/' : ''
          const folderSet = new Set<string>()
          const filesHere: ServerFile[] = []
          for (const f of files) {
            if (!f.path.startsWith(prefix)) continue
            const rest = f.path.slice(prefix.length)
            const slash = rest.indexOf('/')
            if (slash === -1) filesHere.push(f)
            else folderSet.add(rest.slice(0, slash))
          }
          const folders = Array.from(folderSet).sort()
          filesHere.sort((a, b) => a.path.localeCompare(b.path))

          const getExt = (p: string) => p.split('.').pop()?.toLowerCase() ?? ''
          const getKind = (ext: string) => ({ jar: 'Jar ファイル', json: 'JSON', toml: 'TOML', cfg: '設定ファイル', properties: 'プロパティ', png: 'PNG 画像', txt: 'テキスト', zip: 'ZIP' }[ext] ?? (ext ? `${ext.toUpperCase()} ファイル` : 'ファイル'))
          const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`
          const FileIcon = ({ ext }: { ext: string }) =>
            ext === 'jar' ? <Package size={14} className="text-blue-400/80 flex-shrink-0" /> :
            ['json','toml','cfg','properties','txt'].includes(ext) ? <FileText size={14} className="text-green-400/80 flex-shrink-0" /> :
            <File size={14} className="text-gray-400/70 flex-shrink-0" />

          return (
            <div className="flex flex-col gap-3">
              {/* ModPack selector */}
              <div className="flex-shrink-0">
                <label className="block text-xs text-gray-500 mb-1.5">対象ModPack</label>
                {modpacks.length === 0 ? (
                  <div className="rounded-lg bg-[#1a1a2e] border border-white/5 px-4 py-3 text-xs text-gray-600">
                    ModPackがありません。まず「ModPack管理」タブで作成してください。
                  </div>
                ) : (
                  <select
                    value={selectedModpackForFiles}
                    onChange={(e) => {
                      setSelectedModpackForFiles(e.target.value)
                      setCurrentPath('')
                      setFiles([])
                      if (e.target.value) loadFiles(e.target.value)
                    }}
                    className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-yellow-500/50"
                  >
                    <option value="">— ModPackを選択 —</option>
                    {modpacks.map((mp) => (
                      <option key={mp.id} value={mp.id}>{mp.name} (v{mp.version})</option>
                    ))}
                  </select>
                )}
              </div>

              {selectedModpackForFiles && (
                <>
                  {/* Address bar */}
                  <div className="flex items-center gap-1.5 bg-[#0d0d14] rounded-lg border border-white/8 px-2 py-1.5 flex-shrink-0">
                    <button
                      onClick={() => setCurrentPath(currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '')}
                      disabled={!currentPath}
                      className="p-1 rounded hover:bg-white/8 disabled:opacity-25 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                      title="上のフォルダーへ"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <div className="flex items-center gap-0.5 flex-1 overflow-x-auto">
                      <button
                        onClick={() => setCurrentPath('')}
                        className={`text-xs px-1.5 py-0.5 rounded hover:bg-white/8 flex-shrink-0 transition-colors ${!currentPath ? 'text-white font-semibold' : 'text-gray-500 hover:text-white'}`}
                      >
                        ルート
                      </button>
                      {currentPath.split('/').filter(Boolean).map((part, i, arr) => {
                        const pathTo = arr.slice(0, i + 1).join('/')
                        return (
                          <React.Fragment key={pathTo}>
                            <ChevronRight size={10} className="text-gray-700 flex-shrink-0" />
                            <button
                              onClick={() => setCurrentPath(pathTo)}
                              className={`text-xs px-1.5 py-0.5 rounded hover:bg-white/8 flex-shrink-0 transition-colors ${pathTo === currentPath ? 'text-white font-semibold' : 'text-gray-500 hover:text-white'}`}
                            >
                              {part}
                            </button>
                          </React.Fragment>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                      <button
                        onClick={handleFolderUpload}
                        disabled={folderUploading || uploading}
                        className="flex items-center gap-1.5 rounded-lg bg-[#252535] hover:bg-[#303045] disabled:opacity-50 px-3 py-1 text-xs text-gray-300 transition-colors"
                        title="フォルダをここへアップロード"
                      >
                        <Folder size={11} />
                        {folderUploading ? `${folderUploadProgress.current}/${folderUploadProgress.total}` : 'フォルダ'}
                      </button>
                      <button
                        onClick={handleUpload}
                        disabled={uploading || folderUploading}
                        className="flex items-center gap-1.5 rounded-lg bg-yellow-600/80 hover:bg-yellow-500 disabled:opacity-50 px-3 py-1 text-xs font-semibold transition-colors"
                        title={`ファイルをここへアップロード (${currentPath || 'ルート'})`}
                      >
                        <Upload size={11} />
                        {uploading ? '...' : 'ファイル'}
                      </button>
                      <button
                        onClick={() => loadFiles()}
                        disabled={loading}
                        className="p-1.5 rounded hover:bg-white/8 text-gray-500 hover:text-white transition-colors"
                        title="更新"
                      >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                  {/* Folder upload progress bar */}
                  {folderUploading && (
                    <div className="flex-shrink-0 bg-[#0d0d14] rounded-lg border border-white/8 px-3 py-2">
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1.5">
                        <span className="truncate">{folderUploadProgress.file || 'スキャン中...'}</span>
                        <span className="flex-shrink-0 ml-2">{folderUploadProgress.current} / {folderUploadProgress.total}</span>
                      </div>
                      <div className="w-full bg-black/40 rounded-full h-1 overflow-hidden">
                        <div className="bg-yellow-500 h-1 rounded-full transition-all"
                          style={{ width: folderUploadProgress.total > 0 ? `${Math.round(folderUploadProgress.current / folderUploadProgress.total * 100)}%` : '0%' }} />
                      </div>
                    </div>
                  )}

                  {/* File list */}
                  <div className="flex flex-col rounded-xl border border-white/5 overflow-hidden" style={{ minHeight: 240 }}>
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_100px_76px_36px] bg-[#1a1a2e] border-b border-white/8 flex-shrink-0">
                      <div className="px-4 py-2 text-xs text-gray-500 font-medium">名前</div>
                      <div className="px-3 py-2 text-xs text-gray-500 font-medium">種類</div>
                      <div className="px-3 py-2 text-xs text-gray-500 font-medium text-right">サイズ</div>
                      <div />
                    </div>

                    <div className="flex-1 overflow-y-auto bg-[#111117]">
                      {loading ? (
                        <div className="flex items-center justify-center gap-2 p-10 text-gray-600 text-sm">
                          <Loader2 size={15} className="animate-spin" /> 読み込み中...
                        </div>
                      ) : (
                        <>
                          {/* ".." go up */}
                          {currentPath && (
                            <button
                              onClick={() => setCurrentPath(currentPath.includes('/') ? currentPath.split('/').slice(0, -1).join('/') : '')}
                              className="grid grid-cols-[1fr_100px_76px_36px] w-full border-b border-white/4 hover:bg-white/4 transition-colors text-left"
                            >
                              <div className="px-4 py-2 flex items-center gap-2 text-sm text-gray-400">
                                <Folder size={14} className="text-yellow-500/60 flex-shrink-0" />
                                ..
                              </div>
                              <div className="px-3 py-2 text-xs text-gray-600">フォルダー</div>
                              <div /><div />
                            </button>
                          )}

                          {/* Folders */}
                          {folders.map((folder) => (
                            <button
                              key={folder}
                              onClick={() => setCurrentPath(currentPath ? `${currentPath}/${folder}` : folder)}
                              className="grid grid-cols-[1fr_100px_76px_36px] w-full border-b border-white/4 hover:bg-white/4 transition-colors text-left"
                            >
                              <div className="px-4 py-2 flex items-center gap-2 text-sm text-gray-200">
                                <Folder size={14} className="text-yellow-500/70 flex-shrink-0" />
                                {folder}
                              </div>
                              <div className="px-3 py-2 text-xs text-gray-600">フォルダー</div>
                              <div /><div />
                            </button>
                          ))}

                          {/* Files */}
                          {filesHere.map((f) => {
                            const name = f.path.split('/').pop() || f.path
                            const ext = getExt(name)
                            return (
                              <div
                                key={f.path}
                                className="grid grid-cols-[1fr_100px_76px_36px] items-center border-b border-white/4 hover:bg-white/4 transition-colors"
                              >
                                <div className="px-4 py-2 flex items-center gap-2 text-sm text-gray-300 min-w-0">
                                  <FileIcon ext={ext} />
                                  <span className="truncate">{name}</span>
                                </div>
                                <div className="px-3 py-2 text-xs text-gray-600 truncate">{getKind(ext)}</div>
                                <div className="px-3 py-2 text-xs text-gray-500 text-right">{f.size ? fmtSize(f.size) : '—'}</div>
                                <div className="flex items-center justify-center">
                                  {confirmDeletePath === f.path ? (
                                    <div className="flex items-center gap-0.5">
                                      <button onClick={() => handleDelete(f.path)}
                                        className="text-[10px] px-1.5 py-0.5 bg-red-600 hover:bg-red-500 rounded text-white transition-colors">✓</button>
                                      <button onClick={() => setConfirmDeletePath(null)}
                                        className="text-[10px] px-1.5 py-0.5 bg-[#252535] hover:bg-[#303045] rounded text-gray-400 transition-colors">✗</button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDeletePath(f.path)}
                                      className="p-1.5 text-red-500/40 hover:text-red-400 transition-colors"
                                      title="削除"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}

                          {/* Empty state */}
                          {!loading && folders.length === 0 && filesHere.length === 0 && (
                            <div className="flex flex-col items-center justify-center p-10 text-gray-700">
                              <FolderOpen size={30} className="mb-2 opacity-40" />
                              <p className="text-sm">このフォルダーは空です</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Status bar */}
                    <div className="bg-[#1a1a2e] border-t border-white/5 px-4 py-1 flex items-center gap-4 flex-shrink-0">
                      <span className="text-[11px] text-gray-600">{files.length} 件のファイル</span>
                      {currentPath && <span className="text-[11px] text-gray-600">場所: {currentPath}/</span>}
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })()}

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
