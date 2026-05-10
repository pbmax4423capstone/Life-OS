import { useState } from 'react'
import { CheckCircle, AlertCircle, X, Loader2, Sparkles } from 'lucide-react'
import type { RecognitionResult } from '@/lib/imageRecognition'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

interface Props {
  result: RecognitionResult
  previewUrl: string
  onConfirm: () => void
  onDismiss: () => void
}

const FIELD_LABELS: Record<string, string> = {
  institution: 'Institution', last_four: 'Last 4', balance: 'Balance',
  credit_limit: 'Credit Limit', apr: 'APR (%)', min_payment: 'Min Payment',
  due_date: 'Due Date', rewards_points: 'Rewards Points',
  fees_charged: 'Fees Charged', interest_charged: 'Interest Charged',
  insurer_name: 'Insurer', policy_type: 'Policy Type',
  policy_number: 'Policy #', group_number: 'Group #', member_id: 'Member ID',
  copay_primary: 'Copay (Primary)', copay_specialist: 'Copay (Specialist)',
  airline: 'Airline', flight_number: 'Flight #', passenger_name: 'Passenger',
  origin_code: 'From', destination_code: 'To', departure_datetime: 'Departure',
  seat_number: 'Seat', cabin_class: 'Cabin', confirmation_code: 'Confirmation',
  program_name: 'Program', miles_balance: 'Miles Balance', member_number: 'Member #',
  medication_name: 'Medication', dosage: 'Dosage', frequency: 'Frequency',
  prescriber: 'Prescriber', pharmacy_name: 'Pharmacy', refills_remaining: 'Refills',
  company_name: 'Company', job_title: 'Job Title', salary: 'Salary',
  name: 'Certification', issuing_org: 'Issuer', credential_id: 'Credential ID',
  achieved_date: 'Achieved', expiry_date: 'Expires',
  full_name: 'Name', title: 'Title', email: 'Email', phone: 'Phone',
  score: 'Credit Score', bureau: 'Bureau', account_type: 'Account Type',
  apy: 'APY (%)', interest_earned: 'Interest Earned',
}

