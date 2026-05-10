import { useState, useEffect } from 'react'
import {
  Copy, Check, Plus, Mail, Link2,
  Users, Trash2, Loader2, Send, ChevronDown, ChevronUp
} from 'lucide-react'
import {
  createInviteCode, getMyInviteCodes, deactivateCode,
  sendEmailInvitation, getSentInvitations,
  type InviteCode, type EmailInvitation
} from '@/lib/inviteService'

export function InvitePanel() {
  const [tab, setTab] = useState<'codes' | 'email'>('codes')
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [invitations, setInvitations] = useState<EmailInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  // New code form
  const [maxUses, setMaxUses] = useState(1)
  const [codeNote, setCodeNote] = useState('')
  const [generating, setGenerating] = useState(false)

  // Email invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNote, setInviteNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [showEmailForm, setShowEmailForm] = useState(false)

  useEffect(() => {
    Promise.all([getMyInviteCodes(), getSentInvitations()])
      .then(([c, i]) => { setCodes(c); setInvitations(i) })
      .finally(() => setLoading(false))
  }, [])

  const handleGenerateCode = async () => {
    setGenerating(true)
    try {
      const code = await createInviteCode({ maxUses, note: codeNote || undefined })
      setCodes(prev => [code, ...prev])
      setCodeNote('')
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleDeactivate = async (id: string) => {
    await deactivateCode(id)
    setCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: false } : c))
  }

  const handleSendInvite = async () => {
    if (!inviteEmail) return
    setSending(true)
    setSendResult(null)
    setSendError(null)
    try {
      const result = await sendEmailInvitation({ email: inviteEmail, personalNote: inviteNote })
      if (result.success) {
        setSendResult(`Invitation sent to ${inviteEmail}`)
        setInviteEmail('')
        setInviteNote('')
        setShowEmailForm(false)
        const updated = await getSentInvitations()
        setInvitations(updated)
      } else {
        setSendError(result.error ?? 'Failed to send')
      }
    } finally {
      setSending(false)
    }
  }

  const appUrl = import.meta.env.VITE_APP_URL ?? window.location.origin

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
          <Users size={16} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Beta Invitations</h3>
          <p className="text-xs text-slate-400">Invite friends & family to Life OS</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(['codes', 'email'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-200 bg-slate-800'}`}>
            {t === 'codes' ? <><Link2 size={11} /> Codes</> : <><Mail size={11} /> Email Invites</>}
          </button>
        ))}
      </div>

      {/* ── Invite Codes Tab ─────────────────────────────── */}
      {tab === 'codes' && (
        <div className="space-y-3">
          {/* Generate new code */}
          <div className="bg-slate-900/60 rounded-xl p-3 space-y-2.5">
            <p className="text-xs font-medium text-slate-300">Generate New Code</p>
            <div className="flex gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-slate-500">Max uses</label>
                <select
                  value={maxUses}
                  onChange={e => setMaxUses(Number(e.target.value))}
                  className="input-base text-xs py-1.5"
                >
                  {[1, 2, 5, 10, 25, 50].map(n => (
                    <option key={n} value={n}>{n} use{n !== 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-xs text-slate-500">Note (optional)</label>
                <input
                  value={codeNote}
                  onChange={e => setCodeNote(e.target.value)}
                  placeholder="e.g. family group"
                  className="input-base text-xs py-1.5"
                />
              </div>
            </div>
            <button onClick={handleGenerateCode} disabled={generating} className="btn-primary text-xs w-full justify-center">
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Generate Code
            </button>
          </div>

          {/* Code list */}
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
          ) : codes.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3">No codes yet — generate your first one above</p>
          ) : (
            <div className="space-y-2">
              {codes.map(code => (
                <div key={code.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${code.is_active ? 'bg-slate-800/60 border-slate-700/50' : 'bg-slate-900/30 border-slate-800/30 opacity-50'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-mono font-semibold text-brand-400 tracking-wider">{code.code}</code>
                      {!code.is_active && <span className="badge bg-slate-700 text-slate-400 border-slate-600">inactive</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-500">{code.uses_count}/{code.max_uses} uses</span>
                      {code.note && <span className="text-xs text-slate-600">· {code.note}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                    <button
                      onClick={() => handleCopy(code.code, code.id)}
                      className="btn-ghost p-1.5 text-xs"
                      title="Copy code"
                    >
                      {copied === code.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                    <button
                      onClick={() => handleCopy(`${appUrl}/join?code=${code.code}`, `link-${code.id}`)}
                      className="btn-ghost p-1.5 text-xs"
                      title="Copy invite link"
                    >
                      {copied === `link-${code.id}` ? <Check size={13} className="text-emerald-400" /> : <Link2 size={13} />}
                    </button>
                    {code.is_active && (
                      <button onClick={() => handleDeactivate(code.id)} className="btn-ghost p-1.5 text-xs text-red-400 hover:text-red-300">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Email Invites Tab ────────────────────────────── */}
      {tab === 'email' && (
        <div className="space-y-3">
          {sendResult && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <Check size={12} /> {sendResult}
            </div>
          )}

          {/* Compose form toggle */}
          <button
            onClick={() => setShowEmailForm(v => !v)}
            className="w-full flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all text-left"
          >
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Send size={14} className="text-brand-400" />
              Send a new invitation
            </div>
            {showEmailForm ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
          </button>

          {showEmailForm && (
            <div className="bg-slate-900/60 rounded-xl p-3 space-y-2.5 border border-slate-700/30">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="input-base text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Personal note (optional)</label>
                <textarea
                  value={inviteNote}
                  onChange={e => setInviteNote(e.target.value)}
                  placeholder="Hey! I've been using this app to manage all my finances…"
                  rows={2}
                  className="input-base text-sm resize-none"
                />
              </div>
              {sendError && <p className="text-xs text-red-400">{sendError}</p>}
              <button
                onClick={handleSendInvite}
                disabled={sending || !inviteEmail}
                className="btn-primary text-xs w-full justify-center"
              >
                {sending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                Send Invitation
              </button>
            </div>
          )}

          {/* Sent invitations */}
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-slate-600" /></div>
          ) : invitations.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3">No email invitations sent yet</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400">Sent Invitations</p>
              {invitations.map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/30">
                  <div>
                    <p className="text-xs font-medium text-slate-200">{inv.email}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sent {new Date(inv.sent_at ?? inv.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`badge ${
                    inv.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                    inv.status === 'expired' ? 'bg-slate-700 text-slate-400 border-slate-600' :
                    'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {inv.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
