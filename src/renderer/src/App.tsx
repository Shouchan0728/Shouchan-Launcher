import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import HomeView from './components/HomeView'
import SettingsView from './components/SettingsView'
import LogsView from './components/LogsView'
import SetupWizard from './components/SetupWizard'
import DeveloperMenu from './components/DeveloperMenu'
import LoginScreen from './components/LoginScreen'
import UpdateNotifier from './components/UpdateNotifier'
import AccountPage from './components/AccountPage'
import { ViewType, LauncherAccount, Stats, AppState, LaunchStatus, UpdateState } from './types'
import { RefreshCw, X } from 'lucide-react'

export default function App(): React.JSX.Element {
  const [appState, setAppState] = useState<AppState>('loading')
  const [view, setView] = useState<ViewType>('home')
  const [launcherAccount, setLauncherAccount] = useState<LauncherAccount | null>(null)
  const [mcUsername, setMcUsername] = useState('')
  const [stats, setStats] = useState<Stats>({ launches: 0, playTimeMinutes: 0 })
  const [logs, setLogs] = useState<string[]>([])
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [reauthError, setReauthError] = useState('')
  const [launchStatus, setLaunchStatus] = useState<LaunchStatus>('idle')
  const [launcherIconUrl, setLauncherIconUrl] = useState('')

  // アップデート状態
  const [updateState, setUpdateState] = useState<UpdateState>({
    checking: false,
    available: false,
    downloaded: false
  })
  const [showUpdateNotifier, setShowUpdateNotifier] = useState(true)

  const loadLauncherIcon = async () => {
    const res = await window.api.getLauncherIcon()
    if (res.success && res.iconPath) {
      const imgRes = await window.api.readImageAsDataUrl(res.iconPath)
      setLauncherIconUrl(imgRes.success && imgRes.dataUrl ? imgRes.dataUrl : '')
    } else {
      setLauncherIconUrl('')
    }
  }

  useEffect(() => { loadLauncherIcon() }, [])

  useEffect(() => {
    const init = async () => {
      // バージョンとアカウントを並列取得
      const [version, accountRaw] = await Promise.all([
        window.api.getAppVersion(),
        window.api.getStore('launcherAccount')
      ])
      setAppVersion(version as string)

      const account = accountRaw as LauncherAccount | null
      if (!account) {
        const setupCompleted = await window.api.getStore('setupCompleted')
        setAppState(setupCompleted ? 'login' : 'setup')
        return
      }
      setLauncherAccount(account)

      // mc.auth・統計をすべて並列取得（トークン検証を待たない）
      const [mcAuthRaw, launchesRaw, playTimeRaw, lastLaunchRaw, modpackVersionRaw] = await Promise.all([
        window.api.getStore('mc.auth'),
        window.api.getStore('stats.launches'),
        window.api.getStore('stats.playTimeMinutes'),
        window.api.getStore('stats.lastLaunch'),
        window.api.getStore('modpack.version')
      ])
      const mcAuth = mcAuthRaw as { name: string; isOffline: boolean } | null

      if (!mcAuth && account.role === 'player') {
        setAppState('reauth')
        return
      }
      if (mcAuth?.name) {
        setMcUsername(mcAuth.name)
      } else if (account.linkedMicrosoft?.name) {
        setMcUsername(account.linkedMicrosoft.name)
      }

      setStats({
        launches: ((launchesRaw as number) || 0),
        playTimeMinutes: ((playTimeRaw as number) || 0),
        lastLaunch: lastLaunchRaw as string | undefined,
        modpackVersion: modpackVersionRaw as string | undefined
      })

      // キャッシュデータでUIをすぐに表示
      setAppState('main')

      // トークン検証はバックグラウンドで実行（UIをブロックしない）
      window.api.accountVerifyToken().then((tokenRes) => {
        if (tokenRes.success && tokenRes.role && tokenRes.role !== account.role) {
          const updated = { ...account, role: tokenRes.role }
          setLauncherAccount(updated)
          window.api.setStore('launcherAccount', updated)
        }
      }).catch(() => {})
    }
    init()
  }, [])

  useEffect(() => {
    const cleanup = window.api.onLaunchLog((log) => {
      setLogs((prev) => [...prev.slice(-500), log])
    })
    return cleanup
  }, [])

  useEffect(() => {
    const cleanup = window.api.onGameClosed(({ addedMinutes }) => {
      setLaunchStatus('idle')
      if (addedMinutes > 0) {
        setStats((prev) => {
          const newTotal = prev.playTimeMinutes + addedMinutes
          window.api.setStore('stats.playTimeMinutes', newTotal)
          return { ...prev, playTimeMinutes: newTotal }
        })
      }
    })
    return cleanup
  }, [])

  // アップデート状態の監視
  useEffect(() => {
    const cleanup = window.api.onUpdateStatus((state) => {
      setUpdateState(state)
      // アップデートがある場合は通知を表示
      if (state.available || state.checking || state.error) {
        setShowUpdateNotifier(true)
      }
    })
    return cleanup
  }, [])

  const handleCheckForUpdates = async () => {
    setShowUpdateNotifier(true)
    await window.api.checkForUpdates()
  }

  const handleInstallUpdate = async () => {
    await window.api.installUpdate()
  }

  const handleDismissUpdate = () => {
    setShowUpdateNotifier(false)
  }

  const handleSetupComplete = (account: LauncherAccount, username: string) => {
    setLauncherAccount(account)
    setMcUsername(username)
    setAppState('main')
  }

  const handleLoginComplete = async (account: LauncherAccount, username: string) => {
    // 同一ユーザーの既存データからローカル設定フィールドを引き継ぐ
    const existing = await window.api.getStore('launcherAccount') as LauncherAccount | null
    const isSameUser = existing?.id === account.id

    const finalAccount: LauncherAccount = {
      ...account,
      ...(isSameUser && existing?.linkedMicrosoft ? { linkedMicrosoft: existing.linkedMicrosoft } : {}),
      ...(isSameUser && existing?.avatar ? { avatar: existing.avatar } : {}),
    }
    await window.api.setStore('launcherAccount', finalAccount)

    let finalMcUsername = username
    const mcAuth = await window.api.getStore('mc.auth') as { name: string } | null
    if (!finalMcUsername && mcAuth?.name) finalMcUsername = mcAuth.name
    if (!finalMcUsername && finalAccount.linkedMicrosoft?.name) finalMcUsername = finalAccount.linkedMicrosoft.name

    setLauncherAccount(finalAccount)
    setMcUsername(finalMcUsername)
    setAppState('main')
  }

  const handleReauth = async () => {
    setReauthError('')
    const res = await window.api.authMicrosoft()
    if (res.success && res.mcUsername) {
      setMcUsername(res.mcUsername)
      setAppState('main')
    } else {
      setReauthError(res.error || '認証に失敗しました')
    }
  }

  const handleLogout = async () => {
    await window.api.deleteStore('launcherAccount')
    setLauncherAccount(null)
    setMcUsername('')
    setAppState('login')
  }

  const handleStatsUpdate = (newStats: Partial<Stats>) => {
    setStats((prev) => ({ ...prev, ...newStats }))
  }

  if (appState === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#111117]">
        <div className="text-gray-500 text-sm">読み込み中...</div>
      </div>
    )
  }

  if (appState === 'setup') {
    return <SetupWizard onComplete={handleSetupComplete} />
  }

  if (appState === 'login') {
    return <LoginScreen onLogin={handleLoginComplete} />
  }

  if (appState === 'reauth') {
    return (
      <div className="flex flex-col h-screen w-screen bg-[#111117] text-white">
        <div className="flex h-9 items-center justify-between bg-[#0d0d14] px-3 select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <span className="text-sm font-semibold text-white">Shouchan Launcher</span>
          <div className="flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button onClick={() => window.api.windowClose()} className="flex h-7 w-7 items-center justify-center rounded hover:bg-red-500/80 transition-colors">
              <X size={14} className="text-gray-300" />
            </button>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-5 max-w-sm text-center">
            <RefreshCw size={40} className="text-blue-400" />
            <div>
              <h2 className="text-lg font-bold">再ログインが必要です</h2>
              <p className="text-sm text-gray-500 mt-1">Microsoftアカウントで再認証してください</p>
            </div>
            {reauthError && <p className="text-sm text-red-400">{reauthError}</p>}
            <button onClick={handleReauth} className="flex items-center gap-3 rounded-xl bg-[#0078d4] hover:bg-[#106ebe] px-6 py-3 font-semibold transition-colors">
              <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Microsoftでログイン
            </button>
            <button onClick={handleLogout} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
              アカウントを切り替える
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#111117] text-white overflow-hidden">
      <TitleBar appVersion={appVersion} launcherAccount={launcherAccount} mcUsername={mcUsername} launcherIconUrl={launcherIconUrl} />
      {showUpdateNotifier && (
        <UpdateNotifier
          updateState={updateState}
          onCheckForUpdates={handleCheckForUpdates}
          onInstallUpdate={handleInstallUpdate}
          onDismiss={handleDismissUpdate}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={view} onViewChange={setView} role={launcherAccount?.role ?? 'player'} />
        <main className="flex-1 overflow-hidden">
          {view === 'home' && (
            <HomeView
              mcUsername={mcUsername}
              launcherAccount={launcherAccount}
              stats={stats}
              onLogout={handleLogout}
              onStatsUpdate={handleStatsUpdate}
              launchStatus={launchStatus}
              setLaunchStatus={setLaunchStatus}
            />
          )}
          {view === 'settings' && <SettingsView />}
          {view === 'logs' && <LogsView logs={logs} onClear={() => setLogs([])} />}
          {view === 'account' && launcherAccount && (
            <AccountPage
              account={launcherAccount}
              mcUsername={mcUsername}
              onAccountChange={(a: LauncherAccount) => {
                setLauncherAccount(a)
                window.api.setStore('launcherAccount', a)
              }}
              onMcUsernameChange={setMcUsername}
            />
          )}
          {view === 'developer' && launcherAccount?.role === 'developer' && (
            <DeveloperMenu mcUsername={mcUsername} onMcUsernameChange={setMcUsername} onLauncherIconChange={loadLauncherIcon} />
          )}
        </main>
      </div>
    </div>
  )
}
