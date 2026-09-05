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
  { key: 'my_desk', label: 'מסך ראשי לנציג' },
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
    // Race guard: initialize() and the INITIAL_SESSION auth event fire two
    // overlapping loads on refresh. If call A (non-silent, first paint) is
    // still in flight and call B finishes first, B's set would be clobbered
    // by A's slower (possibly error-laden) result — the reported "permissions
    // lost after every refresh". Serialize: newer call wins, older aborts.
    const seq = (get()._loadSeq || 0) + 1
    // loading:false may only land when a real matrix lands with it. A silent
    // refetch that flips loading:false while matrix is still {} made
    // RequirePermission render its no-access screen (can() on an empty
    // matrix is false) until the 48 RPCs finished — the reported "no
    // permission after every refresh, clears after navigating".
    const firstLoad = !Object.keys(get().matrix).length
    set({ loading: !silent || firstLoad, userId, _loadSeq: seq })
    const stale = () => get()._loadSeq !== seq
    // 'view' goes through can_view_resource, not can_access — can_access's
    // 'view' branch is now a strict per-row check (requires a real row's
    // owner_id to evaluate 'mine' scope correctly, see migration 022) and
    // would incorrectly report "cannot view at all" for every scope='mine'
    // role here, since this bulk loader has no specific row to check.
    const pairs = RESOURCES.flatMap(r => ACTIONS.map(a => ({ resource: r.key, action: a })))
    const results = await Promise.all(pairs.map(({ resource, action }) =>
      (action === 'view'
        ? supabase.rpc('can_view_resource', { p_resource: resource })
        : supabase.rpc('can_access', { p_resource: resource, p_action: action })
      ).then(({ data, error }) => {
        // Distinguish "denied" from "didn't get an answer": a transient RPC
        // failure (network wake-up right after tab restore, cold start)
        // reported as ok:false made RequirePermission show the no-access
        // screen after every refresh for managers with full permissions.
        return { resource, action, ok: error ? null : !!data, error: !!error }
      })
    ))
    const hadError = results.some(r => r.error)
    if (hadError) {
      // Retry once — a partial matrix is worse than a short wait, because a
      // false "no permission" is a hard wall the user can't get past.
      const retry = await Promise.all(pairs.map(({ resource, action }) =>
        (action === 'view'
          ? supabase.rpc('can_view_resource', { p_resource: resource })
          : supabase.rpc('can_access', { p_resource: resource, p_action: action })
        ).then(({ data, error }) => ({ resource, action, ok: error ? null : !!data, error: !!error }))
      ))
      results.splice(0, results.length, ...retry)
    }
    // scope is needed for the edit/delete/create branch above — one extra
    // light read of the caller's own permission rows (RLS-readable to any
    // authenticated user per 003_rbac.sql's permissions_select policy).
    const { data: rep } = await supabase.from('app_users').select('role_id').eq('id', userId).maybeSingle()
    const { data: scopeRows } = rep?.role_id
      ? await supabase.from('permissions').select('resource, scope').eq('role_id', rep.role_id)
      : { data: [] }
    if (stale()) return // a newer load superseded this one — don't clobber it
    const scopeByResource = Object.fromEntries((scopeRows || []).map(r => [r.resource, r.scope]))

    const matrix = {}
    for (const { resource, action, ok } of results) {
      matrix[resource] = matrix[resource] || { scope: scopeByResource[resource] || 'mine' }
      // ok===null (RPC error even after retry) must NOT close the screen:
      // treat "unknown" as granted at the UI layer and let RLS decide the
      // truth server-side — a wrongly-denied manager is a hard wall, while
      // a wrongly-shown button fails safely at the data layer.
      matrix[resource][action] = ok !== null ? ok : true
    }
    if (stale()) return
    set({ matrix, loading: false })
  },

  reset: () => set({ loading: false, userId: null, matrix: {}, impersonating: null, realUserId: null }),
}))
