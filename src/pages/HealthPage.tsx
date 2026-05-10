import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { DomainModal, SectionState, TabButton, ToastViewport, formatDate, formatUsd, maskLast4, useToastState } from '@/components/health/HealthUi'

type LooseDb = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>
  }
}
const db = supabase as unknown as SupabaseClient<LooseDb>

type Tab = 'insurance' | 'appointments' | 'claims' | 'prescriptions'

type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'
type ClaimStatus = 'submitted' | 'processing' | 'approved' | 'denied' | 'appealing' | 'paid'

interface InsurancePolicy { id: string; insurer_name: string; policy_number: string | null; plan_name: string | null; policy_type: string; premium_amount: number | null; premium_frequency: string | null; deductible: number | null; out_of_pocket_max: number | null; effective_date: string | null; renewal_date: string | null }
interface PolicyMember { id: string; policy_id: string; household_member_id: string; member_id_number: string | null; household_member?: { full_name: string; relationship: string | null } | null }
interface HouseholdMember { id: string; full_name: string; relationship: string | null }
interface Appointment { id: string; provider_name: string; specialty: string | null; appointment_type: string | null; appointment_date: string; location: string | null; notes: string | null; household_member_id: string | null; insurance_policy_id: string | null; status: AppointmentStatus }
interface InsuranceClaim { id: string; claim_number: string; policy_id: string; service_date: string; provider_name: string; diagnosis_code: string | null; billed_amount: number | null; allowed_amount: number | null; insurance_paid: number | null; patient_responsibility: number | null; status: ClaimStatus; notes: string | null }
interface Prescription { id: string; household_member_id: string | null; medication_name: string; dosage: string | null; frequency: string | null; prescriber_name: string | null; pharmacy_name: string | null; refills_remaining: number | null; last_filled_date: string | null; next_fill_date: string | null; cost_per_fill: number | null; notes: string | null; is_active: boolean }

const POLICY_TYPES = ['medical', 'dental', 'vision', 'life', 'disability', 'other']
const APPOINTMENT_STATUS: AppointmentStatus[] = ['scheduled', 'completed', 'cancelled', 'no_show']
const CLAIM_STATUS: ClaimStatus[] = ['submitted', 'processing', 'approved', 'denied', 'appealing', 'paid']

const STATUS_CLASS: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  cancelled: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  no_show: 'bg-red-500/20 text-red-300 border-red-500/40',
  submitted: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  processing: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  denied: 'bg-red-500/20 text-red-300 border-red-500/40',
  appealing: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  paid: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
}

