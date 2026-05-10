import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard, CreditCard, Plane, Heart,
  Briefcase, Mail, Star, Shield, ArrowRight,
  Check, Sparkles, Users
} from 'lucide-react'

const FEATURES = [
  { icon: CreditCard, title: 'Finance Hub',      desc: 'Track all accounts, payments, rewards. Import statements with AI.' },
  { icon: Mail,       title: 'Mail Preview',     desc: 'USPS Informed Delivery — see your mail before it arrives.' },
  { icon: Plane,      title: 'Travel & Miles',   desc: 'Multi-airline miles, flights for your whole family.' },
  { icon: Heart,      title: 'Health',           desc: 'Appointments, insurance claims, prescriptions in one place.' },
  { icon: Briefcase,  title: 'Career',           desc: 'Job tracker, AI resume customizer, certification goals.' },
  { icon: Star,       title: 'Rewards',          desc: 'Points valuation, redemption tracking across all cards.' },
  { icon: Sparkles,   title: 'AI-Powered',       desc: 'Paste any image — statements, boarding passes, insurance cards — and AI adds it instantly.' },
  { icon: Shield,     title: 'Secure by Design', desc: 'Row-level security, encrypted at rest, audit log on every change.' },
]

const PLANS = [
  {
    id: 'free', name: 'Free', price: '$0', period: 'forever',
    features: ['2 accounts', 'Basic tracking', 'Payment scheduling'],
    cta: 'Get Started', highlight: false,
  },
  {
    id: 'beta', name: 'Beta', price: '$0', period: 'invite only',
    features: ['Everything in Pro', 'Free for beta testers', 'Direct feedback line', 'Shape the product'],
    cta: 'Request Invite', highlight: true,
  },
  {
    id: 'pro', name: 'Pro', price: '$12', period: 'per month',
    features: ['Unlimited accounts', 'AI document scanning', 'Gmail integration', 'All life domains'],
    cta: 'Coming Soon', highlight: false,
  },
]

