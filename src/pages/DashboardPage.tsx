import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Wallet, Star, CalendarDays, Pencil, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase, type FinancialAccount, type ScheduledPayment } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { MailWidget } from '@/components/mail/MailWidget'
import { InvitePanel } from '@/components/shared/InvitePanel'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtDec = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

// ── Payday settings (localStorage) ───────────────────────────
interface PaydaySettings {
  frequency: 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly'
  next_payday: string    // YYYY-MM-DD anchor date
  paycheck_amount: string
}
const FREQ_DAYS: Record<string, number> = {
  weekly: 7, biweekly: 14, 'semi-monthly': 15, monthly: 30,
}
const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Biweekly', 'semi-monthly': 'Semi-Monthly', monthly: 'Monthly',
}

function loadPayday(): PaydaySettings | null {
  try { return JSON.parse(localStorage.getItem('life_os_payday') ?? 'null') } catch { return null }
}
function savePayday(s: PaydaySettings) {
  localStorage.setItem('life_os_payday', JSON.stringify(s))
}

/** Advance anchor date until it is >= today */
function nextPaydayFrom(anchor: string, freq: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(anchor + 'T00:00:00')
  const step = FREQ_DAYS[freq] ?? 14
  while (d < today) {
    if (freq === 'monthly') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + step)
  }
  return d.toISOString().split('T')[0]
}

