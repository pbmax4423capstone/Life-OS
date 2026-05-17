import { useState, useEffect } from 'react'
import { Plus, Trash2, Plane, Star, Loader2, X } from 'lucide-react'
import { supabase, type LoyaltyProgram, type Flight } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

const CABIN_CLASSES = ['economy', 'premium_economy', 'business', 'first']
const MEMBERS = ['Patrick', 'Spouse', 'Child 1', 'Child 2']

export default function TravelPage() {
  const { user } = useAuthStore()
  const [miles, setMiles] = useState<LoyaltyProgram[]>([])
  const [flights, setFlights] = useState<Flight[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Miles Programs')
  const [modal, setModal] = useState<'miles' | 'flight' | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingMilesId, setEditingMilesId] = useState<string | null>(null)
  const [editingFlightId, setEditingFlightId] = useState<string | null>(null)

  const [milesForm, setMilesForm] = useState({
    program_name: '', program_type: 'airline', airline_code: '',
    member_number: '', miles_balance: '', expiry_date: '', color: '#6366f1',
  })
  const [flightForm, setFlightForm] = useState({
    passenger_name: 'Patrick', airline: '', flight_number: '',
    origin_code: '', destination_code: '', departure_datetime: '',
    status: 'confirmed', cabin_class: 'economy', seat_number: '', confirmation_code: '',
  })

  useEffect(() => {
    if (!user) { setLoading(false); return }
    Promise.all([
      supabase.from('loyalty_programs').select('*').eq('owner_id', user.id).is('deleted_at', null).order('created_at'),
      supabase.from('flights').select('*').eq('owner_id', user.id).is('deleted_at', null).order('departure_datetime'),
    ]).then(([{ data: m }, { data: f }]) => {
      setMiles(m ?? [])
      setFlights(f ?? [])
      setLoading(false)
    })
  }, [user])

  const totalMiles = miles.reduce((s, m) => s + m.miles_balance, 0)
  const totalValue = miles.reduce((s, m) => s + (m.miles_balance * m.cpp), 0)
  const upcomingFlights = flights.filter(f => f.departure_datetime >= new Date().toISOString())

  const addMiles = async () => {
    if (!user || !milesForm.program_name) return
    setSaving(true)
    const { data, error } = await supabase.from('loyalty_programs').insert({
      owner_id: user.id,
      program_name: milesForm.program_name,
      program_type: milesForm.program_type,
      airline_code: milesForm.airline_code || null,
      member_number: milesForm.member_number || null,
      miles_balance: parseInt(milesForm.miles_balance) || 0,
      points_balance: 0,
      cpp: 0.01,
      expiry_date: milesForm.expiry_date || null,
      color: milesForm.color,
    }).select('*').single()
    if (!error && data) setMiles(p => [...p, data])
    setSaving(false)
    setModal(null)
    setMilesForm({ program_name: '', program_type: 'airline', airline_code: '', member_number: '', miles_balance: '', expiry_date: '', color: '#6366f1' })
  }

  const openEditMiles = (m: LoyaltyProgram) => {
    setEditingMilesId(m.id)
    setMilesForm({
      program_name: m.program_name,
      program_type: m.program_type,
      airline_code: m.airline_code || '',
      member_number: m.member_number || '',
      miles_balance: String(m.miles_balance),
      expiry_date: m.expiry_date || '',
      color: m.color,
    })
    setModal('miles')
  }

  const updateMiles = async () => {
    if (!editingMilesId || !milesForm.program_name) return
    setSaving(true)
    const patch = {
      program_name: milesForm.program_name,
      program_type: milesForm.program_type,
      airline_code: milesForm.airline_code || null,
      member_number: milesForm.member_number || null,
      miles_balance: parseInt(milesForm.miles_balance) || 0,
      expiry_date: milesForm.expiry_date || null,
      color: milesForm.color,
    }
    const { error } = await supabase.from('loyalty_programs').update(patch).eq('id', editingMilesId)
    if (!error) setMiles(p => p.map(m => m.id === editingMilesId ? { ...m, ...patch } : m))
    setSaving(false)
    setModal(null)
    setEditingMilesId(null)
    setMilesForm({ program_name: '', program_type: 'airline', airline_code: '', member_number: '', miles_balance: '', expiry_date: '', color: '#6366f1' })
  }

  const addFlight = async () => {
    if (!user || !flightForm.origin_code || !flightForm.destination_code || !flightForm.departure_datetime) return
    setSaving(true)
    const { data, error } = await supabase.from('flights').insert({
      owner_id: user.id,
      passenger_name: flightForm.passenger_name,
      airline: flightForm.airline || 'Unknown',
      flight_number: flightForm.flight_number || 'TBD',
      origin_code: flightForm.origin_code.toUpperCase(),
      destination_code: flightForm.destination_code.toUpperCase(),
      departure_datetime: flightForm.departure_datetime,
      status: flightForm.status,
      cabin_class: flightForm.cabin_class,
      seat_number: flightForm.seat_number || null,
      confirmation_code: flightForm.confirmation_code || null,
      miles_earned: 0,
      booked_with_miles: false,
    }).select('*').single()
    if (!error && data) setFlights(p => [...p, data])
    setSaving(false)
    setModal(null)
    setFlightForm({ passenger_name: 'Patrick', airline: '', flight_number: '', origin_code: '', destination_code: '', departure_datetime: '', status: 'confirmed', cabin_class: 'economy', seat_number: '', confirmation_code: '' })
  }

  const openEditFlight = (f: Flight) => {
    setEditingFlightId(f.id)
    setFlightForm({
      passenger_name: f.passenger_name,
      airline: f.airline,
      flight_number: f.flight_number,
      origin_code: f.origin_code,
      destination_code: f.destination_code,
      departure_datetime: f.departure_datetime.slice(0, 16),
      status: f.status,
      cabin_class: f.cabin_class,
      seat_number: f.seat_number || '',
      confirmation_code: f.confirmation_code || '',
    })
    setModal('flight')
  }

  const updateFlight = async () => {
    if (!editingFlightId || !flightForm.departure_datetime) return
    setSaving(true)
    const patch = {
      passenger_name: flightForm.passenger_name,
      airline: flightForm.airline || 'Unknown',
      flight_number: flightForm.flight_number || 'TBD',
      origin_code: flightForm.origin_code.toUpperCase(),
      destination_code: flightForm.destination_code.toUpperCase(),
      departure_datetime: flightForm.departure_datetime,
      status: flightForm.status,
      cabin_class: flightForm.cabin_class,
      seat_number: flightForm.seat_number || null,
      confirmation_code: flightForm.confirmation_code || null,
    }
    const { error } = await supabase.from('flights').update(patch).eq('id', editingFlightId)
    if (!error) setFlights(p => p.map(f => f.id === editingFlightId ? { ...f, ...patch } : f))
    setSaving(false)
    setModal(null)
    setEditingFlightId(null)
    setFlightForm({ passenger_name: 'Patrick', airline: '', flight_number: '', origin_code: '', destination_code: '', departure_datetime: '', status: 'confirmed', cabin_class: 'economy', seat_number: '', confirmation_code: '' })
  }

  const delMiles = async (id: string) => {
    await supabase.from('loyalty_programs').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setMiles(p => p.filter(m => m.id !== id))
  }
  const delFlight = async (id: string) => {
    await supabase.from('flights').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    setFlights(p => p.filter(f => f.id !== id))
  }

  const closeMilesModal = () => {
    setModal(null)
    setEditingMilesId(null)
    setMilesForm({ program_name: '', program_type: 'airline', airline_code: '', member_number: '', miles_balance: '', expiry_date: '', color: '#6366f1' })
  }
  const closeFlightModal = () => {
    setModal(null)
    setEditingFlightId(null)
    setFlightForm({ passenger_name: 'Patrick', airline: '', flight_number: '', origin_code: '', destination_code: '', departure_datetime: '', status: 'confirmed', cabin_class: 'economy', seat_number: '', confirmation_code: '' })
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-500" size={32} /></div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Travel & Miles</h1>
          <p className="text-sm text-slate-400 mt-0.5">{miles.length} loyalty programs · {flights.length} flights</p>
        </div>
        <button onClick={() => setModal(tab === 'Miles Programs' ? 'miles' : 'flight')} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Add {tab === 'Miles Programs' ? 'Program' : 'Flight'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Total Miles</div>
          <div className="text-2xl font-bold text-brand-400">{totalMiles.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">All programs combined</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Estimated Value</div>
          <div className="text-2xl font-bold text-emerald-400">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(totalValue)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Based on ~1¢/mile avg</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-1">Upcoming Flights</div>
          <div className="text-2xl font-bold text-slate-200">{upcomingFlights.length}</div>
          <div className="text-xs text-slate-500 mt-1">
            {upcomingFlights[0] ? `Next: ${upcomingFlights[0].origin_code} → ${upcomingFlights[0].destination_code}` : 'None booked'}
          </div>
        </div>
      </div>

      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit">
        {['Miles Programs', 'Flights'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Miles Programs' && (
        miles.length === 0 ? (
          <div className="card p-12 text-center">
            <Star size={40} className="text-slate-700 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300">No loyalty programs yet</h3>
            <button onClick={() => setModal('miles')} className="btn-primary mt-4 mx-auto flex items-center gap-2"><Plus size={14} /> Add Program</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {miles.map(m => (
              <div key={m.id} onClick={() => openEditMiles(m)} className="card p-5 cursor-pointer hover:border-slate-600 transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-slate-100">{m.program_name}</div>
                    {m.airline_code && <div className="text-xs text-slate-500">{m.airline_code}</div>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); delMiles(m.id) }} className="text-slate-600 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
                </div>
                <div className="text-3xl font-bold mb-1" style={{ color: m.color }}>
                  {m.miles_balance.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mb-3">≈ ${Math.round(m.miles_balance * m.cpp)} estimated value</div>
                {[
                  ['Member #', m.member_number ?? 'Not set'],
                  ['Expires', m.expiry_date ?? 'Never'],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{k}</span>
                    <span className="text-slate-300">{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'Flights' && (
        flights.length === 0 ? (
          <div className="card p-12 text-center">
            <Plane size={40} className="text-slate-700 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300">No flights booked</h3>
            <button onClick={() => setModal('flight')} className="btn-primary mt-4 mx-auto flex items-center gap-2"><Plus size={14} /> Add Flight</button>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Passenger', 'Airline', 'Route', 'Departure', 'Flight #', 'Cabin', 'Confirmation', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flights.map(f => (
                  <tr key={f.id} onClick={() => openEditFlight(f)} className="border-b border-slate-800/50 hover:bg-slate-800/30 last:border-0 cursor-pointer">
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">{f.passenger_name}</span>
                    </td>
                    <td className="px-5 py-3 text-slate-300">{f.airline}</td>
                    <td className="px-5 py-3 font-semibold text-slate-100">{f.origin_code} → {f.destination_code}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{f.departure_datetime.split('T')[0]}</td>
                    <td className="px-5 py-3 text-slate-300">{f.flight_number}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs capitalize">{f.cabin_class}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-300">{f.confirmation_code ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">{f.status}</span>
                    </td>
                    <td className="px-5 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => delFlight(f.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {modal === 'miles' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-100">{editingMilesId ? 'Edit Miles Program' : 'Add Miles Program'}</h3>
              <button onClick={closeMilesModal} className="text-slate-400 hover:text-slate-200 p-1"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-1.5 block">Program Name *</label>
                <input value={milesForm.program_name} onChange={e => setMilesForm(p => ({ ...p, program_name: e.target.value }))} className="input-base" placeholder="Delta SkyMiles" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Airline Code</label>
                  <input value={milesForm.airline_code} onChange={e => setMilesForm(p => ({ ...p, airline_code: e.target.value.toUpperCase() }))} className="input-base" placeholder="DL" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Miles Balance</label>
                  <input type="number" value={milesForm.miles_balance} onChange={e => setMilesForm(p => ({ ...p, miles_balance: e.target.value }))} className="input-base" placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Member Number</label>
                  <input value={milesForm.member_number} onChange={e => setMilesForm(p => ({ ...p, member_number: e.target.value }))} className="input-base" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Expires</label>
                  <input value={milesForm.expiry_date} onChange={e => setMilesForm(p => ({ ...p, expiry_date: e.target.value }))} className="input-base" placeholder="Never or YYYY-MM" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={editingMilesId ? updateMiles : addMiles} disabled={saving || !milesForm.program_name} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editingMilesId ? 'Save Changes' : 'Save Program'}
              </button>
              <button onClick={closeMilesModal} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'flight' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-100">{editingFlightId ? 'Edit Flight' : 'Add Flight'}</h3>
              <button onClick={closeFlightModal} className="text-slate-400 hover:text-slate-200 p-1"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Passenger</label>
                  <select value={flightForm.passenger_name} onChange={e => setFlightForm(p => ({ ...p, passenger_name: e.target.value }))} className="input-base">
                    {MEMBERS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Airline</label>
                  <input value={flightForm.airline} onChange={e => setFlightForm(p => ({ ...p, airline: e.target.value }))} className="input-base" placeholder="Delta" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">From (IATA)</label>
                  <input maxLength={3} value={flightForm.origin_code} onChange={e => setFlightForm(p => ({ ...p, origin_code: e.target.value.toUpperCase() }))} className="input-base" placeholder="DEN" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">To (IATA)</label>
                  <input maxLength={3} value={flightForm.destination_code} onChange={e => setFlightForm(p => ({ ...p, destination_code: e.target.value.toUpperCase() }))} className="input-base" placeholder="ATL" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Flight #</label>
                  <input value={flightForm.flight_number} onChange={e => setFlightForm(p => ({ ...p, flight_number: e.target.value }))} className="input-base" placeholder="DL1847" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Departure *</label>
                  <input type="datetime-local" value={flightForm.departure_datetime} onChange={e => setFlightForm(p => ({ ...p, departure_datetime: e.target.value }))} className="input-base" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Cabin Class</label>
                  <select value={flightForm.cabin_class} onChange={e => setFlightForm(p => ({ ...p, cabin_class: e.target.value }))} className="input-base">
                    {CABIN_CLASSES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Seat</label>
                  <input value={flightForm.seat_number} onChange={e => setFlightForm(p => ({ ...p, seat_number: e.target.value }))} className="input-base" placeholder="14A" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium mb-1.5 block">Confirmation</label>
                  <input value={flightForm.confirmation_code} onChange={e => setFlightForm(p => ({ ...p, confirmation_code: e.target.value.toUpperCase() }))} className="input-base" placeholder="XK72A1" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={editingFlightId ? updateFlight : addFlight} disabled={saving || !flightForm.departure_datetime} className="btn-primary flex-1 justify-center flex items-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : editingFlightId ? 'Save Changes' : 'Save Flight'}
              </button>
              <button onClick={closeFlightModal} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
