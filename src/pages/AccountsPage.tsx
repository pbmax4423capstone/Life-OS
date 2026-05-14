import { useState, useEffect } from 'react'
import { Plus, Trash2, CreditCard, Loader2 } from 'lucide-react'
import { supabase, type FinancialAccount } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

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

export default function AccountsPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('All')
  const [form, setForm] = useState({
    nickname: '', account_type: 'Checking', institution_name: '',
    last_four: '', current_balance: '', interest_rate: '', credit_limit: '',
    rewards_balance: '', color: COLORS[0],
  })

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase.from('financial_accounts').select('*')
      .eq('owner_id', user.id).is('deleted_at', null).order('sort_order')
      .then(({ data }) => { setAccounts(data ?? []); setLoading(false) })
  }, [user])

  const tabs = ['All', 'Assets', 'Debt', 'Investments']
  const filtered = accounts.filter(a => {
    if (tab === 'Assets') return ['checking', 'savings', 'cd'].includes(a.account_type)
    if (tab === 'Debt') return ['credit_card', 'mortgage', 'auto_loan', 'student_loan'].includes(a.account_type)
    if (tab === 'Investments') return ['investment', 'retirement'].includes(a.account_type)
    return true
  })

  const totalAssets = accounts.filter(a => a.current_balance > 0).reduce((s, a) => s + a.current_balance, 0)
  const totalDebt = accounts.filter(a => a.current_balance < 0).reduce((s, a) => s + Math.abs(a.current_balance), 0)
  const netWorth = totalAssets - totalDebt

  const add = async () => {
    if (!user || !form.institution_name) return
    setSaving(true)
    const typeKey = form.account_type.toLowerCase().replace(/ /g, '_')
    const { data, error } = await supabase.from('financial_accounts').insert({
      owner_id: user.id,
      account_type: typeKey,
      institution_name: form.institution_name,
      nickname: form.nickname || null,
      last_four: form.last_four || null,
      current_balance: parseFloat(form.current_balance) || 0,
      interest_rate: parseFloat(form.interest_rate) || null,
      credit_limit: parseFloat(form.credit_limit) || null,
      rewards_balance: parseFloat(form.rewards_balance) || 0,
      color: form.color,
      status: 'active', sort_order: accounts.length,
      rewards_unit: 'points', rewards_cpp: 0.01, icon: '🏦',
    }).select('*').single()
    if (!error && data) setAccounts(p => [...p, data])
    setSaving(false)
    setShowAdd(false)
    setForm({ nickname: '', account_type: 'Checking', institution_name: '', last_four: '', current_balance: '', interest_rate: '', credit_limit: '', rewards_balance: '', color: COLORS[0] })
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Accounts</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Net Worth: <span className={`font-semibold ${netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(netWorth)}</span>
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Account
        </button>
      </div>

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
          <p className="text-sm text-slate-500 mt-1">Add your first account to track balances and debt</p>
          <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 mx-auto flex items-center gap-2">
            <Plus size={14} /> Add Account
          </button>
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
                <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors last:border-0">
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
                  <td className="px-5 py-3">
                    <button onClick={() => del(a.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-5">Add Account</h3>
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
              <button onClick={add} disabled={saving || !form.institution_name} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Account'}
              </button>
              <button onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
