import React, { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react'
import { LauncherAccount } from '../types'

interface LoginScreenProps {
  onLogin: (account: LauncherAccount, mcUsername: string) => void
}

const INPUT = 'w-full rounded-lg bg-[#1a1a2e] border border-white/10 px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors'

export default function LoginScreen({ onLogin }: LoginScreenProps): React.JSX.Element {
  const [step, setStep] = useState<'shouchan' | 'microsoft'>('shouchan')
  const [account, setAccount] = useState<LauncherAccount | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mcUsername, setMcUsername] = useState('')
  const [msLoading, setMsLoading] = useState(false)
  const [msError, setMsError] = useState('')

  const handleShouchanLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) { setError('メールアドレスとパスワードを入力してください'); return }
    setLoading(true)
    const res = await window.api.accountLogin({ email: email.trim(), password })
    setLoading(false)
    if (!res.success || !res.account) { setError(res.error || 'ログインに失敗しました'); return }
    setAccount(res.account)

    if (res.account.role === 'developer') {
      onLogin(res.account, mcUsername)
      return
    }
    const mcAuth = await window.api.getStore('mc.auth') as { name: string } | null
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
      setMcUsername(res.mcUsername)
      onLogin(account, res.mcUsername)
    } else {
      setMsError(res.error || '認証に失敗しました')
    }
  }

  return (
    <div className="flex h-screen w-screen bg-[#111117] items-center justify-center select-none">
      <div className="w-[340px] rounded-2xl bg-[#1a1a2e] border border-white/5 p-8 shadow-2xl">

        <div className="flex flex-col items-center gap-2 mb-7">
          <div className="h-14 w-14 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-2xl">S</div>
          <h1 className="text-lg font-bold text-white">Shouchan Launcher</h1>
          <p className="text-xs text-gray-500">
            {step === 'shouchan' ? 'アカウントにログイン' : 'Minecraftアカウントを連携'}
          </p>
        </div>

        {step === 'shouchan' && (
          <form onSubmit={handleShouchanLogin} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Mail size={11} />メールアドレス</label>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} placeholder="example@email.com" className={INPUT} autoFocus />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 flex items-center gap-1"><Lock size={11} />パスワード</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => { setPassword(e.target.value); setError('') }} placeholder="••••••••" className={INPUT + ' pr-10'} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-colors mt-1">
              {loading ? <><Loader2 size={14} className="animate-spin" />ログイン中...</> : 'ログイン'}
            </button>
          </form>
        )}

        {step === 'microsoft' && account && (
          <div className="flex flex-col gap-4 items-center text-center">
            <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
              <CheckCircle size={16} />
              <span>{account.username} としてログイン済み</span>
            </div>
            <p className="text-sm text-gray-400">Minecraftアカウントの認証が必要です</p>
            <button onClick={handleMicrosoftLogin} disabled={msLoading}
              className="flex items-center justify-center gap-3 w-full rounded-xl bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-50 px-5 py-3 font-semibold transition-colors">
              {msLoading
                ? <><Loader2 size={16} className="animate-spin" /><span className="text-sm">認証中...</span></>
                : <><svg width="18" height="18" viewBox="0 0 21 21" fill="none"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg><span>Microsoftでログイン</span></>}
            </button>
            {msError && <p className="text-xs text-red-400">{msError}</p>}
            <button onClick={() => setStep('shouchan')} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">← 戻る</button>
          </div>
        )}
      </div>
    </div>
  )
}
