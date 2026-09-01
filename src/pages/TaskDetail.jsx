import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField, loadOptions } from '../lib/api'
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLOR, enumOpts } from '../lib/constants'
import EditField from '../components/EditField'
import RecordLayout from '../components/RecordLayout'
import SystemFieldsTab from '../components/SystemFieldsTab'
import FieldTabs from '../components/FieldTabs'
import UserPicker from '../components/UserPicker'
import RelatedLink from '../components/RelatedLink'
import { formatDateTime } from '../lib/format'

const statusOpts = enumOpts(TASK_STATUSES)
const priorityOpts = enumOpts(TASK_PRIORITIES)
const STATUS_BADGE = { 'פתוחה': 'warn', 'בוצעה': 'ok', 'בוטלה': 'gray' }

/* Task detail — tasks never had their own detail route (My Desk's
   "open the record, not the list" fix needed one), so this follows the
   exact MeetingDetail pattern: RecordLayout shell + EditField grid,
   every editable field editable in place. */
export default function TaskDetail() {
  const { id } = useParams()
  const [t, setT] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [{ data }, { data: o }] = await Promise.all([
        supabase.from('tasks').select('*').eq('id', id).single(),
        loadOptions(),
      ])
      if (cancelled) return
      setT(data)
      setUsers(o?.users || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [id])

  const save = async (field, value) => {
    if (!t) return
    setT(x => ({ ...x, [field]: value }))
    await updateField('tasks', t, field, value)
  }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!t) return <div className="card"><div className="empty">משימה לא נמצאה.</div></div>

  return (
    <RecordLayout
      title={t.subject || 'משימה'}
      subtitle={t.business_unit}
      backTo="/tasks"
      objectType="task" recordId={id}
      recordType="task" record={t} onRelatedCreated={() => {}}
      feed={false}
    >
      <div className="card">
        <div className="field-grid">
          <EditField label="נושא" value={t.subject} onSave={v => save('subject', v)} />
          <div className="ef">
            <span className="ef-label">משויך ל</span>
            <span className="ef-val"><RelatedLink relatedType={t.related_type} relatedId={t.related_id} /></span>
          </div>
          <EditField label="סטטוס" value={t.status} type="select" options={statusOpts} required
            onSave={v => save('status', v)}
            display={v => <span className={`badge ${STATUS_BADGE[v] || 'gray'}`}>{v}</span>} />
          <EditField label="עדיפות" value={t.priority} type="select" options={priorityOpts}
            onSave={v => save('priority', v)}
            display={v => v ? <span className="badge" style={{ background: TASK_PRIORITY_COLOR[v], color: '#fff' }}>{v}</span> : '-'} />
          <EditField label="תאריך יעד" value={t.due_at?.slice(0, 16)} display={formatDateTime(t.due_at)}
            type="datetime" onSave={v => save('due_at', v)} />
          <div className="ef">
            <span className="ef-label">אחראי</span>
            <span className="ef-val"><UserPicker value={t.assignee_id} users={users} onChange={v => save('assignee_id', v)} /></span>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><EditField label="הערות" value={t.notes} type="textarea" onSave={v => save('notes', v)} /></div>

        <FieldTabs tabs={[
          { key: 'system', label: 'שדות מערכת', content: <SystemFieldsTab record={t} users={users} /> },
        ]} />
      </div>
    </RecordLayout>
  )
}