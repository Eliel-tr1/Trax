/* Navigation as data — TRAX rewrite of bina-crm's nav-data.js. */

export const NAV_GROUPS = [
  {
    title: null,
    items: [
      { path: '/', label: 'דשבורד', icon: 'grid', resource: 'dashboard', end: true },
      { path: '/my-desk', label: 'מסך ראשי לנציג', icon: 'user-plus', resource: 'dashboard' },
      { path: '/tasks', label: 'המשימות שלי', icon: 'calendar', resource: 'tasks' },
    ],
  },
  {
    key: 'sales',
    title: 'מכירות',
    items: [
      { path: '/customers', label: 'לקוחות', icon: 'users', resource: 'customers' },
      { path: '/sales', label: 'מכירות', icon: 'money', resource: 'sales' },
    ],
  },
  {
    key: 'journeys',
    title: 'מסעות',
    items: [
      { path: '/journeys', label: 'מסעות', icon: 'calendar', resource: 'journeys' },
      { path: '/registrations', label: 'הרשמות', icon: 'tag', resource: 'registrations' },
    ],
  },
  {
    key: 'activity',
    title: 'פעילות',
    items: [
      { path: '/meetings', label: 'פגישות', icon: 'calendar', resource: 'meetings' },
      { path: '/phone-calls', label: 'שיחות טלפון', icon: 'phone', resource: 'phone_calls' },
    ],
  },
  {
    key: 'system',
    title: null,
    items: [
      { path: '/settings', label: 'הגדרות', icon: 'cog', resource: 'settings' },
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
  const match = allNavItems()
    .filter(n => n.path === pathname || (n.path !== '/' && pathname.startsWith(n.path)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (match) return match.label
  const detail = DETAIL_TITLES.find(([prefix]) => pathname.startsWith(prefix))
  return detail ? detail[1] : 'TRAX CRM'
}
