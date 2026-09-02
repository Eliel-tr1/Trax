import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import UserAvatar from './UserAvatar'
import { Input } from './ui/input'

/* Ported from bina-crm — single-user popup picker (face + name, not a bare
   <select> which can't show an avatar). MultiUserPicker below is a thin
   TRAX-specific wrapper for meetings.participants (uuid[]), which had no
   add/remove UI at all (see docs/bina-crm-feature-audit.md item 10). */
export default function UserPicker({
  users = [], value, onChange, placeholder = 'בחרו נציג', allowEmpty = true,
  emptyLabel = 'ללא', autoOpen = false, onClose, className = '',
  avatarsOnly = false,
}) {
  const [open, setOpen] = useState(autoOpen)
  const [q, setQ] = useState('')
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    const away = e => { if (box.current && !box.current.contains(e.target)) { setOpen(false); onClose?.() } }
    const esc = e => { if (e.key === 'Escape') { setOpen(false); onClose?.() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open, onClose])

  const selected = users.find(u => u.id === value)
  const list = q.trim()
    ? users.filter(u => (u.full_name || '').toLowerCase().includes(q.trim().toLowerCase()))
    : users

  const pick = (id) => { onChange(id); setOpen(false); setQ(''); onClose?.() }

  // avatarsOnly mode (Sahar, list cells): trigger + dropdown show ONLY the
  // face — full name lives in the trigger's tooltip and each row's tooltip.
  // Keeps the wide-name trigger from blowing up narrow table columns.
  if (avatarsOnly) {
    return (
      <div ref={box} className={`relative ${className}`} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => setOpen(o => !o)}
          className="hover:bg-accent grid size-8 place-items-center rounded-md transition-colors">
          {selected
            ? <UserAvatar user={selected} />
            : <span className="text-muted-foreground grid size-6 place-items-center rounded-full border border-dashed" title={placeholder}>+</span>}
        </button>
        {open && (
          <div dir="rtl" className="bg-popover absolute z-50 mt-1 max-h-72 w-52 overflow-hidden rounded-md border shadow-lg">
            <div className="relative border-b p-1.5">
              <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2" />
              <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש נציג"
                className="h-8 ps-7 text-sm" />
            </div>
            <div className="grid max-h-56 grid-cols-5 gap-1 overflow-y-auto p-2">
              {allowEmpty && (
                <button type="button" title={emptyLabel} onClick={() => pick(null)}
                  className="text-muted-foreground hover:bg-accent grid aspect-square place-items-center rounded-md border border-dashed">
                  <X className="size-4" />
                </button>
              )}
              {list.map(u => (
                <button key={u.id} type="button" title={u.full_name} onClick={() => pick(u.id)}
                  className={`grid aspect-square place-items-center rounded-md p-1 transition-colors ${u.id === value ? 'bg-accent ring-2 ring-[var(--mp)]' : 'hover:bg-accent'}`}>
                  <UserAvatar user={u} />
                </button>
              ))}
              {!list.length && <p className="text-muted-foreground col-span-5 py-4 text-center text-xs">לא נמצאו נציגים</p>}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={box} className={`relative ${className}`} onClick={e => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="border-input bg-background hover:bg-accent flex h-8 w-full min-w-36 items-center gap-2 rounded-md border px-2 text-sm transition-colors">
        {selected
          ? <><UserAvatar user={selected} size="sm" /><span className="min-w-0 flex-1 truncate text-start">{selected.full_name}</span></>
          : <span className="text-muted-foreground flex-1 text-start">{placeholder}</span>}
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
      </button>

      {open && (
        <div dir="rtl" className="bg-popover absolute z-50 mt-1 max-h-72 w-60 overflow-hidden rounded-md border shadow-lg">
          <div className="relative border-b p-1.5">
            <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2" />
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש נציג"
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
            {list.map(u => (
              <button key={u.id} type="button" onClick={() => pick(u.id)}
                className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
                <UserAvatar user={u} size="sm" />
                <span className="min-w-0 flex-1 truncate text-start">{u.full_name}</span>
                {u.id === value && <Check className="size-3.5 shrink-0" />}
              </button>
            ))}
            {!list.length && <p className="text-muted-foreground py-4 text-center text-xs">לא נמצאו נציגים</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// Multi-select add/remove UI for a uuid[] column (meetings.participants):
// chips for the currently-picked users (each removable) + a UserPicker to
// add one more. TRAX has no reusable multi-picker in the ported set, so
// this is new but built entirely from the ported single UserPicker + avatar.
export function MultiUserPicker({ users = [], value = [], onChange, className = '' }) {
  const [adding, setAdding] = useState(false)
  const picked = (value || []).map(id => users.find(u => u.id === id)).filter(Boolean)
  const remaining = users.filter(u => !(value || []).includes(u.id))

  const add = (id) => { if (id && !(value || []).includes(id)) onChange([...(value || []), id]) }
  const remove = (id) => onChange((value || []).filter(x => x !== id))

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {picked.map(u => (
        <span key={u.id} className="bg-muted inline-flex items-center gap-1.5 rounded-full py-0.5 ps-1 pe-2 text-xs">
          <UserAvatar user={u} size="xs" /> {u.full_name}
          <button type="button" onClick={() => remove(u.id)} className="text-muted-foreground hover:text-foreground ms-0.5" title="הסר">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {adding
        ? <UserPicker users={remaining} value="" onChange={add} autoOpen onClose={() => setAdding(false)} placeholder="הוספת משתתף" />
        : <button type="button" className="btn subtle sm" style={{ padding: '3px 10px', fontSize: '0.78rem' }} onClick={() => setAdding(true)}>+ הוספת משתתף</button>}
    </div>
  )
}
