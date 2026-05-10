import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { DomainModal, SectionState, TabButton, ToastViewport, formatDate, formatUsd, isSoon, useToastState } from '@/components/jobs/JobsUi'

type LooseDb = { public: { Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }> } }
const db = supabase as unknown as SupabaseClient<LooseDb>

type Tab = 'applications' | 'resume' | 'certifications' | 'contacts'
type AppStatus = 'saved' | 'applied' | 'phone_screen' | 'interview' | 'offer' | 'rejected' | 'withdrawn'

interface Company { id: string; company_name: string }
interface JobApplication { id: string; company_id: string | null; job_title: string; location: string | null; work_type: string | null; salary_min: number | null; salary_max: number | null; job_url: string | null; date_applied: string | null; status: AppStatus; notes: string | null; next_action: string | null; next_action_date: string | null }
interface InterviewRound { id: string; application_id: string; round_type: string; interview_date: string | null; interviewer_name: string | null; outcome: string | null; notes: string | null }
interface Contact { id: string; full_name: string; title: string | null; company: string | null; email: string | null; phone: string | null; linkedin_url: string | null; relationship_type: string | null; last_contacted_date: string | null; notes: string | null }
interface ApplicationContact { id: string; application_id: string; contact_id: string }
interface ResumeItem { id: string; name: string; version: string | null; base_content: string | null; parent_resume_id: string | null; job_description_snippet: string | null; tags: string[] | null; created_at: string }
interface Certification { id: string; name: string; issuing_organization: string | null; issue_date: string | null; expiry_date: string | null; credential_id: string | null; credential_url: string | null; status: string; study_hours_completed: number | null; study_hours_target: number | null; notes: string | null; is_active: boolean }

const appStatuses: AppStatus[] = ['saved', 'applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn']
const statusLabel: Record<AppStatus, string> = { saved: 'Saved', applied: 'Applied', phone_screen: 'Phone Screen', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn' }
const statusClass: Record<AppStatus, string> = {
  saved: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  applied: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  phone_screen: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  interview: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  offer: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/40',
  withdrawn: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514'
const ANTHROPIC_API_VERSION = '2023-06-01'
const RESUME_SYSTEM = 'You are an expert resume writer. Given the base resume and job description below, rewrite the resume to maximize ATS score and relevance for this specific role. Preserve all factual information — never invent experience or skills. Tailor the summary, reorder bullet points by relevance, and naturally incorporate keywords from the job description. Return the full rewritten resume as clean plain text.'
const COVER_SYSTEM = 'You are an expert cover letter writer. Write a compelling, personalized cover letter for this job application based on the resume provided. Be specific, confident, and concise — three paragraphs max. Match the tone to the company. Return plain text only.'

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    throw new Error('Numeric field must be a valid number.')
  }
  return parsed
}

function parseRequiredNumber(value: string, fieldName: string): number {
  const parsed = parseOptionalNumber(value)
  if (parsed === null) {
    throw new Error(`${fieldName} is required.`)
  }
  return parsed
}

