import { useState } from 'react'
import { Target } from 'lucide-react'

function ProgressBar({ value, max, color = '#6366f1' }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100))
  return (
    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

const SCORE_RANGES = [
  { min: 300, max: 579, label: 'Poor', color: '#ef4444' },
  { min: 580, max: 669, label: 'Fair', color: '#f97316' },
  { min: 670, max: 739, label: 'Good', color: '#fbbf24' },
  { min: 740, max: 799, label: 'Very Good', color: '#34d399' },
  { min: 800, max: 850, label: 'Exceptional', color: '#6366f1' },
]

function getRange(score: number) {
  return SCORE_RANGES.find(r => score >= r.min && score <= r.max) ?? SCORE_RANGES[0]
}

export default function CreditPage() {
  const [score, setScore] = useState(728)
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('728')

  const range = getRange(score)
  const circumference = 2 * Math.PI * 54
  const pct = (score - 300) / (850 - 300)
  const offset = circumference - pct * circumference

  const saveScore = () => {
    const n = parseInt(inputVal)
    if (n >= 300 && n <= 850) setScore(n)
    setEditing(false)
  }

  const factors = [
    { name: 'Payment History', impact: 'High', rating: 'On Time', pct: score >= 750 ? 95 : score >= 670 ? 80 : 60, color: '#34d399' },
    { name: 'Credit Utilization', impact: 'High', rating: 'Good', pct: Math.min(95, Math.round(((score - 300) / 550) * 80 + 15)), color: '#6366f1' },
    { name: 'Length of History', impact: 'Medium', rating: 'Fair', pct: Math.min(90, Math.round(((score - 300) / 550) * 70 + 20)), color: '#fbbf24' },
    { name: 'Credit Mix', impact: 'Low', rating: 'Good', pct: Math.min(85, Math.round(((score - 300) / 550) * 60 + 25)), color: '#a78bfa' },
    { name: 'New Credit', impact: 'Low', rating: 'Good', pct: Math.min(95, Math.round(((score - 300) / 550) * 65 + 30)), color: '#34d399' },
  ]

  const tips = [
    { tip: 'Keep credit utilization below 10% on each card for maximum score impact', impact: '+15–25 pts', effort: 'Medium' },
    { tip: 'Avoid opening new credit lines for 6+ months — hard inquiries temporarily reduce your score', impact: '+8–12 pts', effort: 'Easy' },
    { tip: 'Request a credit limit increase on existing cards (no hard pull required on most issuers)', impact: '+5–10 pts', effort: 'Easy' },
    { tip: 'Become an authorized user on a family member\'s long-standing account to build history', impact: '+10–40 pts', effort: 'Easy' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Credit Score</h1>
          <p className="text-sm text-slate-400 mt-0.5">Track and improve your credit health</p>
        </div>
        <button onClick={() => { setInputVal(String(score)); setEditing(true) }} className="btn-ghost text-sm">
          Update Score
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-8 flex flex-col items-center">
          <div className="relative">
            <svg width={160} height={160} viewBox="0 0 130 130">
              <circle cx={65} cy={65} r={54} fill="none" stroke="var(--color-slate-800, #1e293b)" strokeWidth={10} />
              <circle cx={65} cy={65} r={54} fill="none" stroke={range.color} strokeWidth={10}
                strokeDasharray={circumference} strokeDashoffset={offset}
                strokeLinecap="round" transform="rotate(-90 65 65)"
                style={{ transition: 'stroke-dashoffset 1s ease' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-4xl font-bold text-slate-100">{score}</div>
              <div className="text-sm font-semibold mt-0.5" style={{ color: range.color }}>{range.label}</div>
              <div className="text-xs text-slate-500 mt-1">Equifax</div>
            </div>
          </div>
          <div className="flex gap-3 mt-6 flex-wrap justify-center">
            {SCORE_RANGES.map(r => (
              <div key={r.label} className="text-center">
                <div className="text-xs font-semibold" style={{ color: score >= r.min ? r.color : '#6b7280' }}>{r.min}</div>
                <div className="text-xs text-slate-500">{r.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-base font-semibold text-slate-100 mb-4">Score Factors</h2>
          <div className="space-y-4">
            {factors.map(f => (
              <div key={f.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-200">{f.name}</span>
                  <div className="flex gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/50">{f.impact} Impact</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">{f.rating}</span>
                  </div>
                </div>
                <ProgressBar value={f.pct} max={100} color={f.color} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-100 mb-4">Improvement Recommendations</h2>
        <div className="space-y-4">
          {tips.map((t, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div>
                <div className="text-sm text-slate-300">{t.tip}</div>
                <div className="flex gap-2 mt-1.5">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">{t.impact}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-400 border border-slate-600/50">{t.effort} effort</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <Target size={20} className="text-brand-400" />
              <h3 className="text-lg font-bold text-slate-100">Update Credit Score</h3>
            </div>
            <label className="text-xs text-slate-400 font-medium mb-1.5 block">Score (300–850)</label>
            <input type="number" min={300} max={850} value={inputVal}
              onChange={e => setInputVal(e.target.value)} className="input-base text-2xl font-bold text-center" />
            <div className="flex gap-3 mt-5">
              <button onClick={saveScore} className="btn-primary flex-1 justify-center">Save</button>
              <button onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
