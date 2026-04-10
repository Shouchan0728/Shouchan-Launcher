import React from 'react'
import { Home, Monitor, Settings, Wrench, type LucideIcon } from 'lucide-react'
import { ViewType } from '../types'

interface SidebarProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  role: 'developer' | 'player'
}

const navItems: { icon: React.ComponentType<{ size: number; className?: string }>; view: ViewType; label: string }[] = [
  { icon: Home, view: 'home', label: 'ホーム' },
  { icon: Monitor, view: 'logs', label: 'ログ' }
]

export default function Sidebar({ currentView, onViewChange, role }: SidebarProps): React.JSX.Element {
  return (
    <div className="flex w-14 flex-col items-center bg-[#0d0d14] py-3 gap-1">
      <div className="flex-1 flex flex-col gap-1 w-full items-center pt-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.view}
              title={item.label}
              onClick={() => onViewChange(item.view)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                currentView === item.view ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
            >
              <Icon size={20} />
            </button>
          )
        })}

        {role === 'developer' && (
          <button
            title="開発者メニュー"
            onClick={() => onViewChange('developer')}
            className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
              currentView === 'developer' ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-500 hover:bg-white/5 hover:text-yellow-300'
            }`}
          >
            <Wrench size={20} />
          </button>
        )}
      </div>

      <button
        title="設定"
        onClick={() => onViewChange('settings')}
        className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          currentView === 'settings' ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
        }`}
      >
        <Settings size={20} />
      </button>
    </div>
  )
}
