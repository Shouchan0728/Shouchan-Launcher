import React, { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import HomeView from './components/HomeView'
import SettingsView from './components/SettingsView'
import LogsView from './components/LogsView'
import LoginScreen from './components/LoginScreen'
import { ViewType, UserAccount, Stats } from './types'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<ViewType>('home')
  const [account, setAccount] = useState<UserAccount | null>(null)
  const [stats, setStats] = useState<Stats>({
    launches: 0,
    playTimeMinutes: 0
  })
  const [logs, setLogs] = useState<string[]>([])
  const [appVersion, setAppVersion] = useState('1.0.0')

  useEffect(() => {
    const init = async () => {
      const version = await window.api.getAppVersion()
      setAppVersion(version)

      const savedAccount = (await window.api.getStore('account')) as UserAccount | null
      if (savedAccount && savedAccount.autoLogin) {
        setAccount(savedAccount)
      }

      const launches = ((await window.api.getStore('stats.launches')) as number) || 0
      const playTime = ((await window.api.getStore('stats.playTimeMinutes')) as number) || 0
      const lastLaunch = (await window.api.getStore('stats.lastLaunch')) as string | undefined
      const modpackVersion = (await window.api.getStore('modpack.version')) as
        | string
        | undefined

      setStats({
        launches,
        playTimeMinutes: playTime,
        lastLaunch,
        modpackVersion
      })
    }
    init()
  }, [])

  useEffect(() => {
    const cleanup = window.api.onLaunchLog((log) => {
      setLogs((prev) => [...prev.slice(-500), log])
    })
    return cleanup
  }, [])

  const handleLogin = async (username: string, autoLogin: boolean) => {
    const newAccount: UserAccount = { username, autoLogin }
    setAccount(newAccount)
    await window.api.setStore('account', newAccount)
  }

  const handleLogout = async () => {
    setAccount(null)
    await window.api.deleteStore('account')
  }

  const handleStatsUpdate = (newStats: Partial<Stats>) => {
    setStats((prev) => ({ ...prev, ...newStats }))
  }

  if (!account) {
    return <LoginScreen onLogin={handleLogin} />
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#111117] text-white overflow-hidden">
      <TitleBar appVersion={appVersion} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentView={view} onViewChange={setView} />
        <main className="flex-1 overflow-hidden">
          {view === 'home' && (
            <HomeView
              account={account}
              stats={stats}
              onLogout={handleLogout}
              onStatsUpdate={handleStatsUpdate}
            />
          )}
          {view === 'settings' && <SettingsView />}
          {view === 'logs' && <LogsView logs={logs} />}
        </main>
      </div>
    </div>
  )
}
