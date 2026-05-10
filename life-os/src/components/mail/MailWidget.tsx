import { useState, useEffect, useCallback } from 'react'
import { Mail, RefreshCw, ChevronRight, Flag, Loader2, AlertCircle } from 'lucide-react'
import {
  getRecentDeliveries, getSyncState, triggerMailSync,
  getMailPieces, getMailImageUrl,
  type MailDelivery, type SyncState
} from '@/lib/mailService'
import { MailReviewPanel } from '@/components/mail/MailReviewPanel'

export function MailWidget() {
  const [deliveries, setDeliveries] = useState<MailDelivery[]>([])
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [selected, setSelected] = useState<MailDelivery | null>(null)
  const [previewPieces, setPreviewPieces] = useState<Record<string, string[]>>({})

  const load = useCallback(async () => {
    const [d, s] = await Promise.all([getRecentDeliveries(5), getSyncState()])
    setDeliveries(d)
    setSyncState(s)
    setLoading(false)

    // Load preview thumbnails for top 2 deliveries
    const previews: Record<string, string[]> = {}
    for (const delivery of d.slice(0, 2)) {
      const pieces = await getMailPieces(delivery.id)
      previews[delivery.id] = pieces
        .slice(0, 4)
        .map(p => getMailImageUrl(p.image_storage_path))
    }
    setPreviewPieces(previews)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    setSyncError(null)
    try {
      const result = await triggerMailSync()
      setSyncMsg(result.message)
      await load()
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const unreviewed = deliveries.filter(d => !d.reviewed).length
  const today = new Date().toISOString().split('T')[0]
  const todayDelivery = deliveries.find(d => d.delivery_date === today)

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00')
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const lastSynced = syncState?.last_synced_at
    ? new Date(syncState.last_synced_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <>
      <div className="card p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Mail size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Informed Delivery</h3>
              {lastSynced && (
                <p className="text-xs text-slate-500">Last checked {lastSynced}</p>
              )}
            </div>
            {unreviewed > 0 && (
              <span className="badge bg-red-500/20 text-red-400 border-red-500/30 ml-1">
                {unreviewed} new
              </span>
            )}
          </div>

          {/* Check Mail button */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-primary text-xs py-1.5 px-3"
          >
            {syncing
              ? <><Loader2 size={12} className="animate-spin" /> Checking…</>
              : <><RefreshCw size={12} /> Check Mail</>
            }
          </button>
        </div>

        {/* Sync feedback */}
        {syncMsg && (
          <div className="mb-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            ✓ {syncMsg}
          </div>
        )}
        {syncError && (
          <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertCircle size={12} /> {syncError}
          </div>
        )}

        {/* Today highlight */}
        {todayDelivery && (
          <button
            onClick={() => setSelected(todayDelivery)}
            className="w-full mb-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl hover:bg-indigo-500/15 transition-all text-left group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wide">
                Today's Mail
              </span>
              <div className="flex items-center gap-1 text-indigo-400">
                <span className="text-xs">{todayDelivery.piece_count} pieces</span>
                <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
            {/* Thumbnail strip */}
            {previewPieces[todayDelivery.id]?.length > 0 && (
              <div className="flex gap-1.5">
                {previewPieces[todayDelivery.id].map((url, i) => (
                  <div key={i} className="w-14 h-10 rounded-md bg-slate-800 overflow-hidden flex-shrink-0">
                    <img src={url} alt="" className="w-full h-full object-contain p-0.5"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                  </div>
                ))}
                {todayDelivery.piece_count > 4 && (
                  <div className="w-14 h-10 rounded-md bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-slate-400">+{todayDelivery.piece_count - 4}</span>
                  </div>
                )}
              </div>
            )}
          </button>
        )}

        {/* Recent deliveries list */}
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={20} className="animate-spin text-slate-600" />
          </div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-6">
            <Mail size={24} className="text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-500">No mail deliveries yet</p>
            <p className="text-xs text-slate-600 mt-1">Click "Check Mail" to scan Gmail</p>
          </div>
        ) : (
          <div className="space-y-1">
            {deliveries
              .filter(d => d.delivery_date !== today)
              .slice(0, 4)
              .map(delivery => {
                const flaggedCount = 0 // would load from pieces
                return (
                  <button
                    key={delivery.id}
                    onClick={() => setSelected(delivery)}
                    className="w-full flex items-center justify-between py-2 px-2 rounded-lg hover:bg-slate-700/40 transition-colors group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!delivery.reviewed ? 'bg-indigo-400' : 'bg-slate-700'}`} />
                      <div>
                        <span className={`text-xs font-medium ${!delivery.reviewed ? 'text-slate-200' : 'text-slate-400'}`}>
                          {formatDate(delivery.delivery_date)}
                        </span>
                        <span className="text-xs text-slate-500 ml-2">{delivery.piece_count} pieces</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {flaggedCount > 0 && (
                        <div className="flex items-center gap-1 text-red-400">
                          <Flag size={10} fill="currentColor" />
                          <span className="text-xs">{flaggedCount}</span>
                        </div>
                      )}
                      {delivery.reviewed && (
                        <span className="text-xs text-slate-600">✓</span>
                      )}
                      <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                )
              })}
          </div>
        )}
      </div>

      {/* Mail review panel */}
      {selected && (
        <MailReviewPanel
          delivery={selected}
          onClose={() => setSelected(null)}
          onReviewed={() => {
            setDeliveries(d => d.map(x =>
              x.id === selected.id ? { ...x, reviewed: true } : x
            ))
          }}
        />
      )}
    </>
  )
}
