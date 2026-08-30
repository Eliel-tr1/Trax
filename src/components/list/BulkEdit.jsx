import { useState } from 'react'
import { useListContext, useUpdateMany, useUnselectAll, useRefresh } from 'ra-core'
import { Check, Pencil } from 'lucide-react'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { toast } from '../Toaster'

/* Bulk field edit for a list selection.

   Previously the only bulk action was delete, so changing the status (or
   product, or owner) of twenty rows meant editing them one at a time. This
   applies one field to every selected record in a single updateMany.

   `fields` is [{ field, label, options: [{value,label}] }]. */
export default function BulkEdit({ fields = [] }) {
  /* resource comes from the list context, not useResourceContext(): inside the
     bulk-actions toolbar the resource context is not always populated, and an
     undefined resource made unselectAll a no-op, so the rows stayed selected
     after a successful update. */
  const { selectedIds, resource, onUnselectItems } = useListContext()
  const unselect = useUnselectAll(resource)
  const refresh = useRefresh()
  const [updateMany, { isPending }] = useUpdateMany()
  const [open, setOpen] = useState(false)
  const [field, setField] = useState(fields[0]?.field ?? '')
  const [value, setValue] = useState('')

  if (!fields.length) return null
  const current = fields.find(f => f.field === field) || fields[0]

  const apply = () => {
    if (!field || value === '') return
    updateMany(
      resource,
      { ids: selectedIds, data: { [field]: value } },
      {
        onSuccess: () => {
          const n = selectedIds.length
          setOpen(false); setValue('')
          onUnselectItems?.()
          unselect()
          refresh()
          toast(`${n} רשומות עודכנו`)
        },
        onError: (e) => toast(`העדכון נכשל: ${e?.message || ''}`, 'err'),
      },
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Pencil className="size-4" /> עריכה מרובה
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <p className="text-muted-foreground text-xs">
          העדכון יחול על {selectedIds.length} הרשומות שנבחרו.
        </p>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">שדה</label>
          <Select value={field} onValueChange={v => { setField(v); setValue('') }}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fields.map(f => <SelectItem key={f.field} value={f.field}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">ערך חדש</label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder="בחרו ערך" /></SelectTrigger>
            <SelectContent>
              {(current?.options || []).map(o => (
                <SelectItem key={String(o.value)} value={String(o.value)}>
                  <span className="flex items-center gap-2">
                    {o.user && <UserAvatar user={o.user} size="sm" />}{o.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button className="w-full" size="sm" disabled={!value || isPending} onClick={apply}>
          <Check className="size-4" /> החל על {selectedIds.length} רשומות
        </Button>
      </PopoverContent>
    </Popover>
  )
}
