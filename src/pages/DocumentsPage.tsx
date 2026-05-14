import { useState, useEffect } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { supabase, type ImageRecognition } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

function catBadge(table: string | null) {
  if (!table) return 'bg-slate-700/50 text-slate-400 border-slate-600/50'
  if (table.includes('financial') || table.includes('transaction')) return 'bg-amber-500/15 text-amber-400 border-amber-500/25'
  if (table.includes('flight') || table.includes('travel') || table.includes('loyalty')) return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25'
  if (table.includes('insurance') || table.includes('appointment') || table.includes('prescription')) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
  if (table.includes('job') || table.includes('certification')) return 'bg-purple-500/15 text-purple-400 border-purple-500/25'
  return 'bg-slate-700/50 text-slate-400 border-slate-600/50'
}

function tableLabel(table: string | null): string {
  if (!table) return 'Unknown'
  const map: Record<string, string> = {
    financial_accounts: 'Finance',
    insurance_policies: 'Health',
    flights: 'Travel',
    loyalty_programs: 'Miles',
    prescriptions: 'Health',
    job_applications: 'Career',
    certifications: 'Career',
    contacts: 'Contacts',
    travel_documents: 'Travel',
    documents: 'Document',
    credit_score: 'Finance',
  }
  return map[table] ?? table.replace(/_/g, ' ')
}

export default function DocumentsPage() {
  const { user } = useAuthStore()
  const [scans, setScans] = useState<ImageRecognition[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Scanned Documents')

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase.from('image_recognitions').select('*')
      .eq('owner_id', user.id).order('created_at', { ascending: false })
      .then(({ data }) => { setScans(data ?? []); setLoading(false) })
  }, [user])

  const staticDocs = [
    { name: 'Resume – Salesforce Dev.pdf', cat: 'Career', date: '—', size: '—' },
    { name: 'BCBS Insurance Card 2026.pdf', cat: 'Health', date: '—', size: '—' },
    { name: 'W-2 2025.pdf', cat: 'Finance', date: '—', size: '—' },
    { name: 'Mortgage Statement.pdf', cat: 'Finance', date: '—', size: '—' },
    { name: 'Salesforce Admin Cert.pdf', cat: 'Career', date: '—', size: '—' },
  ]

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-brand-500" size={32} /></div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Document Vault</h1>
          <p className="text-sm text-slate-400 mt-0.5">Paste any document image (Ctrl+V / ⌘+V) to scan and save it</p>
        </div>
      </div>

      <div className="card p-4 border-brand-500/20 bg-brand-500/5">
        <div className="flex items-center gap-3">
          <div className="text-2xl">📋</div>
          <div>
            <div className="text-sm font-semibold text-brand-300">Paste to scan any document</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Copy a screenshot of a bank statement, insurance card, boarding pass, prescription, or any document — then press Ctrl+V anywhere in the app. AI will extract the data and save it to the right section.
            </div>
          </div>
        </div>
      </div>

      <div className="flex bg-slate-900 rounded-lg p-1 gap-1 w-fit">
        {['Scanned Documents', 'File Vault'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Scanned Documents' && (
        scans.length === 0 ? (
          <div className="card p-12 text-center">
            <FolderOpen size={40} className="text-slate-700 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-300">No scanned documents yet</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              Paste a document screenshot with Ctrl+V / ⌘+V anywhere in the app. AI scans it and logs it here automatically.
            </p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {['Document Type', 'Category', 'Confidence', 'Saved To', 'Date', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scans.map(s => (
                  <tr key={s.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-200">
                      📄 {(s.detected_type ?? 'unknown').replace(/_/g, ' ')}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${catBadge(s.target_table)}`}>
                        {tableLabel(s.target_table)}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs ${s.confidence === 'high' ? 'text-emerald-400' : s.confidence === 'medium' ? 'text-amber-400' : 'text-red-400'}`}>
                        {s.confidence ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs capitalize">{s.target_table?.replace(/_/g, ' ') ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${s.status === 'recognized' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-amber-500/15 text-amber-400 border-amber-500/25'}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'File Vault' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                {['Document', 'Category', 'Date Added', 'Size', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400 px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staticDocs.map(d => (
                <tr key={d.name} className="border-b border-slate-800/50 hover:bg-slate-800/30 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-200">📄 {d.name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${d.cat === 'Career' ? 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25' : d.cat === 'Health' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-amber-500/15 text-amber-400 border-amber-500/25'}`}>
                      {d.cat}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{d.date}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{d.size}</td>
                  <td className="px-5 py-3">
                    <button className="btn-ghost text-xs py-1 px-3">↓ Download</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
