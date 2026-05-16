import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, CreditCard, Loader2, ScanLine, Upload, Pencil, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase, type FinancialAccount, type ScheduledPayment } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { recognizeImage } from '@/lib/imageRecognition'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const ASSET_TYPES = ['Checking', 'Savings', 'Investment', 'Retirement', 'CD', 'Other']
const DEBT_TYPES_LABELS = ['Credit Card', 'Buy Now Pay Later', 'Mortgage', 'Auto Loan', 'Student Loan']
const ACCOUNT_TYPES = [...ASSET_TYPES, ...DEBT_TYPES_LABELS]
const DEBT_TYPES = ['credit_card', 'buy_now_pay_later', 'mortgage', 'auto_loan', 'student_loan', 'personal_loan']
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
const INTERVALS = ['Weekly', 'Biweekly', 'Semi-Monthly', 'Monthly', 'Quarterly']

// ── BNPL localStorage helpers ────────────────────────────────
interface BNPLExtras {
  payment_amount: string
  payment_interval: string
  due_date: string
  auto_pay: boolean
  payments_remaining: string
}
function loadBnpl(): Record<string, BNPLExtras> {
  try { return JSON.parse(localStorage.getItem('life_os_bnpl') ?? '{}') } catch { return {} }
}
function saveBnpl(data: Record<string, BNPLExtras>) {
  localStorage.setItem('life_os_bnpl', JSON.stringify(data))
}

// ── Type badge helper ────────────────────────────────────────
function typeBadge(t: string) {
  if (['checking', 'savings', 'cd'].includes(t)) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
  if (t === 'credit_card') return 'bg-amber-500/15 text-amber-400 border-amber-500/25'
  if (t === 'buy_now_pay_later') return 'bg-purple-500/15 text-purple-400 border-purple-500/25'
  if (['mortgage', 'auto_loan', 'student_loan', 'personal_loan'].includes(t)) return 'bg-red-500/15 text-red-400 border-red-500/25'
  if (['investment', 'retirement'].includes(t)) return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25'
  return 'bg-slate-700/50 text-slate-400 border-slate-600/50'
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    buy_now_pay_later: 'BNPL', credit_card: 'Credit Card', auto_loan: 'Auto Loan',
    student_loan: 'Student Loan', checking: 'Checking', savings: 'Savings',
    investment: 'Investment', retirement: 'Retirement',
  }
  return map[t] ?? t.replace(/_/g, ' ')
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const BLANK_FORM = {
  accountKind: '' as 'asset' | 'debt' | '',   // first-step choice
  nickname: '', account_type: 'Checking', institution_name: '',
  last_four: '', current_balance: '', interest_rate: '', credit_limit: '',
  rewards_balance: '', color: COLORS[0],
  // BNPL extras
  bnpl_payment_amount: '', bnpl_interval: 'Monthly', bnpl_due_date: '',
  bnpl_auto_pay: false, bnpl_payments_remaining: '',
}

type FormState = typeof BLANK_FORM

