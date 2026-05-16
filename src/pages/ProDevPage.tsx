import { useState, useEffect } from 'react'
import { Plus, Trash2, GraduationCap, Loader2, Sparkles, Pencil } from 'lucide-react'
import { supabase, type Certification } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { callAI } from '@/lib/chatService'

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
    </div>
  )
}

function AIStudyHelper() {
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<'explain' | 'quiz' | 'studyplan'>('explain')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const prompts: Record<string, string> = {
    explain: `Explain this certification topic clearly for exam prep: "${topic}". Include key concepts, common use cases, and 2–3 exam tips.`,
    quiz: `Create 5 multiple-choice practice questions about "${topic}" for certification prep. Format: question, 4 choices (A–D), correct answer + brief explanation.`,
    studyplan: `Create a focused 4-week study plan for "${topic}" certification. Include daily tasks, key resources, and weekly milestones.`,
  }

  const generate = async () => {
    if (!topic) return
    setLoading(true)
    setOutput('')
    setError(null)
    try {
      const text = await callAI(prompts[mode], 'You are an expert IT certification trainer and career coach.')
      setOutput(text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    }
    setLoading(false)
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-brand-400" />
        <h2 className="text-base font-semibold text-slate-100">AI Study Helper</h2>
      </div>

      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit mb-5">
        {([['explain', 'Explain Topic'], ['quiz', 'Practice Quiz'], ['studyplan', 'Study Plan']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setMode(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === v ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <label className="text-xs text-slate-400 font-medium mb-1.5 block">Topic or Certification</label>
        <input value={topic} onChange={e => setTopic(e.target.value)}
          className="input-base" placeholder="e.g. Salesforce Flow Builder, REST APIs, Governor Limits…"
          onKeyDown={e => e.key === 'Enter' && generate()} />
      </div>

      <button onClick={generate} disabled={loading || !topic} className="btn-primary flex items-center gap-2">
        {loading ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate</>}
      </button>

      {error && <p className="text-xs text-red-400 mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {output && (
        <div className="mt-4 bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  )
}

export default function ProDevPage() {
  const { user } = useAuthStore()
  const [certs, setCerts] = useState<Certification[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('Certifications')
  const [form, setForm] = useState({
    name: '', issuing_org: '', status: 'not_started', progress_pct: '',
    target_date: '', achieved_date: '', expiry_date: '',
  })

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase.from('certifications').select('*')
      .eq('owner_id', user.id).is('deleted_at', null).order('created_at', { ascending: false })
      .then(({ data }) => { setCerts(data ?? []); setLoading(false) })
  }, [user])

  const [editCert, setEditCert] = useState<Certification | null>(null)

  const openEditCert = (c: Certification) => {
    setForm({ name: c.name, issuing_org: c.issuing_org ?? '', status: c.status, progress_pct: String(c.progress_pct), target_date: c.target_date ?? '', achieved_date: c.achieved_date ?? '', expiry_date: c.expiry_date ?? '' })
    setEditCert(c)
    setShowAdd(true)
  }

  const add = async () => {
    if (!user || !form.name) return
    setSaving(true)
    if (editCert) {
      const { data } = await supabase.from('certifications').update({ name: form.name, issuing_org: form.issuing_org || null, status: form.status, progress_pct: parseInt(form.progress_pct) || 0, target_date: form.target_date || null, achieved_date: form.achieved_date || null, expiry_date: form.expiry_date || null }).eq('id', editCert.id).select('*').single()
      if (data) setCerts(p => p.map(x => x.id === data.id ? data : x))
      setSaving(false); setShowAdd(false); setEditCert(null)
      setForm({ name: '', issuing_org: '', status: 'not_started', progress_pct: '', target_date: '', achieved_date: '', expiry_date: '' })
      return
    }
    const { data, error } = await supabase.from('certifications').insert({
      owner_id: user.id,
      name: form.name,
      issuing_org: form.issuing_org || null,
      status: form.status,
      progress_pct: parseInt(form.progress_pct) || 0,
      target_date: form.target_date || null,
      achieved_date: form.achieved_date || null,
      expiry_date: form.expiry_date || null,
    }).select('*').single()
    if (!error && data) setCerts(p => [data, ...p])
    setSaving(false)
    setShowAdd(false)
    setForm({ name: '', issuing_org: '', status: 'not_started', progress_pct: '', target_date: '', achieved_date: '', expiry_date: '' })
  }

  const del = async (id: string) => {
    await supabase.from('certifications').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setCerts(p => p.filter(c => c.id !== id))
  }

  const statusColor = (s: string) =>
    s === 'completed' ? '#34d399' : s === 'in_progress' ? '#6366f1' : '#6b7280'
  const statusBadge = (s: string) =>
    s === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
      : s === 'in_progress' ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25'
      : 'bg-slate-700/50 text-slate-400 border-slate-600/50'

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-500" size={32} /></div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Professional Development</h1>
          <p className="text-sm text-slate-400 mt-0.5">Certifications and career growth</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Certification
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Completed', value: certs.filter(c => c.status === 'completed').length, color: 'text-emerald-400' },
          { label: 'In Progress', value: certs.filter(c => c.status === 'in_progress').length, color: 'text-brand-400' },
          { label: 'Planned', value: certs.filter(c => c.status === 'not_started').length, color: 'text-slate-400' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{s.label}</div>
            <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit">
        {['Certifications', 'AI Study Helper'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Certifications' && (
        certs.length === 0 ? (
          <div className="card p-12 text-center">
            <GraduationCap size={40} className="text-slate-700 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300">No certifications tracked yet</h3>
            <p className="text-sm text-slate-500 mt-1">Add your first certification goal</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 mx-auto flex items-center gap-2"><Plus size={14} /> Add Certification</button>
          </div>
        ) : (
          <div className="space-y-3">
            {certs.map(c => (
              <div key={c.id} className="card p-5 cursor-pointer hover:border-slate-600 transition-colors" onClick={() => openEditCert(c)}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-slate-100">{c.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{c.issuing_org ?? 'Unknown provider'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadge(c.status)}`}>
                      {c.status.replace('_', ' ')}
                    </span>
                    <button onClick={e => { e.stopPropagation(); openEditCert(c) }} className="text-slate-600 hover:text-brand-400 p-1" title="Edit"><Pencil size={13} /></button>
                    <button onClick={e => { e.stopPropagation(); del(c.id) }} className="text-slate-600 hover:text-red-400 transition-colors p-1" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
                <ProgressBar pct={c.progress_pct} color={statusColor(c.status)} />
                <div className="flex justify-between mt-2 text-xs text-slate-500">
                  <span>{c.target_date ? `Target: ${c.target_date}` : c.achieved_date ? `Achieved: ${c.achieved_date}` : 'No date set'}</span>
                  {c.expiry_date && <span>Expires: {c.expiry_date}</span>}
                  <span className="font-semibold text-slate-300">{c.progress_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'AI Study Helper' && <AIStudyHelper />}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100 mb-5">Add Certification</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Certification Name *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-base" placeholder="Salesforce Platform Developer I" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Provider</label>
                  <input value={form.issuing_org} onChange={e => setForm(p => ({ ...p, issuing_org: e.target.value }))} className="input-base" placeholder="Salesforce, AWS, PMI…" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="input-base">
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Progress %</label>
                  <input type="number" min={0} max={100} value={form.progress_pct}
                    onChange={e => setForm(p => ({ ...p, progress_pct: e.target.value }))} className="input-base" placeholder="0" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Target Date</label>
                  <input type="date" value={form.target_date} onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))} className="input-base" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Achieved Date</label>
                  <input type="date" value={form.achieved_date} onChange={e => setForm(p => ({ ...p, achieved_date: e.target.value }))} className="input-base" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Expiry Date</label>
                  <input type="date" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} className="input-base" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={add} disabled={saving || !form.name} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editCert ? 'Save Changes' : 'Save Certification'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditCert(null) }} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
