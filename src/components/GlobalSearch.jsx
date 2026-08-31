import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import Icon from './Icon'

// Global search — customers, sales, journeys, registrations and meetings,
// all scoped to the active business unit. phone_calls is deliberately left
// out: it has no free-text field worth matching on (direction/result are
// closed enums, transcript search would need a much heavier query) — it's
// reachable from its own list page instead (see PhoneCalls.jsx).
export default function GlobalSearch() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [open, setOpen] = useState(false)
  const box = useRef()

  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return }
    const t = setTimeout(async () => {
      const like = `%${q.trim()}%`
      const [cust, sales, journeys, registrations, meetings] = await Promise.all([
        supabase.from('customers').select('id, first_name, last_name, mobile_phone, email')
          .eq('business_unit', unit).is('deleted_at', null)
          .or(`first_name.ilike.${like},last_name.ilike.${like},mobile_phone.ilike.${like},email.ilike.${like}`).limit(6),
        supabase.from('sales').select('id, deal_name')
          .eq('business_unit', unit).is('deleted_at', null).ilike('deal_name', like).limit(4),
        supabase.from('journeys').select('id, name, destination')
          .eq('business_unit', unit).is('deleted_at', null).ilike('name', like).limit(4),
        // registrations has no business_unit column of its own — it's
        // inherited via journey (same !inner-embed pattern as Registrations.jsx).
        supabase.from('registrations').select('id, registration_name, journey:journeys!inner(business_unit)')
          .eq('journey.business_unit', unit).is('deleted_at', null).ilike('registration_name', like).limit(4),
        supabase.from('meetings').select('id, subject')
          .eq('business_unit', unit).is('deleted_at', null).ilike('subject', like).limit(4),
      ])
      const out = [
        ...(cust.data || []).map(c => ({ id: c.id, type: 'לקוח', label: `${c.first_name} ${c.last_name}`, sub: c.mobile_phone || c.email, to: `/customers/${c.id}` })),
        ...(sales.data || []).map(s => ({ id: s.id, type: 'מכירה', label: s.deal_name || '-', sub: null, to: `/sales/${s.id}` })),
        ...(journeys.data || []).map(j => ({ id: j.id, type: 'מסע', label: j.name, sub: j.destination, to: `/journeys/${j.id}` })),
        ...(registrations.data || []).map(r => ({ id: r.id, type: 'הרשמה', label: r.registration_name || '-', sub: null, to: `/registrations/${r.id}` })),
        ...(meetings.data || []).map(m => ({ id: m.id, type: 'פגישה', label: m.subject, sub: null, to: `/meetings/${m.id}` })),
      ]
      setRes(out); setOpen(true)
    }, 250)
    return () => clearTimeout(t)
  }, [q, unit])

  useEffect(() => {
    const h = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', h); return () => document.removeEventListener('click', h)
  }, [])

  const go = (r) => { nav(r.to); setQ(''); setRes([]); setOpen(false) }

  return (
    <div ref={box} className="w-32 min-w-0 shrink sm:w-52 md:w-64" style={{ position: 'relative' }}>
      <Icon name="search" size={15} style={{ position: 'absolute', insetInlineStart: 10, top: 9, color: 'var(--text-3)' }} />
      <input className="input" style={{ paddingInlineStart: 32, height: 36 }} placeholder="חיפוש גלובלי…" value={q}
        onChange={e => setQ(e.target.value)} onFocus={() => res.length && setOpen(true)} />
      {open && res.length > 0 && (
        <div style={{ position: 'absolute', top: 42, insetInlineStart: 0, insetInlineEnd: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', boxShadow: 'var(--sh2)', zIndex: 50, overflow: 'hidden' }}>
          {res.map(r => (
            <div key={r.type + r.id} className="row" style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-soft)' }}
              onMouseDown={() => go(r)}>
              <span className="badge gray" style={{ fontSize: '0.65rem' }}>{r.type}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                {r.sub && <div className="small muted" dir="ltr" style={{ textAlign: 'start' }}>{r.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