export default function AccountsPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editAccount, setEditAccount] = useState<FinancialAccount | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [tab, setTab] = useState('All')
  const [form, setForm] = useState<FormState>(BLANK_FORM)
  const [bnplData, setBnplData] = useState<Record<string, BNPLExtras>>(loadBnpl)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      supabase.from('financial_accounts').select('*').eq('owner_id', user.id).is('deleted_at', null).order('sort_order'),
      supabase.from('scheduled_payments').select('*').eq('owner_id', user.id).is('deleted_at', null).order('next_due_date'),
    ]).then(([{ data: accs }, { data: pmts }]) => {
      setAccounts(accs ?? [])
      setScheduledPayments(pmts ?? [])
      setLoading(false)
    })
  }, [user])

  // ── Tabs ─────────────────────────────────────────────────────
  const tabs = ['All', 'Assets', 'Debt', 'Investments']
  const filtered = accounts.filter(a => {
    if (tab === 'Assets') return ['checking', 'savings', 'cd'].includes(a.account_type)
    if (tab === 'Debt') return DEBT_TYPES.includes(a.account_type)
    if (tab === 'Investments') return ['investment', 'retirement'].includes(a.account_type)
    return true
  })

  const totalAssets = accounts.filter(a => a.current_balance > 0).reduce((s, a) => s + a.current_balance, 0)
  const totalDebt = accounts.filter(a => a.current_balance < 0).reduce((s, a) => s + Math.abs(a.current_balance), 0)
  const netWorth = totalAssets - totalDebt

  // ── Map each debt account → its next scheduled payment ───────
  const paymentsByAccount: Record<string, ScheduledPayment> = {}
  scheduledPayments.forEach(p => {
    if (p.from_account_id && !paymentsByAccount[p.from_account_id]) {
      paymentsByAccount[p.from_account_id] = p
    }
  })

  // ── Open add modal ───────────────────────────────────────────
  const openAdd = () => {
    setEditAccount(null)
    setForm(BLANK_FORM)
    setScanError(null)
    setShowModal(true)
  }

  // ── Open edit modal ──────────────────────────────────────────
  const openEdit = (a: FinancialAccount) => {
    setEditAccount(a)
    const isDebtType = DEBT_TYPES.includes(a.account_type)
    const extras = bnplData[a.id]
    setForm({
      accountKind: isDebtType ? 'debt' : 'asset',
      nickname: a.nickname ?? '',
      account_type: a.account_type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        .replace('Buy Now Pay Later', 'Buy Now Pay Later'),
      institution_name: a.institution_name,
      last_four: a.last_four ?? '',
      current_balance: String(a.current_balance),
      interest_rate: a.interest_rate != null ? String(a.interest_rate) : '',
      credit_limit: a.credit_limit != null ? String(a.credit_limit) : '',
      rewards_balance: String(a.rewards_balance),
      color: a.color,
      bnpl_payment_amount: extras?.payment_amount ?? '',
      bnpl_interval: extras?.payment_interval ?? 'Monthly',
      bnpl_due_date: extras?.due_date ?? '',
      bnpl_auto_pay: extras?.auto_pay ?? false,
      bnpl_payments_remaining: extras?.payments_remaining ?? '',
    })
    setScanError(null)
    setShowModal(true)
  }

  // ── AI scan → pre-fill ───────────────────────────────────────
  const scanImage = async (file: File) => {
    setScanning(true)
    setScanError(null)
    try {
      const base64 = await fileToBase64(file)
      const result = await recognizeImage(base64, file.type)
      const f = result.fields as Record<string, unknown>
      const isBank = result.detectedType === 'bank_statement'
      setForm(p => ({
        ...p,
        institution_name: String(f.institution ?? p.institution_name),
        account_type: isBank ? 'Checking' : 'Credit Card',
        last_four: String(f.last_four ?? p.last_four),
        current_balance: f.balance != null ? String(f.balance) : p.current_balance,
        interest_rate: f.apr != null ? String(f.apr) : p.interest_rate,
        credit_limit: f.credit_limit != null ? String(f.credit_limit) : p.credit_limit,
        rewards_balance: f.rewards_points != null ? String(f.rewards_points) : p.rewards_balance,
        color: isBank ? '#10b981' : '#f59e0b',
      }))
      if (!showModal) setShowModal(true)
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed — enter details manually')
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

  // ── Save (insert or update) ──────────────────────────────────
  const [saveError, setSaveError] = useState<string | null>(null)

  const save = async () => {
    if (!user || !form.institution_name) return
    setSaving(true)
    setSaveError(null)

    const isBNPL = form.account_type === 'Buy Now Pay Later'
    const typeKey = form.account_type.toLowerCase().replace(/ /g, '_')

    const payload = {
      account_type: typeKey,
      institution_name: form.institution_name,
      nickname: form.nickname || null,
      last_four: form.last_four || null,
      current_balance: parseFloat(form.current_balance) || 0,
      interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
      credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
      rewards_balance: parseFloat(form.rewards_balance) || 0,
      color: form.color,
    }

    try {
      let accountId = editAccount?.id

      // ── Insert or Update base account ──────────────────────
      if (editAccount) {
        const { data, error } = await supabase.from('financial_accounts')
          .update(payload).eq('id', editAccount.id).select('*').single()
        if (error) throw new Error(error.message)
        if (data) setAccounts(p => p.map(a => a.id === data.id ? data : a))
      } else {
        const { data, error } = await supabase.from('financial_accounts').insert({
          ...payload, owner_id: user.id, status: 'active', sort_order: accounts.length,
          rewards_unit: 'points', rewards_cpp: 0.01, icon: '🏦',
        }).select('*').single()
        if (error) throw new Error(error.message)
        if (data) { setAccounts(p => [...p, data]); accountId = data.id }
      }

      // ── Save BNPL extras to localStorage ───────────────────
      if (isBNPL && accountId) {
        const extras: BNPLExtras = {
          payment_amount: form.bnpl_payment_amount,
          payment_interval: form.bnpl_interval,
          due_date: form.bnpl_due_date,
          auto_pay: form.bnpl_auto_pay,
          payments_remaining: form.bnpl_payments_remaining,
        }
        const updatedBnpl = { ...bnplData, [accountId]: extras }
        setBnplData(updatedBnpl)
        saveBnpl(updatedBnpl)

        // Create/update the linked ScheduledPayment when payment details are provided
        if (form.bnpl_payment_amount && form.bnpl_due_date) {
          const existing = scheduledPayments.find(p => p.from_account_id === accountId)
          const pmtPayload = {
            owner_id: user.id,
            from_account_id: accountId,
            payee_name: form.institution_name,
            amount: parseFloat(form.bnpl_payment_amount),
            next_due_date: form.bnpl_due_date,
            frequency: form.bnpl_interval.toLowerCase().replace(/\s+/g, '_'),
            auto_pay: form.bnpl_auto_pay,
            status: 'active',
            memo: JSON.stringify({ payments_remaining: parseInt(form.bnpl_payments_remaining) || null }),
          }
          if (existing) {
            const { data: updated, error } = await supabase.from('scheduled_payments')
              .update(pmtPayload).eq('id', existing.id).select('*').single()
            if (error) throw new Error(`Payment schedule: ${error.message}`)
            if (updated) setScheduledPayments(p => p.map(x => x.id === updated.id ? updated : x))
          } else {
            const { data: created, error } = await supabase.from('scheduled_payments')
              .insert(pmtPayload).select('*').single()
            if (error) throw new Error(`Payment schedule: ${error.message}`)
            if (created) setScheduledPayments(p => [...p, created])
          }
        }
      }

      // ── Success — close modal ───────────────────────────────
      setShowModal(false)
      setEditAccount(null)
      setForm(BLANK_FORM)
      setSaveError(null)

    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed — please try again')
    } finally {
      setSaving(false)
    }
  }

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await supabase.from('financial_accounts').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setAccounts(p => p.filter(a => a.id !== id))
    const updated = { ...bnplData }
    delete updated[id]
    setBnplData(updated)
    saveBnpl(updated)
  }

  const isBNPLForm = form.account_type === 'Buy Now Pay Later'

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-500" size={32} />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Accounts</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Net Worth: <span className={`font-semibold ${netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(netWorth)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()} disabled={scanning}
            className="btn-ghost flex items-center gap-2 border border-slate-700">
            {scanning ? <><Loader2 size={15} className="animate-spin text-brand-400" /> Scanning…</> : <><ScanLine size={15} className="text-brand-400" /> Import Snip</>}
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Account
          </button>
        </div>
      </div>

      {scanError && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
          <span className="font-medium">Scan error:</span> {scanError}
        </div>
      )}

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

      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

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
            <button onClick={openAdd} className="btn-primary flex items-center gap-2">
              <Plus size={14} /> Add Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Account', 'Type', 'Balance', 'Rate', 'Next Payment', 'Rewards / Info', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const sched = paymentsByAccount[a.id]
                const bnplExtras = bnplData[a.id]
                const isDebt = DEBT_TYPES.includes(a.account_type)
                const isBNPL = a.account_type === 'buy_now_pay_later'

                return (
                  <tr key={a.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors last:border-0 cursor-pointer"
                    onClick={() => openEdit(a)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                        <div>
                          <div className="font-medium text-slate-200 flex items-center gap-1.5">
                            {a.nickname ?? a.institution_name}
                            <Pencil size={11} className="text-slate-600 opacity-0 group-hover:opacity-100" />
                          </div>
                          <div className="text-xs text-slate-500">{a.institution_name}{a.last_four ? ` ···${a.last_four}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${typeBadge(a.account_type)}`}>
                        {typeLabel(a.account_type)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className={`font-semibold ${a.current_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(Math.abs(a.current_balance))}
                      </div>
                      {a.credit_limit && !isBNPL && <div className="text-xs text-slate-500">Limit: {fmt(a.credit_limit)}</div>}
                    </td>
                    <td className="px-5 py-3 text-slate-300">{a.interest_rate ? `${a.interest_rate}%` : '—'}</td>

                    {/* Next Payment column — only meaningful for debt */}
                    <td className="px-5 py-3">
                      {isBNPL && bnplExtras?.due_date ? (
                        <div>
                          <div className="text-xs font-semibold text-purple-400">{bnplExtras.due_date}</div>
                          <div className="text-xs text-slate-500">{bnplExtras.payment_interval} · {bnplExtras.payment_amount ? fmt(parseFloat(bnplExtras.payment_amount)) : '—'}</div>
                        </div>
                      ) : isDebt && sched ? (
                        <div>
                          <div className="text-xs font-semibold text-amber-400">{sched.next_due_date}</div>
                          <div className="text-xs text-slate-500 capitalize">{sched.frequency} · {fmt(sched.amount)}</div>
                        </div>
                      ) : isDebt ? (
                        <span className="text-xs text-slate-600">Not scheduled</span>
                      ) : (
                        <span className="text-xs text-slate-700">—</span>
                      )}
                    </td>

                    {/* Rewards / BNPL info column */}
                    <td className="px-5 py-3">
                      {isBNPL ? (
                        <div className="space-y-0.5">
                          {bnplExtras?.payments_remaining && (
                            <div className="text-xs font-semibold text-purple-300">
                              {bnplExtras.payments_remaining} payments left
                            </div>
                          )}
                          {bnplExtras?.auto_pay && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Auto-Pay On</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">
                          {a.rewards_balance > 0 ? `${a.rewards_balance.toLocaleString()} pts` : '—'}
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={e => del(a.id, e)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {editAccount ? `Edit — ${editAccount.nickname ?? editAccount.institution_name}` : 'Add Account'}
            </h3>

            {/* ── Step 1: asset or debt? (add mode only) ── */}
            {!editAccount && !form.accountKind && (
              <div>
                <p className="text-sm text-slate-400 mb-5">
                  Is this account an <span className="text-emerald-400 font-medium">asset</span> (money you have) or a <span className="text-red-400 font-medium">debt</span> (money you owe)?
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {/* Asset choice */}
                  <button
                    onClick={() => setForm(p => ({ ...p, accountKind: 'asset', account_type: 'Checking' }))}
                    className="group flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-slate-700 hover:border-emerald-500/60 hover:bg-emerald-500/5 transition-all text-center"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center group-hover:bg-emerald-500/25 transition-colors">
                      <TrendingUp size={28} className="text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-slate-100 mb-1">Asset</div>
                      <div className="text-xs text-slate-500 leading-relaxed">
                        Checking, Savings,<br />Investment, Retirement
                      </div>
                    </div>
                  </button>

                  {/* Debt choice */}
                  <button
                    onClick={() => setForm(p => ({ ...p, accountKind: 'debt', account_type: 'Credit Card' }))}
                    className="group flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-slate-700 hover:border-red-500/60 hover:bg-red-500/5 transition-all text-center"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center group-hover:bg-red-500/25 transition-colors">
                      <TrendingDown size={28} className="text-red-400" />
                    </div>
                    <div>
                      <div className="text-base font-bold text-slate-100 mb-1">Debt</div>
                      <div className="text-xs text-slate-500 leading-relaxed">
                        Credit Card, BNPL,<br />Mortgage, Loan
                      </div>
                    </div>
                  </button>
                </div>

                <button onClick={() => { setShowModal(false); setScanError(null) }}
                  className="w-full mt-5 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1">
                  Cancel
                </button>
              </div>
            )}

            {/* ── Step 2: account form (shown once kind is chosen) ── */}
            {(editAccount || form.accountKind) && (
              <>
                {/* Kind indicator + change link (add mode only) */}
                {!editAccount && form.accountKind && (
                  <div className="flex items-center justify-between mb-5 px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/50">
                    <div className="flex items-center gap-2">
                      {form.accountKind === 'asset'
                        ? <><TrendingUp size={14} className="text-emerald-400" /><span className="text-sm font-medium text-emerald-400">Asset account</span></>
                        : <><TrendingDown size={14} className="text-red-400" /><span className="text-sm font-medium text-red-400">Debt account</span></>}
                    </div>
                    <button onClick={() => setForm(p => ({ ...p, accountKind: '' }))}
                      className="text-xs text-slate-500 hover:text-brand-400 transition-colors">
                      ← Change
                    </button>
                  </div>
                )}

                {/* Scan zone (add mode only) */}
                {!editAccount && (
                  <div
                    className={`mb-5 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
                      ${scanning ? 'border-brand-500/60 bg-brand-500/5' : 'border-slate-700 hover:border-brand-500/50 hover:bg-brand-500/5'}`}
                    onClick={() => !scanning && fileInputRef.current?.click()}
                    onPaste={handleModalPaste}
                    tabIndex={0}
                  >
                    {scanning ? (
                      <div className="flex items-center justify-center gap-2 text-brand-400">
                        <Loader2 size={16} className="animate-spin" />
                        <span className="text-sm font-medium">Scanning with AI…</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-center gap-2 text-slate-400 hover:text-brand-400 mb-1">
                          <ScanLine size={16} />
                          <span className="text-sm font-medium">Paste or click to scan a statement screenshot</span>
                        </div>
                        <p className="text-xs text-slate-600">Bank statement · Credit card · Any account summary</p>
                      </>
                    )}
                  </div>
                )}

                {scanError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">{scanError}</p>
                )}

                {/* Form fields */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1.5 block">Institution Name *</label>
                    <input value={form.institution_name} onChange={e => setForm(p => ({ ...p, institution_name: e.target.value }))}
                      className="input-base" placeholder="Chase, Ally, Klarna…" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1.5 block">Nickname (optional)</label>
                    <input value={form.nickname} onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))}
                      className="input-base" placeholder="My Checking" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1.5 block">Account Type</label>
                    <select value={form.account_type} onChange={e => setForm(p => ({ ...p, account_type: e.target.value }))} className="input-base">
                      {(editAccount
                        ? ACCOUNT_TYPES
                        : form.accountKind === 'asset' ? ASSET_TYPES : DEBT_TYPES_LABELS
                      ).map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                        {isBNPLForm ? 'Remaining Balance ($)' : 'Balance ($)'}
                      </label>
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
                    {!isBNPLForm && (
                      <div>
                        <label className="text-xs text-slate-400 font-medium mb-1.5 block">Credit Limit ($)</label>
                        <input type="number" value={form.credit_limit} onChange={e => setForm(p => ({ ...p, credit_limit: e.target.value }))}
                          className="input-base" placeholder="Optional" />
                      </div>
                    )}
                  </div>

                  {/* BNPL-specific fields */}
                  {isBNPLForm && (
                    <div className="space-y-4 pt-3 border-t border-slate-800">
                      <div className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Buy Now Pay Later Details</div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payment Amount ($)</label>
                          <input type="number" value={form.bnpl_payment_amount}
                            onChange={e => setForm(p => ({ ...p, bnpl_payment_amount: e.target.value }))}
                            className="input-base" placeholder="0.00" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payment Interval</label>
                          <select value={form.bnpl_interval} onChange={e => setForm(p => ({ ...p, bnpl_interval: e.target.value }))} className="input-base">
                            {INTERVALS.map(i => <option key={i}>{i}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Next Due Date</label>
                          <input type="date" value={form.bnpl_due_date}
                            onChange={e => setForm(p => ({ ...p, bnpl_due_date: e.target.value }))}
                            className="input-base" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payments Remaining</label>
                          <input type="number" min={0} value={form.bnpl_payments_remaining}
                            onChange={e => setForm(p => ({ ...p, bnpl_payments_remaining: e.target.value }))}
                            className="input-base" placeholder="e.g. 4" />
                        </div>
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                        <input type="checkbox" checked={form.bnpl_auto_pay}
                          onChange={e => setForm(p => ({ ...p, bnpl_auto_pay: e.target.checked }))}
                          className="rounded accent-brand-500 w-4 h-4" />
                        <div>
                          <div className="text-sm font-medium text-slate-200">Auto-Pay Enabled</div>
                          <div className="text-xs text-slate-500 mt-0.5">Payments are automatically deducted on the due date</div>
                        </div>
                        {form.bnpl_auto_pay && (
                          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">On</span>
                        )}
                      </label>
                    </div>
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
                  <button onClick={save} disabled={saving || !form.institution_name || scanning}
                    className="btn-primary flex-1 justify-center flex items-center gap-2">
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editAccount ? 'Save Changes' : 'Save Account'}
                  </button>
                  <button onClick={() => { setShowModal(false); setEditAccount(null); setScanError(null); setSaveError(null) }} className="btn-ghost">Cancel</button>
                </div>

                {saveError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-3">
                    ⚠ {saveError}
                  </p>
                )}

                {!editAccount && (
                  <button onClick={() => fileInputRef.current?.click()} disabled={scanning}
                    className="w-full mt-3 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-brand-400 transition-colors py-1">
                    <Upload size={12} /> Browse for a different screenshot
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
