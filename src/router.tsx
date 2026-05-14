import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import AppShell from '@/components/layout/AppShell'
import AuthPage from '@/pages/AuthPage'
import DashboardPage from '@/pages/DashboardPage'
import LandingPage from '@/pages/LandingPage'
import ChatPage from '@/pages/ChatPage'
import DebtPlannerPage from '@/pages/finance/DebtPlannerPage'
import RetirementLoanPage from '@/pages/finance/RetirementLoanPage'
import AccountsPage from '@/pages/AccountsPage'
import PaymentsPage from '@/pages/PaymentsPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import CreditPage from '@/pages/CreditPage'
import HealthPage from '@/pages/HealthPage'
import JobsPage from '@/pages/JobsPage'
import ProDevPage from '@/pages/ProDevPage'
import TravelPage from '@/pages/TravelPage'
import DocumentsPage from '@/pages/DocumentsPage'
import { SettingsPage, PrivacyPage, TermsPage } from '@/pages/StubPages'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuthStore()
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
    </div>
  )
  if (!session) return <Navigate to="/auth" replace />
  return <>{children}</>
}

const router = createBrowserRouter([
  { path: '/welcome', element: <LandingPage /> },
  { path: '/auth',    element: <AuthPage /> },
  { path: '/join',    element: <AuthPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms',   element: <TermsPage /> },
  {
    path: '/',
    element: <ProtectedRoute><AppShell /></ProtectedRoute>,
    children: [
      { index: true,                    element: <DashboardPage /> },
      { path: 'accounts',               element: <AccountsPage /> },
      { path: 'payments',               element: <PaymentsPage /> },
      { path: 'analytics',              element: <AnalyticsPage /> },
      { path: 'credit',                 element: <CreditPage /> },
      { path: 'finance/debt-planner',   element: <DebtPlannerPage /> },
      { path: 'finance/retirement',     element: <RetirementLoanPage /> },
      { path: 'health',                 element: <HealthPage /> },
      { path: 'jobs',                   element: <JobsPage /> },
      { path: 'prodev',                 element: <ProDevPage /> },
      { path: 'travel',                 element: <TravelPage /> },
      { path: 'documents',              element: <DocumentsPage /> },
      { path: 'settings',               element: <SettingsPage /> },
      { path: 'chat',                   element: <ChatPage /> },
    ],
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
