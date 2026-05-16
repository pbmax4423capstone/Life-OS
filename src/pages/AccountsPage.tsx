import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, CreditCard, Loader2, ScanLine, Upload, Pencil, TrendingUp, TrendingDown, BarChart2, DollarSign, CheckCircle2, ChevronDown, ChevronUp, CalendarClock } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { supabase, type FinancialAccount, type ScheduledPayment } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { recognizeImage } from '@/lib/imageRecognition'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

// ── Category definitions ──────────────────────────────────────
type AccountKind = 'asset' | 'investment' | 'debt' | ''

const CATEGORY_CONFIG = {
  asset:      { label: 'Asset',      desc: 'Checking, Savings, CD',         icon: TrendingUp,  border: 'hover:border-emerald-500/60 hover:bg-emerald-500/5', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', default: 'Checking' },
  investment: { label: 'Investment', desc: 'Brokerage, Retirement',          icon: BarChart2,   border: 'hover:border-indigo-500/60 hover:bg-indigo-500/5',  badge: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25',  default: 'Investment' },
  debt:       { label: 'Debt',       desc: 'Credit Card, Loans, BNPL',       icon: TrendingDown,border: 'hover:border-red-500/60 hover:bg-red-500/5',        badge: 'bg-red-500/15 text-red-400 border-red-500/25',          default: 'Credit Card' },
}

const TYPE_OPTIONS: Record<string, string[]> = {
  asset:      ['Checking', 'Savings', 'Money Market', 'CD', 'Other'],
  investment: ['Investment', 'Retirement / 401K', 'Stocks', 'Bonds', 'Bitcoin', 'Other Investment'],
  debt:       ['Credit Card', 'Buy Now Pay Later', 'Mortgage', 'Auto Loan', 'Student Loan', '401K Loan'],
}

const ACCOUNT_TYPES = [...TYPE_OPTIONS.asset, ...TYPE_OPTIONS.investment, ...TYPE_OPTIONS.debt]
const DEBT_TYPES    = ['credit_card', 'buy_now_pay_later', 'mortgage', 'auto_loan', 'student_loan', 'personal_loan', 'heloc', '401k_loan']
const INV_TYPES     = ['investment', 'retirement', 'retirement_/_401k', 'stocks', 'bonds', 'bitcoin', 'other_investment', 'money_market']

// ── Extended type support ─────────────────────────────────────
// The DB enum only allows a fixed set of account_type values.
// Extended UI types are stored in the `icon` field and mapped to
// the nearest valid DB enum value for persistence.
const EXTENDED_TYPES = new Set([
  'buy_now_pay_later', 'money_market', 'stocks', 'bonds', 'bitcoin',
  'retirement_/_401k', 'other_investment', '401k_loan',
])

const DB_TYPE_MAP: Record<string, string> = {
  buy_now_pay_later:    'credit_card',
  money_market:         'savings',
  stocks:               'investment',
  bonds:                'investment',
  bitcoin:              'investment',
  'retirement_/_401k':  'retirement',
  other_investment:     'investment',
  '401k_loan':          'other',
}

/** Type stored in DB (valid enum value) */
function toDbType(t: string): string {
  return DB_TYPE_MAP[t] ?? t
}

/** Real display type: reads `icon` field for extended types */
function getDisplayType(a: FinancialAccount): string {
  if (a.icon && EXTENDED_TYPES.has(a.icon)) return a.icon
  return a.account_type
}

function getCategory(t: string): 'asset' | 'investment' | 'debt' {
  if (INV_TYPES.includes(t))  return 'investment'
  if (DEBT_TYPES.includes(t)) return 'debt'
  return 'asset'
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
const INTERVALS = ['Weekly', 'Biweekly', 'Semi-Monthly', 'Monthly', 'Quarterly']

// ── BNPL localStorage helpers ────────────────────────────────
interface BNPLExtras {
  payment_amount: string
  payment_interval: string
  due_date: string
  auto_pay: boolean
  payments_remaining: string
  last_payment_date?: string
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
  if (['mortgage', 'auto_loan', 'student_loan', 'personal_loan', 'heloc'].includes(t)) return 'bg-red-500/15 text-red-400 border-red-500/25'
  if (INV_TYPES.includes(t)) return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25'
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

function advanceDueDate(dateStr: string, freq: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  switch (freq.toLowerCase()) {
    case 'weekly':    d.setDate(d.getDate() + 7);   break
    case 'biweekly':  d.setDate(d.getDate() + 14);  break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'annually':  d.setFullYear(d.getFullYear() + 1); break
    case 'once':      return dateStr
    default:          d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString().split('T')[0]
}

function parseMeta(memo: string | null): Record<string, unknown> {
  if (!memo) return {}
  try { return JSON.parse(memo) } catch { return {} }
}

// ── Payday helpers (mirror DashboardPage) ─────────────────────
function loadPaydaySettings() {
  try { return JSON.parse(localStorage.getItem('life_os_payday') ?? 'null') as { frequency: string; next_payday: string } | null } catch { return null }
}

function computeNextPayday(anchor: string, freq: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(anchor + 'T00:00:00')
  const step: Record<string, number> = { weekly: 7, biweekly: 14, 'semi-monthly': 15, monthly: 30 }
  while (d < today) {
    if (freq === 'monthly') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + (step[freq] ?? 14))
  }
  return d.toISOString().split('T')[0]
}

// ── Payment budget (localStorage) ────────────────────────────
function loadBudget(): string {
  try { return JSON.parse(localStorage.getItem('life_os_pay_budget') ?? 'null')?.amount ?? '' } catch { return '' }
}
function saveBudgetAmount(amount: string) {
  localStorage.setItem('life_os_pay_budget', JSON.stringify({ amount }))
}

const BLANK_FORM = {
  accountKind: '' as AccountKind,
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
  const [searchParams, setSearchParams] = useSearchParams()
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

  // Pay Now state
  const [payNowAccount, setPayNowAccount] = useState<FinancialAccount | null>(null)
  const [payNowAmount, setPayNowAmount] = useState('')
  const [payNowDate, setPayNowDate] = useState('')
  const [payNowSourceId, setPayNowSourceId] = useState('')
  const [payingNow, setPayingNow] = useState(false)
  const [payNowError, setPayNowError] = useState<string | null>(null)

  // Payday + budget state
  const [paydaySettings] = useState(loadPaydaySettings)
  const [budgetAmount, setBudgetAmountState] = useState(loadBudget)
  const [showDueExpanded, setShowDueExpanded] = useState(false)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      supabase.from('financial_accounts').select('*').eq('owner_id', user.id).is('deleted_at', null).order('sort_order'),
      supabase.from('scheduled_payments').select('*').eq('owner_id', user.id).is('deleted_at', null).order('next_due_date'),
    ]).then(([{ data: accs }, { data: pmts }]) => {
      setAccounts(accs ?? [])
      setScheduledPayments(pmts ?? [])
      setLoading(false)

      // Auto-open edit modal if navigated here with ?edit=<id>
      const editId = searchParams.get('edit')
      if (editId && accs) {
        const target = accs.find(a => a.id === editId)
        if (target) {
          openEdit(target)
          setSearchParams({})
        }
      }
    })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tabs ─────────────────────────────────────────────────────
  const tabs = ['All', 'Assets', 'Debt', 'Investments']
  const filtered = accounts.filter(a => {
    if (tab === 'Assets') return getCategory(getDisplayType(a)) === 'asset'
    if (tab === 'Debt') return getCategory(getDisplayType(a)) === 'debt'
    if (tab === 'Investments') return getCategory(getDisplayType(a)) === 'investment'
    return true
  })

  // ── Map each debt account → its next scheduled payment (must be before dueItems) ──
  const paymentsByAccount: Record<string, ScheduledPayment> = {}
  scheduledPayments.forEach(p => {
    if (p.from_account_id && !paymentsByAccount[p.from_account_id]) {
      paymentsByAccount[p.from_account_id] = p
    }
  })

  // ── Stat card calculations (same classifier as Dashboard) ──
  const isDebtAcc = (a: FinancialAccount) => DEBT_TYPES.includes(getDisplayType(a)) || a.current_balance < 0
  const debtAccList  = accounts.filter(isDebtAcc)
  const assetAccList = accounts.filter(a => !isDebtAcc(a) && a.current_balance > 0)
  const totalAssets  = assetAccList.reduce((s, a) => s + a.current_balance, 0)
  const totalDebt    = debtAccList.reduce((s, a) => s + Math.abs(a.current_balance), 0)
  const netWorth     = totalAssets - totalDebt

  // ── Payments due before next payday ───────────────────────
  const nextPayday = paydaySettings ? computeNextPayday(paydaySettings.next_payday, paydaySettings.frequency) : null

  const dueItems = nextPayday ? debtAccList.flatMap(a => {
    const dt     = getDisplayType(a)
    const extras = bnplData[a.id]
    const sched  = paymentsByAccount[a.id]
    let dueDate: string | undefined
    let amount = 0
    if (dt === 'buy_now_pay_later' && extras?.due_date) {
      dueDate = extras.due_date
      amount  = parseFloat(extras.payment_amount) || 0
    } else if (sched) {
      dueDate = sched.next_due_date
      amount  = sched.amount
    }
    if (dueDate && dueDate <= nextPayday! && amount > 0) {
      return [{ account: a, dueDate, amount, extras, sched }]
    }
    return []
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) : []

  const totalDue        = dueItems.reduce((s, i) => s + i.amount, 0)
  const budgetRemaining = parseFloat(budgetAmount) > 0 ? parseFloat(budgetAmount) - totalDue : null

  // ── Source accounts for Pay Now dropdown ─────────────────────
  const sourceAccounts = accounts.filter(a => !isDebtAcc(a) && a.current_balance > 0)
  const openAdd = () => {
    setEditAccount(null)
    setForm(BLANK_FORM)
    setScanError(null)
    setShowModal(true)
  }

  // ── Open edit modal ──────────────────────────────────────────
  const openEdit = (a: FinancialAccount) => {
    setEditAccount(a)
    const cat = getCategory(getDisplayType(a))
    const displayType = getDisplayType(a)   // may differ from a.account_type for extended types
    const extras = bnplData[a.id]
    setForm({
      accountKind: cat,
      nickname: a.nickname ?? '',
      account_type: displayType.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      institution_name: a.institution_name,
      last_four: a.last_four ?? '',
      current_balance: String(Math.abs(a.current_balance)),  // always show positive in form
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
    const dbType = toDbType(typeKey)                    // valid DB enum value
    const iconValue = EXTENDED_TYPES.has(typeKey)       // store real type in icon
      ? typeKey : '🏦'

    const payload = {
      account_type: dbType,                             // safe for DB enum
      institution_name: form.institution_name,
      nickname: form.nickname || null,
      last_four: form.last_four || null,
      current_balance: (form.accountKind === 'debt' || editAccount && DEBT_TYPES.includes(getDisplayType(editAccount!)))
        ? -(Math.abs(parseFloat(form.current_balance) || 0))   // debt = negative
        : parseFloat(form.current_balance) || 0,
      interest_rate: form.interest_rate !== '' ? parseFloat(form.interest_rate) : null,
      credit_limit: form.credit_limit ? parseFloat(form.credit_limit) : null,
      rewards_balance: parseFloat(form.rewards_balance) || 0,
      color: form.color,
    }

    try {
      let accountId = editAccount?.id

      // ── Insert or Update base account ──────────────────────
      if (editAccount) {
        const { data, error } = await supabase.from('financial_accounts')
          .update({ ...payload, icon: iconValue }).eq('id', editAccount.id).select('*').single()
        if (error) throw new Error(error.message)
        if (data) setAccounts(p => p.map(a => a.id === data.id ? data : a))
      } else {
        const insertPromise = supabase.from('financial_accounts').insert({
          ...payload, owner_id: user.id, status: 'active', sort_order: accounts.length,
          rewards_unit: 'points', rewards_cpp: 0.01, icon: iconValue,
        }).select('*').single()
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timed out — check your connection and try again')), 12000)
        )
        const { data, error } = await Promise.race([insertPromise, timeoutPromise])
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

        // Create/update the linked ScheduledPayment — fire-and-forget so it never blocks the modal
        if (form.bnpl_payment_amount && form.bnpl_due_date) {
          const existing = scheduledPayments.find(p => p.from_account_id === accountId)
          const pmtPayload = {
            owner_id: user.id,
            from_account_id: accountId!,
            payee_name: form.institution_name,
            amount: parseFloat(form.bnpl_payment_amount),
            next_due_date: form.bnpl_due_date,
            frequency: form.bnpl_interval.toLowerCase().replace(/\s+/g, '_'),
            auto_pay: form.bnpl_auto_pay,
            status: 'active',
            memo: JSON.stringify({ payments_remaining: parseInt(form.bnpl_payments_remaining) || null }),
          }
          if (existing) {
            supabase.from('scheduled_payments').update(pmtPayload).eq('id', existing.id).select('*').single()
              .then(({ data: updated }) => { if (updated) setScheduledPayments(p => p.map(x => x.id === updated.id ? updated : x)) })
              .catch(() => {})
          } else {
            supabase.from('scheduled_payments').insert(pmtPayload).select('*').single()
              .then(({ data: created }) => { if (created) setScheduledPayments(p => [...p, created]) })
              .catch(() => {})
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

  // ── Pay Now ──────────────────────────────────────────────────
  const openPayNow = (a: FinancialAccount, e: React.MouseEvent) => {
    e.stopPropagation()
    const extras = bnplData[a.id]
    const sched  = paymentsByAccount[a.id]
    const defaultAmt = sched?.amount
      ? String(sched.amount)
      : extras?.payment_amount ?? ''
    // Auto-select the single checking account if there's only one source
    const defaultSource = sourceAccounts.length === 1 ? sourceAccounts[0].id : ''
    setPayNowAccount(a)
    setPayNowAmount(defaultAmt)
    setPayNowDate(new Date().toISOString().split('T')[0])
    setPayNowSourceId(defaultSource)
    setPayNowError(null)
  }

  const confirmPayNow = async () => {
    if (!payNowAccount || !user) return
    const amount = parseFloat(payNowAmount) || 0
    if (amount <= 0) { setPayNowError('Enter a payment amount greater than $0'); return }
    setPayingNow(true)
    setPayNowError(null)

    // Reduce the debt balance (debt is negative, adding positive reduces it)
    const newBalance = payNowAccount.current_balance + amount
    const { data, error } = await supabase.from('financial_accounts')
      .update({ current_balance: newBalance })
      .eq('id', payNowAccount.id)
      .select('*').single()
    if (error) { setPayNowError(error.message); setPayingNow(false); return }
    if (data) setAccounts(p => p.map(a => a.id === data.id ? data : a))

    // Deduct from the chosen source account
    if (payNowSourceId) {
      const src = sourceAccounts.find(a => a.id === payNowSourceId)
      if (src) {
        const newSrcBalance = src.current_balance - amount
        const { data: srcData } = await supabase.from('financial_accounts')
          .update({ current_balance: newSrcBalance })
          .eq('id', src.id)
          .select('*').single()
        if (srcData) setAccounts(p => p.map(a => a.id === srcData.id ? srcData : a))
      }
    }

    // Update BNPL extras: decrement payments_remaining, record last_payment_date, advance due_date
    const dt = getDisplayType(payNowAccount)
    if (dt === 'buy_now_pay_later') {
      const extras = bnplData[payNowAccount.id]
      if (extras) {
        const remaining = parseInt(extras.payments_remaining) || 0
        const newRemaining = Math.max(0, remaining - 1)
        // Advance due_date so this account leaves the "due before payday" list
        const newDueDate = newRemaining > 0
          ? advanceDueDate(extras.due_date, extras.payment_interval)
          : extras.due_date
        const updated: BNPLExtras = {
          ...extras,
          payments_remaining: String(newRemaining),
          last_payment_date: payNowDate,
          due_date: newDueDate,
        }
        const updatedAll = { ...bnplData, [payNowAccount.id]: updated }
        setBnplData(updatedAll)
        saveBnpl(updatedAll)
      }
    }

    // Advance any linked scheduled payment
    const sched = paymentsByAccount[payNowAccount.id]
    if (sched) {
      const nextDue = advanceDueDate(sched.next_due_date, sched.frequency)
      const meta = parseMeta(sched.memo)
      await supabase.from('scheduled_payments').update({
        anchor_date: payNowDate,
        next_due_date: nextDue,
        memo: JSON.stringify({ ...meta, last_payment_date: payNowDate }),
      }).eq('id', sched.id)
      setScheduledPayments(p => p.map(x =>
        x.id === sched.id ? { ...x, next_due_date: nextDue, anchor_date: payNowDate } : x
      ))
    }

    setPayingNow(false)
    setPayNowAccount(null)
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

      {/* ── Payments Due This Pay Period ── */}
      {nextPayday && (
        <div className={`card p-5 border-2 transition-colors ${dueItems.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-700/50'}`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${dueItems.length > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
                <CalendarClock size={16} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Payments Due Before Payday
                  {dueItems.length > 0 && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">{dueItems.length} due</span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Next payday: <span className="text-emerald-400 font-medium">{nextPayday}</span></p>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 whitespace-nowrap">Payment Budget</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                  <input type="number" value={budgetAmount}
                    onChange={e => { setBudgetAmountState(e.target.value); saveBudgetAmount(e.target.value) }}
                    className="input-base pl-6 py-1.5 text-sm w-28" placeholder="0" />
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-amber-400">{fmt(totalDue)} due</div>
                {budgetRemaining != null && (
                  <div className={`text-xs font-semibold ${budgetRemaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmt(Math.abs(budgetRemaining))} {budgetRemaining >= 0 ? 'remaining' : 'over budget'}
                  </div>
                )}
              </div>
              {dueItems.length > 0 && (
                <button onClick={() => setShowDueExpanded(v => !v)}
                  className="btn-ghost text-xs py-1 px-3 flex items-center gap-1">
                  {showDueExpanded ? <><ChevronUp size={13} /> Hide</> : <><ChevronDown size={13} /> Details</>}
                </button>
              )}
            </div>
          </div>

          {showDueExpanded && (
            <div className="mt-4 space-y-2">
              {dueItems.map(item => (
                <div key={item.account.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 hover:border-slate-700 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: item.account.color }} />
                    <div>
                      <div className="text-sm font-medium text-slate-200">{item.account.nickname ?? item.account.institution_name}</div>
                      <div className="text-xs text-slate-500">
                        Due {item.dueDate}
                        {item.extras?.last_payment_date && <span className="text-emerald-400 ml-2">· Last paid {item.extras.last_payment_date}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-amber-400">{fmt(item.amount)}</span>
                    <button onClick={e => openPayNow(item.account, e)}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 border border-brand-500/20 transition-colors">
                      <DollarSign size={11} /> Pay Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {dueItems.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 mt-3">
              <CheckCircle2 size={15} /> No payments due before {nextPayday} — you're all clear!
            </div>
          )}
        </div>
      )}

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
                {['Account', 'Category', 'Type', 'Balance', 'Rate', 'Next Payment', 'Payments Left', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => {
                const dt    = getDisplayType(a)
                const sched = paymentsByAccount[a.id]
                const bnplExtras = bnplData[a.id]
                const isDebt = DEBT_TYPES.includes(dt)
                const isBNPL = dt === 'buy_now_pay_later'

                const isPaidOff = isBNPL && (parseInt(bnplExtras?.payments_remaining ?? '1') <= 0)

                return (
                  <tr key={a.id}
                    className={`border-b transition-colors last:border-0 cursor-pointer ${isPaidOff ? 'border-emerald-800/40 bg-emerald-500/5 hover:bg-emerald-500/10' : 'border-slate-800/50 hover:bg-slate-800/30'}`}
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
                      {(() => {
                        const cat = getCategory(dt)
                        const cfg = CATEGORY_CONFIG[cat]
                        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${cfg.badge}`}>{cfg.label}</span>
                      })()}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${typeBadge(dt)}`}>
                        {typeLabel(dt)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className={`font-semibold ${a.current_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(Math.abs(a.current_balance))}
                      </div>
                      {a.credit_limit && !isBNPL && <div className="text-xs text-slate-500">Limit: {fmt(a.credit_limit)}</div>}
                    </td>
                    <td className="px-5 py-3 text-slate-300">{a.interest_rate != null ? `${a.interest_rate}%` : '—'}</td>

                    {/* Next Payment column */}
                    <td className="px-5 py-3">
                      {isBNPL && bnplExtras?.due_date ? (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-purple-400">{bnplExtras.due_date}</div>
                          <div className="text-xs text-slate-500">{bnplExtras.payment_interval} · {bnplExtras.payment_amount ? fmt(parseFloat(bnplExtras.payment_amount)) : '—'}</div>
                          <button onClick={e => openPayNow(a, e)}
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 border border-brand-500/20 transition-colors">
                            <DollarSign size={10} /> Pay Now
                          </button>
                        </div>
                      ) : isDebt && sched ? (
                        <div className="space-y-1">
                          <div className="text-xs font-semibold text-amber-400">{sched.next_due_date}</div>
                          <div className="text-xs text-slate-500 capitalize">{sched.frequency} · {fmt(sched.amount)}</div>
                          <button onClick={e => openPayNow(a, e)}
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 border border-brand-500/20 transition-colors">
                            <DollarSign size={10} /> Pay Now
                          </button>
                        </div>
                      ) : isDebt ? (
                        <div className="space-y-1">
                          <span className="text-xs text-slate-600">Not scheduled</span>
                          <button onClick={e => openPayNow(a, e)}
                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 text-brand-400 border border-brand-500/20 transition-colors">
                            <DollarSign size={10} /> Pay Now
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-700">—</span>
                      )}
                    </td>

                    {/* Payments Left column */}
                    <td className="px-5 py-3">
                      {isBNPL ? (
                        <div className="space-y-0.5">
                          {isPaidOff ? (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                              ✓ Paid off
                            </span>
                          ) : (
                            <>
                              {bnplExtras?.payments_remaining && (
                                <div className="text-xs font-semibold text-purple-300">
                                  {bnplExtras.payments_remaining} payments left
                                </div>
                              )}
                              {bnplExtras?.last_payment_date && (
                                <div className="text-xs text-slate-500">Last paid: {bnplExtras.last_payment_date}</div>
                              )}
                              {bnplExtras?.auto_pay && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">Auto-Pay</span>
                              )}
                            </>
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

            {/* ── Step 1: asset / investment / debt? (add mode only) ── */}
            {!editAccount && !form.accountKind && (
              <div>
                <p className="text-sm text-slate-400 mb-5">What kind of account is this?</p>
                <div className="grid grid-cols-3 gap-3">
                  {(Object.entries(CATEGORY_CONFIG) as [AccountKind, typeof CATEGORY_CONFIG[keyof typeof CATEGORY_CONFIG]][])
                    .filter(([k]) => k !== '')
                    .map(([kind, cfg]) => {
                      const Icon = cfg.icon
                      return (
                        <button key={kind}
                          onClick={() => setForm(p => ({ ...p, accountKind: kind, account_type: cfg.default }))}
                          className={`group flex flex-col items-center gap-2 p-5 rounded-2xl border-2 border-slate-700 ${cfg.border} transition-all text-center`}
                        >
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${cfg.badge.replace('text-', 'bg-').replace(/\s.*/, '')} opacity-50 group-hover:opacity-100`}>
                            <Icon size={24} className={cfg.badge.split(' ')[1]} />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-100 mb-0.5">{cfg.label}</div>
                            <div className="text-xs text-slate-500 leading-relaxed">{cfg.desc}</div>
                          </div>
                        </button>
                      )
                    })}
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
                    {(() => {
                      const k = form.accountKind as keyof typeof CATEGORY_CONFIG
                      const cfg = CATEGORY_CONFIG[k]
                      const Icon = cfg?.icon ?? TrendingUp
                      return (
                        <div className="flex items-center gap-2">
                          <Icon size={14} className={cfg?.badge.split(' ')[1] ?? 'text-slate-400'} />
                          <span className={`text-sm font-medium ${cfg?.badge.split(' ')[1] ?? 'text-slate-400'}`}>
                            {cfg?.label ?? k} account
                          </span>
                        </div>
                      )
                    })()}
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
                        : form.accountKind ? TYPE_OPTIONS[form.accountKind] ?? ACCOUNT_TYPES : ACCOUNT_TYPES
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

      {/* ── Pay Now Modal ── */}
      {payNowAccount && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-xl bg-brand-500/20 text-brand-400">
                <DollarSign size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Make a Payment</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {payNowAccount.nickname ?? payNowAccount.institution_name}
                  {' · '}
                  Balance: {fmt(Math.abs(payNowAccount.current_balance))}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                  Payment Amount ($)
                  <span className="text-slate-600 ml-1 font-normal">— edit to pay any amount</span>
                </label>
                <input
                  type="number"
                  value={payNowAmount}
                  onChange={e => setPayNowAmount(e.target.value)}
                  className="input-base text-lg font-semibold"
                  placeholder="0.00"
                  autoFocus
                />
              </div>

              {/* Payment source dropdown */}
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">
                  Pay From Account
                  {!payNowSourceId && <span className="text-amber-500 ml-1 font-normal">— select to update source balance</span>}
                </label>
                {sourceAccounts.length === 0 ? (
                  <div className="input-base text-slate-500 text-xs">
                    No asset accounts found — add a checking or savings account first
                  </div>
                ) : (
                  <select
                    value={payNowSourceId}
                    onChange={e => setPayNowSourceId(e.target.value)}
                    className="input-base"
                  >
                    <option value="">— Select account (optional) —</option>
                    {sourceAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.nickname ?? a.institution_name}
                        {a.last_four ? ` ···${a.last_four}` : ''}
                        {' · '}
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(a.current_balance)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Payment Date</label>
                <input type="date" value={payNowDate} onChange={e => setPayNowDate(e.target.value)} className="input-base" />
              </div>

              {parseFloat(payNowAmount) > 0 && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{payNowAccount.nickname ?? payNowAccount.institution_name} balance</span>
                    <span className="text-red-400 font-semibold">{fmt(Math.abs(payNowAccount.current_balance))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">After payment</span>
                    <span className={`font-semibold ${Math.abs(payNowAccount.current_balance) - parseFloat(payNowAmount) <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {fmt(Math.max(0, Math.abs(payNowAccount.current_balance) - parseFloat(payNowAmount)))}
                    </span>
                  </div>
                  {payNowSourceId && (() => {
                    const src = sourceAccounts.find(a => a.id === payNowSourceId)
                    if (!src) return null
                    const afterSrc = src.current_balance - parseFloat(payNowAmount)
                    return (
                      <>
                        <div className="border-t border-slate-700 pt-1.5 flex justify-between">
                          <span className="text-slate-500">{src.nickname ?? src.institution_name} balance</span>
                          <span className="text-emerald-400 font-semibold">{fmt(src.current_balance)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">After deduction</span>
                          <span className={`font-semibold ${afterSrc >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                            {fmt(afterSrc)}
                          </span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {payNowError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{payNowError}</p>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={confirmPayNow} disabled={payingNow || !payNowAmount}
                className="btn-primary flex-1 justify-center flex items-center gap-2">
                {payingNow
                  ? <><Loader2 size={14} className="animate-spin" /> Processing…</>
                  : <><CheckCircle2 size={14} /> Confirm Payment</>}
              </button>
              <button onClick={() => setPayNowAccount(null)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
