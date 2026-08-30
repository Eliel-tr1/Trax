/* Navigation as data — TRAX rewrite of bina-crm's nav-data.js. Wave 1
   screens only (see docs/roadmap.md); journeys/registrations are schema-
   ready but have no screens yet. */

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
]

export const DETAIL_TITLES = [
  ['/customers/', 'כרטיס לקוח'],
  ['/sales/', 'כרטיס מכירה'],
]

export const allNavItems = () => NAV_GROUPS.flatMap(g => g.items)

export function titleForPath(pathname) {
  const match = allNavItems()
    .filter(n => n.path === pathname || (n.path !== '/' && pathname.startsWith(n.path)))
    .sort((a, b) => b.path.length - a.path.length)[0]
  if (match) return match.label
  const detail = DETAIL_TITLES.find(([prefix]) => pathname.startsWith(prefix))
  return detail ? detail[1] : 'TRAX CRM'
}
