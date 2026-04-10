import React, { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'

interface LogsViewProps {
  logs: string[]
}

export default function LogsView({ logs }: LogsViewProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <Terminal size={16} className="text-green-400" />
        <h2 className="text-sm font-semibold text-white">ゲームログ</h2>
        <span className="ml-auto text-xs text-gray-500">{logs.length} 行</span>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg bg-[#0a0a10] border border-white/5 p-3 font-mono text-xs text-green-400">
        {logs.length === 0 ? (
          <p className="text-gray-600">ゲームを起動するとログがここに表示されます...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="leading-5 break-all">
              {log}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
