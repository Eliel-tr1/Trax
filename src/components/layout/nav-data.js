/* Navigation as data — TRAX rewrite of bina-crm's nav-data.js. */

export const NAV_GROUPS = [
  {
    title: null,
    items: [
      { path: '/', label: 'דשבורד', icon: 'grid', resource: 'dashboard', end: true },
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
]

export const allNavItems = () => NAV_GROUPS.flatMap(g => g.items)

export function titleForPath(pathname) {
  if (pathname === '/profile') return 'הפרופיל שלי'
  const match = allNavItems()
    .filter(n => n.path === pathname || (n.path !== '/' && pathname.startsWith(n.path)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (match) return match.label
  const detail = DETAIL_TITLES.find(([prefix]) => pathname.startsWith(prefix))
  return detail ? detail[1] : 'TRAX CRM'
}
