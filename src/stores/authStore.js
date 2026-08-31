import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { usePermissionStore } from './permissionStore'

// Maps a Supabase auth user + the matching app_users row into a session
// profile. TRAX has no permission_level yet (spec: "2 users, both
// full-access owners", see docs/blockers.md) — isManager/isAdmin both
// resolve to true for any signed-in user for now.
export const useAuthStore = create((set, get) => ({
  user: null,   // supabase auth user
  rep: null,    // row from public.app_users
  loading: true,
  error: null,

  isAdmin: () => !!get().user,
  isManager: () => !!get().user,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) await get().fetchRep(session.user)
    set({ loading: false })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) await get().fetchRep(session.user)
      else set({ user: null, rep: null })
    })
  },

  fetchRep: async (user) => {
    const { data } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    set({ user, rep: data })
    usePermissionStore.getState().load(user.id)
  },

  signIn: async (email, password) => {
    set({ error: null })
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      set({ error: 'מייל או סיסמה שגויים' })
      throw error
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, rep: null })
    usePermissionStore.getState().reset()
  },
}))
