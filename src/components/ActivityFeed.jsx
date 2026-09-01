import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadOptions } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { TASK_PRIORITIES, TASK_PRIORITY_COLOR, MEETING_TYPES } from '../lib/constants'
import { formatDateTime } from '../lib/format'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { toast } from './Toaster'
import Icon from './Icon'
import { deleteConfirmDialog } from './Dialogs'
import UserAvatar from './UserAvatar'
import UserPicker, { MultiUserPicker } from './UserPicker'
import Attachment from './Attachment'

/* TRAX rewrite of bina-crm's ActivityFeed.jsx.

   bina-crm keyed this on a single `activities` table with
   object_type/record_id (+ replies + file attachments). TRAX's schema
   (data/001_init_schema.sql) instead has two separate tables, both
   polymorphic via related_type/related_id (NOT object_type/record_id):
     notes   — related_type in ('customer','sale','journey','registration')
     tasks   — related_type in ('customer','sale','registration'), with its
               own status/priority/assignee_id/due_at columns
   There is no replies/threading and no file-attachment column on notes in
   this schema (documents is its own table) — this feed only posts notes
   and tasks, no reply threads, no attachments. That's a deliberate scope
   cut for Wave 1, not an oversight. */

// Which field on the *current* record holds its "owner"/assignee — used to
// default a quick-created meeting/task's linked user. Only customers and
// sales have an owner_id column (data/001_init_schema.sql); journeys and
// registrations don't, so those fall back to the logged-in rep.
const OWNER_FIELD = { customer: 'owner_id', sale: 'owner_id' }
function recordOwnerId(objectType, record) {
  const f = OWNER_FIELD[objectType]
  return (f && record?.[f]) || null
}

// Best-effort display name for "the current record's own customer" — used
// to compose the meeting subject. customer pages ARE the customer; sale
// (and registration) pages carry a joined `customer` relation when their
// detail-page query selects it (SaleDetail/RegistrationDetail both do).
function customerNameFor(objectType, record) {
  if (!record) return ''
  const c = objectType === 'customer' ? record : record.customer
  if (!c) return ''
  return `${c.first_name || ''} ${c.last_name || ''}`.trim()
}

// meetings.related_type only allows 'customer'/'sale' (DB CHECK constraint)
// — journeys/registrations can't be linked to a meeting at all, so the
// "פגישה" tab is hidden there regardless of allowTasks.
const MEETING_OBJECT_TYPES = ['customer', 'sale']

