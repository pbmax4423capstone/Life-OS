import { useState, useEffect } from 'react'
import { BarChart3, Loader2 } from 'lucide-react'
import { supabase, type FinancialAccount, type Transaction } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const CATEGORY_COLORS: Record<string, string> = {
  housing: '#6366f1', mortgage: '#6366f1', rent: '#6366f1',
  transportation: '#a78bfa', auto: '#a78bfa',
  food: '#34d399', dining: '#34d399', groceries: '#34d399',
  healthcare: '#fbbf24', health: '#fbbf24', medical: '#fbbf24',
  entertainment: '#f87171',
  utilities: '#fb923c',
  insurance: '#38bdf8',
  subscriptions: '#e879f9',
  other: '#6b7280',
}

export default function AnalyticsPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      supabase.from('financial_accounts').select('*').eq('owner_id', user.id).is('deleted_at', null),
      supabase.from('transactions').select('*').eq('owner_id', user.id).is('deleted_at', null)
        .gte('transaction_date', new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0])
        .order('transaction_date', { ascending: false }),
    ]).then(([{ data: accs }, { data: txns }]) => {
      setAccounts(accs ?? [])
      setTransactions(txns ?? [])
      setLoading(false)
    })
  }, [user])

  const expenses = transactions.filter(t => t.amount < 0)
  const income = transactions.filter(t => t.amount > 0)
  const totalExpenses = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalIncome = income.reduce((s, t) => s + t.amount, 0)

  const catMap = expenses.reduce<Record<string, number>>((acc, t) => {
    const cat = (t.category ?? 'other').toLowerCase()
    acc[cat] = (acc[cat] ?? 0) + Math.abs(t.amount)
    return acc
  }, {})
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, amt]) => ({
      cat: cat.charAt(0).toUpperCase() + cat.slice(1),
      amount: amt,
      pct: totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0,
      color: CATEGORY_COLORS[cat] ?? '#6b7280',
    }))

  const creditCards = accounts.filter(a => a.account_type === 'credit_card' && a.current_balance < 0)

  const months = [...Array(7)].map((_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (6 - i))
    return d.toLocaleString('en-US', { month: 'short' })
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-brand-500" size={32} />
    </div>
  )

  const hasData = transactions.length > 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
        <p className="text-sm text-slate-400 mt-0.5">Last 90 days · {transactions.length} transactions</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Income', value: fmt(totalIncome), color: 'text-emerald-400' },
          { label: 'Total Expenses', value: fmt(totalExpenses), color: 'text-red-400' },
          { label: 'Net Cash Flow', value: fmt(totalIncome - totalExpenses), color: totalIncome - totalExpenses >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Transactions', value: String(transactions.length), color: 'text-brand-400' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="card p-12 text-center">
          <BarChart3 size={40} className="text-slate-700 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-300">No transaction data yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            Paste a bank or credit card statement anywhere in the app to import transactions and see analytics here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-slate-100 mb-4">Spending by Category</h2>
            {topCats.length === 0 ? (
              <p className="text-sm text-slate-500">No expense categories found</p>
            ) : (
              <div className="space-y-3">
                {topCats.map(s => (
                  <div key={s.cat}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        {s.cat}
                      </span>
                      <span className="text-sm font-semibold">{fmt(s.amount)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold text-slate-100 mb-4">Recent Months</h2>
            <div className="flex items-end gap-2 h-36">
              {months.map(m => (
                <div key={m} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-brand-600/40 rounded-t" style={{ height: `${Math.random() * 80 + 20}px` }} />
                  <span className="text-xs text-slate-500">{m}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-2">Monthly expense trend — add transactions to see real data</p>
          </div>
        </div>
      )}

      {creditCards.length > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Credit Card Cost of Credit</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Card', 'Balance', 'APR', 'Monthly Interest', 'YTD Interest', 'Rewards'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-4 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {creditCards.map(a => {
                  const monthly = (Math.abs(a.current_balance) * ((a.interest_rate ?? 0) / 100)) / 12
                  return (
                    <tr key={a.id} className="border-b border-slate-800/50 last:border-0">
                      <td className="px-4 py-2 font-medium">{a.nickname ?? a.institution_name}</td>
                      <td className="px-4 py-2 text-red-400">{fmtD(Math.abs(a.current_balance))}</td>
                      <td className="px-4 py-2">{a.interest_rate != null ? `${a.interest_rate}%` : '—'}</td>
                      <td className="px-4 py-2 text-red-400">{fmtD(monthly)}</td>
                      <td className="px-4 py-2 text-red-400">{fmtD(monthly * (new Date().getMonth() + 1))}</td>
                      <td className="px-4 py-2 text-emerald-400">{a.rewards_balance > 0 ? `${a.rewards_balance.toLocaleString()} pts` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
