import { useEffect, useRef } from 'react'
import { useStore } from 'ra-core'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

// Stable reference, not a fresh `{}` per render — ra-core's useStore puts
// the default value in a useEffect dependency array, so a literal `{}`
// here would tear down and rebuild this hook's store subscription on every
// render, and could miss a rapid resize update (many setItem calls per
// drag) published during that gap.
const EMPTY_COLUMN_WIDTHS = {}

/* Bridges the DataTable's column order/width (data-table.tsx, columns-
   button.tsx — both drag-driven, stored under ra-core's localStorage-backed
   store as `${resource}.datatable_columnRanks` / `_columnWidths`) to
   app_users.prefs, the same per-user jsonb column NavCustomizationCard
   already uses for navOrder/navHidden (see Profile.jsx). localStorage alone
   survives a reload but not a different browser/profile, so the layout is
   mirrored server-side, keyed by resource: prefs.columnLayout.<resource>.

   FOUND LIVE (root-caused with mount/unmount + save-check console tracing,
   don't re-break this): a React effect always fires once on mount even
   though its dependency array didn't "change" from a prior render — there
   is no prior render to diff against. On this component's very first
   mount, that fired the save effect below with the local columnRanks/
   columnWidths hooks not necessarily settled yet from ra-core's store, so
   it could write a spurious/incomplete value, call fetchRep(), which
   flips permissionStore's `loading` true→false, which makes
   RequirePermission remount its guarded subtree (including THIS
   component) — closing a self-sustaining ~1-2s mount→spurious-save→
   fetchRep→remount loop with no user interaction at all (that's what
   "the screen keeps refreshing" was). Comparing current-vs-last-saved
   content (JSON.stringify) alone does NOT fix this: the fix has to be
   that the save effect is INERT on the render where it first becomes
   eligible to run (right after hydrate), and only ever acts on a
   genuinely later dependency change — hence armedRef below, separate
   from hydrated.

   SECOND bug, same class, found live afterward: even with armedRef fixing
   the spurious mount-time save, a REAL drag/resize still called
   fetchRep(user) with no arguments below, which defaults to a non-silent
   permissionStore.load() — i.e. every genuine column reorder/resize
   flipped `loading` true then false once the debounced save landed,
   remounting the entire routed screen (RequirePermission wraps every
   route in App.jsx). That's "changing column order/width causes a full
   page reload" — a different trigger than the mount-time bug above, but
   the exact same RequirePermission-remount mechanism. Fix:
   fetchRep(user, true) — silent, so `rep` still refreshes with the new
   prefs but the route never unmounts. See authStore.js's fetchRep.

   Renders nothing — it only watches two store keys and syncs them. */
export default function ColumnLayoutSync({ resource, datatableStoreKey }) {
  const rep = useAuthStore(s => s.rep)
  const user = useAuthStore(s => s.user)
  const fetchRep = useAuthStore(s => s.fetchRep)
  const [columnRanks, setColumnRanks] = useStore(`${datatableStoreKey}_columnRanks`)
  const [columnWidths, setColumnWidths] = useStore(`${datatableStoreKey}_columnWidths`, EMPTY_COLUMN_WIDTHS)
  const hydrated = useRef(false)
  const armedRef = useRef(false) // becomes true only after the save effect has already run once and skipped itself
  const saveTimer = useRef(null)
  const lastSavedRef = useRef(undefined) // last value THIS TAB actually wrote — never diff against server-echoed rep.prefs (jsonb key order isn't guaranteed stable)

  // Hydrate once from server prefs, but only fill in what the local store
  // doesn't already have — a returning user's in-browser drag state should
  // never be clobbered by a stale server copy on remount.
  useEffect(() => {
    if (hydrated.current || !rep) return
    hydrated.current = true
    const saved = rep.prefs?.columnLayout?.[resource]
    if (!saved) return
    lastSavedRef.current = { columnRanks: saved.columnRanks || null, columnWidths: saved.columnWidths || null }
    if (columnRanks === undefined && Array.isArray(saved.columnRanks)) setColumnRanks(saved.columnRanks)
    if ((!columnWidths || Object.keys(columnWidths).length === 0) && saved.columnWidths) {
      setColumnWidths(saved.columnWidths)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep])

  // Persist whenever the live layout actually changes, debounced so a drag
  // or a resize doesn't fire a write per pixel/frame. Deliberately inert on
  // its first eligible firing (see the file-level comment above) — only a
  // real subsequent change to columnRanks/columnWidths schedules a save.
  useEffect(() => {
    if (!hydrated.current || !user) return
    if (!armedRef.current) { armedRef.current = true; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const current = { columnRanks: columnRanks || null, columnWidths: columnWidths || null }
      if (JSON.stringify(current) === JSON.stringify(lastSavedRef.current)) return
      lastSavedRef.current = current
      const nextPrefs = {
        ...(rep?.prefs || {}),
        columnLayout: { ...(rep?.prefs?.columnLayout || {}), [resource]: current },
      }
      const { error } = await supabase.from('app_users').update({ prefs: nextPrefs }).eq('id', user.id)
      if (!error) await fetchRep(user, true)
    }, 600)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnRanks, columnWidths])

  return null
}
