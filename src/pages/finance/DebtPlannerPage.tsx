import { useState, useEffect, useMemo } from 'react'
import {
  TrendingDown, Zap, Snowflake, Sliders, Sparkles,
  ChevronDown, ChevronUp, Loader2, Info, DollarSign
} from 'lucide-react'
import { supabase, type FinancialAccount } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  calcAvalanche, calcSnowball, calcCustom,
  buildDebtContext, calcMinPayment,
  type DebtAccount, type StrategyResult,
} from '@/lib/debtCalculator'
import { AiChat } from '@/components/chat/AiChat'

const DEBT_TYPES = ['credit_card', 'loan', 'bnpl', 'mortgage', 'heloc', 'student_loan', 'personal_loan', '401k_loan']

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const fmtDec = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

function toDebtAccount(a: FinancialAccount): DebtAccount {
  return {
    id: a.id,
    name: a.nickname ?? a.institution_name,
    balance: Math.abs(a.current_balance),
    interestRate: a.interest_rate ?? 0,
    minimumPayment: calcMinPayment(Math.abs(a.current_balance), a.interest_rate ?? 0),
    accountType: a.account_type,
  }
}

// ── Strategy card ─────────────────────────────────────────────
function StrategyCard({
  result, label, icon: Icon, color, selected, onSelect, highlight
}: {
  result: StrategyResult
  label: string
  icon: React.ElementType
  color: string
  selected: boolean
  onSelect: () => void
  highlight?: string
}) {
  return (
    <button
      onClick={onSelect}
      className={`card p-4 text-left transition-all w-full ${selected ? `ring-2 ring-offset-2 ring-offset-slate-950` : 'hover:border-slate-600'}`}
      style={selected ? { '--tw-ring-color': color } as React.CSSProperties : {}}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: color + '25', color }}>
            <Icon size={14} />
          </div>
          <span className="text-sm font-semibold text-slate-200">{label}</span>
        </div>
        {highlight && (
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: color + '20', color }}>
            {highlight}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-slate-500">Total Interest</div>
          <div className="text-base font-bold" style={{ color }}>{fmt(result.totalInterest)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Payoff Date</div>
          <div className="text-sm font-semibold text-slate-200">
            {result.payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Months</div>
          <div className="text-sm font-semibold text-slate-300">{result.totalMonths} mo</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Total Paid</div>
          <div className="text-sm font-semibold text-slate-300">{fmt(result.totalPaid)}</div>
        </div>
      </div>
    </button>
  )
}

// ── Payoff timeline bar ───────────────────────────────────────
function PayoffTimeline({ result }: { result: StrategyResult }) {
  const maxMonths = Math.max(...result.accounts.map(a => a.payoffMonth))
  const colors = ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6']

  return (
    <div className="space-y-2">
      {result.accounts
        .sort((a, b) => a.payoffMonth - b.payoffMonth)
        .map((acct, i) => (
          <div key={acct.accountId} className="flex items-center gap-3">
            <div className="w-32 text-xs text-slate-400 truncate text-right flex-shrink-0">{acct.name}</div>
            <div className="flex-1 h-5 bg-slate-800 rounded-full overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{
                  width: `${((acct.payoffMonth + 1) / (maxMonths + 1)) * 100}%`,
                  backgroundColor: colors[i % colors.length],
                }}
              >
                <span className="text-xs text-white font-medium whitespace-nowrap">
                  {acct.payoffDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                </span>
              </div>
            </div>
            <div className="w-20 text-xs text-right flex-shrink-0">
              <div className="text-slate-400">{fmt(acct.totalInterest)}</div>
              <div className="text-slate-600">interest</div>
            </div>
          </div>
        ))}
    </div>
  )
}

