import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { loadOptions, updateField } from '../lib/api'
import { MEETING_TYPES, enumOpts } from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import RelatedLink from '../components/RelatedLink'

export default function MeetingDetail() {
  const { id } = useParams()
  const [m, setM] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [{ data }, opts] = await Promise.all([
      supabase.from('meetings').select('*').eq('id', id).single(),
      loadOptions(),
    ])
    setM(data); setUsers(opts.users || []); setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const save = async (field, value) => { setM(x => ({ ...x, [field]: value })); await updateField('meetings', m, field, value) }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!m) return <div className="card"><div className="empty">פגישה לא נמצאה.</div></div>

  const relatedPath = m.related_type === 'customer' ? `/customers/${m.related_id}` : m.related_type === 'sale' ? `/sales/${m.related_id}` : null

  return (
    <RecordLayout
      title={m.subject}
      subtitle={m.business_unit}
      backTo="/meetings"
      objectType="meeting" recordId={id}
      recordType="meeting" record={m} onRelatedCreated={() => load()}
      feed={false}
    >
      <div className="card">
        <div className="field-grid">
          <EditField label="נושא" value={m.subject} onSave={v => save('subject', v)} />
          <div className="ef">
            <span className="ef-label">משויך ל</span>
            <span className="ef-val"><RelatedLink relatedType={m.related_type} relatedId={m.related_id} /></span>
          </div>
          <EditField label="תאריך ושעה" value={m.start_at?.slice(0, 16)} type="datetime" onSave={v => save('start_at', v)} />
          <EditField label="משך (דקות)" value={m.duration_minutes} type="number" onSave={v => save('duration_minutes', v)} />
          <EditField label="סוג" value={m.type} type="select" options={enumOpts(MEETING_TYPES)} onSave={v => save('type', v)} />
          <EditField label="יחידה עסקית" value={m.business_unit} readOnly readOnlyReason="נקבע בעת יצירת הפגישה ולא ניתן לשינוי" />
          <EditField label="משתתפים" value={(m.participants || []).length ? (m.participants || []).map(pid => users.find(u => u.id === pid)?.full_name || '?').join(', ') : null} readOnly readOnlyReason="עריכת רשימת משתתפים אינה נתמכת עדיין בממשק זה" />
          {m.google_event_id && <EditField label="סנכרון יומן גוגל" value={m.google_event_id} readOnly readOnlyReason="מגיע מסנכרון Google Calendar" />}
        </div>
        <div style={{ marginTop: 10 }}><EditField label="סיכום" value={m.summary} type="textarea" onSave={v => save('summary', v)} /></div>
      </div>
    </RecordLayout>
  )
}
