import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Input } from './ui/input'
import { loadOptions } from '../lib/api'

// Generic typeahead picker for an entity reference (customer/journey/sale/
// etc.), modeled directly on UserPicker.jsx's popup+search pattern (same
// styling/behavior), but pulls its candidate list from loadOptions()'s
// cache by resource key instead of always users — so callers get one
// reusable searchable dropdown instead of N one-off <select> lists.
// resource: 'customers' | 'journeys' | 'sales' | 'users' (a loadOptions()
//   key) — auto-loads and re-uses the shared cache. Omit and pass `items`
//   directly when the candidate list is already filtered/local (e.g.
//   MeetingFormModal's related-type-dependent list).
// labelField: (item) => string. Defaults per known resource.
const DEFAULT_LABEL = {
  customers: c => c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
  journeys: j => j.name,
  sales: s => s.deal_name || 'עסקה',
  users: u => u.full_name,
}

export default function EntityPicker({
  resource, items, value, onChange, labelField, filter,
  placeholder = 'בחירה…', searchPlaceholder = 'חיפוש…',
  allowEmpty = true, emptyLabel = 'ללא', autoOpen = false, onClose,
  className = '', disabled = false,
}) {
  const [open, setOpen] = useState(autoOpen)
  const [q, setQ] = useState('')
  const [list, setList] = useState(items || [])
  const box = useRef(null)

  useEffect(() => {
    if (items) { setList(items); return }
    if (!resource) return
    let live = true
    loadOptions().then(o => { if (live) setList(o[resource] || []) })
    return () => { live = false }
  }, [resource, items])

  useEffect(() => {
    if (!open) return
    const away = e => { if (box.current && !box.current.contains(e.target)) { setOpen(false); onClose?.() } }
    const esc = e => { if (e.key === 'Escape') { setOpen(false); onClose?.() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open, onClose])

  const labelFn = labelField || DEFAULT_LABEL[resource] || (x => x.name || x.label || String(x.id))
  const base = filter ? list.filter(filter) : list
  const selected = base.find(x => x.id === value) || list.find(x => x.id === value)
  const qq = q.trim().toLowerCase()
  const shown = qq ? base.filter(x => (labelFn(x) || '').toLowerCase().includes(qq)) : base

  const pick = (id) => { onChange(id); setOpen(false); setQ(''); onClose?.() }

  return (
    <div ref={box} className={`relative ${className}`} onClick={e => e.stopPropagation()}>
      <button type="button" disabled={disabled} onClick={() => !disabled && setOpen(o => !o)}
        className="border-input bg-background hover:bg-accent flex h-8 w-full min-w-36 items-center gap-2 rounded-md border px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60">
        {selected
          ? <span className="min-w-0 flex-1 truncate text-start">{labelFn(selected)}</span>
          : <span className="text-muted-foreground flex-1 text-start">{placeholder}</span>}
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
      </button>

      {open && (
        <div dir="rtl" className="bg-popover absolute z-50 mt-1 max-h-72 w-64 overflow-hidden rounded-md border shadow-lg">
          <div className="relative border-b p-1.5">
            <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2" />
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={searchPlaceholder}
              className="h-8 ps-7 text-sm" />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {allowEmpty && (
              <button type="button" onClick={() => pick(null)}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                <span className="text-muted-foreground grid size-6 place-items-center"><X className="size-3.5" /></span>
                <span className="flex-1 text-start">{emptyLabel}</span>
                {!value && <Check className="size-3.5" />}
              </button>
            )}
            {shown.map(x => (
              <button key={x.id} type="button" onClick={() => pick(x.id)}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-start">{labelFn(x)}</span>
                {x.id === value && <Check className="size-3.5 shrink-0" />}
              </button>
            ))}
            {!shown.length && <p className="text-muted-foreground py-4 text-center text-xs">לא נמצאו תוצאות</p>}
          </div>
        </div>
      )}
    </div>
  )
}
