import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Calendar, Loader2, Building2 } from 'lucide-react'
import { supabase, type ScheduledPayment, type FinancialAccount } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const FREQUENCIES = ['Once', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annually']
const CATEGORIES = ['Credit Card', 'Mortgage', 'Auto Loan', 'Student Loan', 'Utility', 'Insurance', 'Subscription', 'Other']

const FUNDING_TYPES = ['checking', 'savings']
const PAYEE_TYPES = ['credit_card', 'mortgage', 'auto_loan', 'student_loan', 'personal_loan']

function accountLabel(a: FinancialAccount) {
  const name = a.nickname ?? a.institution_name
  return a.last_four ? `${name} ···${a.last_four}` : name
}

export default function PaymentsPage() {
  const { user } = useAuthStore()
  const [payments, setPayments] = useState<ScheduledPayment[]>([])
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    payee_name: '', amount: '', next_due_date: '', from_account_id: '',
    to_account_id: '', frequency: 'Monthly', memo: '', auto_pay: false,
  })

  const accountMap = useMemo(
    () => new Map(accounts.map(a => [a.id, a])),
    [accounts],
  )

  const fundingAccounts = useMemo(
    () => accounts.filter(a => FUNDING_TYPES.includes(a.account_type)),
    [accounts],
  )

  const payeeAccounts = useMemo(
    () => accounts.filter(a => PAYEE_TYPES.includes(a.account_type)),
    [accounts],
  )

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      supabase.from('scheduled_payments').select('*')
        .eq('owner_id', user.id).is('deleted_at', null).order('next_due_date'),
      supabase.from('financial_accounts').select('*')
        .eq('owner_id', user.id).is('deleted_at', null).order('sort_order'),
    ]).then(([{ data: pmts }, { data: accs }]) => {
      setPayments(pmts ?? [])
      setAccounts(accs ?? [])
      setLoading(false)
    })
  }, [user])

  const total = payments.reduce((s, p) => s + p.amount, 0)
  const nextDue = payments.sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0]

  const resetForm = () => setForm({
    payee_name: '', amount: '', next_due_date: '', from_account_id: '',
    to_account_id: '', frequency: 'Monthly', memo: '', auto_pay: false,
  })

  const add = async () => {
    if (!user || !form.payee_name || !form.amount) return
    setSaving(true)
    const { data, error } = await supabase.from('scheduled_payments').insert({
      owner_id: user.id,
      from_account_id: form.from_account_id || user.id,
      to_account_id: form.to_account_id || null,
      payee_name: form.payee_name,
      amount: parseFloat(form.amount),
      next_due_date: form.next_due_date || new Date().toISOString().split('T')[0],
      frequency: form.frequency.toLowerCase(),
      memo: form.memo || null,
      auto_pay: form.auto_pay,
      status: 'active',
    }).select('*').single()
    if (!error && data) setPayments(p => [...p, data])
    setSaving(false)
    setShowAdd(false)
    resetForm()
  }

  const del = async (id: string) => {
    await supabase.from('scheduled_payments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setPayments(p => p.filter(x => x.id !== id))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-500" size={32} />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Scheduled Payments</h1>
          <p className="text-sm text-slate-400 mt-0.5">{payments.length} payment{payments.length !== 1 ? 's' : ''} scheduled</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Schedule Payment
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Monthly Obligations</div>
          <div className="text-2xl font-bold text-red-400">{fmt(total)}</div>
          <div className="text-xs text-slate-500 mt-1">{payments.length} active payments</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Next Due</div>
          <div className="text-lg font-bold text-slate-200 truncate">{nextDue?.payee_name ?? '—'}</div>
          <div className="text-xs text-slate-500 mt-1">{nextDue ? `${nextDue.next_due_date} · ${fmt(nextDue.amount)}` : 'No payments'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Auto-Pay Enabled</div>
          <div className="text-2xl font-bold text-emerald-400">{payments.filter(p => p.auto_pay).length}</div>
          <div className="text-xs text-slate-500 mt-1">of {payments.length} payments</div>
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
                {['Payee', 'Amount', 'Pay From', 'Due Date', 'Frequency', 'Auto-Pay', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const fromAcct = accountMap.get(p.from_account_id)
                return (
                  <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors last:border-0">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-200">{p.payee_name ?? 'Payment'}</div>
                      {p.memo && <div className="text-xs text-slate-500">{p.memo}</div>}
                    </td>
                    <td className="px-5 py-3 font-semibold text-slate-200">{fmt(p.amount)}</td>
                    <td className="px-5 py-3">
                      {fromAcct ? (
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: fromAcct.color }} />
                          <div>
                            <div className="text-sm text-slate-200">{fromAcct.nickname ?? fromAcct.institution_name}</div>
                            {fromAcct.last_four && <div className="text-xs text-slate-500">···{fromAcct.last_four}</div>}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">Not set</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-300">{p.next_due_date}</td>
                    <td className="px-5 py-3 text-slate-300 capitalize">{p.frequency}</td>
                    <td className="px-5 py-3">
                      {p.auto_pay
                        ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">On</span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/50">Off</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${p.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-amber-500/15 text-amber-400 border-amber-500/25'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => del(p.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-5">Schedule Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payee *</label>
                <input value={form.payee_name} onChange={e => setForm(p => ({ ...p, payee_name: e.target.value }))}
                  className="input-base" placeholder="Chase Sapphire, Mortgage…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Amount ($) *</label>
                  <input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="input-base" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Due Date</label>
                  <input type="date" value={form.next_due_date} onChange={e => setForm(p => ({ ...p, next_due_date: e.target.value }))}
                    className="input-base" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                  <span className="flex items-center gap-1.5"><Building2 size={12} /> Pay From (Funding Account)</span>
                </label>
                {fundingAccounts.length > 0 ? (
                  <select
                    value={form.from_account_id}
                    onChange={e => setForm(p => ({ ...p, from_account_id: e.target.value }))}
                    className="input-base"
                  >
                    <option value="">Select account…</option>
                    {fundingAccounts.map(a => (
                      <option key={a.id} value={a.id}>{accountLabel(a)} — {fmt(a.current_balance)}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-500 italic py-2">
                    No checking or savings accounts yet. Add one in Accounts to link it here.
                  </p>
                )}
              </div>

              {payeeAccounts.length > 0 && (
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Pay To (Destination Account, optional)</label>
                  <select
                    value={form.to_account_id}
                    onChange={e => setForm(p => ({ ...p, to_account_id: e.target.value }))}
                    className="input-base"
                  >
                    <option value="">None — external payee</option>
                    {payeeAccounts.map(a => (
                      <option key={a.id} value={a.id}>{accountLabel(a)}</option>
                    ))}
                  </select>
                </div>
              )}

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
                <input type="checkbox" checked={form.auto_pay} onChange={e => setForm(p => ({ ...p, auto_pay: e.target.checked }))}
                  className="rounded" />
                <span className="text-sm text-slate-300">Auto-Pay enabled</span>
              </label>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={add} disabled={saving || !form.payee_name || !form.amount} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Payment'}
              </button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
