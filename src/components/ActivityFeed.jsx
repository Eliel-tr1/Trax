import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadOptions } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { TASK_PRIORITIES, TASK_PRIORITY_COLOR } from '../lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { toast } from './Toaster'
import Icon from './Icon'
import { confirmDialog } from './Dialogs'
import UserAvatar from './UserAvatar'

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
export default function ActivityFeed({ objectType, recordId }) {
  const user = useAuthStore(s => s.user)
  const rep = useAuthStore(s => s.rep)
  const [notes, setNotes] = useState([])
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [mode, setMode] = useState('note')
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState('רגילה')
  const [assignee, setAssignee] = useState('')
  const [busy, setBusy] = useState(false)

  // notes.created_by / tasks.assignee_id reference auth.users(id), not
  // app_users — there is no FK PostgREST can embed across (see the same
  // note in lib/ra/providers.js), so author/assignee names are resolved
  // client-side from loadOptions()'s users list below instead of embedded.
  const load = async () => {
    if (!objectType || !recordId) return
    const [{ data: n }, { data: t }, o] = await Promise.all([
      supabase.from('notes').select('*')
        .eq('related_type', objectType).eq('related_id', recordId).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*')
        .eq('related_type', objectType).eq('related_id', recordId).order('created_at', { ascending: false }),
      loadOptions(),
    ])
    const userList = o.users || []
    const withUser = (row, field, userField) => ({ ...row, [userField]: userList.find(u => u.id === row[field]) })
    setNotes((n || []).map(x => withUser(x, 'created_by', 'created_by_user')))
    setTasks((t || []).map(x => withUser(x, 'assignee_id', 'assignee_user')))
    setUsers(userList)
    if (!assignee && user?.id) setAssignee(user.id)
  }
  useEffect(() => { load() }, [objectType, recordId])

  const addNote = async () => {
    if (!text.trim()) return
    setBusy(true)
    const { data, error } = await supabase.from('notes')
      .insert({ related_type: objectType, related_id: recordId, content: text.trim(), created_by: user?.id })
      .select('*').single()
    setBusy(false)
    if (error) { toast('שמירת ההערה נכשלה: ' + error.message, 'err'); return }
    setNotes(x => [{ ...data, created_by_user: users.find(u => u.id === data.created_by) }, ...x]); setText('')
  }

  const addTask = async () => {
    if (!text.trim()) return
    setBusy(true)
    const { data, error } = await supabase.from('tasks')
      .insert({ related_type: objectType, related_id: recordId, subject: text.trim(), due_at: due || null, priority, assignee_id: assignee || user?.id })
      .select('*').single()
    setBusy(false)
    if (error) { toast('יצירת המשימה נכשלה: ' + error.message, 'err'); return }
    setTasks(x => [{ ...data, assignee_user: users.find(u => u.id === data.assignee_id) }, ...x]); setText(''); setDue(''); setPriority('רגילה')
  }

  const toggleTask = async (t) => {
    const status = t.status === 'פתוחה' ? 'בוצעה' : 'פתוחה'
    await supabase.from('tasks').update({ status }).eq('id', t.id)
    setTasks(ts => ts.map(x => x.id === t.id ? { ...x, status } : x))
  }
  const delNote = async (n) => {
    if (!await confirmDialog('למחוק הערה?')) return
    await supabase.from('notes').delete().eq('id', n.id)
    setNotes(x => x.filter(y => y.id !== n.id))
  }

  const openTasks = tasks.filter(t => t.status === 'פתוחה')
  const doneTasks = tasks.filter(t => t.status !== 'פתוחה')

  return (
    <Card className="gap-3" data-tour="rec-feed">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base"><Icon name="book" size={16} /> פעילות</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center gap-2">
          <Button size="sm" variant={mode === 'note' ? 'default' : 'outline'} onClick={() => setMode('note')}><Icon name="edit" size={13} /> הערה</Button>
          <Button size="sm" variant={mode === 'task' ? 'default' : 'outline'} onClick={() => setMode('task')}><Icon name="calendar" size={13} /> משימה</Button>
        </div>

        <div className="bg-card focus-within:border-ring mb-4 rounded-lg border p-3 transition-colors">
          <Textarea className="min-h-24 resize-y" value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'note' ? 'הוסיפו הערה…' : 'נושא המשימה…'} />
          {mode === 'task' && (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Input className="h-7 w-48 text-xs" type="datetime-local" dir="ltr" value={due} onChange={e => setDue(e.target.value)} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">עדיפות:</span>
                {TASK_PRIORITIES.map(p => (
                  <Button key={p} size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setPriority(p)}
                    style={priority === p ? { background: TASK_PRIORITY_COLOR[p], color: '#fff', borderColor: TASK_PRIORITY_COLOR[p] } : { color: TASK_PRIORITY_COLOR[p] }}>{p}</Button>
                ))}
                <Select value={assignee || '__none__'} onValueChange={v => setAssignee(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="אחראי…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">ללא אחראי</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        <span className="flex items-center gap-2"><UserAvatar user={u} size="sm" />{u.full_name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={mode === 'note' ? addNote : addTask} disabled={busy || !text.trim()}>
              {busy ? <span className="spinner light" style={{ width: 14, height: 14 }} /> : 'פרסם'}
            </Button>
          </div>
        </div>

        {openTasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            {openTasks.map(t => (
              <div key={t.id} className="bg-muted/40 flex items-center gap-2 rounded-md border-s-4 p-2" style={{ borderInlineStartColor: TASK_PRIORITY_COLOR[t.priority] || 'var(--mp)' }}>
                <input type="checkbox" checked={false} onChange={() => toggleTask(t)} />
                <span style={{ flex: 1, fontSize: '0.86rem', fontWeight: 600 }}>{t.subject}</span>
                {t.priority && <span className="badge" style={{ background: TASK_PRIORITY_COLOR[t.priority], color: '#fff' }}>{t.priority}</span>}
                {t.assignee_user?.full_name && <span className="badge gray" style={{ fontSize: '0.68rem' }}>{t.assignee_user.full_name}</span>}
                {t.due_at && <span className="muted small">{new Date(t.due_at).toLocaleString('he-IL')}</span>}
              </div>
            ))}
          </div>
        )}

        {notes.length === 0 && doneTasks.length === 0 ? <p className="text-muted-foreground py-6 text-center text-sm">אין פעילות עדיין</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 460, overflowY: 'auto' }}>
            {notes.map(n => (
              <div key={n.id} className="bg-muted/30 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <UserAvatar user={n.created_by_user} size="sm" />
                  <b style={{ color: 'var(--heading)', fontSize: '0.82rem' }}>{n.created_by_user?.full_name || 'נציג'}</b>
                  <span className="text-muted-foreground text-xs">· {new Date(n.created_at).toLocaleString('he-IL')}</span>
                  {(n.created_by === user?.id) && <Button variant="ghost" size="icon" className="ms-auto size-6 text-[var(--err)]" onClick={() => delNote(n)}><Icon name="x" size={12} /></Button>}
                </div>
                {n.content && <div className="mt-1.5 text-sm whitespace-pre-wrap">{n.content}</div>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
