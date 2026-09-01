import { useEffect, useState } from 'react'
import { loadOptions } from '../lib/api'

const PATH = { customer: id => `/customers/${id}`, sale: id => `/sales/${id}`, registration: id => `/registrations/${id}` }
const LABEL = { customer: 'לקוח', sale: 'מכירה', registration: 'הרשמה' }

// Resolves meetings/phone_calls/tasks' polymorphic related_type + related_id
// into a clickable "משויך ל" link, using loadOptions()'s cached
// customers/sales/registrations lists (no per-row query — see lib/api.js).
// Renders '-' if the related record can't be resolved (e.g. it was deleted).
export default function RelatedLink({ relatedType, relatedId, showType = true }) {
  const [opts, setOpts] = useState(null)
  useEffect(() => { loadOptions().then(setOpts) }, [])

  if (!relatedType || !relatedId) return <span className="muted">-</span>
  if (!opts) return <span className="muted">…</span>

  const name = relatedType === 'customer'
    ? opts.customers.find(c => c.id === relatedId)?.name
    : relatedType === 'sale'
      ? opts.sales.find(s => s.id === relatedId)?.deal_name
      : relatedType === 'registration'
        ? opts.registrations?.find(r => r.id === relatedId)?.registration_name
        : null

  const path = PATH[relatedType]?.(relatedId)
  if (!name || !path) return <span className="muted">רשומה לא נמצאה</span>

  return (
    <a href={`#${path}`} onClick={e => e.stopPropagation()} style={{ color: 'var(--mp)', fontWeight: 600 }}>
      {showType && <span className="muted" style={{ fontWeight: 400, marginInlineEnd: 4 }}>{LABEL[relatedType]}:</span>}
      {name}
    </a>
  )
}
