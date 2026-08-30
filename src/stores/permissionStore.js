import { create } from 'zustand'

/* Minimal permission layer for Wave 1.
   Spec: "2 users, both full-access owners" — no per-role restriction yet
   (see docs/blockers.md / architecture.md). RequirePermission and
   CustomFields' "canManage" hook expect this shape, so it's kept alive
   rather than deleted, but `can()` always returns true for now.

   RESOURCES lists screens for RequirePermission's "no access" message —
   kept in sync with the sidebar nav (layout/AppLayout.jsx). */
export const RESOURCES = [
  { key: 'dashboard', label: 'לוח בקרה' },
  { key: 'customers', label: 'לקוחות' },
  { key: 'sales', label: 'מכירות' },
  { key: 'tasks', label: 'משימות' },
  { key: 'contacts', label: 'אנשי קשר' },
]

export const usePermissionStore = create(() => ({
  loading: false,
  can: () => true,
}))
