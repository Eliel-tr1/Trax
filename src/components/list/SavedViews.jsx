import { useEffect, useState } from 'react'
import { useListContext, useStore } from 'ra-core'
import { Bookmark, BookmarkPlus, Check, Save, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { toast } from '../Toaster'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandSeparator } from '../ui/command'

const same = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {})

// See ColumnLayoutSync.jsx: useStore's default value identity must stay
// stable across renders, not a fresh `{}` literal each time.
const EMPTY_COLUMN_WIDTHS = {}

/* Generalizes Customers.jsx's old hardcoded "לידים חדשים" quick-view preset
   into a per-user, per-resource saved_views table (id, user_id, resource,
   name, filters jsonb, columns jsonb) — same idea (a named, reapplyable
   filter combination) but user-created and shared across all 6 list
   screens through ResourceList, instead of one screen's baked-in tab.

   Saves the active filters plus a snapshot of the current column layout
   (order/widths/hidden — the same store keys ColumnLayoutSync mirrors to
   app_users.prefs), so reapplying a view restores what the table looked
   like, not just what it showed. */
export default function SavedViews({ resource, datatableStoreKey }) {
  const { filterValues, setFilters } = useListContext()
  const user = useAuthStore(s => s.user)
  const [views, setViews] = useState([])
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [createNameInput, setCreateNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const hasActiveFilters = filterValues && Object.keys(filterValues).length > 0

  const [columnRanks, setColumnRanks] = useStore(`${datatableStoreKey}_columnRanks`)
  const [columnWidths, setColumnWidths] = useStore(`${datatableStoreKey}_columnWidths`, EMPTY_COLUMN_WIDTHS)
  const [hiddenColumns, setHiddenColumns] = useStore(datatableStoreKey)

  const load = async () => {
    if (!user) return
    // Shared "תצוגות ייעודיות" presets (is_preset:true, user_id:null,
    // seeded in data/011_status_tab_and_shared_views.sql) show for every
    // user alongside their own saved views — the RLS select policy already
    // allows both (`user_id = auth.uid() or is_preset`), this just widens
    // the query from "my rows only" to match it.
    const { data, error } = await supabase.from('saved_views').select('*')
      .or(`user_id.eq.${user.id},is_preset.eq.true`).eq('resource', resource).order('created_at')
    if (!error) setViews(data || [])
  }
  useEffect(() => { load() }, [user?.id, resource])

  const activeViewId = views.find(v => same(v.filters, filterValues))?.id
  const presetViews = views.filter(v => v.is_preset)
  const myViews = views.filter(v => !v.is_preset)

  const saveView = async (rawName) => {
    const name = (rawName ?? nameInput).trim()
    if (!name || !user) return
    setSaving(true)
    const columns = {
      columnRanks: columnRanks || null,
      columnWidths: columnWidths || null,
      hiddenColumns: hiddenColumns || null,
    }
    const { error } = await supabase.from('saved_views').insert({
      user_id: user.id, resource, name, filters: filterValues || {}, columns,
    })
    setSaving(false)
    if (error) { toast('שמירת התצוגה נכשלה', 'err'); return null }
    setNameInput('')
    setCreateNameInput('')
    toast('התצוגה נשמרה')
    load()
    return true
  }

  const applyView = (view) => {
    setFilters(view.filters || {}, null, false)
    const cols = view.columns || {}
    if (cols.columnRanks) setColumnRanks(cols.columnRanks)
    if (cols.columnWidths) setColumnWidths(cols.columnWidths)
    if (cols.hiddenColumns) setHiddenColumns(cols.hiddenColumns)
    setOpen(false)
  }

  const deleteView = async (e, id) => {
    e.stopPropagation()
    const { error } = await supabase.from('saved_views').delete().eq('id', id)
    if (error) { toast('מחיקת התצוגה נכשלה', 'err'); return }
    setViews(v => v.filter(x => x.id !== id))
    toast('התצוגה נמחקה')
  }

  return (
    <div className="flex items-center gap-1.5">
      {hasActiveFilters && (
        <Popover open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateNameInput('') }}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <BookmarkPlus className="size-4" /> הפוך לתצוגה שמורה
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">שם לתצוגה החדשה</div>
              <div className="flex items-center gap-1.5">
                <Input value={createNameInput} onChange={e => setCreateNameInput(e.target.value)}
                  placeholder="לדוגמה: לידים חמים החודש" autoFocus
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && createNameInput.trim()) {
                      if (await saveView(createNameInput)) setCreateOpen(false)
                    }
                  }}
                  className="h-8" />
                <Button size="sm" className="h-8 shrink-0" disabled={!createNameInput.trim() || saving}
                  onClick={async () => { if (await saveView(createNameInput)) setCreateOpen(false) }}>
                  <Save className="size-3.5" /> שמירה
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Bookmark className="size-4" /> תצוגות שמורות
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>אין עדיין תצוגות שמורות</CommandEmpty>
            {presetViews.length > 0 && (
              <CommandGroup heading="תצוגות ייעודיות">
                {presetViews.map(v => (
                  <CommandItem key={v.id} onSelect={() => applyView(v)} className="justify-between">
                    <span className="flex items-center gap-2 truncate">
                      {v.id === activeViewId && <Check className="size-3.5 shrink-0" />}
                      <span className="truncate">{v.name}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {myViews.length > 0 && (
              <CommandGroup heading="התצוגות שלי">
                {myViews.map(v => (
                  <CommandItem key={v.id} onSelect={() => applyView(v)} className="justify-between">
                    <span className="flex items-center gap-2 truncate">
                      {v.id === activeViewId && <Check className="size-3.5 shrink-0" />}
                      <span className="truncate">{v.name}</span>
                    </span>
                    <button type="button" aria-label="מחיקת התצוגה" onClick={e => deleteView(e, v.id)}
                      className="text-muted-foreground hover:text-destructive shrink-0 rounded p-1">
                      <Trash2 className="size-3.5" />
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <div className="flex items-center gap-1.5 p-2">
              <Input value={nameInput} onChange={e => setNameInput(e.target.value)}
                placeholder="שם לתצוגה החדשה"
                onKeyDown={e => { if (e.key === 'Enter' && nameInput.trim()) saveView() }}
                className="h-8" />
              <Button size="sm" className="h-8 shrink-0" disabled={!nameInput.trim() || saving} onClick={() => saveView()}>
                <Save className="size-3.5" /> שמירה
              </Button>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    </div>
  )
}
