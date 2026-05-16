import { useState, useEffect, useMemo } from 'react'
import {
  PiggyBank, Plus, Loader2, TrendingDown,
  Calendar, DollarSign, Sparkles, ChevronDown, ChevronUp, Info, Pencil, Trash2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { generateLoanSchedule, calcOpportunityCost } from '@/lib/debtCalculator'
import { AiChat } from '@/components/chat/AiChat'

interface RetirementLoan {
  id: string
  plan_name: string
  original_amount: number
  current_balance: number
  interest_rate: number
  origination_date: string
  first_payment_date: string
  payoff_date: string
  payment_amount: number
  payment_frequency: string
  total_interest_paid: number
  total_principal_paid: number
  payments_made: number
  payments_remaining: number | null
  assumed_growth_rate: number
  opportunity_cost: number | null
  status: string
  account_id: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtDec = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`

// ── Add / Edit loan modal ──────────────────────────────────────
function AddLoanModal({ onSave, onClose, accounts, initialData }: {
  onSave: (data: Partial<RetirementLoan> & { owner_id: string }) => Promise<void>
  onClose: () => void
  accounts: { id: string; institution_name: string; nickname: string | null }[]
  initialData?: RetirementLoan
}) {
  const { user } = useAuthStore()
  const isEdit = !!initialData
  const [form, setForm] = useState({
    plan_name: initialData?.plan_name ?? '401(k) Loan',
    account_id: initialData?.account_id ?? accounts[0]?.id ?? '',
    original_amount: initialData ? String(initialData.original_amount) : '',
    current_balance: initialData ? String(initialData.current_balance) : '',
    interest_rate: initialData ? String((initialData.interest_rate * 100).toFixed(2)) : '6.5',
    origination_date: initialData?.origination_date ?? new Date().toISOString().split('T')[0],
    first_payment_date: initialData?.first_payment_date ?? '',
    payoff_date: initialData?.payoff_date ?? '',
    loan_term_months: initialData?.loan_term_months ? String(initialData.loan_term_months) : '60',
    payment_frequency: initialData?.payment_frequency ?? 'biweekly',
    payment_amount: initialData ? String(initialData.payment_amount) : '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Auto-calc payment amount when amount + term change
  useEffect(() => {
    const principal = parseFloat(form.original_amount)
    const rate = parseFloat(form.interest_rate) / 100
    const n = parseInt(form.loan_term_months)
    const periods = form.payment_frequency === 'biweekly' ? Math.round(n * 26 / 12) : n
    const periodRate = rate / (form.payment_frequency === 'biweekly' ? 26 : 12)
    if (principal > 0 && periods > 0) {
      const pmt = periodRate > 0
        ? principal * (periodRate * Math.pow(1 + periodRate, periods)) / (Math.pow(1 + periodRate, periods) - 1)
        : principal / periods
      setForm(f => ({ ...f, payment_amount: pmt.toFixed(2) }))
    }
  }, [form.original_amount, form.interest_rate, form.loan_term_months, form.payment_frequency])

  // Auto-calc payoff date
  useEffect(() => {
    if (form.first_payment_date && form.loan_term_months) {
      const d = new Date(form.first_payment_date)
      d.setMonth(d.getMonth() + parseInt(form.loan_term_months))
      setForm(f => ({ ...f, payoff_date: d.toISOString().split('T')[0] }))
    }
  }, [form.first_payment_date, form.loan_term_months])

  const f = (key: keyof typeof form, value: string) => setForm(p => ({ ...p, [key]: value }))

  const handleSave = async () => {
    if (!user) return
    setFormError(null)

    const originalAmount = parseFloat(form.original_amount)
    const currentBalance = parseFloat(form.current_balance || form.original_amount)
    const rate = parseFloat(form.interest_rate) / 100
    const loanTermMonths = parseInt(form.loan_term_months)
    const paymentAmount = parseFloat(form.payment_amount)
    const firstPaymentDate = form.first_payment_date ? new Date(form.first_payment_date) : null

    if (!form.first_payment_date || !firstPaymentDate || Number.isNaN(firstPaymentDate.getTime())) {
      setFormError('First payment date is required.')
      return
    }
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
      setFormError('Original amount must be greater than 0.')
      return
    }
    if (!Number.isFinite(currentBalance) || currentBalance <= 0) {
      setFormError('Current balance must be greater than 0.')
      return
    }
    if (!Number.isFinite(loanTermMonths) || loanTermMonths <= 0) {
      setFormError('Loan term must be greater than 0 months.')
      return
    }
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      setFormError('Payment amount must be greater than 0.')
      return
    }
    if (!Number.isFinite(rate) || rate < 0) {
      setFormError('Interest rate must be 0 or greater.')
      return
    }

    setSaving(true)
    await onSave({
      owner_id: user.id,
      plan_name: form.plan_name,
      account_id: form.account_id,
      original_amount: originalAmount,
      current_balance: currentBalance,
      interest_rate: rate,
      origination_date: form.origination_date,
      first_payment_date: form.first_payment_date,
      payoff_date: form.payoff_date,
      loan_term_months: loanTermMonths,
      payment_frequency: form.payment_frequency as 'biweekly' | 'monthly',
      payment_amount: paymentAmount,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h3 className="text-base font-semibold text-slate-100">{isEdit ? 'Edit Loan' : 'Add 401(k) Loan'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Plan Name', key: 'plan_name', type: 'text' },
              { label: 'Original Amount', key: 'original_amount', type: 'number', placeholder: '15000' },
              { label: 'Current Balance', key: 'current_balance', type: 'number', placeholder: 'Same as original if new' },
              { label: 'Interest Rate (%)', key: 'interest_rate', type: 'number', placeholder: '6.5' },
              { label: 'Origination Date', key: 'origination_date', type: 'date' },
              { label: 'First Payment Date', key: 'first_payment_date', type: 'date' },
              { label: 'Loan Term (months)', key: 'loan_term_months', type: 'number', placeholder: '60' },
              { label: 'Payment Amount', key: 'payment_amount', type: 'number', placeholder: 'Auto-calculated' },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">{label}</label>
                <input type={type} value={form[key as keyof typeof form]} onChange={e => f(key as keyof typeof form, e.target.value)}
                  placeholder={placeholder} className="input-base text-sm" required={key === 'first_payment_date'} />
              </div>
            ))}
          </div>

          {formError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400">Payment Frequency</label>
            <select value={form.payment_frequency} onChange={e => f('payment_frequency', e.target.value)} className="input-base text-sm">
              <option value="biweekly">Biweekly (every 2 weeks)</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {accounts.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Link to Account</label>
              <select value={form.account_id} onChange={e => f('account_id', e.target.value)} className="input-base text-sm">
                {accounts.map(a => <option key={a.id} value={a.id}>{a.nickname ?? a.institution_name}</option>)}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.original_amount || !form.first_payment_date}
              className="btn-primary flex-1 justify-center"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : isEdit ? 'Save Changes' : 'Save Loan'}
            </button>
            <button onClick={onClose} className="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main 401K loan page ───────────────────────────────────────
export default function RetirementLoanPage() {
  const { user } = useAuthStore()
  const [loans, setLoans] = useState<RetirementLoan[]>([])
  const [retAccounts, setRetAccounts] = useState<{ id: string; institution_name: string; nickname: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingLoan, setEditingLoan] = useState<RetirementLoan | null>(null)
  const [deletingLoan, setDeletingLoan] = useState<RetirementLoan | null>(null)
  const [selectedLoan, setSelectedLoan] = useState<RetirementLoan | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showChat, setShowChat] = useState(false)

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('retirement_loans').select('*').eq('owner_id', user.id).is('deleted_at', null),
      supabase.from('financial_accounts').select('id, institution_name, nickname').eq('owner_id', user.id).in('account_type', ['retirement', '401k_loan']).is('deleted_at', null),
    ]).then(([{ data: l }, { data: a }]) => {
      setLoans(l ?? [])
      setRetAccounts(a ?? [])
      if (l && l.length > 0) setSelectedLoan(l[0])
      setLoading(false)
    })
  }, [user])

  const handleAddLoan = async (data: Partial<RetirementLoan> & { owner_id: string }) => {
    let accountId = data.account_id
    if (!accountId) {
      const { data: acct } = await supabase.from('financial_accounts').insert({
        owner_id: user!.id,
        account_type: '401k_loan',
        institution_name: data.plan_name ?? '401(k) Loan',
        current_balance: -(data.current_balance ?? 0),
        interest_rate: data.interest_rate,
        original_amount: data.original_amount,
      }).select('id').single()
      accountId = acct?.id
    }

    const { data: loan } = await supabase.from('retirement_loans').insert({
      ...data, account_id: accountId,
    }).select('*').single()

    if (loan) {
      // Generate and save amortization schedule
      const schedule = generateLoanSchedule(
        loan.original_amount,
        loan.interest_rate,
        loan.loan_term_months,
        new Date(loan.first_payment_date),
        loan.payment_frequency as 'monthly' | 'biweekly'
      )
      await supabase.from('loan_payment_schedule').insert(
        schedule.map(p => ({
          loan_id: loan.id,
          owner_id: user!.id,
          payment_number: p.paymentNumber,
          due_date: p.dueDate.toISOString().split('T')[0],
          payment_amount: p.paymentAmount,
          principal_amount: p.principalAmount,
          interest_amount: p.interestAmount,
          balance_after: p.balanceAfter,
        }))
      )

      setLoans(prev => [...prev, loan])
      setSelectedLoan(loan)
    }
  }

  const handleEditLoan = async (data: Partial<RetirementLoan> & { owner_id: string }) => {
    if (!editingLoan) return
    const { data: updated } = await supabase.from('retirement_loans')
      .update({
        plan_name: data.plan_name,
        current_balance: data.current_balance,
        interest_rate: data.interest_rate,
        payment_amount: data.payment_amount,
        payment_frequency: data.payment_frequency,
        payoff_date: data.payoff_date,
        first_payment_date: data.first_payment_date,
        origination_date: data.origination_date,
        loan_term_months: data.loan_term_months,
      })
      .eq('id', editingLoan.id)
      .select('*').single()
    if (updated) {
      setLoans(p => p.map(l => l.id === updated.id ? updated as RetirementLoan : l))
      if (selectedLoan?.id === updated.id) setSelectedLoan(updated as RetirementLoan)
    }
    setEditingLoan(null)
  }

  const handleDeleteLoan = async (loanToDelete: RetirementLoan) => {
    await supabase.from('retirement_loans')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', loanToDelete.id)
    // Also soft-delete the linked financial account
    if (loanToDelete.account_id) {
      await supabase.from('financial_accounts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', loanToDelete.account_id)
    }
    const remaining = loans.filter(l => l.id !== loanToDelete.id)
    setLoans(remaining)
    if (selectedLoan?.id === loanToDelete.id) setSelectedLoan(remaining[0] ?? null)
    setDeletingLoan(null)
  }

  const loan = selectedLoan
  const schedule = useMemo(() => {
    if (!loan) return []
    const startDate = loan.first_payment_date
      ? new Date(loan.first_payment_date)
      : new Date(loan.origination_date || Date.now())
    if (Number.isNaN(startDate.getTime())) return []

    return generateLoanSchedule(
      loan.current_balance,
      loan.interest_rate,
      loan.loan_term_months ?? 60,
      startDate,
      loan.payment_frequency as 'monthly' | 'biweekly'
    )
  }, [loan])

  const opportunityCost = loan
    ? calcOpportunityCost(loan.original_amount, loan.loan_term_months ?? 60, loan.assumed_growth_rate ?? 0.07)
    : 0

  const totalInterestOnLoan = schedule.reduce((s, p) => s + p.interestAmount, 0)
  const pctPaid = loan ? ((loan.total_principal_paid / loan.original_amount) * 100) : 0

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-500" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">401(k) Loan Tracker</h1>
          <p className="text-sm text-slate-400 mt-0.5">{loans.length} loan{loans.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowChat(v => !v)} className="btn-ghost border border-slate-700">
            <Sparkles size={14} className="text-brand-400" /> AI Analysis
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus size={14} /> Add Loan
          </button>
        </div>
      </div>

      {loans.length === 0 ? (
        <div className="card p-12 text-center space-y-3">
          <PiggyBank size={40} className="text-slate-700 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-300">No 401(k) loans tracked</h3>
          <p className="text-sm text-slate-500">Add your 401(k) loan to see your payoff schedule and opportunity cost analysis.</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary mx-auto">
            <Plus size={14} /> Add First Loan
          </button>
        </div>
      ) : loan ? (
        <>
          {/* Loan selector + edit/delete */}
          {loans.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {loans.map(l => (
                <button key={l.id} onClick={() => setSelectedLoan(l)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedLoan?.id === l.id ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                  {l.plan_name}
                </button>
              ))}
              {loan && (
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => setEditingLoan(loan)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-all">
                    <Pencil size={12} /> Edit
                  </button>
                  <button onClick={() => setDeletingLoan(loan)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Current Balance', value: fmt(loan.current_balance), color: '#EF4444', icon: DollarSign },
              { label: 'Interest Rate',   value: fmtPct(loan.interest_rate), color: '#F59E0B', icon: TrendingDown },
              { label: 'Payment',         value: `${fmt(loan.payment_amount)}/${loan.payment_frequency === 'biweekly' ? '2wk' : 'mo'}`, color: '#6366F1', icon: Calendar },
              { label: 'Payoff Date',     value: new Date(loan.payoff_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), color: '#10B981', icon: Calendar },
            ].map(s => (
              <div key={s.label} className="card p-4">
                <div className="text-xs text-slate-400 mb-1">{s.label}</div>
                <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Progress + interest breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">Payoff Progress</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Principal paid</span>
                    <span>{fmt(loan.total_principal_paid)} of {fmt(loan.original_amount)}</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${pctPaid}%` }} />
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{pctPaid.toFixed(1)}% paid off</div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {[
                    { label: 'Payments Made',      value: loan.payments_made },
                    { label: 'Payments Left',       value: loan.payments_remaining ?? (schedule.length - loan.payments_made) },
                    { label: 'Interest Paid (YTD)', value: fmtDec(loan.total_interest_paid) },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <div className="text-base font-bold text-slate-200">{s.value}</div>
                      <div className="text-xs text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Opportunity cost */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-200">Opportunity Cost</h3>
                <div className="group relative">
                  <Info size={13} className="text-slate-500 cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 w-56 bg-slate-800 border border-slate-600 rounded-lg p-2 text-xs text-slate-300 hidden group-hover:block z-10">
                    What your loan amount would have grown to if left invested at the assumed growth rate over the loan term.
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Loan amount borrowed</span>
                  <span className="text-sm font-semibold text-red-400">{fmt(loan.original_amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Total interest on loan</span>
                  <span className="text-sm font-semibold text-amber-400">{fmt(totalInterestOnLoan)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">If left invested ({fmtPct(loan.assumed_growth_rate ?? 0.07)}/yr)</span>
                  <span className="text-sm font-semibold text-emerald-400">{fmt(opportunityCost)}</span>
                </div>
                <div className="pt-2 border-t border-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-300">True cost of loan</span>
                    <span className="text-base font-bold text-red-400">
                      {fmt(opportunityCost - loan.original_amount + totalInterestOnLoan)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Interest paid + investment growth foregone</p>
                </div>
              </div>
            </div>
          </div>

          {/* Payment schedule */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-200">Payment Schedule</h3>
              <button onClick={() => setShowSchedule(v => !v)} className="btn-ghost text-xs py-1 px-2">
                {showSchedule ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Show all</>}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-700">
                    <th className="text-left py-2 pr-3">#</th>
                    <th className="text-left py-2 pr-3">Due Date</th>
                    <th className="text-right py-2 px-2">Payment</th>
                    <th className="text-right py-2 px-2">Principal</th>
                    <th className="text-right py-2 px-2">Interest</th>
                    <th className="text-right py-2">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(showSchedule ? schedule : schedule.slice(0, 12)).map(p => (
                    <tr key={p.paymentNumber} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="py-1.5 pr-3 text-slate-500">{p.paymentNumber}</td>
                      <td className="py-1.5 pr-3 text-slate-400">
                        {p.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </td>
                      <td className="py-1.5 px-2 text-right text-slate-200 font-medium">{fmtDec(p.paymentAmount)}</td>
                      <td className="py-1.5 px-2 text-right text-emerald-400">{fmtDec(p.principalAmount)}</td>
                      <td className="py-1.5 px-2 text-right text-red-400">{fmtDec(p.interestAmount)}</td>
                      <td className="py-1.5 text-right text-slate-300">{fmtDec(p.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!showSchedule && schedule.length > 12 && (
                <p className="text-xs text-slate-500 text-center mt-2">{schedule.length - 12} more payments — click Show all</p>
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* AI Chat */}
      {showChat && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-brand-400" />
              <span className="text-sm font-semibold text-slate-200">401(k) Loan AI Analysis</span>
            </div>
            <button onClick={() => setShowChat(false)} className="btn-ghost text-xs py-1 px-2">Hide</button>
          </div>
          <div className="h-[460px]">
            <AiChat initialContext="retirement" embedded onAction={() => {}} />
          </div>
        </div>
      )}

      {showAdd && (
        <AddLoanModal
          onSave={handleAddLoan}
          onClose={() => setShowAdd(false)}
          accounts={retAccounts}
        />
      )}

      {/* Edit modal */}
      {editingLoan && (
        <AddLoanModal
          initialData={editingLoan}
          onSave={handleEditLoan}
          onClose={() => setEditingLoan(null)}
          accounts={retAccounts}
        />
      )}

      {/* Delete confirmation */}
      {deletingLoan && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-red-500/15 text-red-400">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Delete Loan</h3>
                <p className="text-xs text-slate-400 mt-0.5">{deletingLoan.plan_name}</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              This will permanently remove the loan and its payment schedule. The linked financial account will also be deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDeleteLoan(deletingLoan)}
                className="flex-1 flex items-center justify-center gap-2 btn-primary bg-red-600 hover:bg-red-500 text-white"
              >
                <Trash2 size={14} /> Delete Loan
              </button>
              <button onClick={() => setDeletingLoan(null)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
