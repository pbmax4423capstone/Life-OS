import { useState, useEffect } from 'react'
import {
  X, Flag, CheckCheck, ChevronLeft,
  ChevronRight, Maximize2, AlertCircle, Mail
} from 'lucide-react'
import {
  getMailPieces, getMailImageUrl, toggleFlag,
  markDeliveryReviewed, type MailDelivery, type MailPiece
} from '@/lib/mailService'

interface Props {
  delivery: MailDelivery
  onClose: () => void
  onReviewed: () => void
}

const FLAG_COLORS = [
  { id: 'red',    label: 'Urgent',    bg: 'bg-red-500',    ring: 'ring-red-500' },
  { id: 'yellow', label: 'Follow up', bg: 'bg-amber-400',  ring: 'ring-amber-400' },
  { id: 'green',  label: 'Expected',  bg: 'bg-emerald-500',ring: 'ring-emerald-500' },
  { id: 'blue',   label: 'Info',      bg: 'bg-blue-500',   ring: 'ring-blue-500' },
]

export function MailReviewPanel({ delivery, onClose, onReviewed }: Props) {
  const [pieces, setPieces] = useState<MailPiece[]>([])
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [flagging, setFlagging] = useState<string | null>(null)
  const [flagNote, setFlagNote] = useState('')
  const [flagColor, setFlagColor] = useState('red')
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    getMailPieces(delivery.id)
      .then(setPieces)
      .finally(() => setLoading(false))
  }, [delivery.id])

  const handleFlag = async (piece: MailPiece) => {
    if (piece.flagged) {
      // Unflag immediately
      await toggleFlag(piece.id, false)
      setPieces(p => p.map(x => x.id === piece.id ? { ...x, flagged: false, flag_note: null } : x))
    } else {
      // Open flag dialog
      setFlagging(piece.id)
      setFlagNote(piece.flag_note ?? '')
      setFlagColor(piece.flag_color ?? 'red')
    }
  }

  const confirmFlag = async () => {
    if (!flagging) return
    await toggleFlag(flagging, true, flagNote, flagColor)
    setPieces(p => p.map(x =>
      x.id === flagging
        ? { ...x, flagged: true, flag_note: flagNote, flag_color: flagColor }
        : x
    ))
    setFlagging(null)
    setFlagNote('')
  }

  const handleMarkReviewed = async () => {
    setMarking(true)
    await markDeliveryReviewed(delivery.id)
    onReviewed()
    onClose()
  }

  const flaggedCount = pieces.filter(p => p.flagged).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
            <Mail size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Mail for {new Date(delivery.delivery_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <p className="text-xs text-slate-400">
              {delivery.piece_count} piece{delivery.piece_count !== 1 ? 's' : ''}
              {flaggedCount > 0 && <span className="text-red-400 ml-2">· {flaggedCount} flagged</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!delivery.reviewed && (
            <button
              onClick={handleMarkReviewed}
              disabled={marking}
              className="btn-primary text-sm py-1.5 px-3"
            >
              <CheckCheck size={14} />
              {marking ? 'Marking…' : 'Mark All Reviewed'}
            </button>
          )}
          {delivery.reviewed && (
            <span className="badge bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              ✓ Reviewed
            </span>
          )}
          <button onClick={onClose} className="btn-ghost p-2">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : pieces.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <AlertCircle size={32} className="text-slate-600 mb-3" />
            <p className="text-slate-400">No mail piece images found for this delivery</p>
            <p className="text-xs text-slate-500 mt-1">Images may not have loaded from USPS</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-4">
              Click any piece to enlarge · Click the flag icon to mark for attention
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {pieces.map((piece, idx) => (
                <MailPieceCard
                  key={piece.id}
                  piece={piece}
                  index={idx}
                  onExpand={() => setLightbox(idx)}
                  onFlag={() => handleFlag(piece)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox !== null && pieces[lightbox] && (
        <Lightbox
          piece={pieces[lightbox]}
          pieces={pieces}
          index={lightbox}
          onNavigate={setLightbox}
          onClose={() => setLightbox(null)}
          onFlag={handleFlag}
        />
      )}

      {/* Flag dialog */}
      {flagging && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setFlagging(null)} />
          <div className="relative bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 mb-4">Flag This Piece</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-2 block">
                  Flag Color
                </label>
                <div className="flex gap-2">
                  {FLAG_COLORS.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setFlagColor(c.id)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${c.bg} text-white ${flagColor === c.id ? `ring-2 ${c.ring} ring-offset-2 ring-offset-slate-900` : 'opacity-60 hover:opacity-100'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wide font-medium mb-1.5 block">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={flagNote}
                  onChange={e => setFlagNote(e.target.value)}
                  placeholder="e.g. Bill due, open immediately…"
                  className="input-base"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && confirmFlag()}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={confirmFlag} className="btn-primary flex-1 justify-center">
                  <Flag size={14} /> Flag Piece
                </button>
                <button onClick={() => setFlagging(null)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Individual mail piece card ─────────────────────────────────
function MailPieceCard({
  piece, index, onExpand, onFlag
}: {
  piece: MailPiece
  index: number
  onExpand: () => void
  onFlag: () => void
}) {
  const imageUrl = getMailImageUrl(piece.image_storage_path)
  const flagColorMap: Record<string, string> = {
    red: 'bg-red-500', yellow: 'bg-amber-400',
    green: 'bg-emerald-500', blue: 'bg-blue-500'
  }

  return (
    <div className={`relative group card overflow-hidden cursor-pointer transition-all hover:border-slate-600 ${piece.flagged ? 'ring-2 ring-offset-2 ring-offset-slate-950 ' + (piece.flag_color === 'red' ? 'ring-red-500' : piece.flag_color === 'yellow' ? 'ring-amber-400' : piece.flag_color === 'green' ? 'ring-emerald-500' : 'ring-blue-500') : ''}`}>
      {/* Image */}
      <div className="relative aspect-[4/3] bg-slate-900 overflow-hidden" onClick={onExpand}>
        <img
          src={imageUrl}
          alt={`Mail piece ${index + 1}`}
          className="w-full h-full object-contain p-2 transition-transform group-hover:scale-105"
          onError={e => {
            (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect fill="%23334155" width="100" height="60"/><text x="50" y="35" text-anchor="middle" fill="%2364748b" font-size="12">Mail piece</text></svg>'
          }}
        />
        {/* Expand icon */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="p-1.5 bg-slate-900/80 rounded-lg backdrop-blur-sm">
            <Maximize2 size={13} className="text-slate-300" />
          </div>
        </div>
        {/* Flag indicator */}
        {piece.flagged && (
          <div className={`absolute top-2 left-2 w-3 h-3 rounded-full ${flagColorMap[piece.flag_color] ?? 'bg-red-500'} shadow-lg`} />
        )}
      </div>

      {/* Footer */}
      <div className="p-3 flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-300 truncate">
            Piece {index + 1}
            {piece.sender_name && ` · ${piece.sender_name}`}
          </p>
          {piece.flagged && piece.flag_note && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{piece.flag_note}</p>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onFlag() }}
          className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ml-2 ${piece.flagged ? 'text-red-400 bg-red-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'}`}
          title={piece.flagged ? 'Remove flag' : 'Flag for attention'}
        >
          <Flag size={13} fill={piece.flagged ? 'currentColor' : 'none'} />
        </button>
      </div>
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────
function Lightbox({
  piece, pieces, index, onNavigate, onClose, onFlag
}: {
  piece: MailPiece
  pieces: MailPiece[]
  index: number
  onNavigate: (i: number) => void
  onClose: () => void
  onFlag: (p: MailPiece) => void
}) {
  const imageUrl = getMailImageUrl(piece.image_storage_path)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
      if (e.key === 'ArrowRight' && index < pieces.length - 1) onNavigate(index + 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, pieces.length, onClose, onNavigate])

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/90 animate-fade-in">
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white p-2">
        <X size={24} />
      </button>

      {/* Nav arrows */}
      {index > 0 && (
        <button onClick={() => onNavigate(index - 1)}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-3 bg-slate-800/60 rounded-xl">
          <ChevronLeft size={24} />
        </button>
      )}
      {index < pieces.length - 1 && (
        <button onClick={() => onNavigate(index + 1)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-3 bg-slate-800/60 rounded-xl">
          <ChevronRight size={24} />
        </button>
      )}

      {/* Image */}
      <div className="max-w-3xl max-h-[80vh] p-4">
        <img src={imageUrl} alt={`Mail piece ${index + 1}`}
          className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl" />
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-2xl px-5 py-3">
        <span className="text-sm text-slate-300">Piece {index + 1} of {pieces.length}</span>
        <div className="w-px h-4 bg-slate-700" />
        <button
          onClick={() => onFlag(piece)}
          className={`flex items-center gap-2 text-sm font-medium transition-colors ${piece.flagged ? 'text-red-400' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Flag size={14} fill={piece.flagged ? 'currentColor' : 'none'} />
          {piece.flagged ? 'Flagged' : 'Flag for attention'}
        </button>
      </div>
    </div>
  )
}
