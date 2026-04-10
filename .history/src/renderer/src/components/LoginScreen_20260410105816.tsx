import React, { useState } from 'react'
import { User, LogIn } from 'lucide-react'

interface LoginScreenProps {
  onLogin: (username: string, autoLogin: boolean) => void
}

export default function LoginScreen({ onLogin }: LoginScreenProps): React.JSX.Element {
  const [username, setUsername] = useState('')
  const [autoLogin, setAutoLogin] = useState(true)
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      setError('ユーザー名を入力してください')
      return
    }
    if (username.length < 3) {
      setError('ユーザー名は3文字以上入力してください')
      return
    }
    onLogin(username.trim(), autoLogin)
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#111117] items-center justify-center">
      <div className="w-80 rounded-2xl bg-[#1a1a2e] p-8 shadow-2xl border border-white/5">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="h-16 w-16 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-2xl mb-1">
            S
          </div>
          <h1 className="text-xl font-bold text-white">Shouchan Launcher</h1>
          <p className="text-sm text-gray-400">ログインしてください</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Minecraftユーザー名
            </label>
            <div className="relative">
              <User
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setError('')
                }}
                placeholder="ユーザー名"
                className="w-full rounded-lg bg-[#0d0d14] border border-white/10 pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-green-500/50 transition-colors"
              />
            </div>
            {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoLogin}
              onChange={(e) => setAutoLogin(e.target.checked)}
              className="h-4 w-4 rounded accent-green-500"
            />
            <span className="text-sm text-gray-300">自動ログイン</span>
          </label>

          <button
            type="submit"
            className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-green-500 py-2.5 font-semibold text-white transition-colors hover:bg-green-400 active:bg-green-600"
          >
            <LogIn size={16} />
            ログイン
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-gray-600">
          オフラインモードで起動します
        </p>
      </div>
    </div>
  )
}