// ── Payday Planner Card ───────────────────────────────────────
function PaydayPlanner({
  settings, onChange, billsBeforePayday, checkingAfterBills,
}: {
  settings: PaydaySettings | null
  onChange: (s: PaydaySettings) => void
  billsBeforePayday: ScheduledPayment[]
  checkingAfterBills: number
}) {
  const [editing, setEditing] = useState(!settings)
  const [form, setForm] = useState<PaydaySettings>(settings ?? {
    frequency: 'biweekly', next_payday: new Date().toISOString().split('T')[0], paycheck_amount: '',
  })

  const save = () => {
    onChange(form)
    setEditing(false)
  }

  const nextPayday = settings ? nextPaydayFrom(settings.next_payday, settings.frequency) : null
  const totalBills = billsBeforePayday.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-brand-500/20 text-brand-400">
            <CalendarDays size={16} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Payday Planner</h2>
            {settings && !editing && (
              <p className="text-xs text-slate-500">
                {FREQ_LABELS[settings.frequency]} · Next payday: <span className="text-emerald-400 font-medium">{nextPayday}</span>
              </p>
            )}
          </div>
        </div>
        {settings && !editing && (
          <button onClick={() => setEditing(true)} className="btn-ghost text-xs py-1 px-3 flex items-center gap-1.5">
            <Pencil size={12} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1.5 block">Pay Frequency</label>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value as PaydaySettings['frequency'] }))} className="input-base">
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly (every 2 weeks)</option>
                <option value="semi-monthly">Semi-Monthly (1st & 15th)</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium mb-1.5 block">Next / Most Recent Payday</label>
              <input type="date" value={form.next_payday}
                onChange={e => setForm(p => ({ ...p, next_payday: e.target.value }))} className="input-base" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 font-medium mb-1.5 block">Paycheck Amount (optional)</label>
            <input type="number" value={form.paycheck_amount}
              onChange={e => setForm(p => ({ ...p, paycheck_amount: e.target.value }))}
              className="input-base" placeholder="e.g. 2440" />
          </div>
          <div className="flex gap-3">
            <button onClick={save} className="btn-primary flex-1 justify-center">Save</button>
            {settings && <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Next Payday</div>
              <div className="text-sm font-bold text-emerald-400">{nextPayday}</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Bills Before Then</div>
              <div className="text-sm font-bold text-red-400">{fmtDec(totalBills)}</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Checking After Bills</div>
              <div className={`text-sm font-bold ${checkingAfterBills >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                {fmtDec(checkingAfterBills)}
              </div>
            </div>
          </div>

          {/* Bills due before payday */}
          {billsBeforePayday.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <CheckCircle2 size={16} />
              No scheduled payments due before your next payday — you're all clear!
            </div>
          ) : (
            <div>
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-2">
                Payments due before {nextPayday}
              </div>
              <div className="space-y-1.5">
                {billsBeforePayday.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${p.auto_pay ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <div>
                        <div className="text-sm font-medium text-slate-200">{p.payee_name ?? 'Payment'}</div>
                        <div className="text-xs text-slate-500">Due {p.next_due_date} · {p.auto_pay ? 'Auto-pay' : 'Manual'}</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-red-400">{fmtDec(p.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {settings?.paycheck_amount && parseFloat(settings.paycheck_amount) > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-500">Projected balance after payday + bills</span>
              <span className={`text-sm font-bold ${checkingAfterBills + parseFloat(settings.paycheck_amount) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtDec(checkingAfterBills + parseFloat(settings.paycheck_amount))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [payments, setPayments] = useState<ScheduledPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [paydaySettings, setPaydaySettings] = useState<PaydaySettings | null>(loadPayday)
  const [showAssetDrilldown, setShowAssetDrilldown] = useState(false)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    const load = async () => {
      try {
        const [{ data: accs }, { data: pmts }] = await Promise.all([
          supabase.from('financial_accounts').select('*').eq('owner_id', user.id).is('deleted_at', null).order('sort_order'),
          supabase.from('scheduled_payments').select('*').eq('owner_id', user.id).is('deleted_at', null).order('next_due_date'),
        ])
        setAccounts(accs ?? [])
        setPayments(pmts ?? [])
      } catch {
        // graceful empty state
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const handlePaydayChange = (s: PaydaySettings) => {
    setPaydaySettings(s)
    savePayday(s)
  }

  // ── Derived values ────────────────────────────────────────
  const assets = accounts.filter(a => a.current_balance > 0).reduce((s, a) => s + a.current_balance, 0)
  const debt = accounts.filter(a => a.current_balance < 0).reduce((s, a) => s + Math.abs(a.current_balance), 0)
  const netWorth = assets - debt
  const totalRewardsValue = accounts.reduce((s, a) => s + (a.rewards_balance * a.rewards_cpp / 100), 0)

  const checkingBalance = accounts
    .filter(a => a.account_type === 'checking' && a.current_balance > 0)
    .reduce((s, a) => s + a.current_balance, 0)

  // Bills due before next payday
  const nextPayday = paydaySettings ? nextPaydayFrom(paydaySettings.next_payday, paydaySettings.frequency) : null
  const billsBeforePayday = nextPayday
    ? payments.filter(p => p.next_due_date <= nextPayday)
    : []
  const totalBillsBeforePayday = billsBeforePayday.reduce((s, p) => s + p.amount, 0)
  const checkingAfterBills = checkingBalance - totalBillsBeforePayday

  // Checking accounts for the accounts list
  const checkingAccounts = accounts.filter(a => a.account_type === 'checking')

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats row — Total Assets card is clickable */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Clickable Total Assets card */}
        <button
          onClick={() => setShowAssetDrilldown(v => !v)}
          className={`card p-4 text-left transition-all hover:border-emerald-500/40 group ${showAssetDrilldown ? 'border-emerald-500/40 bg-emerald-500/5' : ''}`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-widest">Total Assets</span>
            <div className="flex items-center gap-1">
              <TrendingUp size={15} style={{ color: '#10B981' }} />
              {showAssetDrilldown
                ? <ChevronUp size={13} className="text-emerald-400" />
                : <ChevronDown size={13} className="text-slate-600 group-hover:text-emerald-400 transition-colors" />}
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-400">{fmt(assets)}</div>
          <div className="text-xs text-slate-500 mt-1">{accounts.filter(a => a.current_balance > 0).length} accounts · click to drill down</div>
        </button>

        {[
          { label: 'Net Worth',     value: fmt(netWorth),          icon: Wallet,      color: '#6366F1' },
          { label: 'Total Debt',    value: fmt(debt),              icon: TrendingDown, color: '#EF4444' },
          { label: 'Rewards Value', value: fmt(totalRewardsValue), icon: Star,        color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-widest">{s.label}</span>
              <s.icon size={15} style={{ color: s.color }} />
            </div>
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Asset drill-down ── */}
      {showAssetDrilldown && (
        <div className="card p-5 border-emerald-500/20 bg-emerald-500/5 animate-fade-in">
          <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide mb-4 flex items-center gap-2">
            <TrendingUp size={14} /> Asset Accounts
          </h2>
          {accounts.filter(a => a.current_balance > 0).length === 0 ? (
            <p className="text-sm text-slate-500">No asset accounts found.</p>
          ) : (
            <div className="space-y-3">
              {accounts.filter(a => a.current_balance > 0).map(a => {
                // Payments sourced from this account
                const accountPayments = payments.filter(p => p.from_account_id === a.id)
                const totalScheduled = accountPayments.reduce((s, p) => s + p.amount, 0)
                const afterPayments = a.current_balance - totalScheduled

                return (
                  <div key={a.id} className="flex items-center gap-4 p-3 rounded-xl bg-slate-900/60 border border-slate-800/60">
                    <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: a.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium text-slate-200 truncate">
                          {a.nickname ?? a.institution_name}
                        </span>
                        <span className="text-sm font-bold text-emerald-400 ml-2">{fmtDec(a.current_balance)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 capitalize">{a.account_type.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-slate-400">
                          After scheduled payments:
                          <span className={`font-semibold ml-1 ${afterPayments >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                            {fmtDec(afterPayments)}
                          </span>
                        </span>
                      </div>
                      {totalScheduled > 0 && (
                        <div className="mt-1.5">
                          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, (afterPayments / a.current_balance) * 100))}%` }} />
                          </div>
                          <div className="text-xs text-slate-600 mt-0.5">
                            {accountPayments.length} payment{accountPayments.length !== 1 ? 's' : ''} totaling {fmtDec(totalScheduled)} scheduled from this account
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
                <span className="text-xs text-slate-500">Total assets after all scheduled payments</span>
                <span className={`text-sm font-bold ${assets - payments.reduce((s, p) => s + p.amount, 0) >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                  {fmtDec(assets - payments.reduce((s, p) => s + p.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Checking after bills highlight */}
      {checkingAccounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {checkingAccounts.map(a => (
            <div key={a.id} className="card p-4 border-slate-700/80">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                  {a.nickname ?? a.institution_name} · Checking
                </span>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">Current balance</div>
                  <div className="text-lg font-bold text-emerald-400">{fmtDec(a.current_balance)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-0.5">After scheduled payments</div>
                  <div className={`text-lg font-bold ${a.current_balance - totalBillsBeforePayday >= 0 ? 'text-brand-400' : 'text-red-400'}`}>
                    {fmtDec(a.current_balance - totalBillsBeforePayday)}
                  </div>
                </div>
              </div>
              {totalBillsBeforePayday > 0 && (
                <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full"
                    style={{ width: `${Math.min(100, ((a.current_balance - totalBillsBeforePayday) / a.current_balance) * 100)}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Payday Planner */}
      <PaydayPlanner
        settings={paydaySettings}
        onChange={handlePaydayChange}
        billsBeforePayday={billsBeforePayday}
        checkingAfterBills={checkingAfterBills}
      />

      {/* Accounts list */}
      {accounts.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-slate-400 mb-2">No accounts yet</p>
          <p className="text-sm text-slate-500">Paste a bank or credit card statement to get started ✦</p>
        </div>
      ) : (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-4">All Accounts</h2>
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
                  {a.credit_limit && a.account_type !== 'buy_now_pay_later' && (
                    <div className="h-1 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min((Math.abs(a.current_balance) / a.credit_limit) * 100, 100)}%`,
                        backgroundColor: a.color,
                      }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All upcoming payments */}
      {payments.length > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-4">All Scheduled Payments</h2>
          <div className="space-y-2">
            {payments.map(p => {
              const isBeforePayday = nextPayday && p.next_due_date <= nextPayday
              return (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
                  <div className="flex items-center gap-3">
                    {isBeforePayday && (
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Due before payday" />
                    )}
                    <div>
                      <div className="text-sm text-slate-200">{p.payee_name ?? 'Payment'}</div>
                      <div className="text-xs text-slate-500">
                        Due {p.next_due_date} · <span className="capitalize">{p.frequency}</span>
                        {p.auto_pay && <span className="ml-1.5 text-xs text-emerald-400">· Auto-pay</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-slate-200">{fmtDec(p.amount)}</div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
            <span className="text-xs text-slate-500">Monthly obligations total</span>
            <span className="text-sm font-bold text-red-400">
              {fmtDec(payments.reduce((s, p) => s + p.amount, 0))}
            </span>
          </div>
        </div>
      )}

      {/* Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        <MailWidget />
        <InvitePanel />
      </div>
    </div>
  )
}
