import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Checkbox } from './ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { confirmDialog, deleteConfirmDialog } from './Dialogs'
import { toast } from './Toaster'
import { formatDateTime } from '../lib/format'

/* Recycle bin — porting bina-crm's TrashManager.jsx pattern to TRAX's own
   entity set. Every table in lib/ra/providers.js's SOFT_DELETE set stamps
   `deleted_at` instead of hard-deleting (customers/sales/journeys/
   registrations/tasks/meetings) — this is where those rows actually live,
   with search, paging and multi-select restore/purge, one table at a time. */
const OBJECTS = [
  { key: 'customers', label: 'לקוחות', select: 'id, first_name, last_name, mobile_phone, deleted_at',
    line: r => [`${r.first_name} ${r.last_name}`, r.mobile_phone].filter(Boolean).join(' · '), search: ['first_name', 'last_name', 'mobile_phone'] },
  { key: 'sales', label: 'מכירות', select: 'id, deal_name, deleted_at',
    line: r => r.deal_name || '(ללא שם)', search: ['deal_name'] },
  { key: 'journeys', label: 'מסעות', select: 'id, name, destination, deleted_at',
    line: r => [r.name, r.destination].filter(Boolean).join(' · '), search: ['name'] },
  { key: 'registrations', label: 'הרשמות', select: 'id, registration_name, deleted_at',
    line: r => r.registration_name || '(ללא שם)', search: ['registration_name'] },
  { key: 'tasks', label: 'משימות', select: 'id, subject, deleted_at',
    line: r => r.subject || '-', search: ['subject'] },
  { key: 'meetings', label: 'פגישות', select: 'id, subject, start_at, deleted_at',
    line: r => r.subject || '-', search: ['subject'] },
]

const PAGE = 50

export default function TrashManager() {
  const [objKey, setObjKey] = useState('customers')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({})
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(new Set())
  const [loading, setLoading] = useState(false)

  const obj = useMemo(() => OBJECTS.find(o => o.key === objKey), [objKey])

  const loadCounts = async () => {
    const entries = await Promise.all(OBJECTS.map(async o => {
      const { count } = await supabase.from(o.key).select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null)
      return [o.key, count || 0]
    }))
    setCounts(Object.fromEntries(entries))
  }

  const load = async (reset = false) => {
    setLoading(true)
    const from = reset ? 0 : page * PAGE
    let query = supabase.from(obj.key).select(obj.select, { count: 'exact' })
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (q.trim() && obj.search.length) query = query.or(obj.search.map(f => `${f}.ilike.%${q.trim()}%`).join(','))
    const { data, count } = await query
    setRows(reset ? (data || []) : [...rows, ...(data || [])])
    setTotal(count || 0)
    setLoading(false)
  }

  useEffect(() => { loadCounts() }, [])
  useEffect(() => { setPage(0); setSel(new Set()); load(true) }, [objKey])
  useEffect(() => { if (page > 0) load(false) }, [page])

  const search = () => { setPage(0); setSel(new Set()); load(true) }

  const allOnPageSelected = rows.length > 0 && rows.every(r => sel.has(r.id))
  const toggleAll = () => setSel(allOnPageSelected ? new Set() : new Set(rows.map(r => r.id)))

  const restore = async (ids) => {
    const { error } = await supabase.from(obj.key).update({ deleted_at: null }).in('id', ids)
    if (error) return toast('השחזור נכשל: ' + error.message, 'err')
    toast(ids.length === 1 ? 'הרשומה שוחזרה' : `${ids.length} רשומות שוחזרו`)
    setSel(new Set()); setPage(0); load(true); loadCounts()
  }

  const purge = async (ids) => {
    if (!await deleteConfirmDialog(`למחוק לצמיתות ${ids.length} רשומות? פעולה זו אינה הפיכה.`, { confirmText: 'מחיקה לצמיתות' })) return
    const { error } = await supabase.from(obj.key).delete().in('id', ids)
    if (error) return toast(`המחיקה נכשלה: ${error.message}`, 'err')
    toast(`${ids.length} רשומות נמחקו לצמיתות`)
    setSel(new Set()); setPage(0); load(true); loadCounts()
  }

  const restoreAllMatching = async () => {
    if (!await confirmDialog(`לשחזר את כל ${total} הרשומות שתואמות לסינון הנוכחי?`, { confirmText: 'שחזור הכל' })) return
    let query = supabase.from(obj.key).select('id').not('deleted_at', 'is', null)
    if (q.trim() && obj.search.length) query = query.or(obj.search.map(f => `${f}.ilike.%${q.trim()}%`).join(','))
    const { data } = await query
    if (data?.length) await restore(data.map(r => r.id))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={objKey} onValueChange={setObjKey}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OBJECTS.map(o => (
              <SelectItem key={o.key} value={o.key}>{o.label}{counts[o.key] ? ` (${counts[o.key]})` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {!!obj.search.length && (
          <div className="flex gap-2">
            <Input className="w-56" placeholder="חיפוש בסל" value={q}
              onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
            <Button variant="outline" size="sm" className="h-9" onClick={search}><Search className="size-4" /> חיפוש</Button>
          </div>
        )}

        <span className="text-muted-foreground text-sm">{total ? `${total} רשומות בסל` : 'הסל ריק'}</span>

        {total > 0 && (
          <Button variant="outline" size="sm" className="h-9 ms-auto" onClick={restoreAllMatching}>
            <RotateCcw className="size-4" /> שחזור כל התוצאות
          </Button>
        )}
      </div>

      {sel.size > 0 && (
        <div className="bg-accent flex items-center gap-2 rounded-md px-3 py-2">
          <span className="text-sm font-medium">{sel.size} נבחרו</span>
          <Button size="sm" className="h-8" onClick={() => restore([...sel])}><RotateCcw className="size-3.5" /> שחזור</Button>
          <Button size="sm" variant="destructive" className="h-8" onClick={() => purge([...sel])}><Trash2 className="size-3.5" /> מחיקה לצמיתות</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSel(new Set())}>ביטול בחירה</Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 px-3 py-2"><Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="בחירת הכל" /></th>
              <th className="px-3 py-2 text-start font-semibold">רשומה</th>
              <th className="w-40 px-3 py-2 text-start font-semibold">נמחק בתאריך</th>
              <th className="w-28 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-accent/50 border-t">
                <td className="px-3 py-2">
                  <Checkbox checked={sel.has(r.id)} onCheckedChange={v => setSel(s => { const n = new Set(s); v ? n.add(r.id) : n.delete(r.id); return n })} />
                </td>
                <td className="px-3 py-2">{obj.line(r)}</td>
                <td className="text-muted-foreground px-3 py-2 text-xs">{formatDateTime(r.deleted_at)}</td>
                <td className="px-3 py-2 text-end">
                  <Button variant="ghost" size="sm" className="h-7" onClick={() => restore([r.id])}>שחזור</Button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={4} className="text-muted-foreground py-8 text-center">אין רשומות מחוקות</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length < total && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => setPage(p => p + 1)}>
          טעינת 50 נוספות ({rows.length} מתוך {total})
        </Button>
      )}
    </div>
  )
}
