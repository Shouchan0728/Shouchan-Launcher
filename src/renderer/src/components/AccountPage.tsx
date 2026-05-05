import React, { useState, useEffect } from 'react'
import {
  User, Mail, Shield, Calendar, Camera, Trash2, CheckCircle, Loader2,
  Link as LinkIcon, Unlink, AlertCircle, Gamepad2, ListPlus, Pencil
} from 'lucide-react'
import { LauncherAccount, WhitelistStatus } from '../types'

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
  const [mcidInput, setMcidInput] = useState('')
  const [wlLoading, setWlLoading] = useState(false)
  const [wlStatus, setWlStatus] = useState<WhitelistStatus | null>(null)
  const [usernameInput, setUsernameInput] = useState(account.username || '')
  const [usernameEditing, setUsernameEditing] = useState(false)
  const [usernameLoading, setUsernameLoading] = useState(false)

  const ok = (msg: string) => { setStatus({ msg, type: 'ok' }); setTimeout(() => setStatus({ msg: '', type: 'idle' }), 3000) }
  const err = (msg: string) => { setStatus({ msg, type: 'error' }); setTimeout(() => setStatus({ msg: '', type: 'idle' }), 4000) }

  const refreshWhitelistStatus = async () => {
    const res = await window.api.fetchWhitelistStatus()
    if (res.ok) {
      setWlStatus({ registered: res.registered, mcid: res.mcid, mc_uuid: res.mc_uuid })
    }
  }

  useEffect(() => {
    refreshWhitelistStatus()
  }, [account.id])

  useEffect(() => {
    setUsernameInput(account.username || '')
  }, [account.username])

  const displayName = account.discord_name || account.username

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
      refreshWhitelistStatus()
    } else {
      err(res.error || 'Microsoft認証に失敗しました')
    }
  }

  const handleRegisterWhitelist = async () => {
    const mcid = mcidInput.trim()
    if (!mcid) return
    setWlLoading(true)
    const res = await window.api.linkMinecraftManual(mcid)
    setWlLoading(false)
    if (res.ok) {
      setMcidInput('')
      ok(`${mcid} をホワイトリストに登録しました`)
      refreshWhitelistStatus()
    } else {
      err(res.error || 'ホワイトリスト登録に失敗しました')
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

  const handleSaveUsername = async () => {
    const name = usernameInput.trim()
    if (!name) return
    if (name === account.username) {
      setUsernameEditing(false)
      return
    }
    setUsernameLoading(true)
    const res = await window.api.updateLauncherUsername(name)
    setUsernameLoading(false)
    if (res.ok) {
      onAccountChange({ ...account, username: res.username || name })
      setUsernameEditing(false)
      ok('ユーザー名を変更しました')
    } else {
      err(res.error || 'ユーザー名の変更に失敗しました')
    }
  }

  const formatDate = (iso: string) => {
    if (!iso) return '不明'
    try {
      return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      return iso
    }
  }

  const initial = (displayName || account.email || '?')[0]?.toUpperCase() || '?'

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
                <h3 className="text-lg font-bold text-white truncate">{displayName}</h3>
                {account.role === 'developer' && (
                  <span className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-400">
                    <Shield size={10} /> 開発者
                  </span>
                )}
                {account.discord_name && (
                  <span className="rounded px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-[10px] text-indigo-300">
                    Discord
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

        {/* ── ホワイトリスト登録 ── */}
        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-300 flex items-center gap-2">
            <ListPlus size={14} />
            ホワイトリスト登録
          </h3>
          {wlStatus?.registered ? (
            <div className="flex items-center gap-3 bg-[#0d0d14] border border-green-500/20 rounded-lg p-3">
              <Gamepad2 size={16} className="text-green-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{wlStatus.mcid}</p>
                <p className="text-xs text-gray-500">ホワイトリスト登録済み</p>
              </div>
              <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">
                MinecraftのユーザーID（MCID）を入力してホワイトリストに登録してください。
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mcidInput}
                  onChange={e => setMcidInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRegisterWhitelist()}
                  placeholder="MinecraftID（例: Steve）"
                  maxLength={16}
                  className="flex-1 bg-[#0d0d14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
                />
                <button
                  onClick={handleRegisterWhitelist}
                  disabled={wlLoading || !mcidInput.trim()}
                  className="flex items-center gap-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  {wlLoading ? <Loader2 size={13} className="animate-spin" /> : '登録'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Account details ── */}
        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-300">アカウント詳細</h3>
          <div className="flex flex-col gap-2 text-sm">
            <Row label="ユーザーID" value={account.id || '(不明)'} />
            {account.discord_name ? (
              <Row label="ユーザー名" value={account.discord_name} hint="Discord連携中" />
            ) : (
              <div className="flex items-center justify-between py-1.5 border-b border-white/5 gap-3">
                <span className="text-gray-500 flex-shrink-0">ユーザー名</span>
                {usernameEditing ? (
                  <div className="flex items-center gap-1.5 flex-1 justify-end">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={e => setUsernameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
                      maxLength={64}
                      className="bg-[#0d0d14] border border-white/10 rounded px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 w-40"
                    />
                    <button
                      onClick={handleSaveUsername}
                      disabled={usernameLoading || !usernameInput.trim()}
                      className="rounded bg-green-700 hover:bg-green-600 disabled:opacity-50 px-2 py-1 text-xs font-semibold"
                    >
                      {usernameLoading ? <Loader2 size={11} className="animate-spin" /> : '保存'}
                    </button>
                    <button
                      onClick={() => { setUsernameEditing(false); setUsernameInput(account.username || '') }}
                      className="rounded bg-[#0d0d14] border border-white/10 hover:bg-white/5 px-2 py-1 text-xs text-gray-400"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-200 truncate">{account.username}</span>
                    <button
                      onClick={() => setUsernameEditing(true)}
                      className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
                      title="ユーザー名を変更"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                )}
              </div>
            )}
            <Row label="メールアドレス" value={account.email} />
            <Row label="ロール" value={account.role === 'developer' ? '開発者' : 'プレイヤー'} />
            <Row label="登録日" value={formatDate(account.createdAt)} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }): React.JSX.Element {
  return (
    <div className="flex justify-between py-1.5 border-b border-white/5 last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        {hint && <span className="text-[10px] text-indigo-300/70">{hint}</span>}
        <span className="text-gray-200 truncate ml-1">{value}</span>
      </div>
    </div>
  )
}
