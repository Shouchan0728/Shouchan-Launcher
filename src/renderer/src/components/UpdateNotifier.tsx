import React from 'react'
import { Download, RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { UpdateState } from '../types'

interface UpdateNotifierProps {
  updateState: UpdateState
  onCheckForUpdates: () => void
  onInstallUpdate: () => void
  onDismiss: () => void
}

export default function UpdateNotifier({
  updateState,
  onCheckForUpdates,
  onInstallUpdate,
  onDismiss
}: UpdateNotifierProps): React.JSX.Element | null {
  // チェック中
  if (updateState.checking) {
    return (
      <div className="fixed top-12 right-4 z-50 flex items-center gap-3 rounded-xl bg-[#1a1a24] border border-blue-500/30 px-4 py-3 shadow-lg">
        <RefreshCw size={18} className="text-blue-400 animate-spin" />
        <span className="text-sm text-gray-300">アップデートを確認中...</span>
      </div>
    )
  }

  // エラー
  if (updateState.error) {
    return (
      <div className="fixed top-12 right-4 z-50 flex items-center gap-3 rounded-xl bg-[#1a1a24] border border-red-500/30 px-4 py-3 shadow-lg">
        <AlertCircle size={18} className="text-red-400" />
        <div className="flex flex-col">
          <span className="text-sm text-gray-300">アップデート確認エラー</span>
          <span className="text-xs text-gray-500">{updateState.error}</span>
        </div>
        <button onClick={onDismiss} className="ml-2 text-gray-500 hover:text-gray-300">
          <X size={14} />
        </button>
      </div>
    )
  }

  // ダウンロード完了（インストール待ち）
  if (updateState.downloaded && updateState.available) {
    return (
      <div className="fixed top-12 right-4 z-50 flex items-center gap-3 rounded-xl bg-[#1a1a24] border border-green-500/30 px-4 py-3 shadow-lg">
        <CheckCircle2 size={18} className="text-green-400" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-200">
            バージョン {updateState.version} 準備完了
          </span>
          <span className="text-xs text-gray-500">再起動してアップデートを適用します</span>
        </div>
        <button
          onClick={onInstallUpdate}
          className="ml-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 px-3 py-1.5 text-sm font-medium text-green-400 transition-colors"
        >
          再起動
        </button>
        <button onClick={onDismiss} className="text-gray-500 hover:text-gray-300">
          <X size={14} />
        </button>
      </div>
    )
  }

  // ダウンロード進行中
  if (updateState.available && !updateState.downloaded && updateState.progress !== undefined) {
    return (
      <div className="fixed top-12 right-4 z-50 flex items-center gap-3 rounded-xl bg-[#1a1a24] border border-blue-500/30 px-4 py-3 shadow-lg min-w-[280px]">
        <Download size={18} className="text-blue-400" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">バージョン {updateState.version} ダウンロード中</span>
            <span className="text-xs text-blue-400">{Math.round(updateState.progress)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${updateState.progress}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  // アップデートあり（ダウンロード開始前）
  if (updateState.available && !updateState.downloaded) {
    return (
      <div className="fixed top-12 right-4 z-50 flex items-center gap-3 rounded-xl bg-[#1a1a24] border border-blue-500/30 px-4 py-3 shadow-lg">
        <Download size={18} className="text-blue-400" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-200">
            バージョン {updateState.version} が利用可能
          </span>
          <span className="text-xs text-gray-500">自動的にダウンロードを開始します</span>
        </div>
        <button onClick={onDismiss} className="ml-2 text-gray-500 hover:text-gray-300">
          <X size={14} />
        </button>
      </div>
    )
  }

  return null
}
