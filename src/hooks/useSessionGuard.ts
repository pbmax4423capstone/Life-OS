import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

const LOGIN_PATH = '/login'

export function useSessionGuard() {
  const setSessionState = useAuthStore((state) => state.setSessionState)
  const setProfile = useAuthStore((state) => state.setProfile)
  const clearSessionState = useAuthStore((state) => state.clearSessionState)

  useEffect(() => {
    let mounted = true

    const refreshProfile = async (userId: string) => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (mounted && data) setProfile(data)
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      setSessionState(session)
      if (session?.user?.id) {
        await refreshProfile(session.user.id)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        clearSessionState()
        if (window.location.pathname !== LOGIN_PATH) {
          window.location.assign(LOGIN_PATH)
        }
        return
      }

      setSessionState(session)
      if (session?.user?.id) {
        await refreshProfile(session.user.id)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [clearSessionState, setProfile, setSessionState])
}