export default function JobsPage() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  const { toast, toasts } = useToastState()
  const [tab, setTab] = useState<Tab>('applications')
  const [statusFilter, setStatusFilter] = useState<AppStatus | 'all'>('all')
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null)

  const [appModalOpen, setAppModalOpen] = useState(false)
  const [editAppId, setEditAppId] = useState<string | null>(null)
  const [appForm, setAppForm] = useState({ job_title: '', company_name: '', location: '', work_type: 'remote', salary_min: '', salary_max: '', job_url: '', date_applied: '', status: 'saved' as AppStatus, notes: '', next_action: '', next_action_date: '' })

  const [interviewModal, setInterviewModal] = useState({ open: false, application_id: '', round_type: '', interview_date: '', interviewer_name: '', outcome: '', notes: '' })
  const [linkContactModal, setLinkContactModal] = useState({ open: false, application_id: '', contact_id: '' })

  const [baseResumeText, setBaseResumeText] = useState('')
  const [baseResumeName, setBaseResumeName] = useState('')
  const [selectedBaseResumeId, setSelectedBaseResumeId] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [generatedResume, setGeneratedResume] = useState('')
  const [generatingResume, setGeneratingResume] = useState(false)
  const resumeRequestInFlight = useRef(false)

  const [coverResumeId, setCoverResumeId] = useState('')
  const [coverJobDescription, setCoverJobDescription] = useState('')
  const [generatedCover, setGeneratedCover] = useState('')
  const [generatingCover, setGeneratingCover] = useState(false)
  const coverRequestInFlight = useRef(false)

  const [certModalOpen, setCertModalOpen] = useState(false)
  const [editCertId, setEditCertId] = useState<string | null>(null)
  const [certForm, setCertForm] = useState({ name: '', issuing_organization: '', issue_date: '', expiry_date: '', credential_id: '', credential_url: '', status: 'in_progress', study_hours_completed: '', study_hours_target: '', notes: '' })

  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [editContactId, setEditContactId] = useState<string | null>(null)
  const [contactForm, setContactForm] = useState({ full_name: '', title: '', company: '', email: '', phone: '', linkedin_url: '', relationship_type: 'other', last_contacted_date: '', notes: '' })

  const companiesQuery = useQuery({ queryKey: ['jobs-companies', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('companies').select('id, company_name').eq('user_id', userId as string); if (error) throw new Error(error.message); return (data ?? []) as unknown as Company[] } })
  const applicationsQuery = useQuery({ queryKey: ['jobs-applications', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('job_applications').select('id, company_id, job_title, location, work_type, salary_min, salary_max, job_url, date_applied, status, notes, next_action, next_action_date').eq('user_id', userId as string).eq('is_deleted', false).order('date_applied', { ascending: false }); if (error) throw new Error(error.message); return (data ?? []) as unknown as JobApplication[] } })
  const interviewsQuery = useQuery({
    queryKey: ['jobs-interviews', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const applicationIds = (applicationsQuery.data ?? []).map((application) => application.id)
      if (applicationIds.length === 0) return []
      const { data, error } = await db
        .from('interview_rounds')
        .select('id, application_id, round_type, interview_date, interviewer_name, outcome, notes')
        .in('application_id', applicationIds)
        .order('interview_date')
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as InterviewRound[]
    },
  })
  const contactsQuery = useQuery({ queryKey: ['jobs-contacts', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('contacts').select('id, full_name, title, company, email, phone, linkedin_url, relationship_type, last_contacted_date, notes').eq('user_id', userId as string).eq('is_deleted', false).order('full_name'); if (error) throw new Error(error.message); return (data ?? []) as unknown as Contact[] } })
  const appContactsQuery = useQuery({
    queryKey: ['jobs-app-contacts', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const applicationIds = (applicationsQuery.data ?? []).map((application) => application.id)
      if (applicationIds.length === 0) return []
      const { data, error } = await db
        .from('application_contacts')
        .select('id, application_id, contact_id')
        .in('application_id', applicationIds)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as ApplicationContact[]
    },
  })
  const resumesQuery = useQuery({ queryKey: ['jobs-resumes', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('resumes').select('id, name, version, base_content, parent_resume_id, job_description_snippet, tags, created_at').eq('user_id', userId as string).order('created_at', { ascending: false }); if (error) throw new Error(error.message); return (data ?? []) as unknown as ResumeItem[] } })
  const certsQuery = useQuery({ queryKey: ['jobs-certs', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('certifications').select('id, name, issuing_organization, issue_date, expiry_date, credential_id, credential_url, status, study_hours_completed, study_hours_target, notes, is_active').eq('user_id', userId as string).eq('is_active', true).order('expiry_date'); if (error) throw new Error(error.message); return (data ?? []) as unknown as Certification[] } })

  const invalidate = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['jobs-companies', userId] }),
    queryClient.invalidateQueries({ queryKey: ['jobs-applications', userId] }),
    queryClient.invalidateQueries({ queryKey: ['jobs-interviews', userId] }),
    queryClient.invalidateQueries({ queryKey: ['jobs-contacts', userId] }),
    queryClient.invalidateQueries({ queryKey: ['jobs-app-contacts', userId] }),
    queryClient.invalidateQueries({ queryKey: ['jobs-resumes', userId] }),
    queryClient.invalidateQueries({ queryKey: ['jobs-certs', userId] }),
  ])
  const companies = companiesQuery.data ?? []
  const applications = applicationsQuery.data ?? []
  const interviews = interviewsQuery.data ?? []
  const contacts = contactsQuery.data ?? []
  const appContacts = appContactsQuery.data ?? []
  const resumes = resumesQuery.data ?? []
  const certifications = certsQuery.data ?? []

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.company_name])), [companies])
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts])
  const pipelineCounts = useMemo(() => appStatuses.reduce((acc, status) => ({ ...acc, [status]: applications.filter((app) => app.status === status).length }), {} as Record<AppStatus, number>), [applications])
  const filteredApps = statusFilter === 'all' ? applications : applications.filter((app) => app.status === statusFilter)

  const appMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Missing user')
      let companyId: string | null = null
      const existingCompany = companies.find((company) => company.company_name.toLowerCase() === appForm.company_name.trim().toLowerCase())
      if (existingCompany) companyId = existingCompany.id
      if (!companyId) {
        const { data, error } = await db.from('companies').insert({ user_id: userId, company_name: appForm.company_name.trim() }).select('id').single()
        if (error) throw new Error(error.message)
        companyId = ((data as unknown as { id: string }).id)
      }
      const payload = {
        user_id: userId,
        company_id: companyId,
        job_title: appForm.job_title.trim(),
        location: appForm.location || null,
        work_type: appForm.work_type,
        salary_min: parseOptionalNumber(appForm.salary_min),
        salary_max: parseOptionalNumber(appForm.salary_max),
        job_url: appForm.job_url || null,
        date_applied: appForm.date_applied || null,
        status: appForm.status,
        notes: appForm.notes || null,
        next_action: appForm.next_action || null,
        next_action_date: appForm.next_action_date || null,
      }
      if (editAppId) {
        const { error } = await db.from('job_applications').update(payload).eq('id', editAppId).eq('user_id', userId as string)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await db.from('job_applications').insert(payload)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: async () => { toast.success(editAppId ? 'Application updated.' : 'Application added.'); setAppModalOpen(false); setEditAppId(null); setAppForm({ job_title: '', company_name: '', location: '', work_type: 'remote', salary_min: '', salary_max: '', job_url: '', date_applied: '', status: 'saved', notes: '', next_action: '', next_action_date: '' }); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const deleteAppMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await db.from('job_applications').update({ is_deleted: true }).eq('id', id).eq('user_id', userId as string); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Application deleted.'); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const addInterviewMutation = useMutation({ mutationFn: async () => { const { error } = await db.from('interview_rounds').insert({ application_id: interviewModal.application_id, round_type: interviewModal.round_type, interview_date: interviewModal.interview_date || null, interviewer_name: interviewModal.interviewer_name || null, outcome: interviewModal.outcome || null, notes: interviewModal.notes || null }); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Interview round added.'); setInterviewModal({ open: false, application_id: '', round_type: '', interview_date: '', interviewer_name: '', outcome: '', notes: '' }); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const addContactLinkMutation = useMutation({ mutationFn: async () => { const { error } = await db.from('application_contacts').insert({ application_id: linkContactModal.application_id, contact_id: linkContactModal.contact_id }); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Contact linked.'); setLinkContactModal({ open: false, application_id: '', contact_id: '' }); await invalidate() }, onError: (e: Error) => toast.error(e.message) })

  const saveBaseResumeMutation = useMutation({ mutationFn: async () => { const { error } = await db.from('resumes').insert({ user_id: userId, name: baseResumeName.trim(), version: 'base', base_content: baseResumeText }); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Base resume saved.'); setBaseResumeName(''); setBaseResumeText(''); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const saveGeneratedResumeMutation = useMutation({ mutationFn: async () => { const selected = resumes.find((resume) => resume.id === selectedBaseResumeId); if (!selected) throw new Error('Select base resume'); const { error } = await db.from('resumes').insert({ user_id: userId, name: `${selected.name} - tailored`, version: 'customized', parent_resume_id: selected.id, job_description_snippet: jobDescription.slice(0, 200), base_content: generatedResume }); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Customized resume saved.'); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const saveCoverMutation = useMutation({ mutationFn: async () => { const { error } = await db.from('ai_documents').insert({ user_id: userId, type: 'cover_letter', resume_id: coverResumeId || null, content: generatedCover }); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Cover letter saved.'); }, onError: (e: Error) => toast.error(e.message) })

  const certMutation = useMutation({ mutationFn: async () => { const payload = { user_id: userId, name: certForm.name, issuing_organization: certForm.issuing_organization || null, issue_date: certForm.issue_date || null, expiry_date: certForm.expiry_date || null, credential_id: certForm.credential_id || null, credential_url: certForm.credential_url || null, status: certForm.status, study_hours_completed: parseOptionalNumber(certForm.study_hours_completed) ?? 0, study_hours_target: parseOptionalNumber(certForm.study_hours_target) ?? 0, notes: certForm.notes || null, is_active: true }; if (editCertId) { const { error } = await db.from('certifications').update(payload).eq('id', editCertId).eq('user_id', userId as string); if (error) throw new Error(error.message) } else { const { error } = await db.from('certifications').insert(payload); if (error) throw new Error(error.message) } }, onSuccess: async () => { toast.success(editCertId ? 'Certification updated.' : 'Certification added.'); setCertModalOpen(false); setEditCertId(null); setCertForm({ name: '', issuing_organization: '', issue_date: '', expiry_date: '', credential_id: '', credential_url: '', status: 'in_progress', study_hours_completed: '', study_hours_target: '', notes: '' }); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const archiveCertMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await db.from('certifications').update({ is_active: false }).eq('id', id).eq('user_id', userId as string); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Certification archived.'); await invalidate() }, onError: (e: Error) => toast.error(e.message) })

  const contactMutation = useMutation({ mutationFn: async () => { const payload = { user_id: userId, full_name: contactForm.full_name, title: contactForm.title || null, company: contactForm.company || null, email: contactForm.email || null, phone: contactForm.phone || null, linkedin_url: contactForm.linkedin_url || null, relationship_type: contactForm.relationship_type || null, last_contacted_date: contactForm.last_contacted_date || null, notes: contactForm.notes || null }; if (editContactId) { const { error } = await db.from('contacts').update(payload).eq('id', editContactId).eq('user_id', userId as string); if (error) throw new Error(error.message) } else { const { error } = await db.from('contacts').insert(payload); if (error) throw new Error(error.message) } }, onSuccess: async () => { toast.success(editContactId ? 'Contact updated.' : 'Contact added.'); setContactModalOpen(false); setEditContactId(null); setContactForm({ full_name: '', title: '', company: '', email: '', phone: '', linkedin_url: '', relationship_type: 'other', last_contacted_date: '', notes: '' }); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const deleteContactMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await db.from('contacts').update({ is_deleted: true }).eq('id', id).eq('user_id', userId as string); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Contact deleted.'); await invalidate() }, onError: (e: Error) => toast.error(e.message) })

  const streamClaude = async ({ system, userText, onChunk }: { system: string; userText: string; onChunk: (chunk: string) => void }) => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
    if (!apiKey) throw new Error('Missing VITE_ANTHROPIC_API_KEY')
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'anthropic-version': ANTHROPIC_API_VERSION, 'x-api-key': apiKey, accept: 'text/event-stream' },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 2048, stream: true, system, messages: [{ role: 'user', content: userText }] }),
    })
    if (!response.ok || !response.body) throw new Error(await response.text())

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          const evt = JSON.parse(payload) as { type?: string; delta?: { type?: string; text?: string } }
          if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta' && evt.delta.text) onChunk(evt.delta.text)
        } catch {
          // ignore malformed event chunk
        }
      }
    }
  }

  const generateResume = async () => {
    if (resumeRequestInFlight.current) return
    if (!selectedBaseResumeId || !jobDescription.trim()) { toast.error('Select base resume and provide job description.'); return }
    const base = resumes.find((resume) => resume.id === selectedBaseResumeId)
    if (!base || !base.base_content) { toast.error('Selected base resume has no base content.'); return }
    setGeneratedResume('')
    setGeneratingResume(true)
    resumeRequestInFlight.current = true
    try {
      await streamClaude({ system: RESUME_SYSTEM, userText: `BASE RESUME:\n${base.base_content}\n\nJOB DESCRIPTION:\n${jobDescription}`, onChunk: (chunk) => setGeneratedResume((prev) => prev + chunk) })
      toast.success('Resume generated.')
    } catch {
      toast.error('AI request failed. Please try again in a moment.')
    } finally {
      setGeneratingResume(false)
      resumeRequestInFlight.current = false
    }
  }

  const generateCover = async () => {
    if (coverRequestInFlight.current) return
    if (!coverResumeId || !coverJobDescription.trim()) { toast.error('Select resume and provide job description.'); return }
    const resume = resumes.find((item) => item.id === coverResumeId)
    if (!resume || !resume.base_content) { toast.error('Selected resume has no content.'); return }
    setGeneratedCover('')
    setGeneratingCover(true)
    coverRequestInFlight.current = true
    try {
      await streamClaude({ system: COVER_SYSTEM, userText: `RESUME:\n${resume.base_content}\n\nJOB DESCRIPTION:\n${coverJobDescription}`, onChunk: (chunk) => setGeneratedCover((prev) => prev + chunk) })
      toast.success('Cover letter generated.')
    } catch {
      toast.error('AI request failed. Please try again in a moment.')
    } finally {
      setGeneratingCover(false)
      coverRequestInFlight.current = false
    }
  }

  const linkedCountByContact = useMemo(() => appContacts.reduce((acc, rel) => ({ ...acc, [rel.contact_id]: (acc[rel.contact_id] ?? 0) + 1 }), {} as Record<string, number>), [appContacts])

  const requireFields = (vals: string[], message: string) => {
    if (vals.some((v) => !v || !v.trim())) { toast.error(message); return false }
    return true
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <ToastViewport toasts={toasts} />
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Jobs & Career</h1>
        <p className="text-sm text-slate-400 mt-0.5">Applications, resumes, certifications, and network contacts</p>
      </div>

      <div className="card p-3 flex flex-wrap gap-2">
        <TabButton label="Applications" active={tab === 'applications'} onClick={() => setTab('applications')} />
        <TabButton label="AI Resume" active={tab === 'resume'} onClick={() => setTab('resume')} />
        <TabButton label="Certifications" active={tab === 'certifications'} onClick={() => setTab('certifications')} />
        <TabButton label="Contacts" active={tab === 'contacts'} onClick={() => setTab('contacts')} />
      </div>

      {tab === 'applications' && (
        <div className="space-y-4">
          <div className="card p-3 flex flex-wrap gap-2 items-center">
            <button className={`px-2.5 py-1.5 rounded-lg text-xs border ${statusFilter === 'all' ? 'border-brand-500/50 text-brand-300 bg-brand-500/10' : 'border-slate-700 text-slate-300'}`} onClick={() => setStatusFilter('all')}>All ({applications.length})</button>
            {appStatuses.map((status) => <button key={status} className={`px-2.5 py-1.5 rounded-lg text-xs border ${statusFilter === status ? statusClass[status] : 'border-slate-700 text-slate-300'}`} onClick={() => setStatusFilter(status)}>{statusLabel[status]} ({pipelineCounts[status] ?? 0})</button>)}
          </div>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => { setEditAppId(null); setAppModalOpen(true) }}><Plus size={14} /> Add Application</button></div>
          <SectionState loading={applicationsQuery.isLoading || companiesQuery.isLoading} error={applicationsQuery.error instanceof Error ? applicationsQuery.error.message : companiesQuery.error instanceof Error ? companiesQuery.error.message : null} empty={filteredApps.length === 0} emptyText="No applications found.">
            <div className="space-y-3">
              {filteredApps.map((app) => {
                const appInterviews = interviews.filter((item) => item.application_id === app.id)
                const linkedContacts = appContacts.filter((rel) => rel.application_id === app.id).map((rel) => contactMap.get(rel.contact_id)).filter(Boolean) as Contact[]
                const expanded = expandedAppId === app.id
                return (
                  <div key={app.id} className="card p-4 space-y-2">
                    <div className="flex justify-between gap-2">
                      <div>
                        <button className="text-left text-slate-100 font-semibold hover:text-brand-300" onClick={() => setExpandedAppId(expanded ? null : app.id)}>{app.job_title}</button>
                        <div className="text-xs text-slate-400">{companyMap.get(app.company_id ?? '') ?? 'Unknown company'} · {app.location ?? '—'} · {app.work_type ?? '—'}</div>
                        <div className="text-xs text-slate-500">Applied: {formatDate(app.date_applied)} · Salary: {formatUsd(app.salary_min)} - {formatUsd(app.salary_max)}</div>
                      </div>
                      <div className="flex gap-2 items-center"><span className={`badge border ${statusClass[app.status]}`}>{statusLabel[app.status]}</span><button className="btn-ghost" onClick={() => { setEditAppId(app.id); setAppForm({ job_title: app.job_title, company_name: companyMap.get(app.company_id ?? '') ?? '', location: app.location ?? '', work_type: app.work_type ?? 'remote', salary_min: app.salary_min ? String(app.salary_min) : '', salary_max: app.salary_max ? String(app.salary_max) : '', job_url: app.job_url ?? '', date_applied: app.date_applied ?? '', status: app.status, notes: app.notes ?? '', next_action: app.next_action ?? '', next_action_date: app.next_action_date ?? '' }); setAppModalOpen(true) }}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => deleteAppMutation.mutate(app.id)}><Trash2 size={14} /> Delete</button></div>
                    </div>
                    <div className="text-sm text-slate-300">Next action: <span className="text-slate-100">{app.next_action ?? '—'}</span> {app.next_action_date ? `(${formatDate(app.next_action_date)})` : ''}</div>
                    {expanded && (
                      <div className="border-t border-slate-700/60 pt-3 space-y-3 text-sm">
                        <div className="text-slate-300">Notes: <span className="text-slate-100 whitespace-pre-wrap">{app.notes ?? '—'}</span></div>
                        <div>
                          <div className="flex justify-between items-center"><h4 className="text-slate-200 font-medium">Interview Rounds</h4><button className="btn-ghost" onClick={() => setInterviewModal({ open: true, application_id: app.id, round_type: '', interview_date: '', interviewer_name: '', outcome: '', notes: '' })}><Plus size={14} /> Add Round</button></div>
                          {appInterviews.length === 0 ? <div className="text-xs text-slate-500 mt-1">No rounds yet.</div> : <div className="mt-2 space-y-1">{appInterviews.map((round) => <div key={round.id} className="bg-slate-800/60 rounded-lg px-3 py-2"><div className="text-slate-100">{round.round_type} · {formatDate(round.interview_date)}</div><div className="text-xs text-slate-400">{round.interviewer_name ?? '—'} · {round.outcome ?? 'Pending'}</div></div>)}</div>}
                        </div>
                        <div>
                          <div className="flex justify-between items-center"><h4 className="text-slate-200 font-medium">Linked Contacts</h4><button className="btn-ghost" onClick={() => setLinkContactModal({ open: true, application_id: app.id, contact_id: '' })}><Plus size={14} /> Link Contact</button></div>
                          {linkedContacts.length === 0 ? <div className="text-xs text-slate-500 mt-1">No linked contacts.</div> : <div className="mt-2 flex flex-wrap gap-2">{linkedContacts.map((c) => <span key={c.id} className="badge border border-slate-600 text-slate-200">{c.full_name}</span>)}</div>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </SectionState>
        </div>
      )}

      {tab === 'resume' && (
        <div className="space-y-4">
          <SectionState loading={resumesQuery.isLoading} error={resumesQuery.error instanceof Error ? resumesQuery.error.message : null} empty={false} emptyText="">
            <div className="space-y-4">
              <div className="card p-4 space-y-3">
                <h3 className="text-slate-100 font-semibold">Saved Resumes</h3>
                {resumes.length === 0 ? <div className="text-sm text-slate-500">No resumes yet.</div> : <div className="space-y-2">{resumes.map((resume) => <div key={resume.id} className="bg-slate-800/60 rounded-lg px-3 py-2 text-sm"><div className="text-slate-100">{resume.name} {resume.version ? `(${resume.version})` : ''}</div><div className="text-xs text-slate-400">{formatDate(resume.created_at)} {resume.tags?.length ? `· ${resume.tags.join(', ')}` : ''}</div></div>)}</div>}
              </div>
              <div className="card p-4 space-y-3">
                <h3 className="text-slate-100 font-semibold">Base Resume</h3>
                <input className="input-base" placeholder="Resume name" value={baseResumeName} onChange={(e) => setBaseResumeName(e.target.value)} />
                <textarea className="input-base min-h-40" placeholder="Paste base resume text" value={baseResumeText} onChange={(e) => setBaseResumeText(e.target.value)} />
                <div className="flex justify-end"><button className="btn-primary" onClick={() => { if (!requireFields([baseResumeName, baseResumeText], 'Name and base resume text are required.')) return; saveBaseResumeMutation.mutate() }} disabled={saveBaseResumeMutation.isPending}>{saveBaseResumeMutation.isPending ? 'Saving...' : 'Save Base Resume'}</button></div>
              </div>
              <div className="card p-4 space-y-3">
                <h3 className="text-slate-100 font-semibold">Customize Resume</h3>
                <select className="input-base" value={selectedBaseResumeId} onChange={(e) => setSelectedBaseResumeId(e.target.value)}><option value="">Select base resume</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select>
                <textarea className="input-base min-h-32" placeholder="Paste job description" value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
                <div className="flex justify-end"><button className="btn-primary" onClick={generateResume} disabled={generatingResume}>{generatingResume ? 'Generating...' : 'Generate Resume'}</button></div>
                <textarea className="input-base min-h-52" value={generatedResume} onChange={(e) => setGeneratedResume(e.target.value)} placeholder="Streaming generated resume appears here" />
                <div className="flex justify-end"><button className="btn-primary" onClick={() => { if (!generatedResume.trim()) { toast.error('No generated resume to save.'); return } saveGeneratedResumeMutation.mutate() }} disabled={saveGeneratedResumeMutation.isPending}>{saveGeneratedResumeMutation.isPending ? 'Saving...' : 'Save Customized Resume'}</button></div>
              </div>
              <div className="card p-4 space-y-3">
                <h3 className="text-slate-100 font-semibold">Cover Letter</h3>
                <select className="input-base" value={coverResumeId} onChange={(e) => setCoverResumeId(e.target.value)}><option value="">Select resume</option>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select>
                <textarea className="input-base min-h-32" placeholder="Paste job description" value={coverJobDescription} onChange={(e) => setCoverJobDescription(e.target.value)} />
                <div className="flex justify-end"><button className="btn-primary" onClick={generateCover} disabled={generatingCover}>{generatingCover ? 'Generating...' : 'Generate Cover Letter'}</button></div>
                <textarea className="input-base min-h-44" value={generatedCover} onChange={(e) => setGeneratedCover(e.target.value)} placeholder="Generated cover letter" />
                <div className="flex justify-end"><button className="btn-primary" onClick={() => { if (!generatedCover.trim()) { toast.error('No generated cover letter to save.'); return } saveCoverMutation.mutate() }} disabled={saveCoverMutation.isPending}>{saveCoverMutation.isPending ? 'Saving...' : 'Save Cover Letter'}</button></div>
              </div>
            </div>
          </SectionState>
        </div>
      )}
      {tab === 'certifications' && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="btn-primary" onClick={() => { setEditCertId(null); setCertModalOpen(true) }}><Plus size={14} /> Add Certification</button></div>
          <SectionState loading={certsQuery.isLoading} error={certsQuery.error instanceof Error ? certsQuery.error.message : null} empty={certifications.length === 0} emptyText="No certifications found.">
            <div className="space-y-3">{certifications.map((cert) => { const exp = cert.expiry_date ? new Date(cert.expiry_date) : null; const expired = exp ? exp < new Date() : false; const expSoon = isSoon(cert.expiry_date, 90); const pct = cert.status === 'in_progress' && (cert.study_hours_target ?? 0) > 0 ? Math.min(100, Math.round(((cert.study_hours_completed ?? 0) / (cert.study_hours_target ?? 1)) * 100)) : null; return <div key={cert.id} className="card p-4 space-y-2"><div className="flex justify-between"><div><div className="text-slate-100 font-semibold">{cert.name}</div><div className="text-xs text-slate-400">{cert.issuing_organization ?? '—'} · {cert.status}</div></div><div className="flex gap-2"><button className="btn-ghost" onClick={() => { setEditCertId(cert.id); setCertForm({ name: cert.name, issuing_organization: cert.issuing_organization ?? '', issue_date: cert.issue_date ?? '', expiry_date: cert.expiry_date ?? '', credential_id: cert.credential_id ?? '', credential_url: cert.credential_url ?? '', status: cert.status, study_hours_completed: String(cert.study_hours_completed ?? ''), study_hours_target: String(cert.study_hours_target ?? ''), notes: cert.notes ?? '' }); setCertModalOpen(true) }}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => archiveCertMutation.mutate(cert.id)}>Archive</button></div></div><div className="text-sm text-slate-300">Issue: {formatDate(cert.issue_date)} · Expiry: <span className={expired ? 'text-red-300' : expSoon ? 'text-amber-300' : 'text-slate-100'}>{formatDate(cert.expiry_date)}</span> · ID: {cert.credential_id ?? '—'}</div>{pct !== null && <div className="space-y-1"><div className="text-xs text-slate-400">Study progress {pct}%</div><div className="h-2 rounded-full bg-slate-700 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${pct}%` }} /></div></div>}</div> })}</div>
          </SectionState>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="btn-primary" onClick={() => { setEditContactId(null); setContactModalOpen(true) }}><Plus size={14} /> Add Contact</button></div>
          <SectionState loading={contactsQuery.isLoading || appContactsQuery.isLoading} error={contactsQuery.error instanceof Error ? contactsQuery.error.message : appContactsQuery.error instanceof Error ? appContactsQuery.error.message : null} empty={contacts.length === 0} emptyText="No contacts found.">
            <div className="space-y-3">{contacts.map((contact) => <div key={contact.id} className="card p-4 space-y-1"><div className="flex justify-between gap-2"><div><div className="text-slate-100 font-semibold">{contact.full_name}</div><div className="text-xs text-slate-400">{contact.title ?? '—'} · {contact.company ?? '—'} · {contact.relationship_type ?? 'other'}</div></div><div className="flex gap-2 items-center"><span className="badge border border-brand-500/40 text-brand-300">Linked apps: {linkedCountByContact[contact.id] ?? 0}</span><button className="btn-ghost" onClick={() => { setEditContactId(contact.id); setContactForm({ full_name: contact.full_name, title: contact.title ?? '', company: contact.company ?? '', email: contact.email ?? '', phone: contact.phone ?? '', linkedin_url: contact.linkedin_url ?? '', relationship_type: contact.relationship_type ?? 'other', last_contacted_date: contact.last_contacted_date ?? '', notes: contact.notes ?? '' }); setContactModalOpen(true) }}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => deleteContactMutation.mutate(contact.id)}><Trash2 size={14} /> Delete</button></div></div><div className="text-sm text-slate-300">{contact.email ?? '—'} · {contact.phone ?? '—'}</div><div className="text-xs text-slate-500">Last contacted: {formatDate(contact.last_contacted_date)}</div></div>)}</div>
          </SectionState>
        </div>
      )}

      <DomainModal title={editAppId ? 'Edit Application' : 'Add Application'} open={appModalOpen} onClose={() => setAppModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([appForm.job_title, appForm.company_name, appForm.status], 'Job title, company, and status are required.')) return; appMutation.mutate() }}>
          <Field label="Job title *"><input className="input-base" value={appForm.job_title} onChange={(e) => setAppForm((s) => ({ ...s, job_title: e.target.value }))} /></Field>
          <Field label="Company name *"><input className="input-base" value={appForm.company_name} onChange={(e) => setAppForm((s) => ({ ...s, company_name: e.target.value }))} /></Field>
          <Field label="Location"><input className="input-base" value={appForm.location} onChange={(e) => setAppForm((s) => ({ ...s, location: e.target.value }))} /></Field>
          <Field label="Work type"><select className="input-base" value={appForm.work_type} onChange={(e) => setAppForm((s) => ({ ...s, work_type: e.target.value }))}><option value="remote">remote</option><option value="hybrid">hybrid</option><option value="onsite">onsite</option></select></Field>
          <Field label="Salary min"><input className="input-base" type="number" value={appForm.salary_min} onChange={(e) => setAppForm((s) => ({ ...s, salary_min: e.target.value }))} /></Field>
          <Field label="Salary max"><input className="input-base" type="number" value={appForm.salary_max} onChange={(e) => setAppForm((s) => ({ ...s, salary_max: e.target.value }))} /></Field>
          <Field label="Job URL"><input className="input-base" value={appForm.job_url} onChange={(e) => setAppForm((s) => ({ ...s, job_url: e.target.value }))} /></Field>
          <Field label="Date applied"><input className="input-base" type="date" value={appForm.date_applied} onChange={(e) => setAppForm((s) => ({ ...s, date_applied: e.target.value }))} /></Field>
          <Field label="Status *"><select className="input-base" value={appForm.status} onChange={(e) => setAppForm((s) => ({ ...s, status: e.target.value as AppStatus }))}>{appStatuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></Field>
          <Field label="Next action"><input className="input-base" value={appForm.next_action} onChange={(e) => setAppForm((s) => ({ ...s, next_action: e.target.value }))} /></Field>
          <Field label="Next action date"><input className="input-base" type="date" value={appForm.next_action_date} onChange={(e) => setAppForm((s) => ({ ...s, next_action_date: e.target.value }))} /></Field>
          <Field label="Notes"><textarea className="input-base min-h-24" value={appForm.notes} onChange={(e) => setAppForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAppModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={appMutation.isPending}>{appMutation.isPending ? 'Saving...' : 'Save Application'}</button></div>
        </form>
      </DomainModal>

      <DomainModal title="Add Interview Round" open={interviewModal.open} onClose={() => setInterviewModal((s) => ({ ...s, open: false }))}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([interviewModal.round_type], 'Round type is required.')) return; addInterviewMutation.mutate() }}>
          <Field label="Round type *"><input className="input-base" value={interviewModal.round_type} onChange={(e) => setInterviewModal((s) => ({ ...s, round_type: e.target.value }))} /></Field>
          <Field label="Interview date"><input className="input-base" type="date" value={interviewModal.interview_date} onChange={(e) => setInterviewModal((s) => ({ ...s, interview_date: e.target.value }))} /></Field>
          <Field label="Interviewer"><input className="input-base" value={interviewModal.interviewer_name} onChange={(e) => setInterviewModal((s) => ({ ...s, interviewer_name: e.target.value }))} /></Field>
          <Field label="Outcome"><input className="input-base" value={interviewModal.outcome} onChange={(e) => setInterviewModal((s) => ({ ...s, outcome: e.target.value }))} /></Field>
          <Field label="Notes"><textarea className="input-base min-h-24" value={interviewModal.notes} onChange={(e) => setInterviewModal((s) => ({ ...s, notes: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setInterviewModal((s) => ({ ...s, open: false }))}>Close</button><button type="submit" className="btn-primary" disabled={addInterviewMutation.isPending}>{addInterviewMutation.isPending ? 'Saving...' : 'Save Round'}</button></div>
        </form>
      </DomainModal>

      <DomainModal title="Link Contact" open={linkContactModal.open} onClose={() => setLinkContactModal((s) => ({ ...s, open: false }))}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([linkContactModal.contact_id], 'Select a contact.')) return; addContactLinkMutation.mutate() }}>
          <Field label="Contact *"><select className="input-base" value={linkContactModal.contact_id} onChange={(e) => setLinkContactModal((s) => ({ ...s, contact_id: e.target.value }))}><option value="">Select contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.full_name}</option>)}</select></Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setLinkContactModal((s) => ({ ...s, open: false }))}>Close</button><button type="submit" className="btn-primary" disabled={addContactLinkMutation.isPending}>{addContactLinkMutation.isPending ? 'Saving...' : 'Link Contact'}</button></div>
        </form>
      </DomainModal>
      <DomainModal title={editCertId ? 'Edit Certification' : 'Add Certification'} open={certModalOpen} onClose={() => setCertModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([certForm.name, certForm.status], 'Name and status are required.')) return; certMutation.mutate() }}>
          <Field label="Certification name *"><input className="input-base" value={certForm.name} onChange={(e) => setCertForm((s) => ({ ...s, name: e.target.value }))} /></Field>
          <Field label="Issuing organization"><input className="input-base" value={certForm.issuing_organization} onChange={(e) => setCertForm((s) => ({ ...s, issuing_organization: e.target.value }))} /></Field>
          <Field label="Issue date"><input className="input-base" type="date" value={certForm.issue_date} onChange={(e) => setCertForm((s) => ({ ...s, issue_date: e.target.value }))} /></Field>
          <Field label="Expiry date"><input className="input-base" type="date" value={certForm.expiry_date} onChange={(e) => setCertForm((s) => ({ ...s, expiry_date: e.target.value }))} /></Field>
          <Field label="Credential ID"><input className="input-base" value={certForm.credential_id} onChange={(e) => setCertForm((s) => ({ ...s, credential_id: e.target.value }))} /></Field>
          <Field label="Credential URL"><input className="input-base" value={certForm.credential_url} onChange={(e) => setCertForm((s) => ({ ...s, credential_url: e.target.value }))} /></Field>
          <Field label="Status *"><select className="input-base" value={certForm.status} onChange={(e) => setCertForm((s) => ({ ...s, status: e.target.value }))}><option value="in_progress">in_progress</option><option value="earned">earned</option><option value="expired">expired</option><option value="renewed">renewed</option></select></Field>
          <Field label="Study hours completed"><input className="input-base" type="number" min="0" value={certForm.study_hours_completed} onChange={(e) => setCertForm((s) => ({ ...s, study_hours_completed: e.target.value }))} /></Field>
          <Field label="Study hours target"><input className="input-base" type="number" min="0" value={certForm.study_hours_target} onChange={(e) => setCertForm((s) => ({ ...s, study_hours_target: e.target.value }))} /></Field>
          <Field label="Notes"><textarea className="input-base min-h-24" value={certForm.notes} onChange={(e) => setCertForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setCertModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={certMutation.isPending}>{certMutation.isPending ? 'Saving...' : 'Save Certification'}</button></div>
        </form>
      </DomainModal>

      <DomainModal title={editContactId ? 'Edit Contact' : 'Add Contact'} open={contactModalOpen} onClose={() => setContactModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([contactForm.full_name], 'Full name is required.')) return; contactMutation.mutate() }}>
          <Field label="Full name *"><input className="input-base" value={contactForm.full_name} onChange={(e) => setContactForm((s) => ({ ...s, full_name: e.target.value }))} /></Field>
          <Field label="Title"><input className="input-base" value={contactForm.title} onChange={(e) => setContactForm((s) => ({ ...s, title: e.target.value }))} /></Field>
          <Field label="Company"><input className="input-base" value={contactForm.company} onChange={(e) => setContactForm((s) => ({ ...s, company: e.target.value }))} /></Field>
          <Field label="Email"><input className="input-base" type="email" value={contactForm.email} onChange={(e) => setContactForm((s) => ({ ...s, email: e.target.value }))} /></Field>
          <Field label="Phone"><input className="input-base" value={contactForm.phone} onChange={(e) => setContactForm((s) => ({ ...s, phone: e.target.value }))} /></Field>
          <Field label="LinkedIn URL"><input className="input-base" value={contactForm.linkedin_url} onChange={(e) => setContactForm((s) => ({ ...s, linkedin_url: e.target.value }))} /></Field>
          <Field label="Relationship type"><select className="input-base" value={contactForm.relationship_type} onChange={(e) => setContactForm((s) => ({ ...s, relationship_type: e.target.value }))}><option value="recruiter">recruiter</option><option value="hiring_manager">hiring_manager</option><option value="colleague">colleague</option><option value="reference">reference</option><option value="other">other</option></select></Field>
          <Field label="Last contacted"><input className="input-base" type="date" value={contactForm.last_contacted_date} onChange={(e) => setContactForm((s) => ({ ...s, last_contacted_date: e.target.value }))} /></Field>
          <Field label="Notes"><textarea className="input-base min-h-24" value={contactForm.notes} onChange={(e) => setContactForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setContactModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={contactMutation.isPending}>{contactMutation.isPending ? 'Saving...' : 'Save Contact'}</button></div>
        </form>
      </DomainModal>
    </div>
  )
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return <label className="text-sm text-slate-300 space-y-1 block"><span className="text-xs text-slate-400">{label}</span>{children}</label>
}