const CONFIDENCE_STYLES = {
  high:   { color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30', label: 'High confidence' },
  medium: { color: 'text-amber-400',   bg: 'bg-amber-500/20 border-amber-500/30',     label: 'Medium confidence' },
  low:    { color: 'text-red-400',     bg: 'bg-red-500/20 border-red-500/30',         label: 'Low confidence — please verify' },
}

function toFiniteNumber(value: unknown, fallback: number | null = null): number | null {
  const parsed = Number.parseFloat(String(value ?? ''))
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

export function RecognitionModal({ result, previewUrl, onConfirm, onDismiss }: Props) {
  const { user } = useAuthStore()
  const [fields, setFields] = useState<Record<string, unknown>>(result.fields)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conf = CONFIDENCE_STYLES[result.confidence]

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      await saveToTable(result.targetTable, fields, user.id)
      setSaved(true)
      setTimeout(onConfirm, 1000)
    } catch {
      setError('AI request failed. Please try again in a moment.')
    } finally {
      setSaving(false)
    }
  }

  // Editable fields (skip internal type field)
  const editableFields = Object.entries(fields).filter(([k]) => k !== 'type')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onDismiss} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="recognition-modal-title"
        className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-500/20 text-brand-400">
              <Sparkles size={18} />
            </div>
            <div>
                <h3 id="recognition-modal-title" className="text-base font-semibold text-slate-100">
                  {result.displayLabel} Detected
                </h3>
              <span className={`text-xs ${conf.color}`}>{conf.label}</span>
            </div>
          </div>
           <button onClick={onDismiss} className="text-slate-400 hover:text-slate-200 transition-colors" aria-label="Close recognition modal">
             <X size={20} />
           </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Preview */}
          <div className="rounded-xl overflow-hidden border border-slate-700 max-h-36 flex items-center justify-center bg-slate-800">
            <img src={previewUrl} alt="Scanned document" className="max-h-36 object-contain" />
          </div>

          {/* Confidence badge */}
          <div className={`text-xs px-3 py-2 rounded-lg border flex items-center gap-2 ${conf.bg} ${conf.color}`}>
            {result.confidence === 'high'
              ? <CheckCircle size={14} />
              : <AlertCircle size={14} />}
            Detected as <strong>{result.displayLabel}</strong> · will save to <code className="text-xs opacity-80">{result.targetTable}</code>
          </div>

          {/* Editable fields */}
          <div>
            <p className="text-xs text-slate-400 mb-3 uppercase tracking-wide font-medium">
              Review & Edit Before Saving
            </p>
            <div className="grid grid-cols-2 gap-2">
              {editableFields.map(([key, val]) => (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">
                    {FIELD_LABELS[key] ?? key.replace(/_/g, ' ')}
                  </label>
                  <input
                    type="text"
                    value={String(val ?? '')}
                    onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
                    className="input-base text-xs py-1.5"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {error && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className="btn-primary flex-1 justify-center"
            >
              {saved ? (
                <><CheckCircle size={15} /> Saved!</>
              ) : saving ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : (
                <>Confirm & Save to {result.displayLabel}</>
              )}
            </button>
            <button onClick={onDismiss} className="btn-ghost">Discard</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Route to correct Supabase table ───────────────────────────
async function saveToTable(
  table: string,
  fields: Record<string, unknown>,
  ownerId: string
) {
  const f = fields as Record<string, unknown>

  const inserts: Record<string, () => Promise<unknown>> = {
    financial_accounts: () => supabase.from('financial_accounts').insert({
      owner_id: ownerId,
      account_type: f.type === 'bank_statement' ? (f.account_type ?? 'checking') : 'credit_card',
      institution_name: f.institution ?? 'Unknown',
      last_four: f.last_four ?? null,
      current_balance: toFiniteNumber(f.balance, 0) ?? 0,
      credit_limit: toFiniteNumber(f.credit_limit, null),
      interest_rate: toFiniteNumber(f.apr, null) !== null ? (toFiniteNumber(f.apr, 0) ?? 0) / 100 : null,
      rewards_balance: toFiniteNumber(f.rewards_points, 0) ?? 0,
    }),
    insurance_policies: () => supabase.from('insurance_policies').insert({
      owner_id: ownerId,
      insurer_name: f.insurer_name ?? 'Unknown',
      policy_type: f.policy_type ?? 'medical',
      policy_number: f.policy_number ?? null,
      group_number: f.group_number ?? null,
      member_id: f.member_id ?? null,
      copay_primary: toFiniteNumber(f.copay_primary, null),
      copay_specialist: toFiniteNumber(f.copay_specialist, null),
      effective_date: f.effective_date ?? null,
    }),
    flights: () => supabase.from('flights').insert({
      owner_id: ownerId,
      passenger_name: f.passenger_name ?? 'Unknown',
      airline: f.airline ?? 'Unknown',
      airline_code: f.airline_code ?? null,
      flight_number: f.flight_number ?? '',
      origin_code: f.origin_code ?? '',
      destination_code: f.destination_code ?? '',
      departure_datetime: f.departure_datetime ?? new Date().toISOString(),
      seat_number: f.seat_number ?? null,
      cabin_class: f.cabin_class ?? 'economy',
      confirmation_code: f.confirmation_code ?? null,
    }),
    loyalty_programs: () => supabase.from('loyalty_programs').insert({
      owner_id: ownerId,
      program_name: f.program_name ?? 'Unknown Program',
      program_type: 'airline',
      airline_code: f.airline_code ?? null,
      member_number: f.member_number ?? null,
      miles_balance: toFiniteNumber(f.miles_balance, 0) ?? 0,
    }),
    prescriptions: () => supabase.from('prescriptions').insert({
      owner_id: ownerId,
      medication_name: f.medication_name ?? 'Unknown',
      dosage: f.dosage ?? null,
      frequency: f.frequency ?? null,
      pharmacy_name: f.pharmacy_name ?? null,
      refills_remaining: toFiniteNumber(f.refills_remaining, null),
      next_refill_date: f.next_refill_date ?? null,
    }),
    job_applications: () => supabase.from('job_applications').insert({
      owner_id: ownerId,
      company_name: f.company_name ?? 'Unknown',
      job_title: f.job_title ?? 'Unknown',
      status: 'offer',
      salary_min: toFiniteNumber(f.salary, null),
      salary_max: toFiniteNumber(f.salary, null),
      location: f.location ?? null,
      remote_type: f.remote_type ?? null,
      applied_date: new Date().toISOString().split('T')[0],
    }),
    certifications: () => supabase.from('certifications').insert({
      owner_id: ownerId,
      name: f.name ?? 'Unknown Certification',
      issuing_org: f.issuing_org ?? null,
      credential_id: f.credential_id ?? null,
      achieved_date: f.achieved_date ?? null,
      expiry_date: f.expiry_date ?? null,
      status: 'completed',
      progress_pct: 100,
    }),
    contacts: () => supabase.from('contacts').insert({
      owner_id: ownerId,
      full_name: f.full_name ?? 'Unknown',
      title: f.title ?? null,
      email: f.email ?? null,
      phone: f.phone ?? null,
      linkedin_url: f.linkedin_url ?? null,
    }),
    travel_documents: () => supabase.from('travel_documents').insert({
      owner_id: ownerId,
      doc_type: f.doc_type ?? 'passport',
      country: f.country ?? null,
      expiry_date: f.expiry_date ?? null,
      doc_number: f.doc_number ?? null,
    }),
  }

  const fn = inserts[table]
  if (fn) {
    const { error } = await fn() as { error: unknown }
    if (error) throw error
  } else {
    // Fallback: save to documents vault
    await supabase.from('documents').insert({
      owner_id: ownerId,
      display_name: `Scanned document — ${new Date().toLocaleDateString()}`,
      doc_category: 'other',
      storage_path: 'pending',
    })
  }
}
