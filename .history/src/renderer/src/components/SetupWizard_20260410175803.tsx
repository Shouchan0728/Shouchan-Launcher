import React, { useState } from 'react'
import {
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  Download,
  CheckCircle,
  User,
  Shield,
  Cpu,
  HardDrive,
  Gamepad2,
  X,
  Minus
} from 'lucide-react'
import { LauncherAccount } from '../types'

interface SetupWizardProps {
  onComplete: (account: LauncherAccount, mcUsername: string) => void
}

interface SetupData {
  launcherUsername: string
  role: 'developer' | 'player' | null
  devCode: string
  mcUsername: string
  gameDir: string
  javaPath: string
  maxMemory: string
  minMemory: string
  closeOnLaunch: boolean
}

const STEPS = ['アカウント', 'Minecraft認証', 'ゲーム設定', 'Java設定', 'メモリ設定', '完了']

export default function SetupWizard({ onComplete }: SetupWizardProps): React.JSX.Element {
  const [step, setStep] = useState(0)
  const [data, setData] = useState<SetupData>({
    launcherUsername: '',
    role: null,
    devCode: '',
    mcUsername: '',
    gameDir: '',
    javaPath: '',
    maxMemory: '4G',
    minMemory: '2G',
    closeOnLaunch: false
  })
  const [devCodeError, setDevCodeError] = useState('')
  const [authStatus, setAuthStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [authError, setAuthError] = useState('')
  const [javaStatus, setJavaStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [javaProgress, setJavaProgress] = useState(0)

  const update = (patch: Partial<SetupData>) => setData((p) => ({ ...p, ...patch }))

  const handleDevCodeVerify = async () => {
    const ok = await window.api.verifyDevCode(data.devCode)
    if (!ok) {
      setDevCodeError('開発者コードが正しくありません')
      return false
    }
    setDevCodeError('')
    return true
  }

  const canNextStep0 = () => {
    if (!data.launcherUsername.trim()) return false
    if (!data.role) return false
    return true
  }

  const handleStep0Next = async () => {
    if (data.role === 'developer' && data.devCode) {
      const ok = await handleDevCodeVerify()
      if (!ok) return
    }
    setStep(1)
  }

  const handleMicrosoftLogin = async () => {
    setAuthStatus('loading')
    setAuthError('')
    const res = await window.api.authMicrosoft()
    if (res.success && res.mcUsername) {
      update({ mcUsername: res.mcUsername })
      setAuthStatus('done')
    } else {
      setAuthStatus('error')
      setAuthError(res.error || '認証に失敗しました')
    }
  }

  const handleOfflineLogin = () => {
    if (data.mcUsername.trim()) {
      window.api.setStore('mc.auth', {
        access_token: '0',
        client_token: 'offline',
        uuid: `offline-${data.mcUsername}`,
        name: data.mcUsername,
        isOffline: true
      })
      setAuthStatus('done')
    }
  }

  const handleSelectGameDir = async () => {
    const dir = await window.api.selectDirectory()
    if (dir) update({ gameDir: dir })
  }

  const handleSelectJava = async () => {
    const file = await window.api.selectFile([{ name: 'Java実行ファイル', extensions: ['exe', '*'] }])
    if (file) update({ javaPath: file })
  }

  const handleInstallJava = async () => {
    setJavaStatus('loading')
    setJavaProgress(0)
    const cleanup = window.api.onJavaDownloadProgress(({ completed, total }) => {
      if (total > 0) setJavaProgress(Math.round((completed / total) * 100))
    })
    const res = await window.api.installJava()
    cleanup()
    if (res.success && res.javaPath) {
      update({ javaPath: res.javaPath })
      setJavaStatus('done')
    } else {
      setJavaStatus('error')
    }
  }

  const handleComplete = async () => {
    const account: LauncherAccount = {
      username: data.launcherUsername,
      role: data.role!,
      createdAt: new Date().toISOString()
    }
    await window.api.setStore('launcherAccount', account)
    await window.api.setStore('settings.gameDir', data.gameDir)
    await window.api.setStore('settings.javaPath', data.javaPath)
    await window.api.setStore('settings.maxMemory', data.maxMemory)
    await window.api.setStore('settings.minMemory', data.minMemory)
    await window.api.setStore('settings.closeOnLaunch', data.closeOnLaunch)
    onComplete(account, data.mcUsername)
  }

  return (
    <div className="flex flex-col h-full bg-[#111117] text-white select-none">
      {/* Window controls */}
      <div
        className="flex h-9 items-center justify-between bg-[#0d0d14] px-3 flex-shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-xs">S</div>
          <span className="text-sm font-semibold">Shouchan Launcher — 初期設定</span>
        </div>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => window.api.windowMinimize()} className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 transition-colors">
            <Minus size={14} className="text-gray-300" />
          </button>
          <button onClick={() => window.api.windowClose()} className="flex h-7 w-7 items-center justify-center rounded hover:bg-red-500/80 transition-colors">
            <X size={14} className="text-gray-300" />
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 py-4 bg-[#0d0d14] border-b border-white/5 flex-shrink-0">
        {STEPS.map((label, i) => (
          <React.Fragment key={i}>
            <div className={`flex items-center gap-1.5 text-xs ${i === step ? 'text-blue-400 font-semibold' : i < step ? 'text-green-400' : 'text-gray-600'}`}>
              {i < step ? <CheckCircle size={14} /> : <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]" style={{ borderColor: i === step ? '#60a5fa' : '#374151' }}>{i + 1}</span>}
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`h-px w-4 ${i < step ? 'bg-green-400' : 'bg-gray-700'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-md">

          {/* Step 0: Shouchan Account */}
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <User size={40} className="mx-auto mb-3 text-blue-400" />
                <h2 className="text-xl font-bold">Shouchan Launcherアカウントを作成</h2>
                <p className="text-sm text-gray-500 mt-1">このランチャー専用のアカウントです</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">表示名</label>
                <input
                  type="text"
                  value={data.launcherUsername}
                  onChange={(e) => update({ launcherUsername: e.target.value })}
                  placeholder="あなたの名前"
                  className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-2">ロール</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => update({ role: 'player' })}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${data.role === 'player' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-white/10 bg-[#1a1a2e] text-gray-400 hover:border-white/20'}`}
                  >
                    <Gamepad2 size={24} />
                    <span className="text-sm font-semibold">プレイヤー</span>
                  </button>
                  <button
                    onClick={() => update({ role: 'developer' })}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${data.role === 'developer' ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400' : 'border-white/10 bg-[#1a1a2e] text-gray-400 hover:border-white/20'}`}
                  >
                    <Shield size={24} />
                    <span className="text-sm font-semibold">開発者</span>
                  </button>
                </div>
              </div>
              {data.role === 'developer' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">開発者コード</label>
                  <input
                    type="password"
                    value={data.devCode}
                    onChange={(e) => { update({ devCode: e.target.value }); setDevCodeError('') }}
                    placeholder="開発者コードを入力"
                    className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50"
                  />
                  {devCodeError && <p className="text-xs text-red-400 mt-1">{devCodeError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Step 1: Minecraft Auth */}
          {step === 1 && (
            <div className="flex flex-col gap-5 items-center text-center">
              <div>
                <div className="w-16 h-16 rounded-2xl bg-[#1a1a2e] border border-white/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">⛏</span>
                </div>
                <h2 className="text-xl font-bold">Minecraftアカウント認証</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {data.role === 'developer' ? 'Microsoftでログイン、またはオフラインモードを使用' : 'Microsoftアカウントでログインしてください（必須）'}
                </p>
              </div>

              {authStatus === 'done' ? (
                <div className="flex flex-col items-center gap-2 text-green-400">
                  <CheckCircle size={40} />
                  <p className="font-semibold">認証成功！</p>
                  <p className="text-sm text-gray-400">アカウント: <span className="text-white">{data.mcUsername}</span></p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 w-full">
                  <button
                    onClick={handleMicrosoftLogin}
                    disabled={authStatus === 'loading'}
                    className="flex items-center justify-center gap-3 w-full rounded-xl bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-50 px-5 py-3 font-semibold transition-colors"
                  >
                    {authStatus === 'loading' ? (
                      <span className="text-sm">認証中...</span>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                          <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                          <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                          <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                          <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                        </svg>
                        <span>Microsoftでログイン</span>
                      </>
                    )}
                  </button>
                  {authError && <p className="text-xs text-red-400 text-center">{authError}</p>}

                  {data.role === 'developer' && (
                    <div className="border-t border-white/10 pt-3">
                      <p className="text-xs text-gray-500 mb-2 text-center">または（開発者のみ）</p>
                      <input
                        type="text"
                        value={data.mcUsername}
                        onChange={(e) => update({ mcUsername: e.target.value })}
                        placeholder="Minecraftユーザー名（オフライン）"
                        className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-yellow-500/50 mb-2"
                      />
                      <button
                        onClick={handleOfflineLogin}
                        disabled={!data.mcUsername.trim()}
                        className="w-full rounded-xl bg-[#1a1a2e] border border-yellow-500/30 hover:border-yellow-500/60 disabled:opacity-40 px-5 py-2 text-sm text-yellow-400 font-semibold transition-colors"
                      >
                        オフラインモードで続行
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Game Directory */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <HardDrive size={40} className="mx-auto mb-3 text-blue-400" />
                <h2 className="text-xl font-bold">ゲームディレクトリ</h2>
                <p className="text-sm text-gray-500 mt-1">ModPackのインストール先フォルダ</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ディレクトリ</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={data.gameDir}
                    onChange={(e) => update({ gameDir: e.target.value })}
                    placeholder="例: C:\Users\user\AppData\Roaming\.shouchan"
                    className="flex-1 rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                  />
                  <button onClick={handleSelectGameDir} className="flex items-center gap-1.5 rounded-lg bg-[#252535] px-3 py-2 text-sm text-gray-300 hover:bg-[#303045] transition-colors">
                    <FolderOpen size={14} />
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1.5">空欄の場合はデフォルトの場所に保存されます</p>
              </div>
            </div>
          )}

          {/* Step 3: Java */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <Cpu size={40} className="mx-auto mb-3 text-blue-400" />
                <h2 className="text-xl font-bold">Java設定</h2>
                <p className="text-sm text-gray-500 mt-1">Minecraftの実行に必要です（Java 17推奨）</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Javaパス（空欄でシステムデフォルト）</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={data.javaPath}
                    onChange={(e) => update({ javaPath: e.target.value })}
                    placeholder="自動検出"
                    className="flex-1 rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50"
                  />
                  <button onClick={handleSelectJava} className="flex items-center gap-1.5 rounded-lg bg-[#252535] px-3 py-2 text-sm text-gray-300 hover:bg-[#303045] transition-colors">
                    <FolderOpen size={14} />
                  </button>
                </div>
                <button
                  onClick={handleInstallJava}
                  disabled={javaStatus === 'loading' || javaStatus === 'done'}
                  className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${javaStatus === 'done' ? 'bg-green-600 text-white' : javaStatus === 'error' ? 'bg-red-600/30 text-red-400 border border-red-500/30' : 'bg-[#1a1a2e] border border-blue-500/30 text-blue-400 hover:border-blue-500/60 disabled:opacity-50'}`}
                >
                  {javaStatus === 'loading' ? (
                    <span>ダウンロード中... {javaProgress}%</span>
                  ) : javaStatus === 'done' ? (
                    <><CheckCircle size={14} /> Java 17 インストール済み</>
                  ) : javaStatus === 'error' ? (
                    <span>インストール失敗（手動で設定してください）</span>
                  ) : (
                    <><Download size={14} /> Java 17 を自動インストール</>
                  )}
                </button>
                {javaStatus === 'loading' && (
                  <div className="w-full bg-[#1a1a2e] rounded-full h-1.5 mt-2">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${javaProgress}%` }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Memory */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <Cpu size={40} className="mx-auto mb-3 text-blue-400" />
                <h2 className="text-xl font-bold">メモリとオプション</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">最大メモリ</label>
                  <select value={data.maxMemory} onChange={(e) => update({ maxMemory: e.target.value })}
                    className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50">
                    {['2G', '3G', '4G', '6G', '8G', '12G', '16G'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">最小メモリ</label>
                  <select value={data.minMemory} onChange={(e) => update({ minMemory: e.target.value })}
                    className="w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50">
                    {['512M', '1G', '2G', '3G', '4G'].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => update({ closeOnLaunch: !data.closeOnLaunch })}
                  className={`w-10 h-5 rounded-full transition-colors ${data.closeOnLaunch ? 'bg-blue-500' : 'bg-gray-700'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full m-0.5 transition-transform ${data.closeOnLaunch ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
                <span className="text-sm text-gray-300">Minecraft起動後にランチャーを閉じる</span>
              </label>
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle size={56} className="text-green-400" />
              <div>
                <h2 className="text-xl font-bold">設定完了！</h2>
                <p className="text-sm text-gray-500 mt-1">Shouchan Launcherを楽しんでください</p>
              </div>
              <div className="w-full bg-[#1a1a2e] border border-white/5 rounded-xl p-4 text-left text-sm">
                <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-500">アカウント</span><span>{data.launcherUsername}</span></div>
                <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-500">ロール</span><span className={data.role === 'developer' ? 'text-yellow-400' : 'text-blue-400'}>{data.role === 'developer' ? '開発者' : 'プレイヤー'}</span></div>
                <div className="flex justify-between py-1 border-b border-white/5"><span className="text-gray-500">Minecraftアカウント</span><span>{data.mcUsername || '(未設定)'}</span></div>
                <div className="flex justify-between py-1"><span className="text-gray-500">最大メモリ</span><span>{data.maxMemory}</span></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer navigation */}
      <div className="flex items-center justify-between p-4 bg-[#0d0d14] border-t border-white/5 flex-shrink-0">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={16} /> 戻る
        </button>

        {step < 5 ? (
          <button
            onClick={() => {
              if (step === 0) { handleStep0Next(); return }
              if (step === 1 && data.role === 'player' && authStatus !== 'done') return
              setStep((s) => s + 1)
            }}
            disabled={
              (step === 0 && !canNextStep0()) ||
              (step === 1 && data.role === 'player' && authStatus !== 'done')
            }
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold transition-colors"
          >
            次へ <ChevronRight size={16} />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            className="flex items-center gap-1.5 px-6 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-semibold transition-colors"
          >
            <CheckCircle size={16} /> 始める
          </button>
        )}
      </div>
    </div>
  )
}
