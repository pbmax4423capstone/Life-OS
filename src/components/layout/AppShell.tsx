import { useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CreditCard, Calendar, BarChart3,
  Star, Plane, Heart, Briefcase, LogOut, Settings,
  Bell, Menu, X, ScanLine, TrendingDown, PiggyBank, MessageSquare
} from 'lucide-react'
import { FloatingChat } from '@/components/chat/AiChat'
import { useAuthStore } from '@/stores/authStore'
import { useGlobalPaste } from '@/hooks/useGlobalPaste'
import { RecognitionModal } from '@/components/shared/RecognitionModal'
import { PasteIndicator } from '@/components/shared/PasteIndicator'
import type { RecognitionResult } from '@/lib/imageRecognition'

const NAV = [
  { to: '/',                       label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/accounts',               label: 'Accounts',      icon: CreditCard      },
  { to: '/payments',               label: 'Payments',      icon: Calendar        },
  { to: '/analytics',              label: 'Analytics',     icon: BarChart3       },
  { to: '/finance/debt-planner',   label: 'Debt Planner',  icon: TrendingDown    },
  { to: '/finance/retirement',     label: '401K Loans',    icon: PiggyBank       },
  { to: '/rewards',                label: 'Rewards',       icon: Star            },
  { to: '/travel',                 label: 'Travel',        icon: Plane           },
  { to: '/health',                 label: 'Health',        icon: Heart           },
  { to: '/jobs',                   label: 'Jobs',          icon: Briefcase       },
  { to: '/chat',                   label: 'AI Chat',       icon: MessageSquare   },
]

export default function AppShell() {
  const { profile, signOut } = useAuthStore()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [recognition, setRecognition] = useState<{
    result: RecognitionResult
    previewUrl: string
  } | null>(null)

  const handleResult = useCallback((result: RecognitionResult, previewUrl: string) => {
    setRecognition({ result, previewUrl })
  }, [])

  const { isProcessing, error, processImageFile, clearPreview } = useGlobalPaste(handleResult)

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  const initials = profile?.display_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?'

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-900/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-purple-900/10 rounded-full blur-3xl" />
      </div>

      {/* ── Sidebar desktop ──────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 bg-slate-900/80 border-r border-slate-800 backdrop-blur-sm flex-shrink-0 fixed h-full z-20">
        {/* Logo */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-brand-900/50">L</div>
            <span className="font-semibold text-slate-100 text-sm">Life OS</span>
          </div>
        </div>

        {/* Paste hint */}
        <div className="mx-3 mt-3 px-3 py-2 bg-brand-500/10 border border-brand-500/20 rounded-xl">
          <div className="flex items-center gap-2 text-brand-400">
            <ScanLine size={13} />
            <span className="text-xs font-medium">Paste any image to scan</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Ctrl+V / ⌘+V anywhere</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto mt-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'nav-item-active' : ''}`
              }>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
            <Settings size={16} /> Settings
          </NavLink>
          <button onClick={handleSignOut} className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
            <LogOut size={16} /> Sign Out
          </button>
          <div className="flex items-center gap-2 px-3 py-2 mt-1">
            <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-xs font-bold text-white">{initials}</div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-200 truncate">{profile?.display_name ?? profile?.email}</div>
              <div className="text-xs text-slate-500 truncate">{profile?.email}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Mobile sidebar ───────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">L</div>
                <span className="font-semibold text-slate-100 text-sm">Life OS</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="text-slate-400" aria-label="Close mobile menu"><X size={18} /></button>
            </div>
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
              {NAV.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end={to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
                  <Icon size={16} /> {label}
                </NavLink>
              ))}
            </nav>
            <div className="p-3 border-t border-slate-800">
              <button onClick={handleSignOut} className="nav-item w-full text-red-400">
                <LogOut size={16} /> Sign Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col md:ml-56">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-slate-900/60 border-b border-slate-800 backdrop-blur-sm px-4 md:px-6 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="md:hidden text-slate-400 hover:text-slate-200 p-1" aria-label="Open mobile menu">
            <Menu size={20} />
          </button>
          {/* Drop zone for drag-and-drop on mobile */}
          <label
            className="hidden md:flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-slate-400 transition-colors"
            htmlFor="header-file-input"
          >
            <ScanLine size={14} />
            Drop or click to scan a document
          </label>
          <input
            id="header-file-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) processImageFile(f)
              e.target.value = ''
            }}
          />
          <div className="flex items-center gap-2">
            <button className="text-slate-400 hover:text-slate-200 p-2 rounded-lg hover:bg-slate-800 transition-colors" aria-label="Notifications">
              <Bell size={18} />
            </button>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 p-4 md:p-6 relative">
          <Outlet />
        </main>
      </div>

      {/* ── Global overlays ──────────────────────────────────── */}
      <PasteIndicator isProcessing={isProcessing} error={error} />

      {recognition && (
        <RecognitionModal
          result={recognition.result}
          previewUrl={recognition.previewUrl}
          onConfirm={() => {
            clearPreview()
            setRecognition(null)
          }}
          onDismiss={() => {
            clearPreview()
            setRecognition(null)
          }}
        />
      )}

      {/* Floating AI chat button — available on every page */}
      <FloatingChat />
    </div>
  )
}
