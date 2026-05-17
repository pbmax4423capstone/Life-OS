import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Pencil, CreditCard, Loader2, ScanLine, Upload } from 'lucide-react'
import { supabase, type FinancialAccount } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { recognizeImage } from '@/lib/imageRecognition'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const ACCOUNT_TYPES = ['Checking', 'Savings', 'Credit Card', 'Mortgage', 'Auto Loan',
  'Student Loan', 'Investment', 'Retirement', 'CD', 'Other']
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function typeBadge(t: string) {
  if (['checking', 'savings', 'cd'].includes(t)) return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
  if (t === 'credit_card') return 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
  if (['mortgage', 'auto_loan', 'student_loan', 'personal_loan'].includes(t)) return 'bg-red-500/15 text-red-400 border border-red-500/25'
  if (['investment', 'retirement'].includes(t)) return 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25'
  return 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
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
  nickname: '', account_type: 'Checking', institution_name: '',
  last_four: '', current_balance: '', interest_rate: '', credit_limit: '',
  rewards_balance: '', color: COLORS[0],
}

export default function AccountsPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [tab, setTab] = useState('All')
  const [form, setForm] = useState(BLANK_FORM)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase.from('financial_accounts').select('*')
      .eq('owner_id', user.id).is('deleted_at', null).order('sort_order')
      .then(({ data }) => { setAccounts(data ?? []); setLoading(false) })
  }, [user])

  // ── AI scan: process image → pre-fill form ────────────────
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
        institution_name: String(f.institution ?? ''),
        nickname: '',
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

  // Paste inside the modal's paste zone (stop propagation so global handler doesn't fire)
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

  // ── Account CRUD ──────────────────────────────────────────
  const tabs = ['All', 'Assets', 'Debt', 'Investments']
  const filtered = accounts.filter(a => {
    if (tab === 'Assets') return ['checking', 'savings', 'cd'].includes(a.account_type)
    if (tab === 'Debt') return ['credit_card', 'mortgage', 'auto_loan', 'student_loan'].includes(a.account_type)
    if (tab === 'Investments') return ['investment', 'retirement'].includes(a.account_type)
    return true
  })

  const DEBT_TYPES = ['credit_card', 'mortgage', 'auto_loan', 'student_loan', 'personal_loan']
  const ASSET_TYPES = ['checking', 'savings', 'cd', 'investment', 'retirement']
  const totalAssets = accounts.filter(a => ASSET_TYPES.includes(a.account_type)).reduce((s, a) => s + a.current_balance, 0)
  const totalDebt = accounts.filter(a => DEBT_TYPES.includes(a.account_type)).reduce((s, a) => s + a.current_balance, 0)
  const netWorth = totalAssets - totalDebt

  const openEdit = (a: FinancialAccount) => {
    setEditingId(a.id)
    setForm({
      nickname: a.nickname ?? '',
      account_type: a.account_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      institution_name: a.institution_name,
      last_four: a.last_four ?? '',
      current_balance: String(a.current_balance),
      interest_rate: a.interest_rate != null ? String(a.interest_rate) : '',
      credit_limit: a.credit_limit != null ? String(a.credit_limit) : '',
      rewards_balance: a.rewards_balance > 0 ? String(a.rewards_balance) : '',
      color: a.color,
    })
    setScanError(null)
    setShowAdd(true)
  }

  const save = async () => {
    if (!user || !form.institution_name) return
    setSaving(true)
    const typeKey = form.account_type.toLowerCase().replace(/ /g, '_')
    const payload = {
      account_type: typeKey,
      institution_name: form.institution_name,
      nickname: form.nickname || null,
      last_four: form.last_four || null,
      current_balance: parseFloat(form.current_balance) || 0,
      interest_rate: parseFloat(form.interest_rate) || null,
      credit_limit: parseFloat(form.credit_limit) || null,
      rewards_balance: parseFloat(form.rewards_balance) || 0,
      color: form.color,
    }
    if (editingId) {
      const { data, error } = await supabase.from('financial_accounts').update(payload).eq('id', editingId).select('*').single()
      if (!error && data) setAccounts(p => p.map(a => a.id === editingId ? data : a))
    } else {
      const { data, error } = await supabase.from('financial_accounts').insert({
        owner_id: user.id, ...payload,
        status: 'active', sort_order: accounts.length,
        rewards_unit: 'points', rewards_cpp: 0.01, icon: '🏦',
      }).select('*').single()
      if (!error && data) setAccounts(p => [...p, data])
    }
    setSaving(false)
    setShowAdd(false)
    setEditingId(null)
    setForm(BLANK_FORM)
  }

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
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileInput} />

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
          <button onClick={() => { setForm(BLANK_FORM); setEditingId(null); setScanError(null); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Account
          </button>
        </div>
      </div>

      {scanError && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 flex items-center gap-2">
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
            <button onClick={() => { setForm(BLANK_FORM); setShowAdd(true) }} className="btn-primary flex items-center gap-2">
              <Plus size={14} /> Add Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Account', 'Type', 'Balance', 'Rate', 'Rewards', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(a => (
                <tr key={a.id} onClick={() => openEdit(a)} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors last:border-0 cursor-pointer">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                      <div>
                        <div className="font-medium text-slate-200">{a.nickname ?? a.institution_name}</div>
                        <div className="text-xs text-slate-500">{a.institution_name}{a.last_four ? ` ···${a.last_four}` : ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBadge(a.account_type)}`}>
                      {a.account_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className={`font-semibold ${a.current_balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmt(Math.abs(a.current_balance))}
                    </div>
                    {a.credit_limit && <div className="text-xs text-slate-500">Limit: {fmt(a.credit_limit)}</div>}
                  </td>
                  <td className="px-5 py-3 text-slate-300">{a.interest_rate ? `${a.interest_rate}%` : '—'}</td>
                  <td className="px-5 py-3 text-slate-300">{a.rewards_balance > 0 ? `${a.rewards_balance.toLocaleString()} pts` : '—'}</td>
                  <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(a)} className="text-slate-600 hover:text-brand-400 transition-colors p-1">
                        <Pencil size={17} />
                      </button>
                      <button onClick={() => del(a.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">

            <h3 className="text-lg font-bold text-slate-100 mb-4">
              {editingId ? 'Edit Account' : form.institution_name ? 'Review Scanned Account' : 'Add Account'}
            </h3>

            {/* ── Paste / drop zone — hidden when editing an existing account ── */}
            {!editingId && <div
              className={`mb-5 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all group
                ${scanning
                  ? 'border-brand-500/60 bg-brand-500/5'
                  : 'border-slate-700 hover:border-brand-500/50 hover:bg-brand-500/5'}`}
              onClick={() => !scanning && fileInputRef.current?.click()}
              onPaste={handleModalPaste}
              // Make focusable so keyboard paste lands here
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
                  <p className="text-xs text-slate-600">
                    Bank statement · Credit card statement · Any account summary
                  </p>
                  <p className="text-xs text-slate-700 mt-1">
                    Ctrl+V / ⌘+V while focused here · or click to browse
                  </p>
                </>
              )}
            </div>}

            {scanError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                {scanError}
              </p>
            )}

            {/* ── Form fields ── */}
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
              <button onClick={() => { setShowAdd(false); setEditingId(null); setScanError(null) }} className="btn-ghost">Cancel</button>
            </div>

            {/* Re-scan shortcut inside modal — only when adding */}
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
