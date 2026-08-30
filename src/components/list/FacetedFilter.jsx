import { useListContext } from 'ra-core'
import UserAvatar from '../UserAvatar'
import { Check, PlusCircle } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '../ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Separator } from '../ui/separator'

/* Multi-select filter popover, modelled on satnaing/shadcn-admin (MIT) and
   wired to ra-core's filter state.

   Replaces the row of native <select> boxes each screen used to build by
   hand: this one is searchable, shows the active selection inline, and
   supports selecting several values at once. Multiple values are written to
   the filter as `<field>@in`, which the dataProvider turns into a PostgREST
   `in.(...)`; a single value is written as a plain equality so existing
   preset matching keeps working. */
export default function FacetedFilter({ field, title, options }) {
  const { filterValues, setFilters } = useListContext()

  const selected = new Set(
    filterValues?.[`${field}@in`] ??
    (filterValues?.[field] !== undefined && filterValues?.[field] !== '' ? [filterValues[field]] : [])
  )

  const apply = (next) => {
    const f = { ...filterValues }
    delete f[field]; delete f[`${field}@in`]
    if (next.size === 1) f[field] = [...next][0]
    else if (next.size > 1) f[`${field}@in`] = [...next]
    setFilters(f, null, false)
  }

  const toggle = (value) => {
    const next = new Set(selected)
    next.has(value) ? next.delete(value) : next.add(value)
    apply(next)
  }

  const labelFor = v => options.find(o => String(o.value) === String(v))?.label ?? v

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 border-dashed">
          <PlusCircle className="size-4" />
          {title}
          {selected.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-1.5 h-4" />
              {selected.size > 2
                ? <Badge variant="secondary" className="rounded-sm px-1 font-normal">{selected.size} נבחרו</Badge>
                : [...selected].map(v => (
                    <Badge key={v} variant="secondary" className="rounded-sm px-1 font-normal">{labelFor(v)}</Badge>
                  ))}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>לא נמצאו תוצאות.</CommandEmpty>
            <CommandGroup>
              {options.map(o => {
                const on = selected.has(o.value)
                return (
                  <CommandItem key={o.value} onSelect={() => toggle(o.value)}>
                    <div className={`border-primary flex size-4 items-center justify-center rounded-sm border ${on ? 'bg-primary text-primary-foreground' : 'opacity-50'}`}>
                      {on && <Check className="size-3" />}
                    </div>
                    {/* An option that represents a person carries their avatar,
                        the same one shown in the table and everywhere else. */}
                    {o.user && <UserAvatar user={o.user} size="sm" />}
                    <span className="truncate">{o.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => apply(new Set())} className="justify-center text-center">
                    ניקוי הסינון
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
