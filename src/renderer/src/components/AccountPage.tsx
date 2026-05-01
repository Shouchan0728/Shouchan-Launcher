import React, { useState } from 'react'
import {
  User, Mail, Shield, Calendar, Camera, Trash2, CheckCircle, Loader2,
  Link as LinkIcon, Unlink, AlertCircle, Gamepad2
} from 'lucide-react'
import { LauncherAccount } from '../types'

interface AccountPageProps {
  account: LauncherAccount
  mcUsername: string
  onAccountChange: (account: LauncherAccount) => void
  onMcUsernameChange: (name: string) => void
}

export default function AccountPage({
  account,
  mcUsername,
  onAccountChange,
  onMcUsernameChange
}: AccountPageProps): React.JSX.Element {
  const [status, setStatus] = useState<{ msg: string; type: 'ok' | 'error' | 'idle' }>({ msg: '', type: 'idle' })
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [linkLoading, setLinkLoading] = useState(false)

  const ok = (msg: string) => { setStatus({ msg, type: 'ok' }); setTimeout(() => setStatus({ msg: '', type: 'idle' }), 3000) }
  const err = (msg: string) => { setStatus({ msg, type: 'error' }); setTimeout(() => setStatus({ msg: '', type: 'idle' }), 4000) }

  const handleAvatarSelect = async () => {
    const filePath = await window.api.selectFile([{ name: '画像', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }])
    if (!filePath) return
    setAvatarLoading(true)
    const res = await window.api.readImageAsDataUrl(filePath)
    setAvatarLoading(false)
    if (res.success && res.dataUrl) {
      onAccountChange({ ...account, avatar: res.dataUrl })
      window.api.accountAvatarSync(res.dataUrl).catch(() => {})
      ok('アバターを変更しました')
    } else {
      err(res.error || 'アバターの読み込みに失敗しました')
    }
  }

  const handleAvatarRemove = () => {
    const { avatar, ...rest } = account
    void avatar
    onAccountChange(rest)
    window.api.accountAvatarSync(null).catch(() => {})
    ok('アバターを削除しました')
  }

  const handleLinkMicrosoft = async () => {
    setLinkLoading(true)
    const res = await window.api.authMicrosoft()
    setLinkLoading(false)
    if (res.success && res.mcUsername) {
      const stored = (await window.api.getStore('mc.auth')) as { uuid?: string; name: string } | null
      onAccountChange({
        ...account,
        linkedMicrosoft: { name: res.mcUsername, uuid: stored?.uuid || '' }
      })
      onMcUsernameChange(res.mcUsername)
      ok(`${res.mcUsername} と紐付けました`)
    } else {
      err(res.error || 'Microsoft認証に失敗しました')
    }
  }

  const handleUnlinkMicrosoft = async () => {
    const { linkedMicrosoft, ...rest } = account
    void linkedMicrosoft
    onAccountChange(rest)
    await window.api.deleteStore('mc.auth')
    onMcUsernameChange('')
    ok('Microsoftアカウントの紐付けを解除しました')
  }

  const formatDate = (iso: string) => {
    if (!iso) return '不明'
    try {
      return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      return iso
    }
  }

  const initial = (account.username || account.email || '?')[0]?.toUpperCase() || '?'

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center gap-2 mb-6">
        <User size={18} className="text-blue-400" />
        <h2 className="text-lg font-bold text-white">マイページ</h2>
        {status.msg && (
          <div className={`ml-auto flex items-center gap-1.5 text-xs ${status.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
            {status.type === 'ok' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
            <span>{status.msg}</span>
          </div>
        )}
      </div>

      <div className="max-w-xl flex flex-col gap-5">

        {/* ── Profile card ── */}
        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              {account.avatar ? (
                <img src={account.avatar} alt="avatar" className="h-20 w-20 rounded-full object-cover border-2 border-white/10" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-3xl">
                  {initial}
                </div>
              )}
              <button
                onClick={handleAvatarSelect}
                disabled={avatarLoading}
                className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white shadow-lg disabled:opacity-50 transition-colors"
                title="アバターを変更"
              >
                {avatarLoading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white truncate">{account.username}</h3>
                {account.role === 'developer' && (
                  <span className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-400">
                    <Shield size={10} /> 開発者
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                <Mail size={11} />
                <span className="truncate">{account.email}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                <Calendar size={11} />
                <span>登録日: {formatDate(account.createdAt)}</span>
              </div>
              {account.avatar && (
                <button
                  onClick={handleAvatarRemove}
                  className="mt-2 flex items-center gap-1 text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={10} />
                  アバターを削除
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Microsoft link ── */}
        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-300 flex items-center gap-2">
            <LinkIcon size={14} />
            Microsoftアカウント連携
          </h3>

          {account.linkedMicrosoft ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 bg-[#0d0d14] border border-green-500/20 rounded-lg p-3">
                <Gamepad2 size={16} className="text-green-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{account.linkedMicrosoft.name}</p>
                  <p className="text-xs text-gray-500 truncate">Shouchanアカウントに紐付け済み</p>
                </div>
                <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
              </div>
              <button
                onClick={handleUnlinkMicrosoft}
                className="flex items-center justify-center gap-2 rounded-lg bg-[#0d0d14] border border-red-500/20 text-red-400 hover:bg-red-500/10 px-4 py-2 text-sm transition-colors"
              >
                <Unlink size={13} />
                連携を解除
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">
                Microsoftアカウントを紐付けると、次回からワンクリックでログインできます。
                {mcUsername && (
                  <span className="block mt-1 text-gray-400">
                    現在のMinecraftアカウント: <span className="text-white">{mcUsername}</span>
                  </span>
                )}
              </p>
              <button
                onClick={handleLinkMicrosoft}
                disabled={linkLoading}
                className="flex items-center justify-center gap-3 rounded-xl bg-[#0078d4] hover:bg-[#106ebe] disabled:opacity-50 px-5 py-2.5 text-sm font-semibold transition-colors"
              >
                {linkLoading ? (
                  <><Loader2 size={14} className="animate-spin" />認証中...</>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 21 21" fill="none">
                      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                    </svg>
                    Microsoftアカウントを紐付ける
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* ── Account details ── */}
        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-300">アカウント詳細</h3>
          <div className="flex flex-col gap-2 text-sm">
            <Row label="ユーザーID" value={account.id || '(不明)'} />
            <Row label="ユーザー名" value={account.username} />
            <Row label="メールアドレス" value={account.email} />
            <Row label="ロール" value={account.role === 'developer' ? '開発者' : 'プレイヤー'} />
            <Row label="登録日" value={formatDate(account.createdAt)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex justify-between py-1.5 border-b border-white/5 last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 truncate ml-4">{value}</span>
    </div>
  )
}
