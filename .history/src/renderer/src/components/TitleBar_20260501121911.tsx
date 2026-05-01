import React from 'react'
import { Minus, Square, X, Shield } from 'lucide-react'
import { LauncherAccount } from '../types'

interface TitleBarProps {
  appVersion: string
  launcherAccount: LauncherAccount | null
  mcUsername: string
  launcherIconUrl?: string
}

export default function TitleBar({ appVersion, launcherAccount, mcUsername, launcherIconUrl }: TitleBarProps): React.JSX.Element {
  return (
    <div
      className="flex h-9 items-center justify-between bg-[#0d0d14] px-3 select-none flex-shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        {launcherIconUrl ? (
          <img src={launcherIconUrl} alt="launcher icon" className="h-6 w-6 rounded flex-shrink-0 object-cover" />
        ) : (
          <div className="h-6 w-6 rounded flex items-center justify-center bg-yellow-400 text-black font-bold text-xs flex-shrink-0 select-none">
            S
          </div>
        )}
        <span className="text-sm font-semibold text-white">Shouchan Launcher</span>
        <span className="text-[10px] text-gray-600">v{appVersion}</span>
        {launcherAccount?.role === 'developer' && (
          <span className="flex items-center gap-1 rounded px-1.5 py-0.5 bg-yellow-500/10 border border-yellow-500/20 text-[10px] text-yellow-400">
            <Shield size={10} /> DEV
          </span>
        )}
      </div>
      {mcUsername && (
        <span className="text-xs text-gray-500 absolute left-1/2 -translate-x-1/2">{mcUsername}</span>
      )}
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button onClick={() => window.api.windowMinimize()} className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 transition-colors">
          <Minus size={14} className="text-gray-300" />
        </button>
        <button onClick={() => window.api.windowMaximize()} className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 transition-colors">
          <Square size={12} className="text-gray-300" />
        </button>
        <button onClick={() => window.api.windowClose()} className="flex h-7 w-7 items-center justify-center rounded hover:bg-red-500/80 transition-colors">
          <X size={14} className="text-gray-300" />
        </button>
      </div>
    </div>
  )
}