// ── Main debt planner page ─────────────────────────────────────
export default function DebtPlannerPage() {
  const { user } = useAuthStore()
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [extra, setExtra] = useState(0)
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball' | 'custom'>('avalanche')
  const [showChat, setShowChat] = useState(false)
  const [aiContext, setAiContext] = useState<string>('')
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('financial_accounts')
      .select('*')
      .eq('owner_id', user.id)
      .in('account_type', DEBT_TYPES)
      .lt('current_balance', 0)
      .is('deleted_at', null)
      .then(({ data }) => {
        setAccounts(data ?? [])
        setLoading(false)
      })
  }, [user])

  const debtAccounts = useMemo(() => accounts.map(toDebtAccount), [accounts])

  const avalanche = useMemo(() => calcAvalanche(debtAccounts, extra), [debtAccounts, extra])
  const snowball = useMemo(() => calcSnowball(debtAccounts, extra), [debtAccounts, extra])
  const avalancheNoExtra = useMemo(() => calcAvalanche(debtAccounts, 0), [debtAccounts])
  const active = strategy === 'avalanche' ? avalanche : strategy === 'snowball' ? snowball : avalanche

  const interestSaved = Math.max(0, snowball.totalInterest - avalanche.totalInterest)
  const monthsSaved = Math.max(0, snowball.totalMonths - avalanche.totalMonths)
  const extraVsNoExtraSaved = Math.max(0, avalancheNoExtra.totalInterest - avalanche.totalInterest)

  const handleAiAnalyze = () => {
    const ctx = buildDebtContext(debtAccounts, avalanche, snowball, extra)
    setAiContext(ctx)
    setAiAnalyzing(true)
    setShowChat(true)
    setAiAnalyzing(false)
  }

  const totalDebt = debtAccounts.reduce((s, a) => s + a.balance, 0)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-brand-500" />
    </div>
  )

  if (debtAccounts.length === 0) return (
    <div className="flex flex-col items-center justify-center h-64 text-center space-y-3">
      <div className="text-4xl">🎉</div>
      <h2 className="text-xl font-bold text-slate-200">No debt accounts found!</h2>
      <p className="text-sm text-slate-400">Add credit card or loan accounts to see your payoff plan.</p>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Debt Payoff Planner</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {debtAccounts.length} accounts · {fmt(totalDebt)} total debt
          </p>
        </div>
        <button
          onClick={handleAiAnalyze}
          disabled={aiAnalyzing}
          className="btn-primary"
        >
          {aiAnalyzing
            ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
            : <><Sparkles size={14} /> AI Recommend</>
          }
        </button>
      </div>

      {/* Summary banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Debt',       value: fmt(totalDebt),           color: '#EF4444' },
          { label: 'Avalanche Interest', value: fmt(avalanche.totalInterest), color: '#6366F1' },
          { label: 'Interest Savings', value: fmt(interestSaved),       color: '#10B981' },
          { label: 'Months Faster',    value: `${monthsSaved} mo`,      color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="text-xs text-slate-400 mb-1">{s.label}</div>
            <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Extra payment slider */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-brand-400" />
            <span className="text-sm font-semibold text-slate-200">Extra Monthly Payment</span>
          </div>
          <span className="text-lg font-bold text-brand-400">{fmt(extra)}/mo</span>
        </div>
        <input
          type="range" min={0} max={2000} step={25}
          value={extra}
          onChange={e => setExtra(Number(e.target.value))}
          className="w-full accent-brand-500 h-2"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>$0</span>
          <span>$500</span>
          <span>$1,000</span>
          <span>$1,500</span>
          <span>$2,000</span>
        </div>
        {extra > 0 && (
          <div className="mt-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            With ${extra}/mo extra: pay off {monthsSaved > 0 ? `${avalanche.totalMonths} months` : `by ${avalanche.payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`} and save {fmt(extraVsNoExtraSaved)} vs. no extra payment
          </div>
        )}
      </div>

      {/* Strategy comparison */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Choose Strategy</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StrategyCard
            result={avalanche}
            label="Avalanche"
            icon={Zap}
            color="#6366F1"
            selected={strategy === 'avalanche'}
            onSelect={() => setStrategy('avalanche')}
            highlight="Saves most interest"
          />
          <StrategyCard
            result={snowball}
            label="Snowball"
            icon={Snowflake}
            color="#10B981"
            selected={strategy === 'snowball'}
            onSelect={() => setStrategy('snowball')}
            highlight="Most motivating"
          />
        </div>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-800/40 border border-slate-700/30 rounded-xl p-3">
        <Info size={13} className="text-brand-400 mt-0.5 flex-shrink-0" />
        <div>
          <strong className="text-slate-300">Avalanche</strong> pays highest-interest debt first — mathematically optimal, saves the most money.{' '}
          <strong className="text-slate-300">Snowball</strong> pays smallest-balance debt first — builds momentum with quick wins.
          {interestSaved > 0 && <> Avalanche saves you <span className="text-emerald-400 font-semibold">{fmt(interestSaved)}</span> in this scenario.</>}
        </div>
      </div>

      {/* Payoff timeline */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-200">
            Payoff Timeline — {strategy.charAt(0).toUpperCase() + strategy.slice(1)}
          </h2>
          <button
            onClick={() => setShowSchedule(v => !v)}
            className="btn-ghost text-xs py-1 px-2"
          >
            {showSchedule ? <><ChevronUp size={12} /> Hide schedule</> : <><ChevronDown size={12} /> Full schedule</>}
          </button>
        </div>
        <PayoffTimeline result={active} />
      </div>

      {/* Per-account payoff schedule */}
      {showSchedule && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Payment Schedule (first 12 months)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left py-2 pr-4">Month</th>
                  {active.accounts.map(a => (
                    <th key={a.accountId} className="text-right py-2 px-2 whitespace-nowrap">{a.name.split(' ')[0]}</th>
                  ))}
                  <th className="text-right py-2 pl-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {active.monthlySummary.slice(0, 12).map(m => (
                  <tr key={m.month} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                    <td className="py-1.5 pr-4 text-slate-400">
                      {m.date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                    </td>
                    {active.accounts.map(a => {
                      const entry = a.schedule[m.month]
                      return (
                        <td key={a.accountId} className="text-right py-1.5 px-2 text-slate-300">
                          {entry ? fmtDec(entry.payment) : <span className="text-slate-700">paid off</span>}
                        </td>
                      )
                    })}
                    <td className="text-right py-1.5 pl-2 font-semibold text-slate-200">{fmtDec(m.totalPayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Chat panel */}
      {showChat && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-brand-400" />
              <span className="text-sm font-semibold text-slate-200">AI Debt Analysis</span>
            </div>
            <button onClick={() => setShowChat(false)} className="btn-ghost text-xs py-1 px-2">Hide</button>
          </div>
          <div className="h-[500px]">
            <AiChat
              initialContext="debt"
              embedded
              onAction={(action) => {
                if (action.type === 'schedule_payment') window.location.href = '/payments'
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
