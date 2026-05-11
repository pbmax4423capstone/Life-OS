import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { redeemInviteCode } from '@/lib/inviteService'

export default function AuthPage() {
  const { session, signIn, signUp } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [invitePlan, setInvitePlan] = useState<string | null>(null)
  const [validatingInvite, setValidatingInvite] = useState(false)

  const inviteCode = useMemo(
    () => searchParams.get('code')?.trim().toUpperCase() ?? '',
    [searchParams]
  )

  if (session) return <Navigate to="/" replace />

  useEffect(() => {
    if (!inviteCode) {
      setInviteError(null)
      setInvitePlan(null)
      return
    }

    setMode('signup')
    setValidatingInvite(true)
    redeemInviteCode(inviteCode)
      .then((res) => {
        if (res.valid) {
          setInvitePlan(res.planGrant ?? null)
          setInviteError(null)
        } else {
          setInvitePlan(null)
          setInviteError(res.error ?? 'Invalid invite code')
        }
      })
      .catch(() => setInviteError('Unable to validate invite code'))
      .finally(() => setValidatingInvite(false))
  }, [inviteCode])

  const handleSubmit = async () => {
    setError(null)
    setSuccess(null)
    setLoading(true)
    if (mode === 'signin') {
      const { error } = await signIn(email, password)
      if (error) setError(error)
    } else {
      if (inviteCode && (validatingInvite || inviteError)) {
        setError(inviteError ?? 'Invite code validation failed')
        setLoading(false)
        return
      }

      const { error } = await signUp(email, password, name, {
        code: inviteCode || undefined,
        planGrant: invitePlan ?? undefined,
      })
      if (error) setError(error)
      else setSuccess('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-brand-900/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-purple-900/15 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 text-white text-2xl font-black mb-4 shadow-lg shadow-brand-900/50">
            L
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Life OS</h1>
          <p className="text-sm text-slate-400 mt-1">Your personal command center</p>
        </div>

        {/* Card */}
        <div className="card p-6 space-y-4">
          {inviteCode && (
            <div className={`text-xs rounded-lg px-3 py-2 border ${
              inviteError
                ? 'text-red-400 bg-red-500/10 border-red-500/20'
                : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
            }`}>
              {validatingInvite
                ? `Validating invite code ${inviteCode}…`
                : inviteError
                  ? inviteError
                  : `Invite code ${inviteCode} accepted${invitePlan ? ` · plan: ${invitePlan}` : ''}`}
            </div>
          )}

          {/* Tabs */}
          <div className="flex bg-slate-900 rounded-lg p-1">
            {(['signin', 'signup'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null) }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all ${mode === m ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {mode === 'signup' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-slate-400 uppercase tracking-wide font-medium">Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" className="input-base" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400 uppercase tracking-wide font-medium">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="input-base" />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400 uppercase tracking-wide font-medium">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" className="input-base"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error.includes('Invalid API key') || error.includes('invalid_api_key')
                ? 'Configuration error: the API key is invalid. Please contact support or check Vercel → Environment Variables → VITE_SUPABASE_ANON_KEY.'
                : error}
            </p>
          )}
          {success && <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{success}</p>}

          <button onClick={handleSubmit} disabled={loading}
            className="btn-primary w-full justify-center py-2.5">
            {loading ? <Loader2 size={16} className="animate-spin" /> : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Secured with Supabase Auth · End-to-end RLS
        </p>
      </div>
    </div>
  )
}
