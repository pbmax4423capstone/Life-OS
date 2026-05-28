import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Wallet, Star,
  ChevronLeft, ChevronRight, CheckCircle2, Loader2, X, Edit2,
} from 'lucide-react'
import { supabase, type FinancialAccount, type ScheduledPayment } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { MailWidget } from '@/components/mail/MailWidget'
import { InvitePanel } from '@/components/shared/InvitePanel'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtDec = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDateDisplay = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

interface PaydayConfig {
  frequency: string          // 'weekly' | 'biweekly' | 'monthly'
  budget_per_period: number
  anchor_date: string        // ISO date — a known payday
}

// ── Period math ────────────────────────────────────────────────────────────

function addPeriods(date: Date, freq: string, n: number): Date {
  const d = new Date(date)
  const sign = n >= 0 ? 1 : -1
  const f = freq.toLowerCase()
  for (let i = 0; i < Math.abs(n); i++) {
    if (f === 'weekly') d.setDate(d.getDate() + sign * 7)
    else if (f === 'biweekly') d.setDate(d.getDate() + sign * 14)
    else d.setMonth(d.getMonth() + sign * 1)
  }
  return d
}

/** Returns the first period-end date >= today anchored to the given payday. */
function calcCurrentPeriodEnd(anchor: string, freq: string): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let d = new Date(anchor + 'T00:00:00')
  while (d < today) d = addPeriods(d, freq, 1)
  return d
}

/** Advance a payment's next_due_date by one frequency step. */
function advanceDueDate(dueDate: string, frequency: string): string {
  const d = new Date(dueDate + 'T00:00:00')
  const freq = frequency.toLowerCase()
  if (freq === 'weekly') d.setDate(d.getDate() + 7)
  else if (freq === 'biweekly') d.setDate(d.getDate() + 14)
  else if (freq === 'monthly') d.setMonth(d.getMonth() + 1)
  else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3)
  else if (freq === 'annually') d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

