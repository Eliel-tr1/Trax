import { useListContext, useTranslate } from 'ra-core'
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { getPageNumbers } from '../../lib/utils'

/* Paginator modelled on satnaing/shadcn-admin (MIT), wired to ra-core's list
   context instead of TanStack Table.

   RTL note: "previous" must point right and "next" left in Hebrew, so the
   chevrons are swapped relative to the LTR original. */
export default function Pagination() {
  const { page, setPage, perPage, setPerPage, total, isPending } = useListContext()
  const t = useTranslate()
  const pages = Math.max(1, Math.ceil((total || 0) / perPage))

  if (isPending || !total) return null

  const go = (p) => setPage(Math.min(Math.max(1, p), pages))
  const nums = getPageNumbers(page, pages)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-4">
      <div className="flex items-center gap-2">
        <Select value={String(perPage)} onValueChange={v => { setPerPage(Number(v)); setPage(1) }}>
          <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
          <SelectContent side="top">
            {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-sm">שורות בעמוד</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button variant="outline" className="size-8 p-0" disabled={page <= 1}
          onClick={() => go(1)} aria-label={t('ra.navigation.first')}>
          <ChevronsRight className="size-4" />
        </Button>
        <Button variant="outline" className="size-8 p-0" disabled={page <= 1}
          onClick={() => go(page - 1)} aria-label={t('ra.navigation.previous')}>
          <ChevronRight className="size-4" />
        </Button>

        {nums.map((n, i) => n === '...'
          ? <span key={`e${i}`} className="text-muted-foreground px-1 text-sm">…</span>
          : <Button key={n} variant={n === page ? 'default' : 'outline'}
              className="h-8 min-w-8 px-2" onClick={() => go(n)}>{n}</Button>)}

        <Button variant="outline" className="size-8 p-0" disabled={page >= pages}
          onClick={() => go(page + 1)} aria-label={t('ra.navigation.next')}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" className="size-8 p-0" disabled={page >= pages}
          onClick={() => go(pages)} aria-label={t('ra.navigation.last')}>
          <ChevronsLeft className="size-4" />
        </Button>
      </div>

      <div className="text-muted-foreground text-sm">
        {total.toLocaleString('he-IL')} רשומות · עמוד {page} מתוך {pages}
      </div>
    </div>
  )
}
