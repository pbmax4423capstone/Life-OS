import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { format, parseISO } from 'date-fns'

export type ToastKind = 'success' | 'error'

export interface ToastMessage {
  id: number
  kind: ToastKind
  message: string
}

export function useToastState() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const pushToast = (kind: ToastKind, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, kind, message }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 3500)
  }

  const api = useMemo(
    () => ({
      success: (message: string) => pushToast('success', message),
      error: (message: string) => pushToast('error', message),
    }),
    [],
  )

  return { toasts, toast: api }
}

export function ToastViewport({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="fixed top-4 right-4 z-[70] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`card p-3 text-sm border ${toast.kind === 'success' ? 'border-emerald-500/50 text-emerald-200' : 'border-red-500/50 text-red-200'}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}

export function SectionState({
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  loading: boolean
  error: string | null
  empty: boolean
  emptyText: string
  children: JSX.Element
}) {
  if (loading) {
    return (
      <div className="card p-8 flex items-center justify-center">
        <div className="animate-spin w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="card p-6 text-sm text-red-300 border-red-500/40">
        {error}
      </div>
    )
  }

  if (empty) {
    return (
      <div className="card p-8 text-center text-sm text-slate-400">
        {emptyText}
      </div>
    )
  }

  return children
}

export function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${active ? 'bg-brand-600/20 border-brand-500/40 text-brand-300' : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/70'}`}
    >
      {label}
    </button>
  )
}

export function DomainModal({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: JSX.Element
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const titleId = useRef(`domain-modal-title-${Math.random().toString(36).slice(2)}`)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    const focusFirstElement = () => {
      const container = dialogRef.current
      if (!container) return
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        container.focus()
      }
    }

    window.setTimeout(focusFirstElement, 0)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const container = dialogRef.current
      if (!container) return
      const focusables = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
      if (focusables.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (event.shiftKey) {
        if (active === first || !active) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previousFocusRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Close modal overlay" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        tabIndex={-1}
        className="relative w-full max-w-2xl card bg-slate-900 border-slate-700 max-h-[90vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 id={titleId.current} className="text-base font-semibold text-slate-100">{title}</h3>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export const formatUsd = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0)

export const formatDate = (value: string | null | undefined) => {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'MMM d, yyyy')
  } catch {
    return '—'
  }
}

export const maskLast4 = (value: string | null | undefined) => {
  if (!value) return '—'
  const trimmed = value.trim()
  if (trimmed.length <= 4) return `••••${trimmed}`
  return `••••${trimmed.slice(-4)}`
}

export const isSoon = (value: string | null | undefined, days: number) => {
  if (!value) return false
  const now = new Date()
  const date = new Date(value)
  const diff = date.getTime() - now.getTime()
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000
}
