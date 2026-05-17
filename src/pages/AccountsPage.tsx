import { useState, useEffect, useRef } from 'react'
import {
  Plus, Trash2, Pencil, CreditCard, Loader2, ScanLine, Upload,
  DollarSign, AlertCircle, Check,
} from 'lucide-react'
import { supabase, type FinancialAccount, type ScheduledPayment } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { recognizeImage } from '@/lib/imageRecognition'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
const fmtShort = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// ── Account type → DB enum mapping ─────────────────────────────
const ACCOUNT_TYPE_MAP: Record<string, string> = {
  'Checking': 'checking',
  'Savings': 'savings',
  'Credit Card': 'credit_card',
  'Mortgage': 'mortgage',
  'Auto Loan': 'loan',
  'Student Loan': 'student_loan',
  'Investment': 'investment',
  'Retirement': 'retirement',
  'CD': 'cd',
  'BNPL': 'bnpl',
  'Personal Loan': 'personal_loan',
  'Other': 'other',
}
const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_MAP)
const DB_TO_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(ACCOUNT_TYPE_MAP).map(([label, db]) => [db, label])
)

const DEBT_TYPES = ['credit_card', 'mortgage', 'loan', 'student_loan', 'personal_loan', 'bnpl', '401k_loan', 'heloc']
const ASSET_TYPES = ['checking', 'savings', 'cd', 'investment', 'retirement']
const PAYMENT_INTERVALS = ['Monthly', 'Biweekly', 'Weekly', 'Quarterly', 'Annually']

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function categoryBadge(t: string): { label: string; cls: string } {
  if (['loan', 'mortgage', 'student_loan', 'personal_loan', 'heloc', '401k_loan'].includes(t))
    return { label: 'Loan', cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' }
  if (['credit_card', 'bnpl'].includes(t))
    return { label: 'Debt', cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' }
  if (['investment', 'retirement'].includes(t))
    return { label: 'Investment', cls: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25' }
  if (['checking', 'savings', 'cd'].includes(t))
    return { label: 'Asset', cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' }
  return { label: 'Other', cls: 'bg-slate-700/50 text-slate-400 border border-slate-600/50' }
}

function typeBadge(t: string) {
  const label = DB_TO_LABEL[t] ?? t.replace(/_/g, ' ')
  if (['credit_card', 'bnpl'].includes(t))
    return { label, cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/25' }
  if (['loan', 'mortgage', 'student_loan', 'personal_loan', 'heloc', '401k_loan'].includes(t))
    return { label, cls: 'bg-red-500/15 text-red-400 border border-red-500/25' }
  if (['checking', 'savings', 'cd'].includes(t))
    return { label, cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' }
  if (['investment', 'retirement'].includes(t))
    return { label, cls: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25' }
  return { label, cls: 'bg-slate-700/50 text-slate-400 border border-slate-600/50' }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

interface LastPaymentInfo {
  date: string
  amount: number
}

const BLANK_FORM = {
  nickname: '', account_type: 'Checking', institution_name: '',
  last_four: '', current_balance: '', interest_rate: '', credit_limit: '',
  rewards_balance: '', color: COLORS[0],
  payment_amount: '', payment_interval: 'Monthly', next_due_date: '',
  payments_remaining: '', auto_pay: false,
}

export default function AccountsPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [payments, setPayments] = useState<Record<string, ScheduledPayment>>({})
  const [lastPayments, setLastPayments] = useState<Record<string, LastPaymentInfo>>({})
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [tab, setTab] = useState('All')
  const [form, setForm] = useState(BLANK_FORM)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Make Payment modal state
  const [payingAccount, setPayingAccount] = useState<FinancialAccount | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payProcessing, setPayProcessing] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  // ── Load accounts, scheduled payments, and last payment info ──
  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      supabase.from('financial_accounts').select('*')
        .eq('owner_id', user.id).is('deleted_at', null).order('sort_order'),
      supabase.from('scheduled_payments').select('*')
        .eq('owner_id', user.id).is('deleted_at', null),
      supabase.from('transactions').select('account_id, amount, transaction_date')
        .eq('owner_id', user.id)
        .eq('transaction_type', 'payment')
        .order('transaction_date', { ascending: false }),
    ]).then(([acctRes, pmtRes, txnRes]) => {
      setAccounts(acctRes.data ?? [])

      const pmtMap: Record<string, ScheduledPayment> = {}
      for (const p of pmtRes.data ?? []) {
        if (p.from_account_id) pmtMap[p.from_account_id] = p
      }
      setPayments(pmtMap)

      const lastMap: Record<string, LastPaymentInfo> = {}
      for (const t of txnRes.data ?? []) {
        if (t.account_id && !lastMap[t.account_id]) {
          lastMap[t.account_id] = { date: t.transaction_date, amount: Math.abs(t.amount) }
        }
      }
      setLastPayments(lastMap)

      setLoading(false)
    })
  }, [user])

  // ── AI scan ────────────────────────────────────────────────────
  const scanImage = async (file: File) => {
    setScanning(true)
    setScanError(null)
    try {
      const base64 = await fileToBase64(file)
      const result = await recognizeImage(base64, file.type)
      const f = result.fields as Record<string, unknown>
      const isBank = result.detectedType === 'bank_statement'
      const isCreditCard = result.detectedType === 'credit_card_statement'
      setForm({
        ...BLANK_FORM,
        institution_name: String(f.institution ?? ''),
        account_type: isBank
          ? (String(f.account_type ?? 'checking').charAt(0).toUpperCase() + String(f.account_type ?? 'checking').slice(1))
          : isCreditCard ? 'Credit Card' : 'Checking',
        last_four: String(f.last_four ?? ''),
        current_balance: f.balance != null ? String(f.balance) : '',
        interest_rate: f.apr != null ? String(f.apr) : '',
        credit_limit: f.credit_limit != null ? String(f.credit_limit) : '',
        rewards_balance: f.rewards_points != null ? String(f.rewards_points) : '',
        color: isCreditCard ? '#f59e0b' : isBank ? '#10b981' : COLORS[0],
      })
      setShowAdd(true)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed — try again or enter details manually')
    }
    setScanning(false)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) scanImage(file)
    e.target.value = ''
  }

  const handleModalPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.stopPropagation()
        const file = item.getAsFile()
        if (file) scanImage(file)
        break
      }
    }
  }

  // ── Derived data ───────────────────────────────────────────────
  const isDebtType = (t: string) => DEBT_TYPES.includes(ACCOUNT_TYPE_MAP[t] ?? t)
  const formTypeKey = ACCOUNT_TYPE_MAP[form.account_type] ?? form.account_type.toLowerCase().replace(/ /g, '_')
  const showDebtFields = isDebtType(form.account_type) || DEBT_TYPES.includes(formTypeKey)

  const tabs = ['All', 'Assets', 'Debt', 'Investments']
  const filtered = accounts.filter(a => {
    if (tab === 'Assets') return ASSET_TYPES.includes(a.account_type)
    if (tab === 'Debt') return DEBT_TYPES.includes(a.account_type)
    if (tab === 'Investments') return ['investment', 'retirement'].includes(a.account_type)
    return true
  })

  const totalAssets = accounts.filter(a => ASSET_TYPES.includes(a.account_type)).reduce((s, a) => s + a.current_balance, 0)
  const totalDebt = accounts.filter(a => DEBT_TYPES.includes(a.account_type)).reduce((s, a) => s + Math.abs(a.current_balance), 0)
  const netWorth = totalAssets - totalDebt

  // Upcoming payments due
  const upcomingPayments = accounts
    .filter(a => DEBT_TYPES.includes(a.account_type) && payments[a.id])
    .map(a => ({ account: a, payment: payments[a.id] }))
    .filter(p => p.payment.next_due_date)
    .sort((a, b) => a.payment.next_due_date.localeCompare(b.payment.next_due_date))

  const totalDue = upcomingPayments.reduce((s, p) => s + p.payment.amount, 0)

  // ── Open edit ──────────────────────────────────────────────────
  const openEdit = (a: FinancialAccount) => {
    const pmt = payments[a.id]
    setEditingId(a.id)
    setForm({
      nickname: a.nickname ?? '',
      account_type: DB_TO_LABEL[a.account_type] ?? a.account_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      institution_name: a.institution_name,
      last_four: a.last_four ?? '',
      current_balance: String(Math.abs(a.current_balance)),
      interest_rate: a.interest_rate != null ? String(a.interest_rate) : '',
      credit_limit: a.credit_limit != null ? String(a.credit_limit) : '',
      rewards_balance: a.rewards_balance > 0 ? String(a.rewards_balance) : '',
      color: a.color,
      payment_amount: pmt ? String(pmt.amount) : '',
      payment_interval: pmt ? pmt.frequency.charAt(0).toUpperCase() + pmt.frequency.slice(1) : 'Monthly',
      next_due_date: pmt?.next_due_date ?? '',
      payments_remaining: pmt?.memo?.match(/payments_remaining:(\d+)/)?.[1] ?? '',
      auto_pay: pmt?.auto_pay ?? false,
    })
    setScanError(null)
    setSaveError(null)
    setShowAdd(true)
  }

  // ── Save account + scheduled payment ───────────────────────────
  const save = async () => {
    if (!user || !form.institution_name) return
    setSaving(true)
    setSaveError(null)
    const typeKey = ACCOUNT_TYPE_MAP[form.account_type] ?? form.account_type.toLowerCase().replace(/ /g, '_')
    const isDebt = DEBT_TYPES.includes(typeKey)
    const balanceRaw = parseFloat(form.current_balance) || 0
    const balance = isDebt ? -Math.abs(balanceRaw) : Math.abs(balanceRaw)

    const payload = {
      account_type: typeKey,
      institution_name: form.institution_name,
      nickname: form.nickname || null,
      last_four: form.last_four || null,
      current_balance: balance,
      interest_rate: parseFloat(form.interest_rate) || null,
      credit_limit: parseFloat(form.credit_limit) || null,
      rewards_balance: parseFloat(form.rewards_balance) || 0,
      color: form.color,
    }

    let error
    let accountId = editingId
    if (editingId) {
      const res = await supabase.from('financial_accounts').update(payload).eq('id', editingId).select('*').single()
      error = res.error
      if (!error && res.data) setAccounts(p => p.map(a => a.id === editingId ? res.data : a))
    } else {
      const res = await supabase.from('financial_accounts').insert({
        owner_id: user.id, ...payload,
        status: 'active', sort_order: accounts.length,
        rewards_unit: 'points', rewards_cpp: 0.01, icon: '🏦',
      }).select('*').single()
      error = res.error
      if (!error && res.data) {
        setAccounts(p => [...p, res.data])
        accountId = res.data.id
      }
    }

    if (error) {
      setSaving(false)
      setSaveError(error.message)
      return
    }

    // Save scheduled payment for debt accounts
    if (isDebt && accountId && form.payment_amount) {
      const pmtPayload = {
        owner_id: user.id,
        from_account_id: accountId,
        payee_name: form.nickname || form.institution_name,
        amount: parseFloat(form.payment_amount) || 0,
        frequency: form.payment_interval.toLowerCase(),
        next_due_date: form.next_due_date || new Date().toISOString().split('T')[0],
        auto_pay: form.auto_pay,
        status: 'active' as const,
        memo: form.payments_remaining ? `payments_remaining:${form.payments_remaining}` : null,
      }

      const existingPmt = payments[accountId]
      if (existingPmt) {
        const { data: pmtData } = await supabase.from('scheduled_payments')
          .update(pmtPayload).eq('id', existingPmt.id).select('*').single()
        if (pmtData) setPayments(p => ({ ...p, [accountId!]: pmtData }))
      } else {
        const { data: pmtData } = await supabase.from('scheduled_payments')
          .insert(pmtPayload).select('*').single()
        if (pmtData) setPayments(p => ({ ...p, [accountId!]: pmtData }))
      }
    }

    setSaving(false)
    setShowAdd(false)
    setEditingId(null)
    setForm(BLANK_FORM)
  }

  // ── Make Payment ───────────────────────────────────────────────
  const openMakePayment = (a: FinancialAccount) => {
    const pmt = payments[a.id]
    setPayingAccount(a)
    setPayAmount(pmt ? String(pmt.amount) : '')
    setPayError(null)
  }

  const makePayment = async () => {
    if (!user || !payingAccount || !payAmount) return
    setPayProcessing(true)
    setPayError(null)
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) {
      setPayError('Enter a valid payment amount')
      setPayProcessing(false)
      return
    }

    // Record the transaction
    const { error: txnError } = await supabase.from('transactions').insert({
      owner_id: user.id,
      account_id: payingAccount.id,
      transaction_type: 'payment',
      amount: -amount,
      currency: 'USD',
      description: `Payment to ${payingAccount.nickname ?? payingAccount.institution_name}`,
      category: 'debt_payment',
      transaction_date: new Date().toISOString().split('T')[0],
      is_pending: false,
      is_recurring: false,
      tags: [],
    })

    if (txnError) {
      setPayError(txnError.message)
      setPayProcessing(false)
      return
    }

    // Update account balance (reduce debt)
    const newBalance = payingAccount.current_balance + amount
    const { data: updatedAcct, error: acctError } = await supabase.from('financial_accounts')
      .update({ current_balance: newBalance })
      .eq('id', payingAccount.id).select('*').single()

    if (acctError) {
      setPayError(acctError.message)
      setPayProcessing(false)
      return
    }

    if (updatedAcct) {
      setAccounts(p => p.map(a => a.id === payingAccount.id ? updatedAcct : a))
    }

    // Update last payment info locally
    setLastPayments(p => ({
      ...p,
      [payingAccount.id]: { date: new Date().toISOString().split('T')[0], amount },
    }))

    // Advance next due date on the scheduled payment
    const pmt = payments[payingAccount.id]
    if (pmt) {
      const nextDate = new Date(pmt.next_due_date)
      const freq = pmt.frequency
      if (freq === 'weekly') nextDate.setDate(nextDate.getDate() + 7)
      else if (freq === 'biweekly') nextDate.setDate(nextDate.getDate() + 14)
      else if (freq === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3)
      else if (freq === 'annually') nextDate.setFullYear(nextDate.getFullYear() + 1)
      else nextDate.setMonth(nextDate.getMonth() + 1)

      const remaining = pmt.memo?.match(/payments_remaining:(\d+)/)
      const newRemaining = remaining ? Math.max(0, parseInt(remaining[1]) - 1) : null

      const { data: updatedPmt } = await supabase.from('scheduled_payments')
        .update({
          next_due_date: nextDate.toISOString().split('T')[0],
          memo: newRemaining !== null ? `payments_remaining:${newRemaining}` : pmt.memo,
        })
        .eq('id', pmt.id).select('*').single()

      if (updatedPmt) setPayments(p => ({ ...p, [payingAccount.id]: updatedPmt }))
    }

    setPayProcessing(false)
    setPayingAccount(null)
    setPayAmount('')
  }

  // ── Delete ─────────────────────────────────────────────────────
  const del = async (id: string) => {
    await supabase.from('financial_accounts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setAccounts(p => p.filter(a => a.id !== id))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-500" size={32} />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Accounts</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Net Worth: <span className={`font-semibold ${netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(netWorth)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            className="btn-ghost flex items-center gap-2 border border-slate-700"
          >
            {scanning
              ? <><Loader2 size={15} className="animate-spin text-brand-400" /> Scanning…</>
              : <><ScanLine size={15} className="text-brand-400" /> Import Snip</>}
          </button>
          <button onClick={() => { setForm(BLANK_FORM); setEditingId(null); setScanError(null); setSaveError(null); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Account
          </button>
        </div>
      </div>

      {scanError && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
          <span className="font-medium">Scan error:</span> {scanError}
        </div>
      )}

      {/* ── Summary cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Assets', value: fmt(totalAssets), color: 'text-emerald-400' },
          { label: 'Total Debt', value: fmt(totalDebt), color: 'text-red-400' },
          { label: 'Net Worth', value: fmt(netWorth), color: netWorth >= 0 ? 'text-brand-400' : 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Payments Due Banner ─────────────────────────────────── */}
      {upcomingPayments.length > 0 && (
        <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="text-amber-400" />
            <div>
              <div className="text-sm font-semibold text-slate-200">Payments Due Before Payday</div>
              <div className="text-xs text-slate-400">
                Next payment: {upcomingPayments[0].payment.next_due_date} &middot; {fmt(upcomingPayments[0].payment.amount)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {upcomingPayments.slice(0, 4).map(p => (
              <span key={p.account.id} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                {fmtShort(p.payment.amount)}
              </span>
            ))}
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/25">
              {fmt(totalDue)} total
            </span>
          </div>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Account table ──────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <CreditCard size={40} className="text-slate-700 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-300">No accounts yet</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Add manually or import from a screenshot</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => fileInputRef.current?.click()} disabled={scanning}
              className="btn-ghost flex items-center gap-2 border border-slate-700">
              <ScanLine size={15} className="text-brand-400" /> Import Snip
            </button>
            <button onClick={() => { setForm(BLANK_FORM); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
              <Plus size={14} /> Add Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Account', 'Category', 'Type', 'Balance', 'Rate', 'Next Payment', 'Last Payment', 'Payments Left', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const pmt = payments[a.id]
                const lastPmt = lastPayments[a.id]
                const cat = categoryBadge(a.account_type)
                const typ = typeBadge(a.account_type)
                const isDebt = DEBT_TYPES.includes(a.account_type)
                const remaining = pmt?.memo?.match(/payments_remaining:(\d+)/)?.[1]

                return (
                  <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors last:border-0">
                    {/* Account */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                        <div>
                          <div className="font-medium text-slate-200">{a.nickname ?? a.institution_name}</div>
                          <div className="text-xs text-slate-500">{a.institution_name}{a.last_four ? ` ···${a.last_four}` : ''}</div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.cls}`}>{cat.label}</span>
                    </td>

                    {/* Type */}
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typ.cls}`}>{typ.label}</span>
                    </td>

                    {/* Balance */}
                    <td className="px-5 py-3">
                      <div className={`font-semibold ${a.current_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(Math.abs(a.current_balance))}
                      </div>
                      {a.credit_limit ? <div className="text-xs text-slate-500">Limit: {fmt(a.credit_limit)}</div> : null}
                    </td>

                    {/* Rate */}
                    <td className="px-5 py-3 text-slate-300">{a.interest_rate ? `${a.interest_rate}%` : '—'}</td>

                    {/* Next Payment */}
                    <td className="px-5 py-3">
                      {pmt ? (
                        <div>
                          <div className="text-slate-200 text-xs font-medium">{pmt.next_due_date}</div>
                          <div className="text-xs text-slate-400">{fmt(pmt.amount)}</div>
                          {isDebt && (
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                onClick={() => openMakePayment(a)}
                                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                              >
                                Make Payment
                              </button>
                              <span className="text-slate-700">|</span>
                              <button
                                onClick={() => openMakePayment(a)}
                                className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
                              >
                                Pay Now
                              </button>
                            </div>
                          )}
                        </div>
                      ) : isDebt ? (
                        <button
                          onClick={() => openEdit(a)}
                          className="text-xs text-slate-500 hover:text-brand-400 transition-colors"
                        >
                          + Set up payment
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Last Payment */}
                    <td className="px-5 py-3">
                      {lastPmt ? (
                        <div>
                          <div className="text-xs text-slate-300">{lastPmt.date}</div>
                          <div className="text-xs text-slate-500">{fmt(lastPmt.amount)}</div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Payments Left */}
                    <td className="px-5 py-3">
                      {remaining ? (
                        <span className="text-xs font-medium text-slate-300">
                          {remaining === '0' ? (
                            <span className="flex items-center gap-1 text-emerald-400"><Check size={12} /> Paid off</span>
                          ) : (
                            `${remaining} remaining`
                          )}
                        </span>
                      ) : pmt ? (
                        <span className="text-xs text-slate-500">Ongoing</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {isDebt && (
                          <button onClick={() => openMakePayment(a)}
                            className="text-slate-600 hover:text-emerald-400 transition-colors p-1"
                            title="Make Payment">
                            <DollarSign size={17} />
                          </button>
                        )}
                        <button onClick={() => openEdit(a)} className="text-slate-600 hover:text-brand-400 transition-colors p-1">
                          <Pencil size={17} />
                        </button>
                        <button onClick={() => del(a.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Make Payment Modal ─────────────────────────────────── */}
      {payingAccount && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-1">Make Payment</h3>
            <p className="text-sm text-slate-400 mb-5">
              {payingAccount.nickname ?? payingAccount.institution_name}
              {payingAccount.last_four ? ` ···${payingAccount.last_four}` : ''}
            </p>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span className="font-medium">Current Balance</span>
                  <span className="text-red-400 font-semibold">{fmt(Math.abs(payingAccount.current_balance))}</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payment Amount ($) *</label>
                <input
                  type="number" value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="input-base text-lg font-semibold"
                  placeholder="0.00" autoFocus
                />
              </div>
              {payments[payingAccount.id] && (
                <div className="text-xs text-slate-500">
                  Scheduled: {fmt(payments[payingAccount.id].amount)} {payments[payingAccount.id].frequency}
                </div>
              )}
            </div>

            {payError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-3">
                {payError}
              </p>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={makePayment}
                disabled={payProcessing || !payAmount}
                className="btn-primary flex-1 justify-center flex items-center gap-2"
              >
                {payProcessing
                  ? <><Loader2 size={14} className="animate-spin" /> Processing…</>
                  : <><DollarSign size={14} /> Pay {payAmount ? fmt(parseFloat(payAmount) || 0) : ''}</>}
              </button>
              <button onClick={() => { setPayingAccount(null); setPayError(null) }} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit Account Modal ──────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">

            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {editingId ? 'Edit Account' : form.institution_name ? 'Review Scanned Account' : 'Add Account'}
            </h3>

            {/* Paste / drop zone */}
            {!editingId && <div
              className={`mb-5 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all group
                ${scanning
                  ? 'border-brand-500/60 bg-brand-500/5'
                  : 'border-slate-700 hover:border-brand-500/50 hover:bg-brand-500/5'}`}
              onClick={() => !scanning && fileInputRef.current?.click()}
              onPaste={handleModalPaste}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && !scanning && fileInputRef.current?.click()}
            >
              {scanning ? (
                <div className="flex items-center justify-center gap-2 text-brand-400">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm font-medium">Scanning with AI…</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2 text-slate-400 group-hover:text-brand-400 transition-colors mb-1">
                    <ScanLine size={18} />
                    <span className="text-sm font-medium">Paste or click to import a screenshot</span>
                  </div>
                  <p className="text-xs text-slate-600">Bank statement · Credit card statement · Any account summary</p>
                  <p className="text-xs text-slate-700 mt-1">Ctrl+V / ⌘+V while focused here · or click to browse</p>
                </>
              )}
            </div>}

            {scanError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                {scanError}
              </p>
            )}

            {/* Form fields */}
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Institution Name *</label>
                <input value={form.institution_name} onChange={e => setForm(p => ({ ...p, institution_name: e.target.value }))}
                  className="input-base" placeholder="Chase, Ally, Wells Fargo…" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Nickname (optional)</label>
                <input value={form.nickname} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
                  className="input-base" placeholder="My Checking" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Account Type</label>
                <select value={form.account_type} onChange={e => setForm(p => ({ ...p, account_type: e.target.value }))} className="input-base">
                  {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Balance ($)</label>
                  <input type="number" value={form.current_balance} onChange={e => setForm(p => ({ ...p, current_balance: e.target.value }))}
                    className="input-base" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">APR / APY (%)</label>
                  <input type="number" value={form.interest_rate} onChange={e => setForm(p => ({ ...p, interest_rate: e.target.value }))}
                    className="input-base" placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Last 4 Digits</label>
                  <input maxLength={4} value={form.last_four} onChange={e => setForm(p => ({ ...p, last_four: e.target.value }))}
                    className="input-base" placeholder="0000" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Credit Limit ($)</label>
                  <input type="number" value={form.credit_limit} onChange={e => setForm(p => ({ ...p, credit_limit: e.target.value }))}
                    className="input-base" placeholder="Optional" />
                </div>
              </div>

              {/* ── Debt Payment Details (conditional) ── */}
              {showDebtFields && (
                <>
                  <div className="pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-brand-400 mb-3">Debt Payment Details</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payment Amount ($)</label>
                      <input type="number" value={form.payment_amount} onChange={e => setForm(p => ({ ...p, payment_amount: e.target.value }))}
                        className="input-base" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payment Interval</label>
                      <select value={form.payment_interval} onChange={e => setForm(p => ({ ...p, payment_interval: e.target.value }))} className="input-base">
                        {PAYMENT_INTERVALS.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Next Due Date</label>
                      <input type="date" value={form.next_due_date} onChange={e => setForm(p => ({ ...p, next_due_date: e.target.value }))}
                        className="input-base" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payments Remaining</label>
                      <input type="number" value={form.payments_remaining} onChange={e => setForm(p => ({ ...p, payments_remaining: e.target.value }))}
                        className="input-base" placeholder="Optional" />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={form.auto_pay} onChange={e => setForm(p => ({ ...p, auto_pay: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-brand-500 focus:ring-brand-500" />
                    <div>
                      <div className="text-sm font-medium text-slate-200">Auto-Pay Enabled</div>
                      <div className="text-xs text-slate-500">Payments are automatically deducted on the due date</div>
                    </div>
                  </label>
                </>
              )}

              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                      style={{ backgroundColor: c, outline: form.color === c ? '2px solid white' : 'none', outlineOffset: 2 }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={save} disabled={saving || !form.institution_name || scanning} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editingId ? 'Save Changes' : 'Save Account'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditingId(null); setScanError(null); setSaveError(null) }} className="btn-ghost">Cancel</button>
            </div>

            {saveError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-3">
                Failed to save account: {saveError}
              </p>
            )}

            {!editingId && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={scanning}
                className="w-full mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-brand-400 transition-colors py-1"
              >
                <Upload size={12} /> Browse for a different screenshot
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
