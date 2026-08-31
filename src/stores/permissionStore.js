import { create } from 'zustand'
import { supabase } from '../lib/supabase'

/* Real RBAC permission layer (data/003_rbac.sql / 005_enforce_rbac_rls.sql):
   roles -> permissions(resource, can_view/create/edit/delete, scope).
   RLS already enforces this server-side via can_access() on every table, so
   this store is a client-side mirror for UI decisions (route guards,
   hide/show a create/edit/delete control) — a wrong answer here can never
   actually leak data, RLS is still the real gate.

   can(resource, action) is called synchronously from render (see
   RequirePermission.jsx), so the permission set is fetched once — via the
   same can_access() RPC the RLS policies call, one round trip per
   resource×action, all in parallel — and cached here rather than awaited
   per call.

   RESOURCES lists screens for RequirePermission's "no access" message —
   kept in sync with the sidebar nav (layout/nav-data.js). */
export const RESOURCES = [
  { key: 'dashboard', label: 'לוח בקרה' },
  { key: 'customers', label: 'לקוחות' },
  { key: 'sales', label: 'מכירות' },
  { key: 'journeys', label: 'מסעות' },
  { key: 'registrations', label: 'הרשמות' },
  { key: 'tasks', label: 'משימות' },
  { key: 'contacts', label: 'אנשי קשר' },
  { key: 'meetings', label: 'פגישות' },
  { key: 'phone_calls', label: 'שיחות טלפון' },
  { key: 'settings', label: 'הגדרות' },
  { key: 'users', label: 'משתמשים' },
]
const ACTIONS = ['view', 'create', 'edit', 'delete']

export const usePermissionStore = create((set, get) => ({
  loading: true,
  userId: null,
  matrix: {},   // { [resource]: { view, create, edit, delete } } — booleans from can_access()

  // "View as user" (Impersonation.jsx / bina-crm's ImpersonationBar port).
  // impersonating holds the target app_users row while active, and realUserId
  // remembers who was actually signed in so stopImpersonation can restore
  // them. This is a UI LENS, not a session swap — the Supabase auth session
  // (and therefore auth.uid() inside RLS/can_access()) never changes, so any
  // row a manager writes while impersonating is still attributed to them,
  // and any list still comes back scoped to what the REAL signed-in user's
  // RLS policies allow. That's why the matrix below is read directly off the
  // target's `permissions` rows instead of the can_access() RPC (which
  // always evaluates against the real auth.uid(), so it would just re-answer
  // "what can the real user do" no matter who's being viewed as) — it makes
  // the visible buttons/route-guards match the target user, while row-level
  // data visibility still relies on the real user's own (usually broader)
  // access. Good enough for "why can't this rep see X" UI debugging; not a
  // substitute for actually logging in as them.
  impersonating: null,
  realUserId: null,

  startImpersonation: async (targetUser) => {
    const realUserId = get().impersonating ? get().realUserId : get().userId
    set({ impersonating: targetUser, realUserId, loading: true })
    const { data: rows } = targetUser.role_id
      ? await supabase.from('permissions').select('resource, can_view, can_create, can_edit, can_delete, scope').eq('role_id', targetUser.role_id)
      : { data: [] }
    const byResource = Object.fromEntries((rows || []).map(r => [r.resource, r]))
    const matrix = {}
    for (const r of RESOURCES) {
      const row = byResource[r.key]
      matrix[r.key] = {
        view: !!row?.can_view, create: !!row?.can_create, edit: !!row?.can_edit, delete: !!row?.can_delete,
        scope: row?.scope || 'mine',
      }
    }
    set({ matrix, userId: targetUser.id, loading: false })
  },

  stopImpersonation: async (realUserId) => {
    set({ impersonating: null, realUserId: null })
    await get().load(realUserId ?? get().realUserId)
  },

  // action==='view' ignores scope on purpose: RLS already scopes every row
  // server-side ('mine' roles simply see a filtered list), so the route
  // guard only needs "can this resource be opened at all". Record-level
  // actions (edit/delete/create a specific row) pass ownerId when known and
  // respect scope for real — but even a wrong client-side answer here is
  // just a hidden/shown button, RLS is the actual enforcement.
  can: (resource, action, ownerId) => {
    const perm = get().matrix[resource]
    if (!perm) return false
    if (!perm[action]) return false
    if (action === 'view') return true
    if (perm.scope === 'all') return true
    return ownerId != null && ownerId === get().userId
  },

  // silent=true skips the loading:true flip — RequirePermission.jsx unmounts
  // its guarded subtree while loading is true, so a "background refresh"
  // call (e.g. after editing a role's permissions elsewhere in Settings)
  // would otherwise unmount+remount the very screen the user is on,
  // resetting all its local state (found live: editing a permission
  // checkbox reset RolesTab's selected-role dropdown back to the first
  // role alphabetically — "the screen refreshes and jumps to a different
  // panel"). A stale matrix for the few hundred ms of this fetch is a
  // non-issue; an unwanted remount of the active screen is not.
  load: async (userId, silent = false) => {
    if (!userId) { set({ loading: false, userId: null, matrix: {} }); return }
    set({ loading: !silent, userId })
    const pairs = RESOURCES.flatMap(r => ACTIONS.map(a => ({ resource: r.key, action: a })))
    const results = await Promise.all(pairs.map(({ resource, action }) =>
      supabase.rpc('can_access', { p_resource: resource, p_action: action })
        .then(({ data, error }) => ({ resource, action, ok: error ? false : !!data }))
    ))
    // scope is needed for the edit/delete/create branch above — one extra
    // light read of the caller's own permission rows (RLS-readable to any
    // authenticated user per 003_rbac.sql's permissions_select policy).
    const { data: rep } = await supabase.from('app_users').select('role_id').eq('id', userId).maybeSingle()
    const { data: scopeRows } = rep?.role_id
      ? await supabase.from('permissions').select('resource, scope').eq('role_id', rep.role_id)
      : { data: [] }
    const scopeByResource = Object.fromEntries((scopeRows || []).map(r => [r.resource, r.scope]))

    const matrix = {}
    for (const { resource, action, ok } of results) {
      matrix[resource] = matrix[resource] || { scope: scopeByResource[resource] || 'mine' }
      matrix[resource][action] = ok
    }
    set({ matrix, loading: false })
  },

  reset: () => set({ loading: false, userId: null, matrix: {}, impersonating: null, realUserId: null }),
}))