// Tomorrow, pushed to the coming Sunday if tomorrow lands on Friday/Saturday
// (Israel's work week — Fri=5, Sat=6 per Date#getDay()).
function nextWorkDate() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const day = d.getDay()
  if (day === 5) d.setDate(d.getDate() + 2)
  else if (day === 6) d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  return d
}
function toDatetimeLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// allowTasks: false hides the "משימה" mode — used for objectType='journey',
// which isn't in tasks.related_type's CHECK constraint (see
// data/001_init_schema.sql), so inserting a task there would just fail.
// record: the full current record row (customer/sale/journey/registration),
// passed by RecordLayout — used to compute meeting/task defaults (owner,
// linked customer name, business_unit).
export default function ActivityFeed({ objectType, recordId, record, allowTasks = true }) {
  const user = useAuthStore(s => s.user)
  const rep = useAuthStore(s => s.rep)
  const unit = useBusinessUnitStore(s => s.unit)
  const [notes, setNotes] = useState([])
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [mode, setMode] = useState('note')
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState('רגילה')
  const [assignee, setAssignee] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef()

  // Meeting-mode fields — meetings have no assignee_id column, only a
  // participants uuid[], so "linked user" here means "seeded into
  // participants", not a dedicated FK (see MultiUserPicker below).
  const [meetStart, setMeetStart] = useState('')
  const [meetDuration, setMeetDuration] = useState('60')
  const [meetType, setMeetType] = useState('זום')
  const [meetParticipants, setMeetParticipants] = useState([])
  const [meetSummary, setMeetSummary] = useState('')

  const allowMeetings = MEETING_OBJECT_TYPES.includes(objectType)
  const businessUnit = record?.business_unit || unit

  // notes.created_by / tasks.assignee_id reference auth.users(id), not
  // app_users — there is no FK PostgREST can embed across (see the same
  // note in lib/ra/providers.js), so author/assignee names are resolved
  // client-side from loadOptions()'s users list below instead of embedded.
  const load = async () => {
    if (!objectType || !recordId) return
    const [{ data: n }, { data: t }, o] = await Promise.all([
      supabase.from('notes').select('*')
        .eq('related_type', objectType).eq('related_id', recordId).order('created_at', { ascending: false }),
      allowTasks
        ? supabase.from('tasks').select('*')
          .eq('related_type', objectType).eq('related_id', recordId).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      loadOptions(),
    ])
    const userList = o.users || []
    const withUser = (row, field, userField) => ({ ...row, [userField]: userList.find(u => u.id === row[field]) })
    setNotes((n || []).map(x => withUser(x, 'created_by', 'created_by_user')))
    setTasks((t || []).map(x => withUser(x, 'assignee_id', 'assignee_user')))
    setUsers(userList)
  }
  useEffect(() => { load() }, [objectType, recordId])

  // Recompute the composer's defaults whenever the mode (or the loaded
  // users list) changes — each mode has its own set of starting values,
  // per the "quick-create meeting/task" spec: real names, real dates,
  // still fully editable before saving.
  const switchMode = (m) => {
    setMode(m)
    const ownerId = recordOwnerId(objectType, record) || user?.id || ''
    if (m === 'task') {
      setText('')
      setAssignee(ownerId)
      setDue(toDatetimeLocal(nextWorkDate()))
      setPriority('רגילה')
    } else if (m === 'meeting') {
      const custName = customerNameFor(objectType, record)
      const ownerName = users.find(u => u.id === ownerId)?.full_name || (ownerId === user?.id ? rep?.full_name : '') || ''
      const who = [custName, ownerName].filter(Boolean)
      setText(who.length ? `פגישה - ${who.join(' ו')}` : 'פגישה')
      setMeetStart('')
      setMeetDuration('60')
      setMeetType('זום')
      setMeetParticipants(ownerId ? [ownerId] : [])
      setMeetSummary('')
    } else {
      setText('')
    }
  }

  const addNote = async () => {
    if (!text.trim() && !file) return
    setBusy(true)
    let file_url = null, file_name = null, file_type = null, file_size = null
    if (file) {
      // Storage keys must be ASCII, so the original (often Hebrew) filename
      // is kept on the row (file_name) instead of being encoded into the
      // path — same approach as bina-crm's ActivityFeed.
      const ext = (file.name.match(/\.[a-z0-9]{1,8}$/i) || [''])[0]
      const path = `${objectType}/${recordId}/${Date.now()}${ext}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
      if (upErr) {
        // Never save the note as if the file had attached — that's how
        // attachments silently disappear.
        setBusy(false)
        toast('העלאת הקובץ נכשלה: ' + (upErr.message || ''), 'err')
        return
      }
      file_url = supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
      file_name = file.name
      file_type = file.type || null
      file_size = file.size ?? null
    }
    const { data, error } = await supabase.from('notes')
      .insert({ related_type: objectType, related_id: recordId, content: text.trim() || null, created_by: user?.id, file_url, file_name, file_type, file_size })
      .select('*').single()
    setBusy(false)
    if (error) { toast('שמירת ההערה נכשלה: ' + error.message, 'err'); return }
    setNotes(x => [{ ...data, created_by_user: users.find(u => u.id === data.created_by) }, ...x])
    setText(''); setFile(null); if (fileRef.current) fileRef.current.value = ''
  }

  const addTask = async () => {
    if (!text.trim()) return
    setBusy(true)
    const { data, error } = await supabase.from('tasks')
      .insert({
        related_type: objectType, related_id: recordId, subject: text.trim(),
        due_at: due ? new Date(due).toISOString() : null, priority,
        assignee_id: assignee || user?.id, business_unit: businessUnit,
      })
      .select('*').single()
    setBusy(false)
    if (error) { toast('יצירת המשימה נכשלה: ' + error.message, 'err'); return }
    setTasks(x => [{ ...data, assignee_user: users.find(u => u.id === data.assignee_id) }, ...x])
    switchMode('task')
    toast('המשימה נוצרה')
  }

  const addMeeting = async () => {
    if (!text.trim() || !meetStart) return
    setBusy(true)
    const { error } = await supabase.from('meetings').insert({
      subject: text.trim(),
      related_type: objectType,
      related_id: recordId,
      start_at: new Date(meetStart).toISOString(),
      duration_minutes: meetDuration === '' ? null : Number(meetDuration),
      type: meetType || null,
      summary: meetSummary.trim() || null,
      business_unit: businessUnit,
      participants: meetParticipants.length ? meetParticipants : null,
    })
    setBusy(false)
    if (error) { toast('יצירת הפגישה נכשלה: ' + error.message, 'err'); return }
    switchMode('meeting')
    toast('הפגישה נוצרה — צפייה במסך הפגישות')
  }

  const toggleTask = async (t) => {
    const status = t.status === 'פתוחה' ? 'בוצעה' : 'פתוחה'
    await supabase.from('tasks').update({ status }).eq('id', t.id)
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, status } : x))
  }
  const delNote = async (n) => {
    if (!await deleteConfirmDialog('למחוק הערה?')) return
    await supabase.from('notes').delete().eq('id', n.id)
    setNotes(x => x.filter(y => y.id !== n.id))
  }

  const openTasks = tasks.filter(t => t.status === 'פתוחה')
  const doneTasks = tasks.filter(t => t.status !== 'פתוחה')

  const submit = mode === 'note' ? addNote : mode === 'task' ? addTask : addMeeting
  const submitDisabled = busy
    || (mode === 'note' && !text.trim() && !file)
    || (mode === 'task' && !text.trim())
    || (mode === 'meeting' && (!text.trim() || !meetStart))

  return (
    <Card className="gap-3" data-tour="rec-feed">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base"><Icon name="book" size={16} /> פעילות</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center gap-2">
          <Button size="sm" variant={mode === 'note' ? 'default' : 'outline'} onClick={() => switchMode('note')}><Icon name="edit" size={13} /> הערה</Button>
          {allowMeetings && <Button size="sm" variant={mode === 'meeting' ? 'default' : 'outline'} onClick={() => switchMode('meeting')}><Icon name="calendar" size={13} /> פגישה</Button>}
          {allowTasks && <Button size="sm" variant={mode === 'task' ? 'default' : 'outline'} onClick={() => switchMode('task')}><Icon name="tag" size={13} /> משימה</Button>}
        </div>

        <div data-tour="rec-composer" className="bg-card focus-within:border-ring mb-4 rounded-lg border p-4 transition-colors space-y-3">
          {mode === 'note'
            ? <Textarea className="min-h-24 resize-y" value={text} onChange={e => setText(e.target.value)} placeholder="הוסיפו הערה…" />
            : <Input value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'task' ? 'נושא המשימה…' : 'נושא הפגישה…'} />}

          {allowTasks && mode === 'task' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <Input className="h-7 w-48 text-xs" type="datetime-local" dir="ltr" value={due} onChange={e => setDue(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-muted-foreground text-xs">עדיפות:</span>
                {TASK_PRIORITIES.map(p => (
                  <Button key={p} size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setPriority(p)}
                    style={priority === p ? { background: TASK_PRIORITY_COLOR[p], color: '#fff', borderColor: TASK_PRIORITY_COLOR[p] } : { color: TASK_PRIORITY_COLOR[p] }}>{p}</Button>
                ))}
                <span className="text-muted-foreground text-xs">אחראי:</span>
                <UserPicker users={users} value={assignee} onChange={v => setAssignee(v || '')} placeholder="בחרו אחראי" allowEmpty={false} className="w-44" />
              </div>
            </div>
          )}

          {allowMeetings && mode === 'meeting' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">תאריך ושעה:</span>
                <Input className="h-7 w-48 text-xs" type="datetime-local" dir="ltr" value={meetStart} onChange={e => setMeetStart(e.target.value)} />
                <span className="text-muted-foreground text-xs">משך (דקות):</span>
                <Input className="h-7 w-20 text-xs" type="number" value={meetDuration} onChange={e => setMeetDuration(e.target.value)} />
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-muted-foreground text-xs">סוג:</span>
                {MEETING_TYPES.map(t => (
                  <Button key={t} size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setMeetType(t)}
                    style={meetType === t ? { background: 'var(--mp)', color: '#fff', borderColor: 'var(--mp)' } : undefined}>{t}</Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-muted-foreground text-xs">משתתפים:</span>
                <MultiUserPicker users={users} value={meetParticipants} onChange={setMeetParticipants} />
              </div>
              <Textarea className="min-h-16 resize-y text-xs" value={meetSummary} onChange={e => setMeetSummary(e.target.value)} placeholder="סיכום (אופציונלי)…" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Button size="sm" onClick={submit} disabled={submitDisabled}>
              {busy ? <span className="spinner light" style={{ width: 14, height: 14 }} /> : 'פרסם'}
            </Button>
            {mode === 'note' && (
              <label className="border-input hover:bg-accent inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors">
                <Icon name="paperclip" size={13} /> {file ? file.name : 'צרף קובץ'}
                <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files[0] || null)} />
              </label>
            )}
          </div>
        </div>

        {openTasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {openTasks.map(t => (
              <div key={t.id} className="bg-muted/40 flex items-center gap-2 rounded-md border-s-4 p-2" style={{ borderInlineStartColor: TASK_PRIORITY_COLOR[t.priority] || 'var(--mp)' }}>
                <input type="checkbox" checked={false} onChange={() => toggleTask(t)} />
                <span style={{ flex: 1, fontSize: '0.86rem', fontWeight: 600 }}>{t.subject}</span>
                {t.priority && <span className="badge" style={{ background: TASK_PRIORITY_COLOR[t.priority], color: '#fff' }}>{t.priority}</span>}
                {t.assignee_user && <UserAvatar user={t.assignee_user} size="xs" />}
                {t.due_at && <span className="muted small">{formatDateTime(t.due_at)}</span>}
              </div>
            ))}
          </div>
        )}

        {notes.length === 0 && doneTasks.length === 0 ? <p className="text-muted-foreground py-6 text-center text-sm">אין פעילות עדיין</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 460, overflowY: 'auto' }}>
            {notes.map(n => (
              <div key={n.id} className="bg-muted/30 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <UserAvatar user={n.created_by_user} name={n.created_by_user ? undefined : 'נציג'} size="sm" />
                  <span className="text-muted-foreground text-xs">{formatDateTime(n.created_at)}</span>
                  {(n.created_by === user?.id) && <Button variant="ghost" size="icon" className="ms-auto size-6 text-[var(--err)]" onClick={() => delNote(n)}><Icon name="x" size={12} /></Button>}
                </div>
                {n.content && <div className="mt-1.5 text-sm whitespace-pre-wrap">{n.content}</div>}
                {n.file_url && <Attachment url={n.file_url} name={n.file_name} size={n.file_size} />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
