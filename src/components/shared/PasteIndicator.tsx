import { Loader2, ScanLine } from 'lucide-react'

interface Props {
  isProcessing: boolean
  error: string | null
}

export function PasteIndicator({ isProcessing, error }: Props) {
  if (!isProcessing && !error) return null

  return (
    <div className="fixed bottom-6 right-6 z-40 animate-slide-up">
      {isProcessing && (
        <div className="flex items-center gap-3 bg-slate-800 border border-brand-500/50 rounded-xl px-4 py-3 shadow-2xl shadow-black/50">
          <div className="relative">
            <ScanLine size={20} className="text-brand-400" />
            <Loader2 size={20} className="text-brand-400 animate-spin absolute inset-0" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">Scanning image…</p>
            <p className="text-xs text-slate-400">AI is identifying this document</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-3 bg-slate-800 border border-red-500/50 rounded-xl px-4 py-3 shadow-2xl shadow-black/50">
          <div className="text-red-400 text-lg">⚠</div>
          <div>
            <p className="text-sm font-medium text-red-300">Recognition failed</p>
            <p className="text-xs text-slate-400 max-w-48 truncate">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
