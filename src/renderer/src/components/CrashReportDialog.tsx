import React, { useState, useRef, useEffect } from 'react'
import { AlertTriangle, Send, X, ChevronDown, ChevronUp, Check, Loader2 } from 'lucide-react'

interface CrashReportDialogProps {
  logs: string[]
  exitCode: number
  launcherVersion: string
  modpackId?: string
  modpackVersion?: string
  mcVersion?: string
  onClose: () => void
  onViewLogs: () => void
}

export default function CrashReportDialog({
  logs,
  exitCode,
  launcherVersion,
  modpackId,
  modpackVersion,
  mcVersion,
  onClose,
  onViewLogs
}: CrashReportDialogProps): React.JSX.Element {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState('')
  const [showLog, setShowLog] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (showLog) logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [showLog])

  const handleSend = async () => {
    setSending(true)
    setSendError('')
    try {
      const res = await window.api.sendCrashReport({
        logs,
        exitCode,
        modpackId,
        modpackVersion,
        mcVersion,
        launcherVersion
      })
      if (res.success) {
        setSent(true)
      } else {
        setSendError(res.error || '送信に失敗しました')
      }
    } catch {
      setSendError('送信中にエラーが発生しました')
    } finally {
      setSending(false)
    }
  }

  const crashLines = logs.slice(-100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#16161e] border border-red-500/30 shadow-2xl flex flex-col max-h-[80vh]">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 p-5 border-b border-white/5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-white">ゲームがクラッシュしました</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              終了コード: <span className="font-mono text-red-400">{exitCode}</span>
              {mcVersion && <span className="ml-3">MC {mcVersion}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* 本文 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!sent ? (
            <>
              <p className="text-sm text-gray-300">
                クラッシュログを開発者に送信して、問題の解決を手伝いましょう。
                個人情報は含まれません。
              </p>

              {/* ログプレビュー */}
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <button
                  onClick={() => setShowLog((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-xs text-gray-400 hover:bg-white/5 transition-colors"
                >
                  <span>ログを{showLog ? '隠す' : '表示する'} ({logs.length} 行)</span>
                  {showLog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showLog && (
                  <div className="max-h-52 overflow-y-auto bg-[#0a0a10] p-3 font-mono text-xs text-green-400">
                    {crashLines.map((line, i) => (
                      <div key={i} className={`leading-5 break-all ${
                        /error|exception|crash|fatal/i.test(line) ? 'text-red-400' :
                        /warn/i.test(line) ? 'text-yellow-400' : ''
                      }`}>
                        {line}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>

              {sendError && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{sendError}</p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15">
                <Check size={24} className="text-green-400" />
              </div>
              <p className="text-sm text-gray-300 text-center">
                レポートを送信しました。<br />ご協力ありがとうございます！
              </p>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center gap-2 p-4 border-t border-white/5">
          <button
            onClick={onViewLogs}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors mr-auto"
          >
            ログビューで確認
          </button>
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-gray-300 transition-colors"
          >
            閉じる
          </button>
          {!sent && (
            <button
              onClick={handleSend}
              disabled={sending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
            >
              {sending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {sending ? '送信中...' : '開発者に送る'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
