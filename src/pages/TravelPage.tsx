import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase'
import { DomainModal, SectionState, TabButton, ToastViewport, formatDate, formatUsd, isSoon, maskLast4, useToastState } from '@/components/travel/TravelUi'

type LooseDb = { public: { Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }> } }
const db = supabase as unknown as SupabaseClient<LooseDb>

type Tab = 'miles' | 'flights' | 'documents'
interface Member { id: string; full_name: string }
interface Program { id: string; program_name: string; program_type: string; account_number: string | null; points_balance: number | null; value_per_point: number | null; tier_status: string | null; expiration_date: string | null }
interface LoyaltyTransaction { id: string; program_id: string; transaction_type: string; points_amount: number | null; cash_value: number | null; description: string | null; transaction_date: string | null }
interface Flight { id: string; airline: string; flight_number: string; origin_airport: string; destination_airport: string; departure_datetime: string; arrival_datetime: string | null; seat_number: string | null; cabin_class: string; confirmation_number: string | null; household_member_id: string | null; loyalty_program_id: string | null; status: string; notes: string | null }
interface TravelDocument { id: string; household_member_id: string | null; document_type: string; document_number: string | null; country_of_issue: string | null; issue_date: string | null; expiry_date: string | null }

const flightStatusClass: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  boarding: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  departed: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  landed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/40',
  delayed: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
}

