import React, { useEffect, useRef, useState } from 'react'
import { Terminal, Trash2, Copy, Download, Check } from 'lucide-react'

interface LogsViewProps {
  logs: string[]
  onClear?: () => void
}

export default function LogsView({ logs, onClear }: LogsViewProps): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const handleCopy = async (): Promise<void> => {
    if (logs.length === 0) return
    await navigator.clipboard.writeText(logs.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExport = async (): Promise<void> => {
    if (logs.length === 0) return
    await window.api.saveLogFile(logs.join('\n'))
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <Terminal size={16} className="text-green-400" />
        <h2 className="text-sm font-semibold text-white">ゲームログ</h2>
        <span className="ml-auto text-xs text-gray-500">{logs.length} 行</span>
        <button
          onClick={handleCopy}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 text-xs text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="ログをコピー"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          {copied ? 'コピー済み' : 'コピー'}
        </button>
        <button
          onClick={handleExport}
          disabled={logs.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 text-xs text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="ログをtxtで保存"
        >
          <Download size={12} />
          保存
        </button>
        <button
          onClick={onClear}
          disabled={!onClear || logs.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-2.5 py-1 text-xs text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="ログをクリア"
        >
          <Trash2 size={12} />
          クリア
        </button>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg bg-[#0a0a10] border border-white/5 p-3 font-mono text-xs text-green-400 select-text cursor-text">
        {logs.length === 0 ? (
          <p className="text-gray-600">ゲームを起動するとログがここに表示されます...</p>
        ) : (
          logs.map((log, i) => {
            const upper = log.toUpperCase()
            const color =
              /FATAL|CRASH|EXCEPTION/.test(upper) ? 'text-red-400' :
              /\bERROR\b/.test(upper) ? 'text-red-300' :
              /\bWARN\b/.test(upper) ? 'text-yellow-300' :
              /\bINFO\b/.test(upper) ? 'text-green-400' :
              'text-gray-400'
            return (
              <div key={i} className={`leading-5 break-all ${color}`}>
                {log}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
