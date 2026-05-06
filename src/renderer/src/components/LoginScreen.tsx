import React, { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle, Minus, X, User } from 'lucide-react'
import { LauncherAccount } from '../types'

interface LoginScreenProps {
  onLogin: (account: LauncherAccount, mcUsername: string) => void
}

const INPUT = 'w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors'

type Mode = 'login' | 'register'
type Step = 'credentials' | 'code' | 'microsoft'

export default function LoginScreen({ onLogin }: LoginScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('login')
  const [step, setStep] = useState<Step>('credentials')
  const [account, setAccount] = useState<LauncherAccount | null>(null)
  const [pendingToken, setPendingToken] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [msLoading, setMsLoading] = useState(false)
  const [msError, setMsError] = useState('')

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
    setStep('credentials')
    setVerificationCode('')
    setPendingToken('')
  }

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'register') {
      if (!username.trim()) { setError('ユーザー名を入力してください'); return }
      if (!email.trim()) { setError('メールアドレスを入力してください'); return }
      if (!password) { setError('パスワードを入力してください'); return }
      if (password.length < 6) { setError('パスワードは6文字以上で入力してください'); return }
      if (password !== passwordConfirm) { setError('パスワードが一致しません'); return }
      setLoading(true)
      const res = await window.api.accountRegisterStart({
        username: username.trim(), email: email.trim(), password
      })
      setLoading(false)
      if (!res.success || !res.pendingToken) { setError(res.error || '認証コード送信に失敗しました'); return }
      setPendingToken(res.pendingToken)
      setVerificationCode('')
      setStep('code')
      return
    }

    if (!email.trim() || !password) { setError('メールアドレスとパスワードを入力してください'); return }
    setLoading(true)
    const res = await window.api.accountLoginStart({ email: email.trim(), password })
    setLoading(false)
    if (!res.success || !res.pendingToken) { setError(res.error || '認証コード送信に失敗しました'); return }
    setPendingToken(res.pendingToken)
    setVerificationCode('')
    setStep('code')
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!verificationCode.trim()) { setError('確認コードを入力してください'); return }
    setLoading(true)
    const res = mode === 'register'
      ? await window.api.accountRegisterVerify({ pendingToken, code: verificationCode.trim() })
      : await window.api.accountLoginVerify({ pendingToken, code: verificationCode.trim() })
    setLoading(false)
    if (!res.success || !res.account) { setError(res.error || '確認コードが正しくありません'); return }
    setAccount(res.account)

    const mcAuth = await window.api.getStore('mc.auth') as { name: string } | null
    if (res.account.role === 'developer') {
      onLogin(res.account, mcAuth?.name || '')
      return
    }
    if (mcAuth?.name) {
      onLogin(res.account, mcAuth.name)
      return
    }
    setStep('microsoft')
  }

  const handleMicrosoftLogin = async () => {
    setMsLoading(true)
    setMsError('')
    const res = await window.api.authMicrosoft()
    setMsLoading(false)
    if (res.success && res.mcUsername && account) {
      onLogin(account, res.mcUsername)
    } else {
      setMsError(res.error || '認証に失敗しました')
    }
  }

  const subtitle =
    step === 'microsoft' ? 'Minecraftアカウントを連携'
      : mode === 'register' ? 'アカウントを新規作成'
        : 'アカウントにログイン'

  return (
    <div className="flex h-screen w-screen bg-[#111117] items-center justify-center select-none flex-col">
      {/* Draggable titlebar with window controls */}
      <div className="fixed top-0 left-0 right-0 h-8 flex items-center justify-between px-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="text-[11px] text-gray-700 font-medium" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Shouchan Launcher</span>
        <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button onClick={() => window.api.windowMinimize()}
            className="h-5 w-5 rounded flex items-center justify-center text-gray-600 hover:bg-white/10 hover:text-gray-300 transition-colors">
            <Minus size={10} />
          </button>
          <button onClick={() => window.api.windowClose()}
            className="h-5 w-5 rounded flex items-center justify-center text-gray-600 hover:bg-red-500/80 hover:text-white transition-colors">
            <X size={10} />
          </button>
        </div>
      </div>

      <div className="w-[340px] rounded-2xl bg-[#1a1a2e] border border-white/5 p-8 shadow-2xl">

        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="h-14 w-14 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-2xl">S</div>
          <h1 className="text-lg font-bold text-white">Shouchan Launcher</h1>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>

        {step !== 'microsoft' && (
          <div className="flex rounded-lg bg-[#0d0d14] p-1 gap-1 mb-5">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {m === 'login' ? 'ログイン' : '新規登録'}
              </button>
            ))}
          </div>
        )}

        {step === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><User size={11} />ユーザー名</label>
                <input
                  type="text" value={username}
                  onChange={(e) => { setUsername(e.target.value); setError('') }}
                  placeholder="あなたの名前" className={INPUT} autoFocus maxLength={64}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Mail size={11} />メールアドレス</label>
              <input
                type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                placeholder="example@email.com" className={INPUT}
                autoFocus={mode === 'login'}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Lock size={11} />パスワード</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••" className={INPUT + ' pr-10'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Lock size={11} />パスワード（確認）</label>
                <input
                  type="password" value={passwordConfirm}
                  onChange={(e) => { setPasswordConfirm(e.target.value); setError('') }}
                  placeholder="••••••••" className={INPUT}
                />
              </div>
            )}
            {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-colors mt-1">
              {loading
                ? <><Loader2 size={14} className="animate-spin" />送信中...</>
                : mode === 'register' ? '確認コードを送信' : 'ログイン'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
            <p className="text-xs text-gray-400 bg-[#121225] border border-white/10 rounded-lg px-3 py-2">
              {email.trim()} に確認コードを送信しました。メール内のコードを入力してください。
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">確認コード</label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => { setVerificationCode(e.target.value.replace(/\s+/g, '')); setError('') }}
                placeholder="6桁コード"
                className={INPUT}
                autoFocus
                maxLength={8}
              />
            </div>
            {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-colors mt-1">
              {loading
                ? <><Loader2 size={14} className="animate-spin" />確認中...</>
                : mode === 'register' ? '確認して登録' : '確認してログイン'}
            </button>
            <button type="button" onClick={() => { setStep('credentials'); setError(''); setVerificationCode('') }} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              ← 戻る
            </button>
          </form>
        )}

        {step === 'microsoft' && account && (
          <div className="flex flex-col gap-4 items-center text-center">
            <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
              <CheckCircle size={16} />
              <span>{account.discord_name || account.username} としてログイン済み</span>
            </div>
            <p className="text-sm text-gray-400">Minecraftアカウントの認証が必要です</p>
            <button onClick={handleMicrosoftLogin} disabled={msLoading}
              className="flex items-center justify-center gap-3 w-full rounded-xl bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-50 px-5 py-3 font-semibold transition-colors">
              {msLoading
                ? <><Loader2 size={16} className="animate-spin" /><span className="text-sm">認証中...</span></>
                : <><svg width="18" height="18" viewBox="0 0 21 21" fill="none"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg><span>Microsoftでログイン</span></>}
            </button>
            {msError && <p className="text-xs text-red-400">{msError}</p>}
            <button onClick={() => { setStep('credentials'); setMode('login') }} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← 戻る</button>
          </div>
        )}
      </div>
    </div>
  )
}
