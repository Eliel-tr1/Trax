import { FileQuestion, SearchX } from 'lucide-react'
import { Button } from './ui/button'

/* An empty list is a fork in the road, not a full stop. Ported verbatim
   from bina-crm — purely generic, content-free. */
export default function EmptyState({ query, onClear, onCreate, createLabel, label = 'רשומות' }) {
  const filtered = !!query
  const Icon = filtered ? SearchX : FileQuestion

  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="bg-muted text-muted-foreground mb-3 grid size-12 place-items-center rounded-full">
        <Icon className="size-6" />
      </div>
      <p className="text-base font-semibold">
        {filtered ? 'לא נמצאו תוצאות' : `אין עדיין ${label}`}
      </p>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        {filtered
          ? <>לא נמצאו {label} התואמים ל<bdi className="text-foreground font-medium break-all">"{query}"</bdi>. נסו ניסוח אחר, או נקו את החיפוש והסינון.</>
          : `כשייווצרו ${label} הם יופיעו כאן.`}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {filtered && onClear && (
          <Button size="sm" onClick={onClear}>ניקוי החיפוש והסינון</Button>
        )}
        {onCreate && (
          <Button size="sm" variant={filtered ? 'outline' : 'default'} onClick={onCreate}>
            {createLabel || 'יצירת רשומה'}
          </Button>
        )}
      </div>
    </div>
  )
}
