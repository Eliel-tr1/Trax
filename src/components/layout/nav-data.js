/* Navigation as data — TRAX rewrite of bina-crm's nav-data.js. */

// Exactly 2 groups (spec: 01.09.2026 sidebar restructure). Group 1 is the
// "home" pair (dashboard + rep home screen); Group 2 is every other entity
// as one flat list, no sub-grouping. Settings was removed from here — it now
// lives behind the profile avatar dropdown in AppSidebar's footer, alongside
// "הפרופיל שלי".
export const NAV_GROUPS = [
  {
    key: 'home',
    title: 'לוח בקרה',
    items: [
      { path: '/', label: 'דשבורד', icon: 'grid', resource: 'dashboard', end: true },
      { path: '/my-desk', label: 'מסך ראשי לנציג', icon: 'user-plus', resource: 'my_desk' },
    ],
  },
  {
    key: 'entities',
    title: 'ניהול',
    items: [
      { path: '/tasks', label: 'המשימות שלי', icon: 'calendar', resource: 'tasks' },
      { path: '/customers', label: 'לקוחות', icon: 'users', resource: 'customers' },
      { path: '/sales', label: 'מכירות', icon: 'money', resource: 'sales' },
      { path: '/journeys', label: 'מסעות', icon: 'calendar', resource: 'journeys' },
      { path: '/registrations', label: 'הרשמות', icon: 'tag', resource: 'registrations' },
      { path: '/meetings', label: 'פגישות', icon: 'calendar', resource: 'meetings' },
      { path: '/phone-calls', label: 'שיחות טלפון', icon: 'phone', resource: 'phone_calls' },
    ],
  },
]

export const DETAIL_TITLES = [
  ['/customers/', 'כרטיס לקוח'],
  ['/sales/', 'כרטיס מכירה'],
  ['/journeys/', 'כרטיס מסע'],
  ['/registrations/', 'כרטיס הרשמה'],
  ['/meetings/', 'כרטיס פגישה'],
  ['/phone-calls/', 'כרטיס שיחה'],
]

export const allNavItems = () => NAV_GROUPS.flatMap(g => g.items)

// Applies a user's saved sidebar customization (app_users.prefs.navOrder /
// .navHidden, set from Profile.jsx — feature-audit item #9, ported from
// bina-crm's MySettings.jsx) to NAV_GROUPS: filters hidden items and
// reorders the survivors within each group by their position in navOrder
// (global order list, items not in it keep their original relative order).
export function orderedGroups(prefs) {
  const order = prefs?.navOrder || []
  const hidden = new Set(prefs?.navHidden || [])
  const rank = (path) => { const i = order.indexOf(path); return i === -1 ? 999 + order.length : i }
  return NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(it => !hidden.has(it.path)).slice().sort((a, b) => rank(a.path) - rank(b.path)) }))
    .filter(g => g.items.length > 0)
}

export function titleForPath(pathname) {
  if (pathname === '/profile') return 'הפרופיל שלי'
  if (pathname === '/settings') return 'הגדרות'
  const match = allNavItems()
    .filter(n => n.path === pathname || (n.path !== '/' && pathname.startsWith(n.path)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (match) return match.label
  const detail = DETAIL_TITLES.find(([prefix]) => pathname.startsWith(prefix))
  return detail ? detail[1] : 'TRAX CRM'
}
