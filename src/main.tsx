import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppRouter from './router'
import { useAuthStore } from './stores/authStore'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,   // 5 min
      retry: 1,
    },
  },
})

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-4">
            <div className="text-4xl">⚠️</div>
            <h1 className="text-xl font-bold text-slate-100">Something went wrong</h1>
            <p className="text-sm text-slate-400">
              An unexpected error occurred. Try refreshing the page.
            </p>
            <p className="text-xs text-slate-600 font-mono bg-slate-900 rounded-lg p-3 text-left break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function Root() {
  const initialize = useAuthStore(s => s.initialize)
  React.useEffect(() => { initialize() }, [initialize])
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
    </QueryClientProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>
)
