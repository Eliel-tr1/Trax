import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import Icon from './Icon'

// Global search across customers and sales, scoped to the active business unit.
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
      const [cust, sales] = await Promise.all([
        supabase.from('customers').select('id, first_name, last_name, mobile_phone, email')
          .eq('business_unit', unit).is('deleted_at', null)
          .or(`first_name.ilike.${like},last_name.ilike.${like},mobile_phone.ilike.${like},email.ilike.${like}`).limit(6),
        supabase.from('sales').select('id, deal_name')
          .eq('business_unit', unit).is('deleted_at', null).ilike('deal_name', like).limit(4),
      ])
      const out = [
        ...(cust.data || []).map(c => ({ id: c.id, type: 'לקוח', label: `${c.first_name} ${c.last_name}`, sub: c.mobile_phone || c.email, to: `/customers/${c.id}` })),
        ...(sales.data || []).map(s => ({ id: s.id, type: 'מכירה', label: s.deal_name || '-', sub: null, to: `/sales/${s.id}` })),
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
