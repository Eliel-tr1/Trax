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

   Renders nothing — it only watches two store keys and syncs them. */
export default function ColumnLayoutSync({ resource, datatableStoreKey }) {
  const rep = useAuthStore(s => s.rep)
  const user = useAuthStore(s => s.user)
  const fetchRep = useAuthStore(s => s.fetchRep)
  const [columnRanks, setColumnRanks] = useStore(`${datatableStoreKey}_columnRanks`)
  const [columnWidths, setColumnWidths] = useStore(`${datatableStoreKey}_columnWidths`, EMPTY_COLUMN_WIDTHS)
  const hydrated = useRef(false)
  const saveTimer = useRef(null)

  // Hydrate once from server prefs, but only fill in what the local store
  // doesn't already have — a returning user's in-browser drag state should
  // never be clobbered by a stale server copy on remount.
  useEffect(() => {
    if (hydrated.current || !rep) return
    hydrated.current = true
    const saved = rep.prefs?.columnLayout?.[resource]
    if (!saved) return
    if (columnRanks === undefined && Array.isArray(saved.columnRanks)) setColumnRanks(saved.columnRanks)
    if ((!columnWidths || Object.keys(columnWidths).length === 0) && saved.columnWidths) {
      setColumnWidths(saved.columnWidths)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep])

  // Persist whenever the live layout actually changes, debounced so a drag
  // or a resize doesn't fire a write per pixel/frame.
  useEffect(() => {
    if (!hydrated.current || !user) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const current = { columnRanks: columnRanks || null, columnWidths: columnWidths || null }
      const prevSaved = rep?.prefs?.columnLayout?.[resource] || { columnRanks: null, columnWidths: null }
      if (JSON.stringify(current) === JSON.stringify(prevSaved)) return
      const nextPrefs = {
        ...(rep?.prefs || {}),
        columnLayout: { ...(rep?.prefs?.columnLayout || {}), [resource]: current },
      }
      const { error } = await supabase.from('app_users').update({ prefs: nextPrefs }).eq('id', user.id)
      if (!error) await fetchRep(user)
    }, 600)
    return () => clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnRanks, columnWidths])

  return null
}
