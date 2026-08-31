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

  load: async (userId) => {
    if (!userId) { set({ loading: false, userId: null, matrix: {} }); return }
    set({ loading: true, userId })
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

  reset: () => set({ loading: false, userId: null, matrix: {} }),
}))