function parseFiniteNumber(value: string, fieldName: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number.`)
  }
  return parsed
}

export default function HealthPage() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  const { toast, toasts } = useToastState()
  const [tab, setTab] = useState<Tab>('insurance')
  const [showCancelledAppointments, setShowCancelledAppointments] = useState(false)

  const [policyModalOpen, setPolicyModalOpen] = useState(false)
  const [editPolicyId, setEditPolicyId] = useState<string | null>(null)
  const [policyForm, setPolicyForm] = useState({ insurer_name: '', policy_number: '', plan_name: '', policy_type: 'medical', premium_amount: '', premium_frequency: '', deductible: '', out_of_pocket_max: '', effective_date: '', renewal_date: '' })

  const [memberModal, setMemberModal] = useState({ open: false, policyId: '', household_member_id: '', member_id_number: '' })

  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false)
  const [editAppointmentId, setEditAppointmentId] = useState<string | null>(null)
  const [appointmentForm, setAppointmentForm] = useState({ provider_name: '', specialty: '', appointment_type: '', appointment_date: '', location: '', notes: '', household_member_id: '', insurance_policy_id: '', status: 'scheduled' as AppointmentStatus })

  const [claimModalOpen, setClaimModalOpen] = useState(false)
  const [editClaimId, setEditClaimId] = useState<string | null>(null)
  const [claimForm, setClaimForm] = useState({ claim_number: '', policy_id: '', service_date: '', provider_name: '', diagnosis_code: '', billed_amount: '', allowed_amount: '', insurance_paid: '', patient_responsibility: '', status: 'submitted' as ClaimStatus, notes: '' })

  const [prescriptionModalOpen, setPrescriptionModalOpen] = useState(false)
  const [editPrescriptionId, setEditPrescriptionId] = useState<string | null>(null)
  const [prescriptionForm, setPrescriptionForm] = useState({ household_member_id: '', medication_name: '', dosage: '', frequency: '', prescriber_name: '', pharmacy_name: '', refills_remaining: '', last_filled_date: '', next_fill_date: '', cost_per_fill: '', notes: '' })

  const membersQuery = useQuery({
    queryKey: ['health-members', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db.from('household_members').select('id, full_name, relationship').eq('user_id', userId as string).order('full_name')
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as HouseholdMember[]
    },
  })
  const policiesQuery = useQuery({
    queryKey: ['health-policies', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db.from('insurance_policies').select('id, insurer_name, policy_number, plan_name, policy_type, premium_amount, premium_frequency, deductible, out_of_pocket_max, effective_date, renewal_date').eq('user_id', userId as string).eq('is_deleted', false)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as InsurancePolicy[]
    },
  })
  const policyMembersQuery = useQuery({
    queryKey: ['health-policy-members', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const policyIds = (policiesQuery.data ?? []).map((policy) => policy.id)
      if (policyIds.length === 0) return []
      const { data, error } = await db
        .from('policy_members')
        .select('id, policy_id, household_member_id, member_id_number, household_member:household_member_id(full_name, relationship)')
        .in('policy_id', policyIds)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as PolicyMember[]
    },
  })
  const appointmentsQuery = useQuery({
    queryKey: ['health-appointments', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db.from('appointments').select('id, provider_name, specialty, appointment_type, appointment_date, location, notes, household_member_id, insurance_policy_id, status').eq('user_id', userId as string).eq('is_deleted', false).order('appointment_date')
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Appointment[]
    },
  })
  const claimsQuery = useQuery({
    queryKey: ['health-claims', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db.from('insurance_claims').select('id, claim_number, policy_id, service_date, provider_name, diagnosis_code, billed_amount, allowed_amount, insurance_paid, patient_responsibility, status, notes').eq('user_id', userId as string).eq('is_deleted', false).order('service_date', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as InsuranceClaim[]
    },
  })
  const prescriptionsQuery = useQuery({
    queryKey: ['health-prescriptions', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await db
        .from('prescriptions')
        .select('id, household_member_id, medication_name, dosage, frequency, prescriber_name, pharmacy_name, refills_remaining, last_filled_date, next_fill_date, cost_per_fill, notes, is_active')
        .eq('user_id', userId as string)
        .eq('is_active', true)
        .order('medication_name')
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Prescription[]
    },
  })

  const invalidate = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['health-policies', userId] }),
    queryClient.invalidateQueries({ queryKey: ['health-policy-members', userId] }),
    queryClient.invalidateQueries({ queryKey: ['health-appointments', userId] }),
    queryClient.invalidateQueries({ queryKey: ['health-claims', userId] }),
    queryClient.invalidateQueries({ queryKey: ['health-prescriptions', userId] }),
  ])
  const policies = policiesQuery.data ?? []
  const policyMembers = policyMembersQuery.data ?? []
  const appointments = appointmentsQuery.data ?? []
  const claims = claimsQuery.data ?? []
  const prescriptions = prescriptionsQuery.data ?? []
  const members = membersQuery.data ?? []
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const policyMap = useMemo(() => new Map(policies.map((p) => [p.id, p])), [policies])

  const policyMutation = useMutation({
    mutationFn: async () => {
      const payload = { user_id: userId, insurer_name: policyForm.insurer_name.trim(), policy_number: policyForm.policy_number.trim(), plan_name: policyForm.plan_name.trim(), policy_type: policyForm.policy_type, premium_amount: parseFiniteNumber(policyForm.premium_amount, 'Premium amount'), premium_frequency: policyForm.premium_frequency.trim(), deductible: parseFiniteNumber(policyForm.deductible, 'Deductible'), out_of_pocket_max: parseFiniteNumber(policyForm.out_of_pocket_max, 'Out of pocket max'), effective_date: policyForm.effective_date, renewal_date: policyForm.renewal_date }
      if (editPolicyId) {
        const { error } = await db.from('insurance_policies').update(payload).eq('id', editPolicyId).eq('user_id', userId as string)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await db.from('insurance_policies').insert(payload)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: async () => { toast.success(editPolicyId ? 'Policy updated.' : 'Policy added.'); setPolicyModalOpen(false); setEditPolicyId(null); setPolicyForm({ insurer_name: '', policy_number: '', plan_name: '', policy_type: 'medical', premium_amount: '', premium_frequency: '', deductible: '', out_of_pocket_max: '', effective_date: '', renewal_date: '' }); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const addMemberMutation = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('policy_members').insert({ policy_id: memberModal.policyId, household_member_id: memberModal.household_member_id, member_id_number: memberModal.member_id_number || null, is_primary: false })
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => { toast.success('Member added.'); setMemberModal({ open: false, policyId: '', household_member_id: '', member_id_number: '' }); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const deletePolicyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('insurance_policies').update({ is_deleted: true }).eq('id', id).eq('user_id', userId as string)
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => { toast.success('Policy deleted.'); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const appointmentMutation = useMutation({
    mutationFn: async () => {
      const payload = { user_id: userId, provider_name: appointmentForm.provider_name.trim(), specialty: appointmentForm.specialty || null, appointment_type: appointmentForm.appointment_type, appointment_date: appointmentForm.appointment_date, location: appointmentForm.location || null, notes: appointmentForm.notes || null, household_member_id: appointmentForm.household_member_id || null, insurance_policy_id: appointmentForm.insurance_policy_id || null, status: appointmentForm.status }
      if (editAppointmentId) {
        const { error } = await db.from('appointments').update(payload).eq('id', editAppointmentId).eq('user_id', userId as string)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await db.from('appointments').insert(payload)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: async () => { toast.success(editAppointmentId ? 'Appointment updated.' : 'Appointment added.'); setAppointmentModalOpen(false); setEditAppointmentId(null); setAppointmentForm({ provider_name: '', specialty: '', appointment_type: '', appointment_date: '', location: '', notes: '', household_member_id: '', insurance_policy_id: '', status: 'scheduled' }); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const cancelAppointmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('appointments').update({ status: 'cancelled' }).eq('id', id).eq('user_id', userId as string)
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => { toast.success('Appointment cancelled.'); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const claimMutation = useMutation({
    mutationFn: async () => {
      const payload = { user_id: userId, claim_number: claimForm.claim_number, policy_id: claimForm.policy_id, service_date: claimForm.service_date, provider_name: claimForm.provider_name, diagnosis_code: claimForm.diagnosis_code || null, billed_amount: parseFiniteNumber(claimForm.billed_amount, 'Billed amount'), allowed_amount: parseFiniteNumber(claimForm.allowed_amount, 'Allowed amount'), insurance_paid: parseFiniteNumber(claimForm.insurance_paid, 'Insurance paid'), patient_responsibility: parseFiniteNumber(claimForm.patient_responsibility, 'Patient responsibility'), status: claimForm.status, notes: claimForm.notes || null }
      if (editClaimId) {
        const { error } = await db.from('insurance_claims').update(payload).eq('id', editClaimId).eq('user_id', userId as string)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await db.from('insurance_claims').insert(payload)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: async () => { toast.success(editClaimId ? 'Claim updated.' : 'Claim added.'); setClaimModalOpen(false); setEditClaimId(null); setClaimForm({ claim_number: '', policy_id: '', service_date: '', provider_name: '', diagnosis_code: '', billed_amount: '', allowed_amount: '', insurance_paid: '', patient_responsibility: '', status: 'submitted', notes: '' }); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const deleteClaimMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('insurance_claims').update({ is_deleted: true }).eq('id', id).eq('user_id', userId as string)
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => { toast.success('Claim deleted.'); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const prescriptionMutation = useMutation({
    mutationFn: async () => {
      const payload = { user_id: userId, household_member_id: prescriptionForm.household_member_id || null, medication_name: prescriptionForm.medication_name, dosage: prescriptionForm.dosage || null, frequency: prescriptionForm.frequency || null, prescriber_name: prescriptionForm.prescriber_name || null, pharmacy_name: prescriptionForm.pharmacy_name || null, refills_remaining: parseFiniteNumber(prescriptionForm.refills_remaining, 'Refills remaining'), last_filled_date: prescriptionForm.last_filled_date || null, next_fill_date: prescriptionForm.next_fill_date || null, cost_per_fill: parseFiniteNumber(prescriptionForm.cost_per_fill, 'Cost per fill'), notes: prescriptionForm.notes || null, is_active: true }
      if (editPrescriptionId) {
        const { error } = await db.from('prescriptions').update(payload).eq('id', editPrescriptionId).eq('user_id', userId as string)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await db.from('prescriptions').insert(payload)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: async () => { toast.success(editPrescriptionId ? 'Prescription updated.' : 'Prescription added.'); setPrescriptionModalOpen(false); setEditPrescriptionId(null); setPrescriptionForm({ household_member_id: '', medication_name: '', dosage: '', frequency: '', prescriber_name: '', pharmacy_name: '', refills_remaining: '', last_filled_date: '', next_fill_date: '', cost_per_fill: '', notes: '' }); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })
  const archivePrescriptionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('prescriptions').update({ is_active: false }).eq('id', id).eq('user_id', userId as string)
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => { toast.success('Prescription archived.'); await invalidate() },
    onError: (error: Error) => toast.error(error.message),
  })

  const now = new Date()
  const appointmentSorted = [...appointments].sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
  const upcoming = appointmentSorted.filter((a) => a.status !== 'cancelled' && new Date(a.appointment_date) >= now)
  const nonUpcoming = appointmentSorted.filter((a) => a.status !== 'cancelled' && new Date(a.appointment_date) < now)
  const cancelled = appointmentSorted.filter((a) => a.status === 'cancelled')

  const year = new Date().getFullYear()
  const ytdClaims = claims.filter((c) => new Date(c.service_date).getFullYear() === year)
  const totals = ytdClaims.reduce((acc, claim) => ({ billed: acc.billed + (claim.billed_amount ?? 0), paid: acc.paid + (claim.insurance_paid ?? 0), patient: acc.patient + (claim.patient_responsibility ?? 0) }), { billed: 0, paid: 0, patient: 0 })

  const openPolicy = (policy?: InsurancePolicy) => {
    if (policy) {
      setEditPolicyId(policy.id)
      setPolicyForm({ insurer_name: policy.insurer_name, policy_number: policy.policy_number ?? '', plan_name: policy.plan_name ?? '', policy_type: policy.policy_type, premium_amount: String(policy.premium_amount ?? ''), premium_frequency: policy.premium_frequency ?? '', deductible: String(policy.deductible ?? ''), out_of_pocket_max: String(policy.out_of_pocket_max ?? ''), effective_date: policy.effective_date ?? '', renewal_date: policy.renewal_date ?? '' })
    } else {
      setEditPolicyId(null)
      setPolicyForm({ insurer_name: '', policy_number: '', plan_name: '', policy_type: 'medical', premium_amount: '', premium_frequency: '', deductible: '', out_of_pocket_max: '', effective_date: '', renewal_date: '' })
    }
    setPolicyModalOpen(true)
  }
  const openAppointment = (item?: Appointment) => {
    if (item) {
      setEditAppointmentId(item.id)
      setAppointmentForm({ provider_name: item.provider_name, specialty: item.specialty ?? '', appointment_type: item.appointment_type ?? '', appointment_date: item.appointment_date.slice(0, 16), location: item.location ?? '', notes: item.notes ?? '', household_member_id: item.household_member_id ?? '', insurance_policy_id: item.insurance_policy_id ?? '', status: item.status })
    } else {
      setEditAppointmentId(null)
      setAppointmentForm({ provider_name: '', specialty: '', appointment_type: '', appointment_date: '', location: '', notes: '', household_member_id: '', insurance_policy_id: '', status: 'scheduled' })
    }
    setAppointmentModalOpen(true)
  }
  const openClaim = (claim?: InsuranceClaim) => {
    if (claim) {
      setEditClaimId(claim.id)
      setClaimForm({ claim_number: claim.claim_number, policy_id: claim.policy_id, service_date: claim.service_date, provider_name: claim.provider_name, diagnosis_code: claim.diagnosis_code ?? '', billed_amount: String(claim.billed_amount ?? ''), allowed_amount: String(claim.allowed_amount ?? ''), insurance_paid: String(claim.insurance_paid ?? ''), patient_responsibility: String(claim.patient_responsibility ?? ''), status: claim.status, notes: claim.notes ?? '' })
    } else {
      setEditClaimId(null)
      setClaimForm({ claim_number: '', policy_id: '', service_date: '', provider_name: '', diagnosis_code: '', billed_amount: '', allowed_amount: '', insurance_paid: '', patient_responsibility: '', status: 'submitted', notes: '' })
    }
    setClaimModalOpen(true)
  }
  const openPrescription = (prescription?: Prescription) => {
    if (prescription) {
      setEditPrescriptionId(prescription.id)
      setPrescriptionForm({ household_member_id: prescription.household_member_id ?? '', medication_name: prescription.medication_name, dosage: prescription.dosage ?? '', frequency: prescription.frequency ?? '', prescriber_name: prescription.prescriber_name ?? '', pharmacy_name: prescription.pharmacy_name ?? '', refills_remaining: String(prescription.refills_remaining ?? ''), last_filled_date: prescription.last_filled_date ?? '', next_fill_date: prescription.next_fill_date ?? '', cost_per_fill: String(prescription.cost_per_fill ?? ''), notes: prescription.notes ?? '' })
    } else {
      setEditPrescriptionId(null)
      setPrescriptionForm({ household_member_id: '', medication_name: '', dosage: '', frequency: '', prescriber_name: '', pharmacy_name: '', refills_remaining: '', last_filled_date: '', next_fill_date: '', cost_per_fill: '', notes: '' })
    }
    setPrescriptionModalOpen(true)
  }

  const requireFields = (values: Array<string>, message: string) => {
    if (values.some((v) => !v || !v.trim())) {
      toast.error(message)
      return false
    }
    return true
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <ToastViewport toasts={toasts} />
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Health Management</h1>
        <p className="text-sm text-slate-400 mt-0.5">Insurance, appointments, claims, and prescriptions</p>
      </div>

      <div className="card p-3 flex flex-wrap gap-2">
        <TabButton label="Insurance" active={tab === 'insurance'} onClick={() => setTab('insurance')} />
        <TabButton label="Appointments" active={tab === 'appointments'} onClick={() => setTab('appointments')} />
        <TabButton label="Claims" active={tab === 'claims'} onClick={() => setTab('claims')} />
        <TabButton label="Prescriptions" active={tab === 'prescriptions'} onClick={() => setTab('prescriptions')} />
      </div>

      {tab === 'insurance' && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="btn-primary" onClick={() => openPolicy()}><Plus size={14} /> Add Policy</button></div>
          <SectionState loading={policiesQuery.isLoading || policyMembersQuery.isLoading} error={policiesQuery.error instanceof Error ? policiesQuery.error.message : policyMembersQuery.error instanceof Error ? policyMembersQuery.error.message : null} empty={policies.length === 0} emptyText="No insurance policies found.">
            <div className="space-y-3">
              {policies.map((policy) => {
                const linkedMembers = policyMembers.filter((pm) => pm.policy_id === policy.id)
                return (
                  <div key={policy.id} className="card p-4 space-y-3">
                    <div className="flex justify-between gap-3">
                      <div>
                        <div className="text-slate-100 font-semibold">{policy.insurer_name}</div>
                        <div className="text-xs text-slate-400">{policy.plan_name ?? '—'} · {policy.policy_type} · {maskLast4(policy.policy_number)}</div>
                      </div>
                      <div className="flex gap-2"><button className="btn-ghost" onClick={() => openPolicy(policy)}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => deletePolicyMutation.mutate(policy.id)}><Trash2 size={14} /> Delete</button></div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-2 text-sm text-slate-300">
                      <div>Premium: <span className="text-slate-100">{formatUsd(policy.premium_amount)}</span>/{policy.premium_frequency ?? '—'}</div>
                      <div>Deductible: <span className="text-slate-100">{formatUsd(policy.deductible)}</span></div>
                      <div>OOP Max: <span className="text-slate-100">{formatUsd(policy.out_of_pocket_max)}</span></div>
                      <div>Effective: <span className="text-slate-100">{formatDate(policy.effective_date)}</span></div>
                      <div>Renewal: <span className="text-slate-100">{formatDate(policy.renewal_date)}</span></div>
                    </div>
                    <div className="border-t border-slate-700/60 pt-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-200 font-medium flex items-center gap-2"><Users size={14} /> Members</div>
                        <button className="btn-ghost" onClick={() => setMemberModal({ open: true, policyId: policy.id, household_member_id: '', member_id_number: '' })}><Plus size={14} /> Add Member</button>
                      </div>
                      {linkedMembers.length === 0 ? <div className="text-xs text-slate-500 mt-2">No members linked.</div> : (
                        <div className="mt-2 space-y-1">{linkedMembers.map((member) => <div key={member.id} className="bg-slate-800/60 rounded-lg px-3 py-2 text-sm flex justify-between"><span>{member.household_member?.full_name ?? memberMap.get(member.household_member_id)?.full_name ?? 'Unknown'}</span><span className="text-xs text-slate-500">{member.household_member?.relationship ?? memberMap.get(member.household_member_id)?.relationship ?? '—'} · {maskLast4(member.member_id_number)}</span></div>)}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionState>
        </div>
      )}

      {tab === 'appointments' && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="btn-primary" onClick={() => openAppointment()}><Plus size={14} /> Add Appointment</button></div>
          <SectionState loading={appointmentsQuery.isLoading} error={appointmentsQuery.error instanceof Error ? appointmentsQuery.error.message : null} empty={appointments.length === 0} emptyText="No appointments found.">
            <div className="space-y-3">
              {[...upcoming, ...nonUpcoming].map((appt) => (
                <div key={appt.id} className={`card p-4 border ${new Date(appt.appointment_date) >= now ? 'border-brand-500/40' : 'border-slate-700/60'}`}>
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="text-slate-100 font-semibold">{appt.provider_name}</div>
                      <div className="text-xs text-slate-400">{appt.specialty ?? 'General'} · {appt.appointment_type ?? 'Visit'}</div>
                    </div>
                    <div className="flex gap-2 items-center"><span className={`badge border ${STATUS_CLASS[appt.status]}`}>{appt.status.replace('_', ' ')}</span><button className="btn-ghost" onClick={() => openAppointment(appt)}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => cancelAppointmentMutation.mutate(appt.id)}>Cancel</button></div>
                  </div>
                  <div className="mt-2 grid md:grid-cols-2 text-sm text-slate-300 gap-1">
                    <div>Date: <span className="text-slate-100">{new Date(appt.appointment_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
                    <div>Location: <span className="text-slate-100">{appt.location ?? '—'}</span></div>
                    <div>Member: <span className="text-slate-100">{appt.household_member_id ? (memberMap.get(appt.household_member_id)?.full_name ?? 'Unknown') : '—'}</span></div>
                    <div>Policy: <span className="text-slate-100">{appt.insurance_policy_id ? (policyMap.get(appt.insurance_policy_id)?.insurer_name ?? 'Unknown') : '—'}</span></div>
                  </div>
                </div>
              ))}
              <div className="card p-3">
                <button className="text-sm text-slate-200 flex items-center gap-2" onClick={() => setShowCancelledAppointments((v) => !v)}>{showCancelledAppointments ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Cancelled appointments ({cancelled.length})</button>
                {showCancelledAppointments && <div className="mt-3 space-y-2">{cancelled.length === 0 ? <div className="text-xs text-slate-500">None</div> : cancelled.map((appt) => <div key={appt.id} className="bg-slate-800/60 rounded-lg px-3 py-2 text-sm">{appt.provider_name} · {formatDate(appt.appointment_date)}</div>)}</div>}
              </div>
            </div>
          </SectionState>
        </div>
      )}
      {tab === 'claims' && (
        <div className="space-y-4">
          <div className="card p-4 grid md:grid-cols-3 gap-3"><SummaryCard label="Total billed (YTD)" value={formatUsd(totals.billed)} /><SummaryCard label="Insurance paid (YTD)" value={formatUsd(totals.paid)} /><SummaryCard label="Patient responsibility (YTD)" value={formatUsd(totals.patient)} /></div>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => openClaim()}><Plus size={14} /> Add Claim</button></div>
          <SectionState loading={claimsQuery.isLoading} error={claimsQuery.error instanceof Error ? claimsQuery.error.message : null} empty={claims.length === 0} emptyText="No claims found.">
            <div className="space-y-3">{claims.map((claim) => <div key={claim.id} className="card p-4 space-y-2"><div className="flex justify-between"><div><div className="text-slate-100 font-semibold">Claim #{claim.claim_number}</div><div className="text-xs text-slate-400">{claim.provider_name} · {formatDate(claim.service_date)}</div></div><div className="flex gap-2 items-center"><span className={`badge border ${STATUS_CLASS[claim.status]}`}>{claim.status}</span><button className="btn-ghost" onClick={() => openClaim(claim)}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => deleteClaimMutation.mutate(claim.id)}><Trash2 size={14} /> Delete</button></div></div><div className="grid md:grid-cols-2 gap-1 text-sm text-slate-300"><div>Diagnosis: <span className="text-slate-100">{claim.diagnosis_code ?? '—'}</span></div><div>Billed: <span className="text-slate-100">{formatUsd(claim.billed_amount)}</span></div><div>Allowed: <span className="text-slate-100">{formatUsd(claim.allowed_amount)}</span></div><div>Insurance paid: <span className="text-slate-100">{formatUsd(claim.insurance_paid)}</span></div><div>Patient responsibility: <span className="text-slate-100">{formatUsd(claim.patient_responsibility)}</span></div></div></div>)}</div>
          </SectionState>
        </div>
      )}

      {tab === 'prescriptions' && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="btn-primary" onClick={() => openPrescription()}><Plus size={14} /> Add Prescription</button></div>
          <SectionState loading={prescriptionsQuery.isLoading} error={prescriptionsQuery.error instanceof Error ? prescriptionsQuery.error.message : null} empty={prescriptions.length === 0} emptyText="No prescriptions found.">
            <div className="space-y-3">{prescriptions.map((rx) => { const refill = rx.refills_remaining ?? 0; const badgeClass = refill <= 0 ? 'text-red-300 bg-red-500/10 border-red-500/40' : refill <= 1 ? 'text-amber-300 bg-amber-500/10 border-amber-500/40' : 'text-slate-300 bg-slate-700/40 border-slate-600/60'; return <div key={rx.id} className="card p-4 space-y-2"><div className="flex justify-between"><div><div className="text-slate-100 font-semibold">{rx.medication_name}</div><div className="text-xs text-slate-400">{rx.dosage ?? '—'} · {rx.frequency ?? '—'}</div></div><div className="flex gap-2 items-center"><button className="btn-ghost" onClick={() => openPrescription(rx)}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => archivePrescriptionMutation.mutate(rx.id)}>Archive</button></div></div><div className="grid md:grid-cols-2 gap-1 text-sm text-slate-300"><div>Prescriber: <span className="text-slate-100">{rx.prescriber_name ?? '—'}</span></div><div>Pharmacy: <span className="text-slate-100">{rx.pharmacy_name ?? '—'}</span></div><div>Last filled: <span className="text-slate-100">{formatDate(rx.last_filled_date)}</span></div><div>Next fill: <span className="text-slate-100">{formatDate(rx.next_fill_date)}</span></div><div>Cost/fill: <span className="text-slate-100">{formatUsd(rx.cost_per_fill)}</span></div><div className={`w-fit rounded-md border px-2 py-1 ${badgeClass}`}>Refills: {refill}</div></div></div> })}</div>
          </SectionState>
        </div>
      )}

      <DomainModal title={editPolicyId ? 'Edit Policy' : 'Add Policy'} open={policyModalOpen} onClose={() => setPolicyModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([policyForm.insurer_name, policyForm.policy_number, policyForm.plan_name, policyForm.policy_type, policyForm.premium_amount, policyForm.premium_frequency, policyForm.deductible, policyForm.out_of_pocket_max, policyForm.effective_date, policyForm.renewal_date], 'Please complete all required policy fields.')) return; policyMutation.mutate() }}>
          <Field label="Insurer name *"><input className="input-base" value={policyForm.insurer_name} onChange={(e) => setPolicyForm((s) => ({ ...s, insurer_name: e.target.value }))} /></Field>
          <Field label="Policy number *"><input className="input-base" value={policyForm.policy_number} onChange={(e) => setPolicyForm((s) => ({ ...s, policy_number: e.target.value }))} /></Field>
          <Field label="Plan name *"><input className="input-base" value={policyForm.plan_name} onChange={(e) => setPolicyForm((s) => ({ ...s, plan_name: e.target.value }))} /></Field>
          <Field label="Policy type *"><select className="input-base" value={policyForm.policy_type} onChange={(e) => setPolicyForm((s) => ({ ...s, policy_type: e.target.value }))}>{POLICY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
          <Field label="Premium amount *"><input className="input-base" type="number" min="0" step="0.01" value={policyForm.premium_amount} onChange={(e) => setPolicyForm((s) => ({ ...s, premium_amount: e.target.value }))} /></Field>
          <Field label="Premium frequency *"><input className="input-base" value={policyForm.premium_frequency} onChange={(e) => setPolicyForm((s) => ({ ...s, premium_frequency: e.target.value }))} /></Field>
          <Field label="Deductible *"><input className="input-base" type="number" min="0" step="0.01" value={policyForm.deductible} onChange={(e) => setPolicyForm((s) => ({ ...s, deductible: e.target.value }))} /></Field>
          <Field label="Out of pocket max *"><input className="input-base" type="number" min="0" step="0.01" value={policyForm.out_of_pocket_max} onChange={(e) => setPolicyForm((s) => ({ ...s, out_of_pocket_max: e.target.value }))} /></Field>
          <Field label="Effective date *"><input className="input-base" type="date" value={policyForm.effective_date} onChange={(e) => setPolicyForm((s) => ({ ...s, effective_date: e.target.value }))} /></Field>
          <Field label="Renewal date *"><input className="input-base" type="date" value={policyForm.renewal_date} onChange={(e) => setPolicyForm((s) => ({ ...s, renewal_date: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setPolicyModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={policyMutation.isPending}>{policyMutation.isPending ? 'Saving...' : 'Save Policy'}</button></div>
        </form>
      </DomainModal>

      <DomainModal title="Add Policy Member" open={memberModal.open} onClose={() => setMemberModal((s) => ({ ...s, open: false }))}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([memberModal.household_member_id], 'Select a household member.')) return; addMemberMutation.mutate() }}>
          <Field label="Household member *"><select className="input-base" value={memberModal.household_member_id} onChange={(e) => setMemberModal((s) => ({ ...s, household_member_id: e.target.value }))}><option value="">Select member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
          <Field label="Member ID"><input className="input-base" value={memberModal.member_id_number} onChange={(e) => setMemberModal((s) => ({ ...s, member_id_number: e.target.value }))} /></Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setMemberModal((s) => ({ ...s, open: false }))}>Close</button><button type="submit" className="btn-primary" disabled={addMemberMutation.isPending}>{addMemberMutation.isPending ? 'Saving...' : 'Save Member'}</button></div>
        </form>
      </DomainModal>
      <DomainModal title={editAppointmentId ? 'Edit Appointment' : 'Add Appointment'} open={appointmentModalOpen} onClose={() => setAppointmentModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([appointmentForm.provider_name, appointmentForm.appointment_type, appointmentForm.appointment_date, appointmentForm.status], 'Please complete all required appointment fields.')) return; appointmentMutation.mutate() }}>
          <Field label="Provider name *"><input className="input-base" value={appointmentForm.provider_name} onChange={(e) => setAppointmentForm((s) => ({ ...s, provider_name: e.target.value }))} /></Field>
          <Field label="Specialty"><input className="input-base" value={appointmentForm.specialty} onChange={(e) => setAppointmentForm((s) => ({ ...s, specialty: e.target.value }))} /></Field>
          <Field label="Appointment type *"><input className="input-base" value={appointmentForm.appointment_type} onChange={(e) => setAppointmentForm((s) => ({ ...s, appointment_type: e.target.value }))} /></Field>
          <Field label="Date/time *"><input className="input-base" type="datetime-local" value={appointmentForm.appointment_date} onChange={(e) => setAppointmentForm((s) => ({ ...s, appointment_date: e.target.value }))} /></Field>
          <Field label="Location"><input className="input-base" value={appointmentForm.location} onChange={(e) => setAppointmentForm((s) => ({ ...s, location: e.target.value }))} /></Field>
          <Field label="Status *"><select className="input-base" value={appointmentForm.status} onChange={(e) => setAppointmentForm((s) => ({ ...s, status: e.target.value as AppointmentStatus }))}>{APPOINTMENT_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
          <Field label="Household member"><select className="input-base" value={appointmentForm.household_member_id} onChange={(e) => setAppointmentForm((s) => ({ ...s, household_member_id: e.target.value }))}><option value="">None</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
          <Field label="Insurance policy"><select className="input-base" value={appointmentForm.insurance_policy_id} onChange={(e) => setAppointmentForm((s) => ({ ...s, insurance_policy_id: e.target.value }))}><option value="">None</option>{policies.map((p) => <option key={p.id} value={p.id}>{p.insurer_name} · {maskLast4(p.policy_number)}</option>)}</select></Field>
          <Field label="Notes"><textarea className="input-base min-h-24" value={appointmentForm.notes} onChange={(e) => setAppointmentForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAppointmentModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={appointmentMutation.isPending}>{appointmentMutation.isPending ? 'Saving...' : 'Save Appointment'}</button></div>
        </form>
      </DomainModal>

      <DomainModal title={editClaimId ? 'Edit Claim' : 'Add Claim'} open={claimModalOpen} onClose={() => setClaimModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([claimForm.claim_number, claimForm.policy_id, claimForm.service_date, claimForm.provider_name, claimForm.billed_amount, claimForm.allowed_amount, claimForm.insurance_paid, claimForm.patient_responsibility, claimForm.status], 'Please complete all required claim fields.')) return; claimMutation.mutate() }}>
          <Field label="Claim number *"><input className="input-base" value={claimForm.claim_number} onChange={(e) => setClaimForm((s) => ({ ...s, claim_number: e.target.value }))} /></Field>
          <Field label="Policy *"><select className="input-base" value={claimForm.policy_id} onChange={(e) => setClaimForm((s) => ({ ...s, policy_id: e.target.value }))}><option value="">Select policy</option>{policies.map((p) => <option key={p.id} value={p.id}>{p.insurer_name}</option>)}</select></Field>
          <Field label="Service date *"><input className="input-base" type="date" value={claimForm.service_date} onChange={(e) => setClaimForm((s) => ({ ...s, service_date: e.target.value }))} /></Field>
          <Field label="Provider *"><input className="input-base" value={claimForm.provider_name} onChange={(e) => setClaimForm((s) => ({ ...s, provider_name: e.target.value }))} /></Field>
          <Field label="Diagnosis code"><input className="input-base" value={claimForm.diagnosis_code} onChange={(e) => setClaimForm((s) => ({ ...s, diagnosis_code: e.target.value }))} /></Field>
          <Field label="Status *"><select className="input-base" value={claimForm.status} onChange={(e) => setClaimForm((s) => ({ ...s, status: e.target.value as ClaimStatus }))}>{CLAIM_STATUS.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
          <Field label="Billed amount *"><input className="input-base" type="number" min="0" step="0.01" value={claimForm.billed_amount} onChange={(e) => setClaimForm((s) => ({ ...s, billed_amount: e.target.value }))} /></Field>
          <Field label="Allowed amount *"><input className="input-base" type="number" min="0" step="0.01" value={claimForm.allowed_amount} onChange={(e) => setClaimForm((s) => ({ ...s, allowed_amount: e.target.value }))} /></Field>
          <Field label="Insurance paid *"><input className="input-base" type="number" min="0" step="0.01" value={claimForm.insurance_paid} onChange={(e) => setClaimForm((s) => ({ ...s, insurance_paid: e.target.value }))} /></Field>
          <Field label="Patient responsibility *"><input className="input-base" type="number" min="0" step="0.01" value={claimForm.patient_responsibility} onChange={(e) => setClaimForm((s) => ({ ...s, patient_responsibility: e.target.value }))} /></Field>
          <Field label="Notes"><textarea className="input-base min-h-24" value={claimForm.notes} onChange={(e) => setClaimForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setClaimModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={claimMutation.isPending}>{claimMutation.isPending ? 'Saving...' : 'Save Claim'}</button></div>
        </form>
      </DomainModal>

      <DomainModal title={editPrescriptionId ? 'Edit Prescription' : 'Add Prescription'} open={prescriptionModalOpen} onClose={() => setPrescriptionModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([prescriptionForm.medication_name, prescriptionForm.refills_remaining, prescriptionForm.cost_per_fill], 'Please complete required prescription fields.')) return; prescriptionMutation.mutate() }}>
          <Field label="Medication name *"><input className="input-base" value={prescriptionForm.medication_name} onChange={(e) => setPrescriptionForm((s) => ({ ...s, medication_name: e.target.value }))} /></Field>
          <Field label="Dosage"><input className="input-base" value={prescriptionForm.dosage} onChange={(e) => setPrescriptionForm((s) => ({ ...s, dosage: e.target.value }))} /></Field>
          <Field label="Frequency"><input className="input-base" value={prescriptionForm.frequency} onChange={(e) => setPrescriptionForm((s) => ({ ...s, frequency: e.target.value }))} /></Field>
          <Field label="Prescriber"><input className="input-base" value={prescriptionForm.prescriber_name} onChange={(e) => setPrescriptionForm((s) => ({ ...s, prescriber_name: e.target.value }))} /></Field>
          <Field label="Pharmacy"><input className="input-base" value={prescriptionForm.pharmacy_name} onChange={(e) => setPrescriptionForm((s) => ({ ...s, pharmacy_name: e.target.value }))} /></Field>
          <Field label="Member"><select className="input-base" value={prescriptionForm.household_member_id} onChange={(e) => setPrescriptionForm((s) => ({ ...s, household_member_id: e.target.value }))}><option value="">None</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
          <Field label="Refills remaining *"><input className="input-base" type="number" min="0" value={prescriptionForm.refills_remaining} onChange={(e) => setPrescriptionForm((s) => ({ ...s, refills_remaining: e.target.value }))} /></Field>
          <Field label="Last filled date"><input className="input-base" type="date" value={prescriptionForm.last_filled_date} onChange={(e) => setPrescriptionForm((s) => ({ ...s, last_filled_date: e.target.value }))} /></Field>
          <Field label="Next fill date"><input className="input-base" type="date" value={prescriptionForm.next_fill_date} onChange={(e) => setPrescriptionForm((s) => ({ ...s, next_fill_date: e.target.value }))} /></Field>
          <Field label="Cost per fill *"><input className="input-base" type="number" min="0" step="0.01" value={prescriptionForm.cost_per_fill} onChange={(e) => setPrescriptionForm((s) => ({ ...s, cost_per_fill: e.target.value }))} /></Field>
          <Field label="Notes"><textarea className="input-base min-h-24" value={prescriptionForm.notes} onChange={(e) => setPrescriptionForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setPrescriptionModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={prescriptionMutation.isPending}>{prescriptionMutation.isPending ? 'Saving...' : 'Save Prescription'}</button></div>
        </form>
      </DomainModal>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3"><div className="text-xs text-slate-400 uppercase tracking-wider">{label}</div><div className="text-lg font-semibold text-slate-100 mt-1">{value}</div></div>
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return <label className="text-sm text-slate-300 space-y-1 block"><span className="text-xs text-slate-400">{label}</span>{children}</label>
}
