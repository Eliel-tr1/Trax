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
      // silent=true is load-bearing here: Supabase fires TOKEN_REFRESHED /
      // INITIAL_SESSION on tab re-focus (autoRefreshToken recovery). Loading
      // the permission matrix non-silently flips loading:true →
      // RequirePermission unmounts the ENTIRE active screen (spinner) →
      // remounts it a few hundred ms later. Users experienced exactly that
      // as "the CRM reloads whenever I switch tabs and back" — open popups
      // closed, scroll lost. A background rep-refetch must never unmount
      // the screen it runs under.
      if (session?.user) await get().fetchRep(session.user, true)
      else set({ user: null, rep: null })
    })
  },

  // silent=true skips permissionStore's loading:true flip (see its load()
  // comment) — used by callers that refetch `rep` as a side effect of a
  // background write (e.g. ColumnLayoutSync persisting a column drag/resize)
  // where the signed-in user's screen shouldn't unmount/remount just because
  // their own prefs blob got a round trip.
  fetchRep: async (user, silent = false) => {
    const { data } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    set({ user, rep: data })
    usePermissionStore.getState().load(user.id, silent)
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
