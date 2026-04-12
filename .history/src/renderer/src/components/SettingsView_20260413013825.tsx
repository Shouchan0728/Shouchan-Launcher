import React, { useState, useEffect } from 'react'
import { FolderOpen, Save, RotateCcw, Trash2, AlertTriangle, Download } from 'lucide-react'

export default function SettingsView(): React.JSX.Element {
  const [gameDir, setGameDir] = useState('')
  const [maxMemory, setMaxMemory] = useState('4G')
  const [minMemory, setMinMemory] = useState('2G')
  const [javaPath, setJavaPath] = useState('')
  const [jvmArgs, setJvmArgs] = useState('')
  const [closeOnLaunch, setCloseOnLaunch] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cacheCleared, setCacheCleared] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateResult, setUpdateResult] = useState<{ success?: boolean; message?: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      const dir = (await window.api.getStore('settings.gameDir')) as string
      const max = (await window.api.getStore('settings.maxMemory')) as string
      const min = (await window.api.getStore('settings.minMemory')) as string
      const java = (await window.api.getStore('settings.javaPath')) as string
      const args = (await window.api.getStore('settings.jvmArgs')) as string
      if (dir) setGameDir(dir)
      if (max) setMaxMemory(max)
      if (min) setMinMemory(min)
      if (java) setJavaPath(java)
      const close = (await window.api.getStore('settings.closeOnLaunch')) as boolean
      if (args) setJvmArgs(args)
      setCloseOnLaunch(close || false)
    }
    load()
  }, [])

  const handleSelectDir = async () => {
    const dir = await window.api.selectDirectory()
    if (dir) setGameDir(dir)
  }

  const handleSave = async () => {
    await window.api.setStore('settings.gameDir', gameDir)
    await window.api.setStore('settings.maxMemory', maxMemory)
    await window.api.setStore('settings.minMemory', minMemory)
    await window.api.setStore('settings.javaPath', javaPath)
    await window.api.setStore('settings.jvmArgs', jvmArgs)
    await window.api.setStore('settings.closeOnLaunch', closeOnLaunch)
    window.api.accountSyncSettings({ gameDir, maxMemory, minMemory, javaPath, closeOnLaunch }).catch(() => {})
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClearCache = async (type: 'versions' | 'libraries' | 'all') => {
    setClearingCache(true)
    try {
      const res = await window.api.clearCache(type)
      if (res.success) {
        setCacheCleared(true)
        setTimeout(() => setCacheCleared(false), 3000)
      } else {
        alert(`キャッシュクリア失敗: ${res.error}`)
      }
    } catch {
      alert('キャッシュクリア中にエラーが発生しました')
    } finally {
      setClearingCache(false)
    }
  }

  const handleReset = () => {
    setMaxMemory('4G')
    setMinMemory('2G')
    setJavaPath('')
    setJvmArgs('')
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    setUpdateResult(null)
    try {
      const res = await window.api.checkForUpdates()
      if (res.success) {
        setUpdateResult({ success: true, message: 'アップデートを確認しました' })
      } else {
        setUpdateResult({ success: false, message: res.error || '確認に失敗しました' })
      }
    } catch {
      setUpdateResult({ success: false, message: '確認中にエラーが発生しました' })
    } finally {
      setCheckingUpdate(false)
      setTimeout(() => setUpdateResult(null), 5000)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="mb-6 text-lg font-bold text-white">設定</h2>

      <div className="max-w-xl flex flex-col gap-5">
        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-300">ゲームディレクトリ</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={gameDir}
              onChange={(e) => setGameDir(e.target.value)}
              placeholder="例: C:\Users\user\AppData\Roaming\.minecraft"
              className="flex-1 rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
            />
            <button
              onClick={handleSelectDir}
              className="flex items-center gap-1.5 rounded-lg bg-[#252535] px-3 py-2 text-sm text-gray-300 hover:bg-[#303045] transition-colors"
            >
              <FolderOpen size={14} />
              参照
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-300">メモリ設定</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">最大メモリ</label>
              <select
                value={maxMemory}
                onChange={(e) => setMaxMemory(e.target.value)}
                className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
              >
                {['2G', '3G', '4G', '6G', '8G', '12G', '16G'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">最小メモリ</label>
              <select
                value={minMemory}
                onChange={(e) => setMinMemory(e.target.value)}
                className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50 transition-colors"
              >
                {['512M', '1G', '2G', '3G', '4G'].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-300">Java設定</h3>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">
                Javaパス (空白の場合はシステムデフォルト)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={javaPath}
                  onChange={(e) => setJavaPath(e.target.value)}
                  placeholder="例: C:\Program Files\Java\jdk-17\bin\java.exe"
                  className="flex-1 rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
                />
                <button
                  onClick={async () => {
                    const file = await window.api.selectFile([{ name: 'Java', extensions: ['exe', '*'] }])
                    if (file) setJavaPath(file)
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-[#252535] px-3 py-2 text-sm text-gray-300 hover:bg-[#303045] transition-colors"
                >
                  <FolderOpen size={14} />
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-gray-500">追加JVM引数</label>
              <input
                type="text"
                value={jvmArgs}
                onChange={(e) => setJvmArgs(e.target.value)}
                placeholder="例: -XX:+UseG1GC -XX:+ParallelRefProcEnabled"
                className="w-full rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-300">起動オプション</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setCloseOnLaunch(!closeOnLaunch)}
              className={`w-10 h-5 rounded-full transition-colors ${closeOnLaunch ? 'bg-blue-500' : 'bg-gray-700'}`}
            >
              <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-transform ${closeOnLaunch ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <span className="text-sm text-gray-300">Minecraft起動後にランチャーを閉じる</span>
          </label>
        </div>

        <div className="rounded-xl bg-[#1a1a2e] border border-red-500/20 p-5">
          <h3 className="mb-4 text-sm font-semibold text-red-400 flex items-center gap-2">
            <AlertTriangle size={16} />
            キャッシュ管理
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            起動に問題がある場合（ClassNotFoundExceptionなど）、キャッシュをクリアして再ダウンロードできます。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleClearCache('versions')}
              disabled={clearingCache}
              className="flex items-center gap-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 px-3 py-2 text-sm text-red-400 transition-colors"
            >
              <Trash2 size={14} />
              {clearingCache ? '削除中...' : cacheCleared ? '削除済み！' : 'バージョンキャッシュをクリア'}
            </button>
            <button
              onClick={() => handleClearCache('all')}
              disabled={clearingCache}
              className="flex items-center gap-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 px-3 py-2 text-sm text-red-400 transition-colors"
            >
              <Trash2 size={14} />
              すべてクリア
            </button>
          </div>
        </div>

        <div className="flex justify-between gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-lg bg-[#1a1a2e] border border-white/10 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <RotateCcw size={14} />
            デフォルトに戻す
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-semibold transition-all ${
              saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            <Save size={14} />
            {saved ? '保存しました！' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
