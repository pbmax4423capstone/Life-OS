import { create } from 'zustand'
import { supabase, type Profile } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

let authListener: { unsubscribe: () => void } | null = null
let initializePromise: Promise<void> | null = null
let initialized = false

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (
    email: string,
    password: string,
    name: string,
    invite?: { code?: string; planGrant?: string }
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  setProfile: (profile: Profile) => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,

  initialize: async () => {
    if (initialized) return
    if (initializePromise) return initializePromise

    initializePromise = (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      set({ session, user: session?.user ?? null })

      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        set({ profile: data, loading: false })
      } else {
        set({ loading: false })
      }

      authListener?.unsubscribe()
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        set({ session, user: session?.user ?? null })
        if (session?.user) {
          try {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            set({ profile: data ?? null })
          } catch {
            set({ profile: null })
          }
        } else {
          set({ profile: null })
        }
      })
      authListener = subscription
      initialized = true
    })()

    try {
      await initializePromise
    } finally {
      initializePromise = null
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  },

  signUp: async (email, password, name, invite) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: {
          full_name: name,
          invite_code: invite?.code ?? null,
          invite_plan: invite?.planGrant ?? null,
        },
      },
    })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, profile: null })
  },

  setProfile: (profile) => set({ profile }),
}))
