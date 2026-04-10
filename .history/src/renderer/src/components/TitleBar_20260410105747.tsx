import React from 'react'
import { Minus, Square, X } from 'lucide-react'

interface TitleBarProps {
  appVersion: string
}

export default function TitleBar({ appVersion }: TitleBarProps): React.JSX.Element {
  return (
    <div
      className="flex h-9 items-center justify-between bg-[#0d0d14] px-3 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-3">
        <div className="h-7 w-7 rounded-full overflow-hidden">
          <img
            src="/assets/logo.png"
            alt="Logo"
            className="h-full w-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.parentElement!.innerHTML =
                '<div class="h-7 w-7 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-xs">S</div>'
            }}
          />
        </div>
        <span className="text-sm font-semibold text-white">Shouchan Launcher</span>
        <span className="text-sm text-gray-400">Home</span>
      </div>
      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          onClick={() => window.api.windowMinimize()}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 transition-colors"
        >
          <Minus size={14} className="text-gray-300" />
        </button>
        <button
          onClick={() => window.api.windowMaximize()}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-white/10 transition-colors"
        >
          <Square size={12} className="text-gray-300" />
        </button>
        <button
          onClick={() => window.api.windowClose()}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-red-500/80 transition-colors"
        >
          <X size={14} className="text-gray-300" />
        </button>
      </div>
      <div className="absolute bottom-0 left-14 text-[10px] text-gray-600">
        v{appVersion}
      </div>
    </div>
  )
}