export default function TravelPage() {
  const userId = useAuthStore((s) => s.user?.id)
  const queryClient = useQueryClient()
  const { toast, toasts } = useToastState()
  const [tab, setTab] = useState<Tab>('miles')
  const [showPastFlights, setShowPastFlights] = useState(false)

  const [programModalOpen, setProgramModalOpen] = useState(false)
  const [editProgramId, setEditProgramId] = useState<string | null>(null)
  const [programForm, setProgramForm] = useState({ program_name: '', program_type: 'airline_miles', account_number: '', points_balance: '', value_per_point: '', tier_status: '', expiration_date: '' })
  const [txModal, setTxModal] = useState({ open: false, program_id: '', transaction_type: 'earn', points_amount: '', cash_value: '', description: '', transaction_date: '' })

  const [flightModalOpen, setFlightModalOpen] = useState(false)
  const [editFlightId, setEditFlightId] = useState<string | null>(null)
  const [flightForm, setFlightForm] = useState({ airline: '', flight_number: '', origin_airport: '', destination_airport: '', departure_datetime: '', arrival_datetime: '', seat_number: '', cabin_class: 'economy', confirmation_number: '', household_member_id: '', loyalty_program_id: '', status: 'scheduled', notes: '' })

  const [docModalOpen, setDocModalOpen] = useState(false)
  const [editDocId, setEditDocId] = useState<string | null>(null)
  const [docForm, setDocForm] = useState({ document_type: 'passport', document_number: '', country_of_issue: '', issue_date: '', expiry_date: '', household_member_id: '' })

  const membersQuery = useQuery({ queryKey: ['travel-members', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('household_members').select('id, full_name').eq('user_id', userId as string); if (error) throw new Error(error.message); return (data ?? []) as unknown as Member[] } })
  const programsQuery = useQuery({ queryKey: ['travel-programs', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('loyalty_programs').select('id, program_name, program_type, account_number, points_balance, value_per_point, tier_status, expiration_date').eq('user_id', userId as string).eq('is_deleted', false).order('program_name'); if (error) throw new Error(error.message); return (data ?? []) as unknown as Program[] } })
  const txQuery = useQuery({ queryKey: ['travel-tx', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('loyalty_transactions').select('id, program_id, transaction_type, points_amount, cash_value, description, transaction_date').order('transaction_date', { ascending: false }); if (error) throw new Error(error.message); return (data ?? []) as unknown as LoyaltyTransaction[] } })
  const flightsQuery = useQuery({ queryKey: ['travel-flights', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('flights').select('id, airline, flight_number, origin_airport, destination_airport, departure_datetime, arrival_datetime, seat_number, cabin_class, confirmation_number, household_member_id, loyalty_program_id, status, notes').eq('user_id', userId as string).eq('is_deleted', false).order('departure_datetime'); if (error) throw new Error(error.message); return (data ?? []) as unknown as Flight[] } })
  const docsQuery = useQuery({ queryKey: ['travel-docs', userId], enabled: Boolean(userId), queryFn: async () => { const { data, error } = await db.from('travel_documents').select('id, household_member_id, document_type, document_number, country_of_issue, issue_date, expiry_date').eq('user_id', userId as string).eq('is_deleted', false).order('expiry_date'); if (error) throw new Error(error.message); return (data ?? []) as unknown as TravelDocument[] } })

  const invalidate = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['travel-programs', userId] }),
    queryClient.invalidateQueries({ queryKey: ['travel-tx', userId] }),
    queryClient.invalidateQueries({ queryKey: ['travel-flights', userId] }),
    queryClient.invalidateQueries({ queryKey: ['travel-docs', userId] }),
  ])

  const members = membersQuery.data ?? []
  const programs = programsQuery.data ?? []
  const transactions = txQuery.data ?? []
  const flights = flightsQuery.data ?? []
  const documents = docsQuery.data ?? []
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m.full_name])), [members])
  const programMap = useMemo(() => new Map(programs.map((p) => [p.id, p.program_name])), [programs])

  const portfolioValue = programs.reduce((sum, p) => sum + ((p.points_balance ?? 0) * (p.value_per_point ?? 0)), 0)
  const groupedPrograms = useMemo(() => ({
    Airlines: programs.filter((p) => p.program_type === 'airline_miles'),
    Hotels: programs.filter((p) => p.program_type === 'hotel_points'),
    'Credit Card Rewards': programs.filter((p) => p.program_type === 'credit_card_rewards'),
    Other: programs.filter((p) => !['airline_miles', 'hotel_points', 'credit_card_rewards'].includes(p.program_type)),
  }), [programs])

  const now = new Date()
  const upcomingFlights = flights.filter((f) => new Date(f.departure_datetime) >= now)
  const pastFlights = flights.filter((f) => new Date(f.departure_datetime) < now)
  const requireFields = (vals: string[], message: string) => {
    if (vals.some((v) => !v || !v.trim())) { toast.error(message); return false }
    return true
  }

  const programMutation = useMutation({ mutationFn: async () => { const payload = { user_id: userId, program_name: programForm.program_name, program_type: programForm.program_type, account_number: programForm.account_number || null, points_balance: Number(programForm.points_balance), value_per_point: Number(programForm.value_per_point), tier_status: programForm.tier_status || null, expiration_date: programForm.expiration_date || null }; if (editProgramId) { const { error } = await db.from('loyalty_programs').update(payload).eq('id', editProgramId); if (error) throw new Error(error.message) } else { const { error } = await db.from('loyalty_programs').insert(payload); if (error) throw new Error(error.message) } }, onSuccess: async () => { toast.success(editProgramId ? 'Program updated.' : 'Program added.'); setProgramModalOpen(false); setEditProgramId(null); setProgramForm({ program_name: '', program_type: 'airline_miles', account_number: '', points_balance: '', value_per_point: '', tier_status: '', expiration_date: '' }); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const deleteProgramMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await db.from('loyalty_programs').update({ is_deleted: true }).eq('id', id); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Program deleted.'); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const txMutation = useMutation({ mutationFn: async () => { const { error } = await db.from('loyalty_transactions').insert({ program_id: txModal.program_id, transaction_type: txModal.transaction_type, points_amount: Number(txModal.points_amount), cash_value: txModal.cash_value ? Number(txModal.cash_value) : null, description: txModal.description || null, transaction_date: txModal.transaction_date || null }); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Transaction added.'); setTxModal({ open: false, program_id: '', transaction_type: 'earn', points_amount: '', cash_value: '', description: '', transaction_date: '' }); await invalidate() }, onError: (e: Error) => toast.error(e.message) })

  const flightMutation = useMutation({ mutationFn: async () => { const payload = { user_id: userId, airline: flightForm.airline, flight_number: flightForm.flight_number, origin_airport: flightForm.origin_airport, destination_airport: flightForm.destination_airport, departure_datetime: flightForm.departure_datetime, arrival_datetime: flightForm.arrival_datetime || null, seat_number: flightForm.seat_number || null, cabin_class: flightForm.cabin_class, confirmation_number: flightForm.confirmation_number || null, household_member_id: flightForm.household_member_id || null, loyalty_program_id: flightForm.loyalty_program_id || null, status: flightForm.status, notes: flightForm.notes || null }; if (editFlightId) { const { error } = await db.from('flights').update(payload).eq('id', editFlightId); if (error) throw new Error(error.message) } else { const { error } = await db.from('flights').insert(payload); if (error) throw new Error(error.message) } }, onSuccess: async () => { toast.success(editFlightId ? 'Flight updated.' : 'Flight added.'); setFlightModalOpen(false); setEditFlightId(null); setFlightForm({ airline: '', flight_number: '', origin_airport: '', destination_airport: '', departure_datetime: '', arrival_datetime: '', seat_number: '', cabin_class: 'economy', confirmation_number: '', household_member_id: '', loyalty_program_id: '', status: 'scheduled', notes: '' }); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const deleteFlightMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await db.from('flights').update({ is_deleted: true }).eq('id', id); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Flight deleted.'); await invalidate() }, onError: (e: Error) => toast.error(e.message) })

  const docMutation = useMutation({ mutationFn: async () => { const payload = { user_id: userId, household_member_id: docForm.household_member_id || null, document_type: docForm.document_type, document_number: docForm.document_number, country_of_issue: docForm.country_of_issue, issue_date: docForm.issue_date || null, expiry_date: docForm.expiry_date || null }; if (editDocId) { const { error } = await db.from('travel_documents').update(payload).eq('id', editDocId); if (error) throw new Error(error.message) } else { const { error } = await db.from('travel_documents').insert(payload); if (error) throw new Error(error.message) } }, onSuccess: async () => { toast.success(editDocId ? 'Document updated.' : 'Document added.'); setDocModalOpen(false); setEditDocId(null); setDocForm({ document_type: 'passport', document_number: '', country_of_issue: '', issue_date: '', expiry_date: '', household_member_id: '' }); await invalidate() }, onError: (e: Error) => toast.error(e.message) })
  const deleteDocMutation = useMutation({ mutationFn: async (id: string) => { const { error } = await db.from('travel_documents').update({ is_deleted: true }).eq('id', id); if (error) throw new Error(error.message) }, onSuccess: async () => { toast.success('Document deleted.'); await invalidate() }, onError: (e: Error) => toast.error(e.message) })

  return (
    <div className="space-y-6 animate-fade-in">
      <ToastViewport toasts={toasts} />
      <div><h1 className="text-2xl font-bold text-slate-100">Travel Management</h1><p className="text-sm text-slate-400 mt-0.5">Miles, flights, and travel documents</p></div>

      <div className="card p-3 flex gap-2 flex-wrap"><TabButton label="Miles & Points" active={tab === 'miles'} onClick={() => setTab('miles')} /><TabButton label="Flights" active={tab === 'flights'} onClick={() => setTab('flights')} /><TabButton label="Documents" active={tab === 'documents'} onClick={() => setTab('documents')} /></div>

      {tab === 'miles' && (
        <div className="space-y-4">
          <div className="card p-4"><div className="text-xs text-slate-400 uppercase tracking-wider">Total estimated value</div><div className="text-2xl font-bold text-emerald-300 mt-1">{formatUsd(portfolioValue)}</div></div>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => { setEditProgramId(null); setProgramModalOpen(true) }}><Plus size={14} /> Add Program</button></div>
          <SectionState loading={programsQuery.isLoading || txQuery.isLoading} error={programsQuery.error instanceof Error ? programsQuery.error.message : txQuery.error instanceof Error ? txQuery.error.message : null} empty={programs.length === 0} emptyText="No loyalty programs found.">
            <div className="space-y-4">{Object.entries(groupedPrograms).map(([group, items]) => <div key={group} className="space-y-2"><h3 className="text-sm text-slate-300 font-semibold">{group}</h3>{items.length === 0 ? <div className="text-xs text-slate-500">None</div> : items.map((program) => { const txs = transactions.filter((tx) => tx.program_id === program.id).slice(0, 10); const value = (program.points_balance ?? 0) * (program.value_per_point ?? 0); return <div key={program.id} className="card p-4 space-y-2"><div className="flex justify-between gap-2"><div><div className="text-slate-100 font-semibold">{program.program_name}</div><div className="text-xs text-slate-400">{maskLast4(program.account_number)} · {program.tier_status ?? '—'} {program.expiration_date && (isSoon(program.expiration_date, 90) ? <span className="text-amber-300">· expiring soon</span> : null)}</div></div><div className="flex gap-2"><button className="btn-ghost" onClick={() => { setEditProgramId(program.id); setProgramForm({ program_name: program.program_name, program_type: program.program_type, account_number: program.account_number ?? '', points_balance: String(program.points_balance ?? ''), value_per_point: String(program.value_per_point ?? ''), tier_status: program.tier_status ?? '', expiration_date: program.expiration_date ?? '' }); setProgramModalOpen(true) }}><Pencil size={14} /> Edit</button><button className="btn-ghost" onClick={() => setTxModal({ open: true, program_id: program.id, transaction_type: 'earn', points_amount: '', cash_value: '', description: '', transaction_date: '' })}><Plus size={14} /> Add Tx</button><button className="btn-danger" onClick={() => deleteProgramMutation.mutate(program.id)}><Trash2 size={14} /> Delete</button></div></div><div className="text-sm text-slate-300">Balance: <span className="text-slate-100">{(program.points_balance ?? 0).toLocaleString()}</span> · Est. value: <span className="text-slate-100">{formatUsd(value)}</span></div><div className="space-y-1">{txs.length === 0 ? <div className="text-xs text-slate-500">No transactions</div> : txs.map((tx) => <div key={tx.id} className="bg-slate-800/60 rounded-lg px-3 py-2 text-sm"><div className="text-slate-100">{tx.transaction_type} {tx.points_amount?.toLocaleString() ?? 0} points</div><div className="text-xs text-slate-400">{formatDate(tx.transaction_date)} · {tx.description ?? '—'} · {formatUsd(tx.cash_value)}</div></div>)}</div></div> })}</div>)}</div>
          </SectionState>
        </div>
      )}
      {tab === 'flights' && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="btn-primary" onClick={() => { setEditFlightId(null); setFlightModalOpen(true) }}><Plus size={14} /> Add Flight</button></div>
          <SectionState loading={flightsQuery.isLoading} error={flightsQuery.error instanceof Error ? flightsQuery.error.message : null} empty={flights.length === 0} emptyText="No flights found.">
            <div className="space-y-3">
              {upcomingFlights.map((flight) => <FlightCard key={flight.id} flight={flight} memberName={flight.household_member_id ? memberMap.get(flight.household_member_id) ?? 'Unknown' : '—'} programName={flight.loyalty_program_id ? programMap.get(flight.loyalty_program_id) ?? '—' : '—'} onEdit={() => { setEditFlightId(flight.id); setFlightForm({ airline: flight.airline, flight_number: flight.flight_number, origin_airport: flight.origin_airport, destination_airport: flight.destination_airport, departure_datetime: flight.departure_datetime.slice(0, 16), arrival_datetime: flight.arrival_datetime ? flight.arrival_datetime.slice(0, 16) : '', seat_number: flight.seat_number ?? '', cabin_class: flight.cabin_class, confirmation_number: flight.confirmation_number ?? '', household_member_id: flight.household_member_id ?? '', loyalty_program_id: flight.loyalty_program_id ?? '', status: flight.status, notes: flight.notes ?? '' }); setFlightModalOpen(true) }} onDelete={() => deleteFlightMutation.mutate(flight.id)} />)}
              <div className="card p-3"><button className="text-sm text-slate-200 flex items-center gap-2" onClick={() => setShowPastFlights((v) => !v)}>{showPastFlights ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Past flights ({pastFlights.length})</button>{showPastFlights && <div className="mt-3 space-y-2">{pastFlights.length === 0 ? <div className="text-xs text-slate-500">None</div> : pastFlights.map((flight) => <FlightCard key={flight.id} flight={flight} memberName={flight.household_member_id ? memberMap.get(flight.household_member_id) ?? 'Unknown' : '—'} programName={flight.loyalty_program_id ? programMap.get(flight.loyalty_program_id) ?? '—' : '—'} onEdit={() => { setEditFlightId(flight.id); setFlightForm({ airline: flight.airline, flight_number: flight.flight_number, origin_airport: flight.origin_airport, destination_airport: flight.destination_airport, departure_datetime: flight.departure_datetime.slice(0, 16), arrival_datetime: flight.arrival_datetime ? flight.arrival_datetime.slice(0, 16) : '', seat_number: flight.seat_number ?? '', cabin_class: flight.cabin_class, confirmation_number: flight.confirmation_number ?? '', household_member_id: flight.household_member_id ?? '', loyalty_program_id: flight.loyalty_program_id ?? '', status: flight.status, notes: flight.notes ?? '' }); setFlightModalOpen(true) }} onDelete={() => deleteFlightMutation.mutate(flight.id)} />)}</div>}</div>
            </div>
          </SectionState>
        </div>
      )}

      {tab === 'documents' && (
        <div className="space-y-4">
          <div className="flex justify-end"><button className="btn-primary" onClick={() => { setEditDocId(null); setDocModalOpen(true) }}><Plus size={14} /> Add Document</button></div>
          <SectionState loading={docsQuery.isLoading} error={docsQuery.error instanceof Error ? docsQuery.error.message : null} empty={documents.length === 0} emptyText="No travel documents found.">
            <div className="space-y-3">{documents.map((doc) => { const exp = doc.expiry_date ? new Date(doc.expiry_date) : null; const expired = exp ? exp < new Date() : false; const soon = isSoon(doc.expiry_date, 180); return <div key={doc.id} className="card p-4 space-y-2"><div className="flex justify-between"><div><div className="text-slate-100 font-semibold">{doc.document_type}</div><div className="text-xs text-slate-400">{maskLast4(doc.document_number)} · {doc.country_of_issue ?? '—'}</div></div><div className="flex gap-2"><button className="btn-ghost" onClick={() => { setEditDocId(doc.id); setDocForm({ document_type: doc.document_type, document_number: doc.document_number ?? '', country_of_issue: doc.country_of_issue ?? '', issue_date: doc.issue_date ?? '', expiry_date: doc.expiry_date ?? '', household_member_id: doc.household_member_id ?? '' }); setDocModalOpen(true) }}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={() => deleteDocMutation.mutate(doc.id)}><Trash2 size={14} /> Delete</button></div></div><div className="text-sm text-slate-300">Member: <span className="text-slate-100">{doc.household_member_id ? memberMap.get(doc.household_member_id) ?? 'Unknown' : '—'}</span></div><div className="text-sm text-slate-300">Issue: {formatDate(doc.issue_date)} · Expiry: <span className={expired ? 'text-red-300' : soon ? 'text-amber-300' : 'text-emerald-300'}>{formatDate(doc.expiry_date)}</span></div></div> })}</div>
          </SectionState>
        </div>
      )}

      <DomainModal title={editProgramId ? 'Edit Program' : 'Add Program'} open={programModalOpen} onClose={() => setProgramModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([programForm.program_name, programForm.program_type, programForm.points_balance, programForm.value_per_point], 'Program name/type/balance/value are required.')) return; programMutation.mutate() }}>
          <Field label="Program name *"><input className="input-base" value={programForm.program_name} onChange={(e) => setProgramForm((s) => ({ ...s, program_name: e.target.value }))} /></Field>
          <Field label="Program type *"><select className="input-base" value={programForm.program_type} onChange={(e) => setProgramForm((s) => ({ ...s, program_type: e.target.value }))}><option value="airline_miles">airline_miles</option><option value="hotel_points">hotel_points</option><option value="credit_card_rewards">credit_card_rewards</option><option value="cashback">cashback</option><option value="other">other</option></select></Field>
          <Field label="Account number"><input className="input-base" value={programForm.account_number} onChange={(e) => setProgramForm((s) => ({ ...s, account_number: e.target.value }))} /></Field>
          <Field label="Points balance *"><input className="input-base" type="number" min="0" value={programForm.points_balance} onChange={(e) => setProgramForm((s) => ({ ...s, points_balance: e.target.value }))} /></Field>
          <Field label="Value per point *"><input className="input-base" type="number" min="0" step="0.0001" value={programForm.value_per_point} onChange={(e) => setProgramForm((s) => ({ ...s, value_per_point: e.target.value }))} /></Field>
          <Field label="Tier status"><input className="input-base" value={programForm.tier_status} onChange={(e) => setProgramForm((s) => ({ ...s, tier_status: e.target.value }))} /></Field>
          <Field label="Expiration date"><input className="input-base" type="date" value={programForm.expiration_date} onChange={(e) => setProgramForm((s) => ({ ...s, expiration_date: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setProgramModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={programMutation.isPending}>{programMutation.isPending ? 'Saving...' : 'Save Program'}</button></div>
        </form>
      </DomainModal>

      <DomainModal title="Add Transaction" open={txModal.open} onClose={() => setTxModal((s) => ({ ...s, open: false }))}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([txModal.points_amount], 'Points amount is required.')) return; txMutation.mutate() }}>
          <Field label="Transaction type"><select className="input-base" value={txModal.transaction_type} onChange={(e) => setTxModal((s) => ({ ...s, transaction_type: e.target.value }))}><option value="earn">earn</option><option value="redeem">redeem</option><option value="expire">expire</option><option value="transfer">transfer</option></select></Field>
          <Field label="Points amount *"><input className="input-base" type="number" min="0" value={txModal.points_amount} onChange={(e) => setTxModal((s) => ({ ...s, points_amount: e.target.value }))} /></Field>
          <Field label="Cash value"><input className="input-base" type="number" min="0" step="0.01" value={txModal.cash_value} onChange={(e) => setTxModal((s) => ({ ...s, cash_value: e.target.value }))} /></Field>
          <Field label="Date"><input className="input-base" type="date" value={txModal.transaction_date} onChange={(e) => setTxModal((s) => ({ ...s, transaction_date: e.target.value }))} /></Field>
          <Field label="Description"><textarea className="input-base min-h-24" value={txModal.description} onChange={(e) => setTxModal((s) => ({ ...s, description: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setTxModal((s) => ({ ...s, open: false }))}>Close</button><button type="submit" className="btn-primary" disabled={txMutation.isPending}>{txMutation.isPending ? 'Saving...' : 'Save Transaction'}</button></div>
        </form>
      </DomainModal>
      <DomainModal title={editFlightId ? 'Edit Flight' : 'Add Flight'} open={flightModalOpen} onClose={() => setFlightModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([flightForm.airline, flightForm.flight_number, flightForm.origin_airport, flightForm.destination_airport, flightForm.departure_datetime, flightForm.status], 'Required flight fields are missing.')) return; flightMutation.mutate() }}>
          <Field label="Airline *"><input className="input-base" value={flightForm.airline} onChange={(e) => setFlightForm((s) => ({ ...s, airline: e.target.value }))} /></Field>
          <Field label="Flight number *"><input className="input-base" value={flightForm.flight_number} onChange={(e) => setFlightForm((s) => ({ ...s, flight_number: e.target.value }))} /></Field>
          <Field label="Origin airport *"><input className="input-base" value={flightForm.origin_airport} onChange={(e) => setFlightForm((s) => ({ ...s, origin_airport: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Destination airport *"><input className="input-base" value={flightForm.destination_airport} onChange={(e) => setFlightForm((s) => ({ ...s, destination_airport: e.target.value.toUpperCase() }))} /></Field>
          <Field label="Departure datetime *"><input className="input-base" type="datetime-local" value={flightForm.departure_datetime} onChange={(e) => setFlightForm((s) => ({ ...s, departure_datetime: e.target.value }))} /></Field>
          <Field label="Arrival datetime"><input className="input-base" type="datetime-local" value={flightForm.arrival_datetime} onChange={(e) => setFlightForm((s) => ({ ...s, arrival_datetime: e.target.value }))} /></Field>
          <Field label="Seat number"><input className="input-base" value={flightForm.seat_number} onChange={(e) => setFlightForm((s) => ({ ...s, seat_number: e.target.value }))} /></Field>
          <Field label="Cabin class"><select className="input-base" value={flightForm.cabin_class} onChange={(e) => setFlightForm((s) => ({ ...s, cabin_class: e.target.value }))}><option value="economy">economy</option><option value="premium_economy">premium_economy</option><option value="business">business</option><option value="first">first</option></select></Field>
          <Field label="Confirmation number"><input className="input-base" value={flightForm.confirmation_number} onChange={(e) => setFlightForm((s) => ({ ...s, confirmation_number: e.target.value }))} /></Field>
          <Field label="Status *"><select className="input-base" value={flightForm.status} onChange={(e) => setFlightForm((s) => ({ ...s, status: e.target.value }))}><option value="scheduled">scheduled</option><option value="boarding">boarding</option><option value="departed">departed</option><option value="landed">landed</option><option value="cancelled">cancelled</option><option value="delayed">delayed</option></select></Field>
          <Field label="Passenger"><select className="input-base" value={flightForm.household_member_id} onChange={(e) => setFlightForm((s) => ({ ...s, household_member_id: e.target.value }))}><option value="">None</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
          <Field label="Loyalty program"><select className="input-base" value={flightForm.loyalty_program_id} onChange={(e) => setFlightForm((s) => ({ ...s, loyalty_program_id: e.target.value }))}><option value="">None</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.program_name}</option>)}</select></Field>
          <Field label="Notes"><textarea className="input-base min-h-24" value={flightForm.notes} onChange={(e) => setFlightForm((s) => ({ ...s, notes: e.target.value }))} /></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setFlightModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={flightMutation.isPending}>{flightMutation.isPending ? 'Saving...' : 'Save Flight'}</button></div>
        </form>
      </DomainModal>

      <DomainModal title={editDocId ? 'Edit Document' : 'Add Document'} open={docModalOpen} onClose={() => setDocModalOpen(false)}>
        <form className="grid md:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (!requireFields([docForm.document_type, docForm.document_number, docForm.country_of_issue], 'Document type/number/country are required.')) return; docMutation.mutate() }}>
          <Field label="Document type"><select className="input-base" value={docForm.document_type} onChange={(e) => setDocForm((s) => ({ ...s, document_type: e.target.value }))}><option value="passport">passport</option><option value="visa">visa</option><option value="tsa_precheck">tsa_precheck</option><option value="global_entry">global_entry</option><option value="nexus">nexus</option><option value="other">other</option></select></Field>
          <Field label="Document number *"><input className="input-base" value={docForm.document_number} onChange={(e) => setDocForm((s) => ({ ...s, document_number: e.target.value }))} /></Field>
          <Field label="Country *"><input className="input-base" value={docForm.country_of_issue} onChange={(e) => setDocForm((s) => ({ ...s, country_of_issue: e.target.value }))} /></Field>
          <Field label="Issue date"><input className="input-base" type="date" value={docForm.issue_date} onChange={(e) => setDocForm((s) => ({ ...s, issue_date: e.target.value }))} /></Field>
          <Field label="Expiry date"><input className="input-base" type="date" value={docForm.expiry_date} onChange={(e) => setDocForm((s) => ({ ...s, expiry_date: e.target.value }))} /></Field>
          <Field label="Household member"><select className="input-base" value={docForm.household_member_id} onChange={(e) => setDocForm((s) => ({ ...s, household_member_id: e.target.value }))}><option value="">None</option>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></Field>
          <div className="md:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setDocModalOpen(false)}>Close</button><button type="submit" className="btn-primary" disabled={docMutation.isPending}>{docMutation.isPending ? 'Saving...' : 'Save Document'}</button></div>
        </form>
      </DomainModal>
    </div>
  )
}

function FlightCard({ flight, memberName, programName, onEdit, onDelete }: { flight: Flight; memberName: string; programName: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex justify-between gap-2">
        <div><div className="text-slate-100 font-semibold">{flight.airline} {flight.flight_number}</div><div className="text-xs text-slate-400">{flight.origin_airport} → {flight.destination_airport}</div></div>
        <div className="flex gap-2 items-center"><span className={`badge border ${flightStatusClass[flight.status] ?? 'border-slate-600 text-slate-300'}`}>{flight.status}</span><button className="btn-ghost" onClick={onEdit}><Pencil size={14} /> Edit</button><button className="btn-danger" onClick={onDelete}><Trash2 size={14} /> Delete</button></div>
      </div>
      <div className="grid md:grid-cols-2 text-sm text-slate-300 gap-1"><div>Departure: <span className="text-slate-100">{new Date(flight.departure_datetime).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div><div>Arrival: <span className="text-slate-100">{flight.arrival_datetime ? new Date(flight.arrival_datetime).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</span></div><div>Seat/Cabin: <span className="text-slate-100">{flight.seat_number ?? '—'} · {flight.cabin_class}</span></div><div>Confirmation: <span className="text-slate-100">{maskLast4(flight.confirmation_number)}</span></div><div>Passenger: <span className="text-slate-100">{memberName}</span></div><div>Loyalty: <span className="text-slate-100">{programName}</span></div></div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return <label className="text-sm text-slate-300 space-y-1 block"><span className="text-xs text-slate-400">{label}</span>{children}</label>
}
