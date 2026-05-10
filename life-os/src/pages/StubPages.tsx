// Stub pages — each will be expanded by their respective agents

export function AccountsPage() {
  return <ComingSoon title="Accounts" desc="Finance Agent — Phase 2" />
}
export function PaymentsPage() {
  return <ComingSoon title="Payments" desc="Finance Agent — Phase 2" />
}
export function AnalyticsPage() {
  return <ComingSoon title="Analytics" desc="Finance Agent — Phase 2" />
}
export function RewardsPage() {
  return <ComingSoon title="Rewards" desc="Finance Agent — Phase 2" />
}
export function TravelPage() {
  return <ComingSoon title="Travel & Miles" desc="Travel Agent — Phase 4" />
}
export function HealthPage() {
  return <ComingSoon title="Health" desc="Health Agent — Phase 4" />
}
export function JobsPage() {
  return <ComingSoon title="Jobs & Career" desc="Jobs Agent — Phase 4" />
}
export function SettingsPage() {
  return <ComingSoon title="Settings" desc="Coming soon" />
}

function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center animate-fade-in">
      <div className="text-4xl mb-4">🔧</div>
      <h1 className="text-xl font-bold text-slate-200">{title}</h1>
      <p className="text-sm text-slate-400 mt-2">{desc}</p>
      <p className="text-xs text-slate-500 mt-4">
        Paste an image (Ctrl+V) to scan documents into any section
      </p>
    </div>
  )
}
