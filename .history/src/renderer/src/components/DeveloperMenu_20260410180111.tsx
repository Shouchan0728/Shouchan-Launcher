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
  FolderOpen
} from 'lucide-react'
import { ModpackInfo, NewsItem } from '../types'

type DevTab = 'files' | 'info' | 'news'

interface ServerFile {
  path: string
  size?: number
  url?: string
}

export default function DeveloperMenu(): React.JSX.Element {
  const [tab, setTab] = useState<DevTab>('files')
  const [files, setFiles] = useState<ServerFile[]>([])
  const [modpackInfo, setModpackInfo] = useState<ModpackInfo>({ version: '', mcVersion: '', name: '' })
  const [news, setNews] = useState<NewsItem[]>([])
  const [status, setStatus] = useState<{ msg: string; type: 'idle' | 'ok' | 'error' }>({ msg: '', type: 'idle' })
  const [uploading, setUploading] = useState(false)
  const [uploadDest, setUploadDest] = useState('mods/')
  const [loading, setLoading] = useState(false)

  const showStatus = (msg: string, type: 'ok' | 'error') => {
    setStatus({ msg, type })
    setTimeout(() => setStatus({ msg: '', type: 'idle' }), 4000)
  }

  const loadFiles = async () => {
    setLoading(true)
    const res = await window.api.devGetFiles()
    if (res.success && res.data) setFiles(res.data as ServerFile[])
    else showStatus(res.error || 'ファイル一覧の取得に失敗', 'error')
    setLoading(false)
  }

  const loadInfo = async () => {
    const res = await window.api.fetchModpackInfo()
    if (res.success && res.data) setModpackInfo(res.data)
  }

  const loadNews = async () => {
    const res = await window.api.devGetNews()
    if (res.success && res.data) setNews(res.data as NewsItem[])
    else {
      const fallback = await window.api.fetchNews()
      if (fallback.success && fallback.data) setNews(fallback.data)
    }
  }

  useEffect(() => {
    if (tab === 'files') loadFiles()
    if (tab === 'info') loadInfo()
    if (tab === 'news') loadNews()
  }, [tab])

  const handleUpload = async () => {
    const filePath = await window.api.selectFile()
    if (!filePath) return
    const fileName = filePath.split(/[\\/]/).pop() || 'file'
    setUploading(true)
    const serverPath = `${uploadDest.replace(/\/$/, '')}/${fileName}`
    const res = await window.api.devUploadFile(filePath, serverPath)
    setUploading(false)
    if (res.success) {
      showStatus(`${serverPath} をアップロードしました`, 'ok')
      loadFiles()
    } else {
      showStatus(res.error || 'アップロード失敗', 'error')
    }
  }

  const handleDelete = async (path: string) => {
    if (!confirm(`${path} を削除しますか？`)) return
    const res = await window.api.devDeleteFile(path)
    if (res.success) {
      showStatus(`${path} を削除しました`, 'ok')
      loadFiles()
    } else {
      showStatus(res.error || '削除失敗', 'error')
    }
  }

  const handleSaveInfo = async () => {
    const res = await window.api.devUpdateInfo(modpackInfo)
    if (res.success) showStatus('ModPack情報を保存しました', 'ok')
    else showStatus(res.error || '保存失敗', 'error')
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

  const tabs: { id: DevTab; label: string; icon: React.ReactNode }[] = [
    { id: 'files', label: 'ファイル管理', icon: <FolderOpen size={14} /> },
    { id: 'info', label: 'ModPack情報', icon: <Package size={14} /> },
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
