import { useState, useEffect } from 'react'
import { Plus, Trash2, Calendar, Loader2, CheckCircle2, CreditCard, Pencil } from 'lucide-react'
import { supabase, type ScheduledPayment, type FinancialAccount } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const FREQUENCIES = ['Once', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annually']
const ASSET_TYPES = ['checking', 'savings', 'investment', 'retirement', 'cd']
// Only valid DB enum values — buy_now_pay_later is stored as credit_card+icon in DB
const DB_DEBT_TYPES = ['credit_card', 'mortgage', 'auto_loan', 'student_loan', 'personal_loan', 'heloc', 'other']

// ── Helpers ───────────────────────────────────────────────────
function parseMemo(memo: string | null): Record<string, unknown> {
  if (!memo) return {}
  try { return JSON.parse(memo) } catch { return { note: memo } }
}

function advanceDueDate(dateStr: string, freq: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  switch (freq.toLowerCase()) {
    case 'weekly':    d.setDate(d.getDate() + 7);   break
    case 'biweekly':  d.setDate(d.getDate() + 14);  break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'annually':  d.setFullYear(d.getFullYear() + 1); break
    case 'once':      return dateStr  // don't advance one-time
    default:          d.setMonth(d.getMonth() + 1)  // monthly
  }
  return d.toISOString().split('T')[0]
}

const today = () => new Date().toISOString().split('T')[0]
const isOverdue = (p: ScheduledPayment) => p.next_due_date < today() && p.status !== 'paid'
const isPaid = (p: ScheduledPayment) => !!parseMemo(p.memo).date_paid

export default function PaymentsPage() {
  const { user } = useAuthStore()
  const [payments, setPayments] = useState<ScheduledPayment[]>([])
  const [assetAccounts, setAssetAccounts] = useState<FinancialAccount[]>([])
  const [debtAccounts, setDebtAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)

  // Mark-as-paid flow
  const [markingPaid, setMarkingPaid] = useState<ScheduledPayment | null>(null)
  const [paidDate, setPaidDate] = useState(today())
  const [confirmingSave, setConfirmingSave] = useState(false)

  const [form, setForm] = useState({
    payee_account_id: '',   // id of the selected debt account
    payee_name: '',         // display name (derived from selected account)
    amount: '', next_due_date: '', from_account_id: '',
    frequency: 'Monthly', memo: '', auto_pay: false,
  })

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      supabase.from('scheduled_payments').select('*')
        .eq('owner_id', user.id).is('deleted_at', null).order('next_due_date'),
      supabase.from('financial_accounts').select('*')
        .eq('owner_id', user.id).is('deleted_at', null)
        .in('account_type', ASSET_TYPES).order('sort_order'),
      supabase.from('financial_accounts').select('*')
        .eq('owner_id', user.id).is('deleted_at', null)
        .in('account_type', DB_DEBT_TYPES).order('sort_order'),
    ]).then(([{ data: pmts }, { data: accs }, { data: debts }]) => {
      setPayments(pmts ?? [])
      setAssetAccounts(accs ?? [])
      setDebtAccounts(debts ?? [])
      setLoading(false)
    })
  }, [user])

  const activePayments = payments.filter(p => !isPaid(p))
  const paidPayments   = payments.filter(p => isPaid(p))
  const total = activePayments.reduce((s, p) => s + p.amount, 0)
  const sorted = [...activePayments].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
  const nextDue = sorted[0]

  // ── Add payment ───────────────────────────────────────────
  const add = async () => {
    if (editPayment) return update()
    if (!user || !form.payee_name || !form.amount) return
    setSaving(true)
    const { data, error } = await supabase.from('scheduled_payments').insert({
      owner_id: user.id,
      from_account_id: form.from_account_id || null,
      to_account_id: form.payee_account_id || null,  // link to the debt account
      payee_name: form.payee_name,
      amount: parseFloat(form.amount),
      next_due_date: form.next_due_date || today(),
      frequency: form.frequency.toLowerCase(),
      memo: form.memo ? JSON.stringify({ note: form.memo }) : null,
      auto_pay: form.auto_pay,
      status: 'active',
    }).select('*').single()
    if (!error && data) setPayments(p => [...p, data])
    setSaving(false)
    setShowAdd(false)
    setForm({ payee_account_id: '', payee_name: '', amount: '', next_due_date: '', from_account_id: '', frequency: 'Monthly', memo: '', auto_pay: false })
  }

  // ── Mark as paid ──────────────────────────────────────────
  const confirmMarkPaid = async () => {
    if (!markingPaid) return
    setConfirmingSave(true)

    const existingMeta = parseMemo(markingPaid.memo)
    const newMemo = JSON.stringify({ ...existingMeta, date_paid: paidDate })
    const nextDueDate = advanceDueDate(markingPaid.next_due_date, markingPaid.frequency)
    const isOnce = markingPaid.frequency.toLowerCase() === 'once'

    await supabase.from('scheduled_payments').update({
      memo: newMemo,
      status: isOnce ? 'paid' : 'active',   // one-time stays paid; recurring resets
      next_due_date: nextDueDate,
      anchor_date: paidDate,
    }).eq('id', markingPaid.id)

    // Deduct from source asset account
    if (markingPaid.from_account_id) {
      const src = assetAccounts.find(a => a.id === markingPaid.from_account_id)
      if (src) {
        const newBal = src.current_balance - markingPaid.amount
        await supabase.from('financial_accounts').update({ current_balance: newBal }).eq('id', src.id)
        setAssetAccounts(p => p.map(a => a.id === src.id ? { ...a, current_balance: newBal } : a))
      }
    }

    // Refresh payments
    const { data } = await supabase.from('scheduled_payments').select('*')
      .eq('owner_id', user!.id).is('deleted_at', null).order('next_due_date')
    if (data) setPayments(data)

    setConfirmingSave(false)
    setMarkingPaid(null)
  }

  const del = async (id: string) => {
    await supabase.from('scheduled_payments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setPayments(p => p.filter(x => x.id !== id))
  }

  // ── Edit payment ──────────────────────────────────────────
  const [editPayment, setEditPayment] = useState<ScheduledPayment | null>(null)

  const openEdit = (p: ScheduledPayment) => {
    const meta = parseMemo(p.memo)
    setForm({
      payee_account_id: p.to_account_id ?? '',
      payee_name: p.payee_name ?? '',
      amount: String(p.amount),
      next_due_date: p.next_due_date,
      from_account_id: p.from_account_id ?? '',
      frequency: p.frequency.charAt(0).toUpperCase() + p.frequency.slice(1),
      memo: (meta.note as string) ?? '',
      auto_pay: p.auto_pay,
    })
    setEditPayment(p)
    setShowAdd(true)
  }

  const update = async () => {
    if (!editPayment || !form.payee_name || !form.amount) return
    setSaving(true)
    const { data, error } = await supabase.from('scheduled_payments').update({
      from_account_id: form.from_account_id || null,
      to_account_id: form.payee_account_id || editPayment.to_account_id || null,
      payee_name: form.payee_name || editPayment.payee_name,
      amount: parseFloat(form.amount),
      next_due_date: form.next_due_date || today(),
      frequency: form.frequency.toLowerCase(),
      memo: form.memo ? JSON.stringify({ note: form.memo }) : null,
      auto_pay: form.auto_pay,
    }).eq('id', editPayment.id).select('*').single()
    if (!error && data) setPayments(p => p.map(x => x.id === data.id ? data : x))
    setSaving(false)
    setShowAdd(false)
    setEditPayment(null)
    setForm({ payee_account_id: '', payee_name: '', amount: '', next_due_date: '', from_account_id: '', frequency: 'Monthly', memo: '', auto_pay: false })
  }

  const sourceLabel = (p: ScheduledPayment) => {
    const acct = assetAccounts.find(a => a.id === p.from_account_id)
    return acct ? (acct.nickname ?? acct.institution_name) : null
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-500" size={32} />
    </div>
  )

  const PaymentRow = ({ p, dimmed = false }: { p: ScheduledPayment; dimmed?: boolean }) => {
    const meta = parseMemo(p.memo)
    const datePaid = meta.date_paid as string | undefined
    const overdue  = isOverdue(p) && !dimmed
    const src      = sourceLabel(p)

    return (
      <tr
        className={`border-b border-slate-800/50 transition-colors last:border-0 cursor-pointer ${dimmed ? 'opacity-50' : 'hover:bg-slate-800/30'}`}
        onClick={() => openEdit(p)}
      >
        <td className="px-5 py-3">
          <div className="font-medium text-slate-200">{p.payee_name ?? 'Payment'}</div>
          {src && <div className="text-xs text-brand-400 mt-0.5 flex items-center gap-1"><CreditCard size={10} /> {src}</div>}
        </td>
        <td className="px-5 py-3 font-semibold text-slate-200">{fmt(p.amount)}</td>

        {/* Scheduled date */}
        <td className="px-5 py-3">
          <div className={`text-sm font-medium ${overdue ? 'text-red-400' : 'text-slate-300'}`}>{p.next_due_date}</div>
          <div className="text-xs text-slate-500 capitalize">{p.frequency}</div>
        </td>

        {/* Date paid */}
        <td className="px-5 py-3">
          {datePaid
            ? <div className="text-sm text-emerald-400 font-medium">{datePaid as string}</div>
            : <span className="text-xs text-slate-600">—</span>}
        </td>

        {/* Auto-pay */}
        <td className="px-5 py-3">
          {p.auto_pay
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">On</span>
            : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/50">Off</span>}
        </td>

        {/* Status */}
        <td className="px-5 py-3">
          {datePaid
            ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Paid</span>
            : overdue
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">Overdue</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">Upcoming</span>}
        </td>

        {/* Actions */}
        <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            {!datePaid && (
              <button
                onClick={e => { e.stopPropagation(); setMarkingPaid(p); setPaidDate(today()) }}
                className="text-xs px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors flex items-center gap-1"
                title="Mark as Paid"
              >
                <CheckCircle2 size={12} /> Paid
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); openEdit(p) }} className="text-slate-600 hover:text-brand-400 transition-colors p-1" title="Edit">
              <Pencil size={13} />
            </button>
            <button onClick={() => del(p.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Scheduled Payments</h1>
          <p className="text-sm text-slate-400 mt-0.5">{activePayments.length} active · {paidPayments.length} paid this cycle</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Schedule Payment
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Monthly Obligations</div>
          <div className="text-2xl font-bold text-red-400">{fmt(total)}</div>
          <div className="text-xs text-slate-500 mt-1">{activePayments.length} active payments</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Next Due</div>
          <div className="text-lg font-bold text-slate-200 truncate">{nextDue?.payee_name ?? '—'}</div>
          <div className="text-xs text-slate-500 mt-1">{nextDue ? `${nextDue.next_due_date} · ${fmt(nextDue.amount)}` : 'No active payments'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Overdue</div>
          <div className={`text-2xl font-bold ${activePayments.filter(p => isOverdue(p)).length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {activePayments.filter(p => isOverdue(p)).length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {activePayments.filter(p => isOverdue(p)).length === 0 ? 'All current' : 'Need attention'}
          </div>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="card p-12 text-center">
          <Calendar size={40} className="text-slate-700 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-300">No payments scheduled</h3>
          <p className="text-sm text-slate-500 mt-1">Track recurring bills and loan payments</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 mx-auto flex items-center gap-2">
            <Plus size={14} /> Schedule Payment
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Payee / Source', 'Amount', 'Scheduled Date', 'Date Paid', 'Auto-Pay', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => <PaymentRow key={p.id} p={p} />)}
              {paidPayments.length > 0 && sorted.length > 0 && (
                <tr><td colSpan={7} className="px-5 py-2 text-xs text-slate-600 font-medium uppercase tracking-wide bg-slate-900/50">Paid this cycle</td></tr>
              )}
              {paidPayments.map(p => <PaymentRow key={p.id} p={p} dimmed />)}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Payment Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-5">{editPayment ? 'Edit Payment' : 'Schedule Payment'}</h3>
            <div className="space-y-4">
              {/* Payee — debt account lookup */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                  Payee (Debt Account) *
                </label>
                {debtAccounts.length === 0 ? (
                  <div className="input-base text-slate-500 text-xs">
                    No debt accounts found — add one in Accounts first
                  </div>
                ) : (
                  <select
                    value={form.payee_account_id}
                    onChange={e => {
                      const acct = debtAccounts.find(a => a.id === e.target.value)
                      setForm(p => ({
                        ...p,
                        payee_account_id: e.target.value,
                        payee_name: acct ? (acct.nickname ?? acct.institution_name) : '',
                      }))
                    }}
                    className="input-base"
                  >
                    <option value="">— Select debt account —</option>
                    {debtAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.nickname ?? a.institution_name}
                        {' · '}
                        {(a.icon && ['buy_now_pay_later','stocks','bonds','bitcoin','retirement_/_401k','other_investment'].includes(a.icon)
                          ? a.icon : a.account_type).replace(/_/g, ' ')}
                        {a.current_balance !== 0 ? ` · Balance: ${fmt(Math.abs(a.current_balance))}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Payment Source — asset account picker */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                  Payment Source
                  <span className="text-slate-600 font-normal ml-1">(asset account funds come from)</span>
                </label>
                <select value={form.from_account_id} onChange={e => setForm(p => ({ ...p, from_account_id: e.target.value }))} className="input-base">
                  <option value="">— Select account —</option>
                  {assetAccounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.nickname ?? a.institution_name} · {fmt(a.current_balance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Amount ($) *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="input-base" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Scheduled Date</label>
                  <input type="date" value={form.next_due_date} onChange={e => setForm(p => ({ ...p, next_due_date: e.target.value }))}
                    className="input-base" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Frequency</label>
                  <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))} className="input-base">
                    {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Memo (optional)</label>
                  <input value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))}
                    className="input-base" placeholder="Notes…" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.auto_pay} onChange={e => setForm(p => ({ ...p, auto_pay: e.target.checked }))} className="rounded" />
                <span className="text-sm text-slate-300">Auto-Pay enabled</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={add} disabled={saving || (!form.payee_account_id && !editPayment) || !form.amount} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editPayment ? 'Save Changes' : 'Save Payment'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditPayment(null) }} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark as Paid Confirmation ── */}
      {markingPaid && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Mark as Paid</h3>
                <p className="text-xs text-slate-400 mt-0.5">{markingPaid.payee_name} · {fmt(markingPaid.amount)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Date Paid</label>
                <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} className="input-base" />
              </div>

              {markingPaid.from_account_id && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  {(() => {
                    const src = assetAccounts.find(a => a.id === markingPaid.from_account_id)
                    if (!src) return null
                    return (
                      <>
                        <div className="text-xs text-slate-500 mb-1">Payment will be deducted from</div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-200">{src.nickname ?? src.institution_name}</span>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Current → After</div>
                            <div className="text-sm font-semibold">
                              <span className="text-slate-300">{fmt(src.current_balance)}</span>
                              <span className="text-slate-600 mx-1">→</span>
                              <span className={src.current_balance - markingPaid.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {fmt(src.current_balance - markingPaid.amount)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {markingPaid.frequency.toLowerCase() !== 'once' && (
                <div className="text-xs text-slate-500 bg-slate-800/40 rounded-lg px-3 py-2">
                  Next occurrence will be set to <span className="text-slate-300 font-medium">
                    {advanceDueDate(markingPaid.next_due_date, markingPaid.frequency)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={confirmMarkPaid} disabled={confirmingSave} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {confirmingSave ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><CheckCircle2 size={14} /> Confirm Paid</>}
              </button>
              <button onClick={() => setMarkingPaid(null)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
