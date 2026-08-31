import { useEffect, useState } from 'react'
import { useListContext } from 'ra-core'
import { SlidersHorizontal, X } from 'lucide-react'
import { loadOptions } from '../../lib/api'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import FacetedFilter from './FacetedFilter'

/* Advanced filters panel: every filterable field of a resource (see
   lib/schemaFilters.js), grouped and tucked behind one "סננים" button so
   the toolbar itself never grows past a single row. Complements, rather
   than replaces, the curated `facets` a screen already shows inline —
   those stay for the 2-3 filters worth one click; everything else lives
   here, one click further in. */
export default function FiltersPanel({ groups }) {
  const { filterValues, setFilters } = useListContext()
  const [open, setOpen] = useState(false)
  if (!groups?.length) return null

  const keysOf = (it) => {
    if (it.kind === 'range') return [`${it.field}@gte`, `${it.field}@lte`]
    if (it.kind === 'numrange') return [`${it.field}@gte`, `${it.field}@lte`]
    if (it.kind === 'text') return [`${it.field}@ilike`]
    return [it.field, `${it.field}@in`]
  }
  const advancedKeys = new Set(groups.flatMap((gr) => gr.items.flatMap(keysOf)))
  const activeCount = Object.keys(filterValues || {}).filter((k) => advancedKeys.has(k)).length

  const resetAdvanced = () => {
    const next = { ...filterValues }
    for (const k of Object.keys(next)) if (advancedKeys.has(k)) delete next[k]
    setFilters(next, null, false)
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-9" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="size-4" /> סננים
        {activeCount > 0 && <Badge variant="secondary" className="rounded-sm px-1 font-normal">{activeCount}</Badge>}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-md" dir="rtl">
          <SheetHeader className="text-start">
            <SheetTitle>כל השדות לסינון</SheetTitle>
          </SheetHeader>
          <div className="space-y-5 px-4 pb-6">
            {groups.map((gr) => (
              <div key={gr.key}>
                <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{gr.title}</p>
                <div className="flex flex-wrap items-start gap-3">
                  {gr.items.map((it) => <FilterControl key={it.field} item={it} />)}
                </div>
              </div>
            ))}
            {activeCount > 0 && (
              <Button variant="outline" size="sm" className="w-full" onClick={resetAdvanced}>
                <X className="size-4" /> איפוס הסינון המתקדם
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function FilterControl({ item }) {
  switch (item.kind) {
    case 'select': return <FacetedFilter field={item.field} title={item.title} options={item.options} />
    case 'user': return <UserFilter field={item.field} title={item.title} />
    case 'range': return <RangeFilter field={item.field} title={item.title} mode={item.mode} />
    case 'numrange': return <RangeFilter field={item.field} title={item.title} mode="number" />
    case 'bool': return <BoolFilter field={item.field} title={item.title} />
    case 'text': return <TextFilter field={item.field} title={item.title} />
    default: return null
  }
}

// Same multi-select popover as a curated facet, just fed the full user list
// so any assignee/owner field is filterable, not only the ones a screen
// happened to declare a facet for.
function UserFilter({ field, title }) {
  const [users, setUsers] = useState([])
  useEffect(() => { loadOptions().then((o) => setUsers(o.users || [])) }, [])
  const options = users.map((u) => ({ value: u.id, label: u.full_name, user: u }))
  return <FacetedFilter field={field} title={title} options={options} />
}

function TextFilter({ field, title }) {
  const { filterValues, setFilters } = useListContext()
  const key = `${field}@ilike`
  const [v, setV] = useState(filterValues?.[key] || '')

  useEffect(() => {
    const t = setTimeout(() => {
      if ((filterValues?.[key] || '') === v) return
      const next = { ...filterValues }
      if (v) next[key] = v; else delete next[key]
      setFilters(next, null, false)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 350)
    return () => clearTimeout(t)
  }, [v])
  useEffect(() => { setV(filterValues?.[key] || '') }, [filterValues?.[key]])

  return (
    <div className="w-40 space-y-1">
      <p className="text-xs font-medium">{title}</p>
      <Input value={v} onChange={(e) => setV(e.target.value)} className="h-8 text-sm" placeholder={title} />
    </div>
  )
}

// Date/datetime/number range: two bounded inputs writing `${field}@gte`
// and `${field}@lte`. Datetime fields still take a plain date picker — the
// bound is widened to the start/end of that day so "מ-1.1 עד 31.1" behaves
// the way a person expects, not truncated to midnight.
function RangeFilter({ field, title, mode }) {
  const { filterValues, setFilters } = useListContext()
  const gteKey = `${field}@gte`
  const lteKey = `${field}@lte`
  const from = filterValues?.[gteKey] || ''
  const to = filterValues?.[lteKey] || ''
  const inputType = mode === 'number' ? 'number' : 'date'

  const commit = (key, raw) => {
    const next = { ...filterValues }
    if (!raw) { delete next[key]; setFilters(next, null, false); return }
    let value = raw
    if (mode === 'datetime') value = key === gteKey ? `${raw}T00:00:00` : `${raw}T23:59:59`
    next[key] = value
    setFilters(next, null, false)
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{title}</p>
      <div className="flex items-center gap-1.5">
        <Input type={inputType} value={mode === 'datetime' ? from.slice(0, 10) : from}
          onChange={(e) => commit(gteKey, e.target.value)} className="h-8 w-28 text-sm" placeholder="מ-" />
        <span className="text-muted-foreground text-xs">עד</span>
        <Input type={inputType} value={mode === 'datetime' ? to.slice(0, 10) : to}
          onChange={(e) => commit(lteKey, e.target.value)} className="h-8 w-28 text-sm" placeholder="עד" />
      </div>
    </div>
  )
}

function BoolFilter({ field, title }) {
  const { filterValues, setFilters } = useListContext()
  const value = filterValues?.[field]
  const set = (v) => {
    const next = { ...filterValues }
    if (v === undefined) delete next[field]; else next[field] = v
    setFilters(next, null, false)
  }
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium">{title}</p>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant={value === undefined ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => set(undefined)}>הכול</Button>
        <Button type="button" size="sm" variant={value === true ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => set(true)}>כן</Button>
        <Button type="button" size="sm" variant={value === false ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => set(false)}>לא</Button>
      </div>
    </div>
  )
}
