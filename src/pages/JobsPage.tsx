import { useState, useEffect } from 'react'
import { Plus, Trash2, Briefcase, Loader2, Sparkles, Pencil } from 'lucide-react'
import { supabase, type JobApplication } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { callAI } from '@/lib/chatService'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  applied:      { label: 'Applied',       color: 'bg-slate-700/50 text-slate-400 border-slate-600/50' },
  phone_screen: { label: 'Phone Screen',  color: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  interview:    { label: 'Interview',     color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' },
  offer:        { label: 'Offer',         color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  rejected:     { label: 'Rejected',      color: 'bg-red-500/15 text-red-400 border-red-500/25' },
  bookmarked:   { label: 'Bookmarked',    color: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
}

function AIResumeHelper() {
  const [resume, setResume] = useState('')
  const [jobDesc, setJobDesc] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'resume' | 'cover'>('resume')
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    if (!resume || !jobDesc) return
    setLoading(true)
    setOutput('')
    setError(null)
    try {
      const prompt = mode === 'resume'
        ? `Customize this resume for the job description. Rewrite bullet points to match keywords, emphasize transferable skills, keep it ATS-friendly.\n\nRESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jobDesc}`
        : `Write a compelling tailored cover letter: opening hook, relevant experience, enthusiastic close (3 paragraphs).\n\nRESUME:\n${resume}\n\nJOB DESCRIPTION:\n${jobDesc}`
      const text = await callAI(prompt, 'You are an expert career coach and resume writer.')
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
        <h2 className="text-base font-semibold text-slate-100">AI Resume & Cover Letter Builder</h2>
      </div>

      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit mb-5">
        {([['resume', 'Customize Resume'], ['cover', 'Cover Letter']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setMode(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === v ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Your Resume</label>
          <textarea value={resume} onChange={e => setResume(e.target.value)}
            className="input-base resize-none h-40" placeholder="Paste your resume text here…" />
        </div>
        <div>
          <label className="text-xs text-slate-400 font-medium mb-1.5 block">Job Description</label>
          <textarea value={jobDesc} onChange={e => setJobDesc(e.target.value)}
            className="input-base resize-none h-40" placeholder="Paste the job description here…" />
        </div>
      </div>

      <button onClick={generate} disabled={loading || !resume || !jobDesc} className="btn-primary flex items-center gap-2">
        {loading ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate {mode === 'resume' ? 'Tailored Resume' : 'Cover Letter'}</>}
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

export default function JobsPage() {
  const { user } = useAuthStore()
  const [jobs, setJobs] = useState<JobApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Pipeline')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    company_name: '', job_title: '', status: 'applied',
    applied_date: new Date().toISOString().split('T')[0],
    salary_min: '', salary_max: '', location: '', remote_type: 'hybrid', notes: '',
  })

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase.from('job_applications').select('*')
      .eq('owner_id', user.id).is('deleted_at', null).order('created_at', { ascending: false })
      .then(({ data }) => { setJobs(data ?? []); setLoading(false) })
  }, [user])

  const counts = Object.fromEntries(
    ['applied', 'phone_screen', 'interview', 'offer'].map(s => [s, jobs.filter(j => j.status === s).length])
  )

  const [editJob, setEditJob] = useState<JobApplication | null>(null)

  const openEditJob = (j: JobApplication) => {
    setForm({ company_name: j.company_name, job_title: j.job_title, status: j.status, applied_date: j.applied_date ?? new Date().toISOString().split('T')[0], salary_min: j.salary_min ? String(j.salary_min) : '', salary_max: j.salary_max ? String(j.salary_max) : '', location: j.location ?? '', remote_type: j.remote_type ?? 'hybrid', notes: j.notes ?? '' })
    setEditJob(j)
    setShowAdd(true)
  }

  const add = async () => {
    if (!user || !form.company_name || !form.job_title) return
    setSaving(true)
    if (editJob) {
      const { data } = await supabase.from('job_applications').update({ company_name: form.company_name, job_title: form.job_title, status: form.status, applied_date: form.applied_date || null, salary_min: parseFloat(form.salary_min) || null, salary_max: parseFloat(form.salary_max) || null, location: form.location || null, remote_type: form.remote_type || null, notes: form.notes || null }).eq('id', editJob.id).select('*').single()
      if (data) setJobs(p => p.map(x => x.id === data.id ? data : x))
      setSaving(false); setShowAdd(false); setEditJob(null)
      setForm({ company_name: '', job_title: '', status: 'applied', applied_date: new Date().toISOString().split('T')[0], salary_min: '', salary_max: '', location: '', remote_type: 'hybrid', notes: '' })
      return
    }
    const { data, error } = await supabase.from('job_applications').insert({
      owner_id: user.id,
      company_name: form.company_name,
      job_title: form.job_title,
      status: form.status,
      applied_date: form.applied_date || null,
      salary_min: parseFloat(form.salary_min) || null,
      salary_max: parseFloat(form.salary_max) || null,
      location: form.location || null,
      remote_type: form.remote_type || null,
      notes: form.notes || null,
    }).select('*').single()
    if (!error && data) setJobs(p => [data, ...p])
    setSaving(false)
    setShowAdd(false)
    setForm({ company_name: '', job_title: '', status: 'applied', applied_date: new Date().toISOString().split('T')[0], salary_min: '', salary_max: '', location: '', remote_type: 'hybrid', notes: '' })
  }

  const del = async (id: string) => {
    await supabase.from('job_applications').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setJobs(p => p.filter(j => j.id !== id))
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-500" size={32} /></div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Job Search</h1>
          <p className="text-sm text-slate-400 mt-0.5">{jobs.length} applications tracked</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add Application
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Applied', key: 'applied', color: 'text-slate-400' },
          { label: 'Phone Screen', key: 'phone_screen', color: 'text-amber-400' },
          { label: 'Interview', key: 'interview', color: 'text-brand-400' },
          { label: 'Offer', key: 'offer', color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.key} className="card p-4">
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">{s.label}</div>
            <div className={`text-3xl font-bold ${s.color}`}>{counts[s.key] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit">
        {['Pipeline', 'AI Resume Helper'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Pipeline' && (
        jobs.length === 0 ? (
          <div className="card p-12 text-center">
            <Briefcase size={40} className="text-slate-700 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300">No applications yet</h3>
            <p className="text-sm text-slate-500 mt-1">Start tracking your job search</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 mx-auto flex items-center gap-2"><Plus size={14} /> Add Application</button>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Company', 'Title', 'Status', 'Applied', 'Salary', 'Location', 'Notes', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => {
                  const st = STATUS_MAP[j.status] ?? STATUS_MAP.applied
                  return (
                    <tr key={j.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 last:border-0">
                      <td className="px-5 py-3 font-medium text-slate-200">{j.company_name}</td>
                      <td className="px-5 py-3 text-slate-300">{j.job_title}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs">{j.applied_date ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-400 text-xs">
                        {j.salary_min ? `$${Math.round(j.salary_min / 1000)}k${j.salary_max ? `–$${Math.round(j.salary_max / 1000)}k` : ''}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-400 text-xs">{j.location ? `${j.location}${j.remote_type ? ` (${j.remote_type})` : ''}` : '—'}</td>
                      <td className="px-5 py-3 text-slate-500 text-xs max-w-[160px] truncate">{j.notes ?? '—'}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEditJob(j)} className="text-slate-600 hover:text-brand-400 p-1"><Pencil size={13} /></button>
                          <button onClick={() => del(j.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'AI Resume Helper' && <AIResumeHelper />}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-100 mb-5">Add Application</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Company *</label>
                <input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} className="input-base" />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Job Title *</label>
                <input value={form.job_title} onChange={e => setForm(p => ({ ...p, job_title: e.target.value }))} className="input-base" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Status</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="input-base">
                    {Object.entries(STATUS_MAP).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Date Applied</label>
                  <input type="date" value={form.applied_date} onChange={e => setForm(p => ({ ...p, applied_date: e.target.value }))} className="input-base" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Salary Min ($)</label>
                  <input type="number" value={form.salary_min} onChange={e => setForm(p => ({ ...p, salary_min: e.target.value }))} className="input-base" placeholder="120000" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Salary Max ($)</label>
                  <input type="number" value={form.salary_max} onChange={e => setForm(p => ({ ...p, salary_max: e.target.value }))} className="input-base" placeholder="150000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Location</label>
                  <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className="input-base" placeholder="Denver, CO" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Remote Type</label>
                  <select value={form.remote_type} onChange={e => setForm(p => ({ ...p, remote_type: e.target.value }))} className="input-base">
                    {['onsite', 'hybrid', 'remote'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Notes / Next Step</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="input-base" placeholder="Technical interview May 18…" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={add} disabled={saving || !form.company_name || !form.job_title} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editJob ? 'Save Changes' : 'Save Application'}
              </button>
              <button onClick={() => { setShowAdd(false); setEditJob(null) }} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
