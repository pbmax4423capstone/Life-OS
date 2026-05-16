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

export function SettingsPage() {
  return <ComingSoon title="Settings" desc="Coming soon" />
}
export function PrivacyPage() {
  return <ComingSoon title="Privacy Policy" desc="Privacy details coming soon" />
}
export function TermsPage() {
  return <ComingSoon title="Terms of Service" desc="Terms details coming soon" />
}
