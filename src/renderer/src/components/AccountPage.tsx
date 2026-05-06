import React, { useState, useEffect, useRef } from 'react'
import {
  User, Mail, Shield, Calendar, Camera, Trash2, CheckCircle, Loader2,
  Link as LinkIcon, Unlink, AlertCircle, Gamepad2, ListPlus, Shirt, Upload, RefreshCw
} from 'lucide-react'
import { LauncherAccount, MinecraftProfile } from '../types'

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
  const [mcProfile, setMcProfile] = useState<MinecraftProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const profileLoadingRef = useRef(false)
  const [retryMsg, setRetryMsg] = useState(false)
  const [skinVariant, setSkinVariant] = useState<'classic' | 'slim'>('classic')
  const [skinLoading, setSkinLoading] = useState(false)
  const [capeLoading, setCapeLoading] = useState(false)
  const [skinPreviewUrl, setSkinPreviewUrl] = useState<string | null>(null)

  const ok = (msg: string) => { setStatus({ msg, type: 'ok' }); setTimeout(() => setStatus({ msg: '', type: 'idle' }), 3000) }
  const err = (msg: string) => { setStatus({ msg, type: 'error' }); setTimeout(() => setStatus({ msg: '', type: 'idle' }), 4000) }

  const loadProfile = async () => {
    if (profileLoadingRef.current) {
      setRetryMsg(true)
      setTimeout(() => setRetryMsg(false), 3000)
      return
    }
    profileLoadingRef.current = true
    setProfileLoading(true)
    setSkinPreviewUrl(null)
    try {
      const res = await window.api.getMinecraftProfile()
      if (res.success && res.data) {
        setMcProfile(res.data)
        const activeSkin = res.data.skins?.find(s => s.state === 'ACTIVE')
        if (activeSkin) {
          setSkinVariant(activeSkin.variant === 'SLIM' ? 'slim' : 'classic')
          const imgRes = await window.api.fetchImageDataUrl(activeSkin.url)
          setSkinPreviewUrl(imgRes.success && imgRes.dataUrl ? imgRes.dataUrl : '')
        } else {
          setSkinPreviewUrl('')
        }
      } else {
        setSkinPreviewUrl('')
      }
    } finally {
      setProfileLoading(false)
      profileLoadingRef.current = false
    }
  }

  const handleSkinUpload = async () => {
    const filePath = await window.api.selectFile([{ name: 'PNGスキン', extensions: ['png'] }])
    if (!filePath) return
    setSkinLoading(true)
    const res = await window.api.uploadSkin(filePath, skinVariant)
    setSkinLoading(false)
    if (res.success) {
      ok('スキンを変更しました')
      await loadProfile()
    } else {
      err(res.error || 'スキンの変更に失敗しました')
    }
  }

  const handleCapeSet = async (capeId: string | null) => {
    setCapeLoading(true)
    const res = await window.api.setCape(capeId)
    setCapeLoading(false)
    if (res.success) {
      ok(capeId ? 'マントを変更しました' : 'マントをはずしました')
      await loadProfile()
    } else {
      err(res.error || 'マントの変更に失敗しました')
    }
  }

  useEffect(() => {
    if (account.linkedMicrosoft) loadProfile()
  }, [])

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

  const handleRegisterWhitelist = async () => {
    const mcid = mcidInput.trim()
    if (!mcid) return
    setWlLoading(true)
    const res = await window.api.linkMinecraftManual(mcid)
    setWlLoading(false)
    if (res.ok) {
      onAccountChange({ ...account, mc_name: mcid })
      setMcidInput('')
      ok(`${mcid} をホワイトリストに登録しました`)
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

        {/* ── ホワイトリスト登録 ── */}
        <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-300 flex items-center gap-2">
            <ListPlus size={14} />
            ホワイトリスト登録
          </h3>
          {account.mc_name ? (
            <div className="flex items-center gap-3 bg-[#0d0d14] border border-green-500/20 rounded-lg p-3">
              <Gamepad2 size={16} className="text-green-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{account.mc_name}</p>
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

        {/* ── スキン・マント管理 ── */}
        {account.linkedMicrosoft && (
          <div className="rounded-xl bg-[#1a1a2e] border border-white/5 p-5">
            <h3 className="mb-4 text-sm font-semibold text-gray-300 flex items-center gap-2">
              <Shirt size={14} />
              スキン・マント管理
            </h3>

            {profileLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                読み込み中...
              </div>
            ) : mcProfile ? (
              <div className="flex flex-col gap-4">
                {/* スキン */}
                <div className="flex gap-4 items-center">
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    {skinPreviewUrl === null ? (
                      <div className="w-16 h-16 rounded bg-white/5 border border-white/10 flex items-center justify-center">
                        <Loader2 size={14} className="text-gray-600 animate-spin" />
                      </div>
                    ) : skinPreviewUrl ? (
                      <div
                        style={{
                          width: 64, height: 64,
                          backgroundImage: `url(${skinPreviewUrl})`,
                          backgroundSize: '512px 512px',
                          backgroundPosition: '-64px -64px',
                          imageRendering: 'pixelated',
                          flexShrink: 0
                        }}
                        title="スキンプレビュー（顔）"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded bg-white/5 border border-white/10 flex items-center justify-center">
                        <Shirt size={20} className="text-gray-700" />
                      </div>
                    )}
                    <p className="text-[10px] text-gray-600">プレビュー</p>
                  </div>
                  <div className="flex-1 flex flex-col gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">モデル</p>
                      <div className="flex gap-2">
                        {(['classic', 'slim'] as const).map(v => (
                          <button
                            key={v}
                            onClick={() => setSkinVariant(v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              skinVariant === v
                                ? 'bg-blue-600 text-white'
                                : 'bg-[#0d0d14] border border-white/10 text-gray-400 hover:text-white'
                            }`}
                          >
                            {v === 'classic' ? 'クラシック (Steve)' : 'スリム (Alex)'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={handleSkinUpload}
                      disabled={skinLoading}
                      className="flex items-center gap-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 disabled:opacity-50 px-4 py-2 text-sm text-blue-300 transition-colors w-fit"
                    >
                      {skinLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {skinLoading ? 'アップロード中...' : 'スキンを変更'}
                    </button>
                  </div>
                </div>

                {/* マント */}
                <div className="pt-3 border-t border-white/5">
                  <p className="text-xs text-gray-500 mb-2">マント</p>
                  {mcProfile.capes && mcProfile.capes.length > 0 ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {mcProfile.capes.map(cape => (
                          <button
                            key={cape.id}
                            onClick={() => handleCapeSet(cape.state === 'ACTIVE' ? null : cape.id)}
                            disabled={capeLoading}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                              cape.state === 'ACTIVE'
                                ? 'bg-green-600/20 border border-green-500/30 text-green-300'
                                : 'bg-[#0d0d14] border border-white/10 text-gray-400 hover:text-white'
                            }`}
                          >
                            {capeLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                            {cape.alias}
                            {cape.state === 'ACTIVE' && <CheckCircle size={11} />}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-600 mt-1.5">アクティブなマントをクリックするとはずせます</p>
                    </>
                  ) : (
                    <p className="text-xs text-gray-600">所持しているマントはありません</p>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={loadProfile}
                    disabled={profileLoading}
                    className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-400 disabled:opacity-40 transition-colors"
                  >
                    {profileLoading ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                    更新
                  </button>
                  {retryMsg && (
                    <span className="text-[11px] text-yellow-500 animate-pulse">
                      読み込み中です。しばらく待ってから試してね
                    </span>
                  )}
                  {!profileLoading && skinPreviewUrl === '' && !retryMsg && (
                    <span className="text-[11px] text-gray-600">
                      プレビューを取得できませんでした。「更新」で再試行できます
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-gray-500">スキン情報を読み込めませんでした</p>
                <button
                  onClick={loadProfile}
                  className="flex items-center gap-2 rounded-lg bg-[#0d0d14] border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors w-fit"
                >
                  <RefreshCw size={12} />
                  再読み込み
                </button>
              </div>
            )}
          </div>
        )}

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
