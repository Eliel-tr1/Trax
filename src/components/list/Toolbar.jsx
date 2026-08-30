import { useEffect, useState } from 'react'
import { useListContext } from 'ra-core'
import { ListFilter, Search, X } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet'
import { Input } from '../ui/input'
import { ColumnsButton } from '../admin/columns-button'
import FacetedFilter from './FacetedFilter'

/* List toolbar modelled on satnaing/shadcn-admin (MIT): a search box, quick
   preset tabs, faceted filters, a reset affordance, and the column selector,
   all in one row that wraps on narrow screens.

   Everything here reads and writes ra-core's filter state, so a preset, a
   facet and the search box can never disagree about what the list shows. */
export default function Toolbar({ presets, facets, search, actions, extra }) {
  const { filterValues, setFilters } = useListContext()
  const [q, setQ] = useState(filterValues?.q || '')
  const [sheet, setSheet] = useState(false)

  // Debounce the free-text box so typing does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filterValues?.q || '') === q) return
      const next = { ...filterValues }
      if (q) next.q = q; else delete next.q
      setFilters(next, null, false)
    }, 350)
    return () => clearTimeout(t)
  }, [q])

  // Keep the input in step when a preset or reset clears the search.
  useEffect(() => { setQ(filterValues?.q || '') }, [filterValues?.q])

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const withoutQ = Object.fromEntries(Object.entries(filterValues || {}).filter(([k]) => k !== 'q'))
  const activePreset = presets?.find(p =>
    p.filter === undefined ? Object.keys(withoutQ).length === 0 : same({ ...p.filter }, withoutQ))
  const filtered = Object.keys(withoutQ).length > 0

  const setPreset = (p) => {
    const next = { ...(p.filter || {}) }
    if (filterValues?.q) next.q = filterValues.q
    setFilters(next, null, false)
  }

  return (
    <div data-tour="toolbar" className="mb-4 flex w-full min-w-0 flex-wrap items-center gap-2">
      {search !== false && (
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input className="h-9 w-56 ps-8 pe-8" placeholder={search || 'חיפוש'}
            value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setQ('') }} />
          {/* Clearing a search meant select-all-and-delete before this existed,
              which is also why an empty result set felt like a dead end. */}
          {q && (
            <button type="button" aria-label="ניקוי החיפוש" onClick={() => setQ('')}
              className="text-muted-foreground hover:text-foreground absolute end-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* On a phone the presets and facets alone ran to five rows - a quarter
          of the screen spent on chrome before a single record. They collapse
          behind one button there and stay laid out flat from `sm` up. */}
      <Button variant="outline" size="sm" className="h-9 sm:hidden"
        onClick={() => setSheet(true)}>
        <ListFilter className="size-4" /> סינון
        {filtered && <Badge variant="secondary" className="rounded-sm px-1 font-normal">{Object.keys(withoutQ).length}</Badge>}
      </Button>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {presets?.map(p => (
          <Button key={p.key} size="sm" variant={activePreset?.key === p.key ? 'default' : 'outline'}
            className="h-9" onClick={() => setPreset(p)}>
            {p.label}
          </Button>
        ))}
        {facets?.map(f => <FacetedFilter key={f.field} {...f} />)}
        {filtered && (
          <Button variant="ghost" size="sm" className="h-9 px-2"
            onClick={() => setFilters(filterValues?.q ? { q: filterValues.q } : {}, null, false)}>
            איפוס <X className="size-4" />
          </Button>
        )}
      </div>

      {extra}
      <div className="grow" />
      <ColumnsButton />
      {actions}

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[80svh] overflow-y-auto" dir="rtl">
          <SheetHeader className="text-start">
            <SheetTitle>סינון</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-6">
            <div>
              <p className="mb-2 text-sm font-medium">תצוגה מהירה</p>
              <div className="flex flex-wrap gap-2">
                {presets?.map(p => (
                  <Button key={p.key} size="sm" variant={activePreset?.key === p.key ? 'default' : 'outline'}
                    onClick={() => setPreset(p)}>{p.label}</Button>
                ))}
              </div>
            </div>
            {!!facets?.length && (
              <div>
                <p className="mb-2 text-sm font-medium">סינון מתקדם</p>
                <div className="flex flex-wrap gap-2">
                  {facets.map(f => <FacetedFilter key={f.field} {...f} />)}
                </div>
              </div>
            )}
            {filtered && (
              <Button variant="outline" size="sm" className="w-full"
                onClick={() => setFilters(filterValues?.q ? { q: filterValues.q } : {}, null, false)}>
                איפוס הסינון
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
