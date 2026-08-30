import { useListContext } from 'ra-core'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Checkbox } from '../ui/checkbox'

/* A ten-column table on a 390px screen is two visible columns and eight you
   have to discover by dragging sideways. Below `sm` the same records are shown
   as cards instead: the first column becomes the title and the next few become
   labelled lines, so everything that matters is readable without scrolling in
   two directions at once. */
export default function MobileCards({ columns, rowPath, maxFields = 4 }) {
  const { data, selectedIds, onToggleItem } = useListContext()
  const nav = useNavigate()
  if (!data?.length) return null

  const shown = columns.filter(c => !c.hidden && c.csv !== false)
  const [title, ...rest] = shown
  const fields = rest.slice(0, maxFields)

  const cellOf = (col, row) => {
    if (col.render) return col.render(row)
    const v = row[col.source]
    return v ?? '-'
  }

  return (
    <div className="space-y-2 sm:hidden">
      {data.map(row => (
        <div key={row.id}
          role={rowPath ? 'button' : undefined}
          onClick={rowPath ? () => nav(rowPath(row)) : undefined}
          className="bg-card hover:bg-accent/40 rounded-lg border p-3 transition-colors">
          <div className="flex items-start gap-2">
            {onToggleItem && (
              <span onClick={e => e.stopPropagation()}>
                <Checkbox aria-label="בחירת השורה" className="mt-0.5"
                  checked={selectedIds?.includes(row.id)}
                  onCheckedChange={() => onToggleItem(row.id)} />
              </span>
            )}
            <div className="min-w-0 flex-1 font-semibold">{title ? cellOf(title, row) : row.id}</div>
            {rowPath && <ChevronLeft className="text-muted-foreground mt-0.5 size-4 shrink-0" />}
          </div>

          <dl className="mt-2 space-y-1">
            {fields.map(col => {
              /* Emptiness has to be judged on the raw value: a column with a
                 `render` returns a React element, which is never equal to '-'
                 no matter how empty it looks. */
              const raw = col.source ? row[col.source] : undefined
              if (col.source && (raw == null || raw === '')) return null
              const val = cellOf(col, row)
              return (
                <div key={col.source || col.label} className="flex items-baseline gap-2 text-sm">
                  <dt className="text-muted-foreground w-24 shrink-0">{col.label}</dt>
                  <dd className="min-w-0 flex-1 truncate">{val}</dd>
                </div>
              )
            })}
          </dl>
        </div>
      ))}
    </div>
  )
}
