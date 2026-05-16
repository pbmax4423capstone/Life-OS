import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Wallet, Star } from 'lucide-react'
import { supabase, type FinancialAccount, type ScheduledPayment } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { MailWidget } from '@/components/mail/MailWidget'
import { InvitePanel } from '@/components/shared/InvitePanel'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtDec = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [payments, setPayments] = useState<ScheduledPayment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    const load = async () => {
      try {
        const [{ data: accs }, { data: pmts }] = await Promise.all([
          supabase.from('financial_accounts').select('*').eq('owner_id', user.id).is('deleted_at', null).order('sort_order'),
          supabase.from('scheduled_payments').select('*').eq('owner_id', user.id).is('deleted_at', null).order('next_due_date').limit(5),
        ])
        setAccounts(accs ?? [])
        setPayments(pmts ?? [])
      } catch {
        // Stay with empty arrays on error
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const assets = accounts.filter(a => a.current_balance > 0).reduce((s, a) => s + a.current_balance, 0)
  const debt = accounts.filter(a => a.current_balance < 0).reduce((s, a) => s + Math.abs(a.current_balance), 0)
  const netWorth = assets - debt
  const totalRewardsValue = accounts.reduce((s, a) => s + (a.rewards_balance * a.rewards_cpp / 100), 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Net Worth',    value: fmt(netWorth),        icon: Wallet,      color: '#10B981', glow: 'glow-green' },
          { label: 'Total Assets', value: fmt(assets),          icon: TrendingUp,  color: '#6366F1', glow: 'glow-indigo' },
          { label: 'Total Debt',   value: fmt(debt),            icon: TrendingDown,color: '#EF4444', glow: 'glow-red' },
          { label: 'Rewards',      value: fmt(totalRewardsValue),icon: Star,       color: '#F59E0B', glow: 'glow-amber' },
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
      {accounts.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-slate-400 mb-2">No accounts yet</p>
          <p className="text-sm text-slate-500">Paste a bank or credit card statement to get started ✦</p>
        </div>
      ) : (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Accounts</h2>
          <div className="space-y-3">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center gap-3">
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

      {/* Upcoming payments */}
      {payments.length > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Upcoming Payments</h2>
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                <div>
                  <div className="text-sm text-slate-200">{p.payee_name ?? 'Payment'}</div>
                  <div className="text-xs text-slate-500">Due {p.next_due_date}</div>
                </div>
                <div className="text-sm font-semibold text-slate-200">{fmtDec(p.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Right column widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        <MailWidget />
        <InvitePanel />
      </div>
    </div>
  )
}
