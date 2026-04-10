import React from 'react'
import { Home, Monitor, MessageSquare, Settings } from 'lucide-react'
import { ViewType } from '../types'

interface SidebarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}

const navItems: { icon: React.ComponentType<{ size: number; className?: string }>; view: ViewType; label: string }[] = [
  { icon: Home, view: 'home', label: 'ホーム' },
  { icon: Monitor, view: 'logs', label: 'ログ' },
  { icon: MessageSquare, view: 'logs', label: 'ニュース' }
]

export default function Sidebar({ currentView, onViewChange }: SidebarProps): React.JSX.Element {
  return (
    <div className="flex w-14 flex-col items-center bg-[#0d0d14] py-3 gap-2">
      <div className="h-8 w-8 rounded-full bg-yellow-400 flex items-center justify-center text-black font-bold text-sm mb-2 flex-shrink-0">
        S
      </div>

      <div className="flex-1 flex flex-col gap-1 w-full items-center">
        {navItems.map((item, index) => {
          const Icon = item.icon
          const isActive = currentView === item.view && index === 0
          return (
            <button
              key={index}
              title={item.label}
              onClick={() => onViewChange(item.view)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
            >
              <Icon size={20} />
            </button>
          )
        })}
      </div>

      <button
        title="設定"
        onClick={() => onViewChange('settings')}
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          currentView === 'settings'
            ? 'bg-white/10 text-white'
            : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
        }`}
      >
        <Settings size={20} />
      </button>
    </div>
  )
}
