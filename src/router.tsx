import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import AppShell from '@/components/layout/AppShell'
import AuthPage from '@/pages/AuthPage'
import DashboardPage from '@/pages/DashboardPage'
import LandingPage from '@/pages/LandingPage'
import ChatPage from '@/pages/ChatPage'
import DebtPlannerPage from '@/pages/finance/DebtPlannerPage'
import RetirementLoanPage from '@/pages/finance/RetirementLoanPage'
import HealthPage from '@/pages/HealthPage'
import JobsPage from '@/pages/JobsPage'
import TravelPage from '@/pages/TravelPage'
import {
  AccountsPage, PaymentsPage, AnalyticsPage,
  RewardsPage, SettingsPage, PrivacyPage, TermsPage
} from '@/pages/StubPages'

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
      { path: 'rewards',                element: <RewardsPage /> },
      { path: 'travel',                 element: <TravelPage /> },
      { path: 'health',                 element: <HealthPage /> },
      { path: 'jobs',                   element: <JobsPage /> },
      { path: 'settings',               element: <SettingsPage /> },
      { path: 'chat',                   element: <ChatPage /> },
      { path: 'finance/debt-planner',   element: <DebtPlannerPage /> },
      { path: 'finance/retirement',     element: <RetirementLoanPage /> },
    ],
  },
])

export default function AppRouter() {
  return <RouterProvider router={router} />
}
