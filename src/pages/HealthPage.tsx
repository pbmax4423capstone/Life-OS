import { useState, useEffect } from 'react'
import { Plus, Trash2, Heart, Loader2, X } from 'lucide-react'
import { supabase, type Appointment, type InsuranceClaim } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

const fmtD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const SPECIALTIES = ['Primary Care', 'OB/GYN', 'Dentist', 'Ophthalmologist', 'Dermatologist',
  'Cardiologist', 'Orthopedics', 'Psychiatry', 'Physical Therapy', 'Other']
const MEMBERS = ['Patrick', 'Spouse', 'Child 1', 'Child 2']

const statusBadge = (s: string) =>
  s === 'confirmed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
    : s === 'scheduled' ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25'
    : s === 'processed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/25'

export default function HealthPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState('Appointments')
  const [appts, setAppts] = useState<Appointment[]>([])
  const [claims, setClaims] = useState<InsuranceClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editApptId, setEditApptId] = useState<string | null>(null)
  const [editClaimId, setEditClaimId] = useState<string | null>(null)

  const [apptForm, setApptForm] = useState({
    member_id: 'Patrick', reason: '', appointment_type: 'Primary Care',
    appointment_date: '', appointment_time: '', location: '', status: 'scheduled', telehealth: false,
  })
  const [claimForm, setClaimForm] = useState({
    policy_id: 'BCBS', service_date: '', service_description: '',
    billed_amount: '', covered_amount: '', patient_owed: '', status: 'pending',
  })

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      supabase.from('appointments').select('*').eq('owner_id', user.id).is('deleted_at', null).order('appointment_date'),
      supabase.from('insurance_claims').select('*').eq('owner_id', user.id).is('deleted_at', null).order('service_date', { ascending: false }),
    ]).then(([{ data: a }, { data: c }]) => {
      setAppts(a ?? [])
      setClaims(c ?? [])
      setLoading(false)
    })
  }, [user])

  const addAppt = async () => {
    if (!user || !apptForm.appointment_date) return
    setSaving(true)
    const { data, error } = await supabase.from('appointments').insert({
      owner_id: user.id,
      member_id: apptForm.member_id,
      appointment_type: apptForm.appointment_type,
      reason: apptForm.reason || null,
      appointment_date: apptForm.appointment_date,
      appointment_time: apptForm.appointment_time || null,
      location: apptForm.location || null,
      status: apptForm.status,
      telehealth: apptForm.telehealth,
    }).select('*').single()
    if (!error && data) setAppts(p => [...p, data].sort((a, b) => a.appointment_date.localeCompare(b.appointment_date)))
    setSaving(false)
    setShowAdd(false)
    setApptForm({ member_id: 'Patrick', reason: '', appointment_type: 'Primary Care', appointment_date: '', appointment_time: '', location: '', status: 'scheduled', telehealth: false })
  }

  const openEditAppt = (a: Appointment) => {
    setEditApptId(a.id)
    setApptForm({
      member_id: a.member_id || 'Patrick',
      reason: a.reason || '',
      appointment_type: a.appointment_type,
      appointment_date: a.appointment_date,
      appointment_time: a.appointment_time || '',
      location: a.location || '',
      status: a.status,
      telehealth: a.telehealth,
    })
    setShowAdd(true)
  }

  const updateAppt = async () => {
    if (!editApptId || !apptForm.appointment_date) return
    setSaving(true)
    const patch = {
      member_id: apptForm.member_id,
      appointment_type: apptForm.appointment_type,
      reason: apptForm.reason || null,
      appointment_date: apptForm.appointment_date,
      appointment_time: apptForm.appointment_time || null,
      location: apptForm.location || null,
      status: apptForm.status,
      telehealth: apptForm.telehealth,
    }
    const { error } = await supabase.from('appointments').update(patch).eq('id', editApptId)
    if (!error) setAppts(p => p.map(a => a.id === editApptId ? { ...a, ...patch } : a))
    setSaving(false)
    setShowAdd(false)
    setEditApptId(null)
    setApptForm({ member_id: 'Patrick', reason: '', appointment_type: 'Primary Care', appointment_date: '', appointment_time: '', location: '', status: 'scheduled', telehealth: false })
  }

  const addClaim = async () => {
    if (!user || !claimForm.service_date || !claimForm.service_description) return
    setSaving(true)
    const { data, error } = await supabase.from('insurance_claims').insert({
      owner_id: user.id,
      policy_id: claimForm.policy_id,
      service_date: claimForm.service_date,
      service_description: claimForm.service_description,
      billed_amount: parseFloat(claimForm.billed_amount) || 0,
      covered_amount: parseFloat(claimForm.covered_amount) || null,
      patient_owed: parseFloat(claimForm.patient_owed) || null,
      status: claimForm.status,
    }).select('*').single()
    if (!error && data) setClaims(p => [data, ...p])
    setSaving(false)
    setShowAdd(false)
    setClaimForm({ policy_id: 'BCBS', service_date: '', service_description: '', billed_amount: '', covered_amount: '', patient_owed: '', status: 'pending' })
  }

  const openEditClaim = (c: InsuranceClaim) => {
    setEditClaimId(c.id)
    setClaimForm({
      policy_id: c.policy_id,
      service_date: c.service_date,
      service_description: c.service_description,
      billed_amount: String(c.billed_amount),
      covered_amount: c.covered_amount != null ? String(c.covered_amount) : '',
      patient_owed: c.patient_owed != null ? String(c.patient_owed) : '',
      status: c.status,
    })
    setShowAdd(true)
  }

  const updateClaim = async () => {
    if (!editClaimId || !claimForm.service_date) return
    setSaving(true)
    const patch = {
      policy_id: claimForm.policy_id,
      service_date: claimForm.service_date,
      service_description: claimForm.service_description,
      billed_amount: parseFloat(claimForm.billed_amount) || 0,
      covered_amount: parseFloat(claimForm.covered_amount) || null,
      patient_owed: parseFloat(claimForm.patient_owed) || null,
      status: claimForm.status,
    }
    const { error } = await supabase.from('insurance_claims').update(patch).eq('id', editClaimId)
    if (!error) setClaims(p => p.map(c => c.id === editClaimId ? { ...c, ...patch } : c))
    setSaving(false)
    setShowAdd(false)
    setEditClaimId(null)
    setClaimForm({ policy_id: 'BCBS', service_date: '', service_description: '', billed_amount: '', covered_amount: '', patient_owed: '', status: 'pending' })
  }

  const delAppt = async (id: string) => {
    await supabase.from('appointments').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setAppts(p => p.filter(a => a.id !== id))
  }
  const delClaim = async (id: string) => {
    await supabase.from('insurance_claims').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setClaims(p => p.filter(c => c.id !== id))
  }

  const closeModal = () => {
    setShowAdd(false)
    setEditApptId(null)
    setEditClaimId(null)
    setApptForm({ member_id: 'Patrick', reason: '', appointment_type: 'Primary Care', appointment_date: '', appointment_time: '', location: '', status: 'scheduled', telehealth: false })
    setClaimForm({ policy_id: 'BCBS', service_date: '', service_description: '', billed_amount: '', covered_amount: '', patient_owed: '', status: 'pending' })
  }

  const nextAppt = appts.filter(a => a.appointment_date >= new Date().toISOString().split('T')[0])[0]
  const pendingClaims = claims.filter(c => c.status === 'pending').length
  const ytdOop = claims.filter(c => c.status === 'processed').reduce((s, c) => s + (c.patient_owed ?? 0), 0)

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-500" size={32} /></div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Health & Insurance</h1>
          <p className="text-sm text-slate-400 mt-0.5">Appointments, claims, and coverage</p>
        </div>
        {(tab === 'Appointments' || tab === 'Claims') && (
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Add {tab === 'Appointments' ? 'Appointment' : 'Claim'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Upcoming Appointments</div>
          <div className="text-2xl font-bold text-brand-400">{appts.filter(a => a.appointment_date >= new Date().toISOString().split('T')[0]).length}</div>
          <div className="text-xs text-slate-500 mt-1">{nextAppt ? `Next: ${nextAppt.appointment_date}` : 'None scheduled'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Pending Claims</div>
          <div className={`text-2xl font-bold ${pendingClaims > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{pendingClaims}</div>
          <div className="text-xs text-slate-500 mt-1">{pendingClaims > 0 ? 'Review needed' : 'All clear'}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">YTD Out-of-Pocket</div>
          <div className="text-2xl font-bold text-slate-200">{fmtD(ytdOop)}</div>
          <div className="text-xs text-slate-500 mt-1">Processed claims only</div>
        </div>
      </div>

      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit">
        {['Appointments', 'Claims', 'Insurance', 'Health Profiles'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Appointments' && (
        appts.length === 0 ? (
          <div className="card p-12 text-center">
            <Heart size={40} className="text-slate-700 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300">No appointments scheduled</h3>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 mx-auto flex items-center gap-2"><Plus size={14} /> Add Appointment</button>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Person', 'Specialty', 'Provider / Reason', 'Date & Time', 'Location', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {appts.map(a => (
                  <tr key={a.id} onClick={() => openEditAppt(a)} className="border-b border-slate-800/50 hover:bg-slate-800/30 last:border-0 cursor-pointer">
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${a.member_id === 'Patrick' ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' : 'bg-purple-500/15 text-purple-400 border-purple-500/25'}`}>
                        {a.member_id ?? 'Self'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-300">{a.appointment_type}</td>
                    <td className="px-5 py-3 font-medium text-slate-200">{a.reason ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-300">{a.appointment_date}{a.appointment_time ? ` · ${a.appointment_time}` : ''}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{a.location ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadge(a.status)}`}>{a.status}</span>
                    </td>
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => delAppt(a.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'Claims' && (
        claims.length === 0 ? (
          <div className="card p-12 text-center">
            <Heart size={40} className="text-slate-700 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300">No insurance claims yet</h3>
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 mx-auto flex items-center gap-2"><Plus size={14} /> Add Claim</button>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Insurer', 'Service', 'Date', 'Billed', 'Insurer Paid', 'You Owe', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {claims.map(c => (
                  <tr key={c.id} onClick={() => openEditClaim(c)} className="border-b border-slate-800/50 hover:bg-slate-800/30 last:border-0 cursor-pointer">
                    <td className="px-5 py-3 font-medium text-slate-200">{c.policy_id}</td>
                    <td className="px-5 py-3 text-slate-300">{c.service_description}</td>
                    <td className="px-5 py-3 text-slate-400">{c.service_date}</td>
                    <td className="px-5 py-3 text-slate-200">{fmtD(c.billed_amount)}</td>
                    <td className="px-5 py-3 text-emerald-400">{c.covered_amount != null ? fmtD(c.covered_amount) : '—'}</td>
                    <td className={`px-5 py-3 font-semibold ${(c.patient_owed ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {c.patient_owed != null ? fmtD(c.patient_owed) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusBadge(c.status)}`}>{c.status}</span>
                    </td>
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => delClaim(c.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'Insurance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { insurer: 'BCBS Colorado', type: 'Medical', members: 'All family members', deductible: 2000, met: ytdOop, oop: 6000, premium: 340 },
            { insurer: 'Delta Dental', type: 'Dental', members: 'All family members', deductible: 50, met: 0, oop: 1500, premium: 42 },
            { insurer: 'VSP Vision', type: 'Vision', members: 'All family members', deductible: 0, met: 0, oop: 200, premium: 18 },
          ].map(ins => (
            <div key={ins.insurer} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-slate-100">{ins.insurer}</div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">{ins.type}</span>
              </div>
              <div className="text-xs text-slate-500 mb-3">Members: {ins.members}</div>
              {[
                ['Monthly Premium', fmtD(ins.premium)],
                ['Deductible Met', `${fmtD(ins.met)} / ${fmtD(ins.deductible)}`],
                ['OOP Maximum', fmtD(ins.oop)],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between mb-1.5">
                  <span className="text-xs text-slate-500">{k}</span>
                  <span className="text-xs font-semibold text-slate-300">{v}</span>
                </div>
              ))}
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${Math.min(100, ins.deductible > 0 ? (ins.met / ins.deductible) * 100 : 0)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'Health Profiles' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MEMBERS.slice(0, 2).map(person => (
            <div key={person} className="card p-5">
              <h3 className="text-lg font-bold text-slate-100 mb-4">{person}</h3>
              {[
                ['Primary Physician', person === 'Patrick' ? 'Dr. Williams (Primary Care)' : 'Dr. Chen (OB/GYN)'],
                ['Insurance', 'BCBS Colorado'],
                ['Blood Type', person === 'Patrick' ? 'O+' : 'A+'],
                ['Allergies', person === 'Patrick' ? 'Penicillin' : 'None known'],
                ['Current Medications', person === 'Patrick' ? 'Lisinopril 10mg' : 'None'],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between mb-2 pb-2 border-b border-slate-800/50 last:border-0 last:mb-0 last:pb-0">
                  <span className="text-xs text-slate-500">{k}</span>
                  <span className="text-xs font-medium text-slate-300">{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            {tab === 'Appointments' ? (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-slate-100">{editApptId ? 'Edit Appointment' : 'Add Appointment'}</h3>
                  <button onClick={closeModal} className="text-slate-400 hover:text-slate-200 p-1"><X size={18} /></button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Family Member</label>
                      <select value={apptForm.member_id} onChange={e => setApptForm(p => ({ ...p, member_id: e.target.value }))} className="input-base">
                        {MEMBERS.map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Specialty</label>
                      <select value={apptForm.appointment_type} onChange={e => setApptForm(p => ({ ...p, appointment_type: e.target.value }))} className="input-base">
                        {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1.5 block">Provider / Doctor *</label>
                    <input value={apptForm.reason} onChange={e => setApptForm(p => ({ ...p, reason: e.target.value }))} className="input-base" placeholder="Dr. Williams, Aurora Medical…" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Date *</label>
                      <input type="date" value={apptForm.appointment_date} onChange={e => setApptForm(p => ({ ...p, appointment_date: e.target.value }))} className="input-base" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Time</label>
                      <input value={apptForm.appointment_time ?? ''} onChange={e => setApptForm(p => ({ ...p, appointment_time: e.target.value }))} className="input-base" placeholder="10:00 AM" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1.5 block">Location</label>
                    <input value={apptForm.location} onChange={e => setApptForm(p => ({ ...p, location: e.target.value }))} className="input-base" placeholder="Aurora Medical Center" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={editApptId ? updateAppt : addAppt} disabled={saving || !apptForm.appointment_date} className="btn-primary flex-1 justify-center flex items-center gap-2">
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editApptId ? 'Save Changes' : 'Save Appointment'}
                  </button>
                  <button onClick={closeModal} className="btn-ghost">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-lg font-bold text-slate-100">{editClaimId ? 'Edit Claim' : 'Add Insurance Claim'}</h3>
                  <button onClick={closeModal} className="text-slate-400 hover:text-slate-200 p-1"><X size={18} /></button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Insurer</label>
                      <input value={claimForm.policy_id} onChange={e => setClaimForm(p => ({ ...p, policy_id: e.target.value }))} className="input-base" placeholder="BCBS" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 font-medium mb-1.5 block">Service Date</label>
                      <input type="date" value={claimForm.service_date} onChange={e => setClaimForm(p => ({ ...p, service_date: e.target.value }))} className="input-base" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 font-medium mb-1.5 block">Service Description</label>
                    <input value={claimForm.service_description} onChange={e => setClaimForm(p => ({ ...p, service_description: e.target.value }))} className="input-base" placeholder="Office Visit, Lab Work…" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ['Billed ($)', 'billed_amount'],
                      ['Insurer Paid ($)', 'covered_amount'],
                      ['You Owe ($)', 'patient_owed'],
                    ].map(([label, field]) => (
                      <div key={field as string}>
                        <label className="text-xs text-slate-400 font-medium mb-1.5 block">{label as string}</label>
                        <input type="number" value={(claimForm as Record<string, string>)[field as string]}
                          onChange={e => setClaimForm(p => ({ ...p, [field as string]: e.target.value }))}
                          className="input-base" placeholder="0.00" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={editClaimId ? updateClaim : addClaim} disabled={saving || !claimForm.service_date} className="btn-primary flex-1 justify-center flex items-center gap-2">
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editClaimId ? 'Save Changes' : 'Save Claim'}
                  </button>
                  <button onClick={closeModal} className="btn-ghost">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