const FREQ_OPTIONS = ['Weekly', 'Biweekly', 'Monthly']

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [payments, setPayments] = useState<ScheduledPayment[]>([])
  const [sourceAccounts, setSourceAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)

  // Payday Planner
  const [paydayConfig, setPaydayConfig] = useState<PaydayConfig | null>(null)
  const [periodOffset, setPeriodOffset] = useState(0)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [configForm, setConfigForm] = useState({
    frequency: 'Biweekly',
    budget_per_period: '2000',
    anchor_date: '',
  })
  const [savingConfig, setSavingConfig] = useState(false)

  // Mark as Paid
  const [showPayModal, setShowPayModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<ScheduledPayment | null>(null)
  const [payFromAccountId, setPayFromAccountId] = useState('')
  const [marking, setMarking] = useState(false)

  // ── Data loading ──

  useEffect(() => {
    if (!user) { setLoading(false); return }
    const load = async () => {
      try {
        const [{ data: accs }, { data: pmts }, { data: prof }] = await Promise.all([
          supabase.from('financial_accounts').select('*')
            .eq('owner_id', user.id).is('deleted_at', null).order('sort_order'),
          supabase.from('scheduled_payments').select('*')
            .eq('owner_id', user.id).is('deleted_at', null).order('next_due_date'),
          supabase.from('profiles').select('preferences').eq('id', user.id).single(),
        ])
        const allAccs = accs ?? []
        setAccounts(allAccs)
        setPayments(pmts ?? [])

        // Prefer checking/savings for the "paid from" dropdown; fall back to all accounts
        const src = allAccs.filter(a => ['checking', 'savings'].includes(a.account_type.toLowerCase()))
        setSourceAccounts(src.length > 0 ? src : allAccs)

        const prefs = prof?.preferences as Record<string, unknown> | null
        if (prefs?.payday_planner) {
          const cfg = prefs.payday_planner as PaydayConfig
          setPaydayConfig(cfg)
          setConfigForm({
            frequency: cfg.frequency.charAt(0).toUpperCase() + cfg.frequency.slice(1),
            budget_per_period: cfg.budget_per_period.toString(),
            anchor_date: cfg.anchor_date,
          })
        }
      } catch {
        // Stay with empty state on error
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  // ── Derived values ──

  const assets = accounts.filter(a => a.current_balance > 0).reduce((s, a) => s + a.current_balance, 0)
  const debt = accounts.filter(a => a.current_balance < 0).reduce((s, a) => s + Math.abs(a.current_balance), 0)
  const netWorth = assets - debt
  const totalRewardsValue = accounts.reduce((s, a) => s + (a.rewards_balance * a.rewards_cpp / 100), 0)

  // Period window for Payday Planner
  const periodEndBase = paydayConfig ? calcCurrentPeriodEnd(paydayConfig.anchor_date, paydayConfig.frequency) : null
  const periodEnd = periodEndBase && paydayConfig ? addPeriods(periodEndBase, paydayConfig.frequency, periodOffset) : null

  // Bills due this period: ALL payments whose due date is on or before the period-end date.
  // This deliberately has no lower bound so overdue bills always surface.
  const periodPayments = payments.filter(p => {
    if (!periodEnd) return false
    const due = new Date(p.next_due_date + 'T00:00:00')
    const end = new Date(periodEnd)
    end.setHours(23, 59, 59, 999)
    return due <= end
  })
  const periodTotal = periodPayments.reduce((s, p) => s + p.amount, 0)
  const budgetRemaining = paydayConfig ? paydayConfig.budget_per_period - periodTotal : 0

  // Account name helper
  const accountLabel = (id: string) => {
    const a = accounts.find(a => a.id === id)
    return a ? (a.nickname || `${a.institution_name}${a.last_four ? ` ····${a.last_four}` : ''}`) : null
  }

  // ── Handlers ──

  const openPayModal = (payment: ScheduledPayment) => {
    setSelectedPayment(payment)
    setPayFromAccountId(payment.from_account_id || '')
    setShowPayModal(true)
  }

  const closePayModal = () => {
    setShowPayModal(false)
    setSelectedPayment(null)
    setPayFromAccountId('')
  }

  const markAsPaid = async () => {
    if (!selectedPayment) return
    setMarking(true)
    try {
      const isOneTime = selectedPayment.frequency.toLowerCase() === 'once'
      const updates: Record<string, unknown> = {
        from_account_id: payFromAccountId || selectedPayment.from_account_id,
        updated_at: new Date().toISOString(),
      }
      if (isOneTime) {
        updates.status = 'paid'
        updates.deleted_at = new Date().toISOString()
      } else {
        updates.next_due_date = advanceDueDate(selectedPayment.next_due_date, selectedPayment.frequency)
      }
      const { error } = await supabase.from('scheduled_payments').update(updates).eq('id', selectedPayment.id)
      if (!error) {
        if (isOneTime) {
          setPayments(ps => ps.filter(p => p.id !== selectedPayment.id))
        } else {
          setPayments(ps => ps.map(p =>
            p.id === selectedPayment.id
              ? { ...p, ...updates, next_due_date: updates.next_due_date as string }
              : p
          ))
        }
      }
    } finally {
      setMarking(false)
      closePayModal()
    }
  }

  const savePaydayConfig = async () => {
    if (!user) return
    setSavingConfig(true)
    try {
      const config: PaydayConfig = {
        frequency: configForm.frequency.toLowerCase(),
        budget_per_period: parseFloat(configForm.budget_per_period) || 0,
        anchor_date: configForm.anchor_date || new Date().toISOString().split('T')[0],
      }
      const { data: prof } = await supabase.from('profiles').select('preferences').eq('id', user.id).single()
      const currentPrefs = (prof?.preferences as Record<string, unknown>) ?? {}
      await supabase.from('profiles').update({
        preferences: { ...currentPrefs, payday_planner: config },
      }).eq('id', user.id)
      setPaydayConfig(config)
      setShowConfigModal(false)
      setPeriodOffset(0)
    } finally {
      setSavingConfig(false)
    }
  }

  // ── Render helpers ──

  const PaymentRow = ({ p, showSource = false }: { p: ScheduledPayment; showSource?: boolean }) => (
    <button
      onClick={() => openPayModal(p)}
      className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-800/60 transition-colors text-left group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${p.auto_pay ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <div className="min-w-0">
          <div className="text-sm text-slate-200 truncate">{p.payee_name ?? 'Payment'}</div>
          <div className="text-xs text-slate-500">
            Due {fmtDateDisplay(p.next_due_date)}
            {p.auto_pay ? ' · Auto-pay' : ' · Manual'}
            {showSource && accountLabel(p.from_account_id) ? ` · ${accountLabel(p.from_account_id)}` : ''}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-3">
        <span className="text-sm font-semibold text-slate-200">{fmtDec(p.amount)}</span>
        <CheckCircle2 size={16} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />
      </div>
    </button>
  )

  // ── Loading ──

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Net Worth',    value: fmt(netWorth),          icon: Wallet,       color: '#10B981', glow: 'glow-green' },
          { label: 'Total Assets', value: fmt(assets),            icon: TrendingUp,   color: '#6366F1', glow: 'glow-indigo' },
          { label: 'Total Debt',   value: fmt(debt),              icon: TrendingDown, color: '#EF4444', glow: 'glow-red' },
          { label: 'Rewards',      value: fmt(totalRewardsValue), icon: Star,         color: '#F59E0B', glow: 'glow-amber' },
        ].map(s => (
          <div key={s.label} className={`card p-4 ${s.glow}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-widest">{s.label}</span>
              <s.icon size={15} style={{ color: s.color }} />
            </div>
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Accounts */}
      {accounts.length > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Accounts</h2>
          <div className="space-y-3">
            {accounts.map(a => (
              <div key={a.id} onClick={() => navigate('/accounts')} className="flex items-center gap-3 cursor-pointer rounded-lg px-1 -mx-1 hover:bg-slate-800/40 transition-colors py-0.5">
                <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200 truncate">{a.nickname ?? a.institution_name}</span>
                    <span className={`text-sm font-semibold ${a.current_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtDec(a.current_balance)}
                    </span>
                  </div>
                  {a.credit_limit && (
                    <div className="h-1 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min((Math.abs(a.current_balance) / a.credit_limit) * 100, 100)}%`, backgroundColor: a.color }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payday Planner — always shown; setup prompt when not yet configured */}
      <div className="card p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Payday Planner</h2>
            {paydayConfig && (
              <p className="text-xs text-slate-400 mt-0.5 capitalize">
                {paydayConfig.frequency} · Budget {fmtDec(paydayConfig.budget_per_period)}/period
              </p>
            )}
          </div>
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/60"
          >
            <Edit2 size={12} /> {paydayConfig ? 'Edit' : 'Set Up'}
          </button>
        </div>

        {paydayConfig && periodEnd ? (
          <>
            {/* Period navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setPeriodOffset(o => o - 1)}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/60"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <div className="text-center">
                <div className="text-sm font-semibold text-brand-400">
                  {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {periodOffset === 0
                    ? 'current period'
                    : periodOffset < 0
                      ? `${Math.abs(periodOffset)} period${Math.abs(periodOffset) > 1 ? 's' : ''} ago`
                      : `${periodOffset} period${periodOffset > 1 ? 's' : ''} ahead`}
                </div>
              </div>
              <button
                onClick={() => setPeriodOffset(o => o + 1)}
                className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800/60"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>

            {/* Budget stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">Budget</div>
                <div className="text-sm font-bold text-slate-200">{fmtDec(paydayConfig.budget_per_period)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">Bills Due</div>
                <div className="text-sm font-bold text-red-400">{fmtDec(periodTotal)}</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">Remaining</div>
                <div className={`text-sm font-bold ${budgetRemaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtDec(budgetRemaining)}
                </div>
              </div>
            </div>

            {/* Payments due this period */}
            {periodPayments.length === 0 ? (
              <p className="text-center py-4 text-slate-500 text-sm">No payments due by this date</p>
            ) : (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Payments due by {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="space-y-0.5">
                  {periodPayments.map(p => <PaymentRow key={p.id} p={p} showSource />)}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Set up your payday budget to track bills per pay period and mark payments as paid.
          </p>
        )}
      </div>

      {/* All Scheduled Payments — always visible so nothing is hidden */}
      {payments.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-100">All Scheduled Payments</h2>
            <button onClick={() => navigate('/payments')} className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
              Manage →
            </button>
          </div>
          <div className="space-y-0.5">
            {payments.map(p => <PaymentRow key={p.id} p={p} showSource />)}
          </div>
        </div>
      )}

      {/* Right column widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        <MailWidget />
        <InvitePanel />
      </div>

      {/* ── Mark as Paid Modal ──────────────────────────────────────────── */}
      {showPayModal && selectedPayment && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-100">Mark as Paid</h3>
              <button onClick={closePayModal} className="text-slate-400 hover:text-slate-200 transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            {/* Payment summary */}
            <div className="bg-slate-800/60 rounded-xl p-4 mb-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-slate-100">{selectedPayment.payee_name ?? 'Payment'}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Due {fmtDateDisplay(selectedPayment.next_due_date)}
                    {' · '}
                    <span className="capitalize">{selectedPayment.frequency}</span>
                  </div>
                  {selectedPayment.memo && (
                    <div className="text-xs text-slate-500 mt-0.5">{selectedPayment.memo}</div>
                  )}
                </div>
                <div className="text-xl font-bold text-slate-100 flex-shrink-0">{fmtDec(selectedPayment.amount)}</div>
              </div>
            </div>

            {/* Source account */}
            <div className="mb-5">
              <label className="text-xs text-slate-400 font-medium mb-1.5 block">Paid From Account</label>
              <select
                value={payFromAccountId}
                onChange={e => setPayFromAccountId(e.target.value)}
                className="input-base"
              >
                <option value="">Select account…</option>
                {sourceAccounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nickname || `${a.institution_name}${a.last_four ? ` ····${a.last_four}` : ''}`}
                  </option>
                ))}
              </select>
            </div>

            {/* What happens next */}
            {selectedPayment.frequency.toLowerCase() !== 'once' ? (
              <div className="text-xs text-slate-500 mb-5 flex items-start gap-2">
                <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>
                  Next due date will advance to{' '}
                  <span className="text-slate-300 font-medium">
                    {fmtDateDisplay(advanceDueDate(selectedPayment.next_due_date, selectedPayment.frequency))}
                  </span>
                </span>
              </div>
            ) : (
              <div className="text-xs text-slate-500 mb-5 flex items-start gap-2">
                <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                <span>This one-time payment will be marked as paid and removed from your schedule.</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={markAsPaid}
                disabled={marking}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {marking
                  ? <><Loader2 size={14} className="animate-spin" /> Marking…</>
                  : <><CheckCircle2 size={14} /> Mark as Paid</>}
              </button>
              <button onClick={closePayModal} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payday Planner Config Modal ────────────────────────────────── */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-100">Payday Planner Settings</h3>
              <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-slate-200 transition-colors p-1">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Pay Frequency</label>
                <select
                  value={configForm.frequency}
                  onChange={e => setConfigForm(f => ({ ...f, frequency: e.target.value }))}
                  className="input-base"
                >
                  {FREQ_OPTIONS.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Budget per Period ($)</label>
                <input
                  type="number"
                  value={configForm.budget_per_period}
                  onChange={e => setConfigForm(f => ({ ...f, budget_per_period: e.target.value }))}
                  className="input-base"
                  placeholder="2000"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Next Payday (anchor date)</label>
                <input
                  type="date"
                  value={configForm.anchor_date}
                  onChange={e => setConfigForm(f => ({ ...f, anchor_date: e.target.value }))}
                  className="input-base"
                />
                <p className="text-xs text-slate-500 mt-1">Enter any upcoming payday. The planner uses it to calculate your pay cycle.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={savePaydayConfig}
                disabled={savingConfig}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {savingConfig ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Settings'}
              </button>
              <button onClick={() => setShowConfigModal(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
