import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

export interface ToastMessage {
  id: string
  type: 'success' | 'error'
  message: string
}

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

export const formatDateLabel = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function useToastQueue() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const push = (type: ToastMessage['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((prev) => [...prev, { id, type, message }])
  }

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const latestToastId = toasts[toasts.length - 1]?.id

  useEffect(() => {
    if (!latestToastId) return
    const timeout = window.setTimeout(() => dismiss(latestToastId), 3500)
    return () => window.clearTimeout(timeout)
  }, [latestToastId, dismiss])

  return {
    toasts,
    dismiss,
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
  }
}

export function ToastViewport({ toasts, onDismiss }: {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}) {
  return (
    <div className="fixed top-4 right-4 z-[70] space-y-2 w-[min(92vw,360px)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`card p-3 border ${toast.type === 'success' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10'}`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className={`text-sm ${toast.type === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
              {toast.message}
            </p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 hover:text-slate-200"
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function FinanceModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto card border-slate-600">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost p-2"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="card p-4 animate-pulse">
          <div className="h-4 bg-slate-700/70 rounded w-1/3 mb-3" />
          <div className="h-3 bg-slate-700/60 rounded w-2/3" />
          <div className="h-3 bg-slate-700/50 rounded w-1/2 mt-2" />
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  cta,
}: {
  title: string
  description: string
  cta?: React.ReactNode
}) {
  return (
    <div className="card p-8 text-center">
      <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      <p className="text-sm text-slate-400 mt-2">{description}</p>
      {cta ? <div className="mt-4 flex justify-center">{cta}</div> : null}
    </div>
  )
}

export interface LineChartPoint {
  label: string
  value: number
}

export function SimpleLineChart({ points, color = '#10B981' }: { points: LineChartPoint[]; color?: string }) {
  const { pathD, min, max } = useMemo(() => {
    if (points.length === 0) return { pathD: '', min: 0, max: 0 }
    const values = points.map((point) => point.value)
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const range = maxValue - minValue || 1

    const coords = points.map((point, idx) => {
      const x = (idx / Math.max(points.length - 1, 1)) * 100
      const y = 100 - (((point.value - minValue) / range) * 80 + 10)
      return { x, y }
    })

    const d = coords
      .map((coord, idx) => `${idx === 0 ? 'M' : 'L'} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`)
      .join(' ')

    return { pathD: d, min: minValue, max: maxValue }
  }, [points])

  return (
    <div className="card p-4">
      <div className="w-full aspect-[16/7] bg-slate-900/50 rounded-xl border border-slate-700/60 p-2">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-500">No chart data yet</div>
        ) : (
          <svg viewBox="0 0 100 100" className="w-full h-full" role="img" aria-label="Line chart">
            <line x1="0" y1="90" x2="100" y2="90" stroke="#334155" strokeWidth="0.6" />
            <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
        <span>{points[0]?.label ?? '—'}</span>
        <span>Min {formatCurrency(min)}</span>
        <span>Max {formatCurrency(max)}</span>
        <span>{points[points.length - 1]?.label ?? '—'}</span>
      </div>
    </div>
  )
}

export interface BarChartPoint {
  label: string
  value: number
}

export function SimpleBarChart({ points, color = '#F59E0B' }: { points: BarChartPoint[]; color?: string }) {
  const max = useMemo(() => Math.max(...points.map((point) => point.value), 0), [points])

  return (
    <div className="card p-4">
      {points.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-sm text-slate-500">No chart data yet</div>
      ) : (
        <div className="space-y-3">
          {points.map((point) => {
            const width = max > 0 ? `${Math.max((point.value / max) * 100, 3)}%` : '0%'
            return (
              <div key={point.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-300">{point.label}</span>
                  <span className="text-slate-400">{formatCurrency(point.value)}</span>
                </div>
                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width, backgroundColor: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