export default function LandingPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [useCase, setUseCase] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState('')

  const handleWaitlist = async () => {
    if (!email) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase
      .from('waitlist')
      .insert({ email, full_name: name || null, use_case: useCase || null })
    if (error) {
      setError(error.code === '23505' ? 'You\'re already on the list!' : error.message)
    } else {
      setSubmitted(true)
    }
    setSubmitting(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand-900/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/4 w-[400px] h-[400px] bg-purple-900/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/2 w-[500px] h-[400px] bg-brand-900/10 rounded-full blur-3xl" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-brand-900/50">L</div>
          <span className="font-bold text-slate-100 text-lg">Life OS</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-slate-400 hover:text-slate-200 transition-colors">Sign In</Link>
          <Link to="/auth" className="btn-primary text-sm py-2 px-4">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 text-center px-6 pt-16 pb-24 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/30 rounded-full px-4 py-1.5 text-sm text-brand-300 mb-8">
          <Sparkles size={13} /> Now in Beta — Invite Only
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-slate-100 leading-tight mb-6">
          Your entire life,<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-400">one command center</span>
        </h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Life OS connects your finances, health, travel, and career — powered by AI that reads your documents, scans your mail, and keeps you in control.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="#waitlist" className="btn-primary text-base py-3 px-8 justify-center">
            Join the Waitlist <ArrowRight size={16} />
          </a>
          <Link to="/auth" className="btn-ghost text-base py-3 px-8 border border-slate-700 justify-center">
            Sign In
          </Link>
        </div>
      </section>

      {/* Feature grid */}
      <section className="relative z-10 px-6 pb-24 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-100 text-center mb-3">Everything in one place</h2>
        <p className="text-slate-400 text-center mb-12">No more switching between ten apps for ten different parts of your life.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card p-5 hover:border-slate-600 transition-all group">
              <div className="p-2.5 rounded-xl bg-brand-500/15 text-brand-400 w-fit mb-4 group-hover:bg-brand-500/25 transition-colors">
                <Icon size={18} />
              </div>
              <h3 className="text-sm font-semibold text-slate-200 mb-1.5">{title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mail preview feature callout */}
      <section className="relative z-10 px-6 pb-24 max-w-4xl mx-auto">
        <div className="card p-8 border-brand-500/20 bg-gradient-to-br from-brand-900/20 to-slate-800/40">
          <div className="flex items-start gap-5">
            <div className="p-3 rounded-2xl bg-brand-500/20 text-brand-400 flex-shrink-0">
              <Mail size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-100 mb-2">See your mail before it arrives</h3>
              <p className="text-slate-400 leading-relaxed mb-4">
                Life OS connects to your Gmail and automatically pulls in your daily USPS Informed Delivery digest. Every morning, you get a notification with images of today's incoming mail — right on your dashboard. Flag important pieces so nothing gets missed.
              </p>
              <div className="flex flex-wrap gap-2">
                {['Daily auto-sync', 'Manual refresh', 'Flag for attention', 'Add notes', 'Review history'].map(f => (
                  <span key={f} className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
                    <Check size={11} /> {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative z-10 px-6 pb-24 max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-slate-100 text-center mb-3">Simple pricing</h2>
        <p className="text-slate-400 text-center mb-12">Beta testers get full Pro access free. Forever grateful.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map(plan => (
            <div key={plan.id} className={`card p-6 flex flex-col ${plan.highlight ? 'border-brand-500/50 bg-gradient-to-b from-brand-900/20 to-slate-800/60 relative' : ''}`}>
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-600 text-white text-xs font-semibold px-4 py-1 rounded-full">
                  Beta Access
                </div>
              )}
              <div className="mb-5">
                <div className="text-sm font-semibold text-slate-400 mb-1">{plan.name}</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-100">{plan.price}</span>
                  <span className="text-sm text-slate-400">/{plan.period}</span>
                </div>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-300">
                    <Check size={14} className="text-emerald-400 flex-shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <a href="#waitlist" className={plan.highlight ? 'btn-primary justify-center' : 'btn-ghost border border-slate-700 justify-center'}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Waitlist / Invite section */}
      <section id="waitlist" className="relative z-10 px-6 pb-24 max-w-xl mx-auto">
        <div className="card p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-600 text-white mb-4 shadow-lg shadow-brand-900/50">
              <Users size={22} />
            </div>
            <h2 className="text-2xl font-bold text-slate-100">Join the Beta</h2>
            <p className="text-slate-400 text-sm mt-2">Have an invite code? Use it below. Otherwise join the waitlist.</p>
          </div>

          {/* Invite code fast path */}
          <div className="mb-5 p-4 bg-brand-500/10 border border-brand-500/20 rounded-xl space-y-2">
            <label className="text-xs font-semibold text-brand-300 uppercase tracking-wide">Have an invite code?</label>
            <div className="flex gap-2">
              <input
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                placeholder="LIFEOS-XXXX-XXXX"
                className="input-base font-mono text-sm flex-1"
              />
              <Link
                to={inviteCode ? `/auth?code=${inviteCode}` : '/auth'}
                className="btn-primary px-4 text-sm whitespace-nowrap"
              >
                Use Code
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">or join waitlist</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          {submitted ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="text-lg font-bold text-slate-100">You're on the list!</h3>
              <p className="text-sm text-slate-400 mt-2">We'll reach out with your invite soon.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="input-base text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Email *</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="input-base text-sm" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">What will you use it for?</label>
                <input value={useCase} onChange={e => setUseCase(e.target.value)} placeholder="Managing finances, tracking travel miles…" className="input-base text-sm" />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={handleWaitlist} disabled={submitting || !email} className="btn-primary w-full justify-center py-2.5">
                {submitting ? 'Joining…' : 'Join Waitlist'}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800 px-6 py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">L</div>
          <span className="font-semibold text-slate-300">Life OS</span>
        </div>
        <p className="text-xs text-slate-600">
          Built with security-first architecture · Supabase + Vercel · Powered by Claude AI
        </p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <Link to="/privacy" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Terms of Service</Link>
          <Link to="/auth" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Sign In</Link>
        </div>
      </footer>
    </div>
  )
}
