import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField, loadOptions } from '../lib/api'
import { CALL_RESULTS, enumOpts } from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import RelatedLink from '../components/RelatedLink'
import UserAvatar from '../components/UserAvatar'
import { formatDateTime } from '../lib/format'

// Detail-only screen — phone calls are never created by hand (auto-created
// from Voicenter/Max, see schema.js's comment on `phone_call`). Everything
// telephony-owns is read-only with an explanatory reason; only the outcome
// tag (`result`) is left editable, so a rep can correct/annotate it.
export default function PhoneCallDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('phone_calls').select('*').eq('id', id).single()
    setC(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])
  useEffect(() => { loadOptions().then(o => setUsers(o.users || [])) }, [])
  const assignedUser = users.find(u => u.id === c?.assigned_user_id)

  const save = async (field, value) => { setC(x => ({ ...x, [field]: value })); await updateField('phone_calls', c, field, value) }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!c) return <div className="card"><div className="empty">שיחה לא נמצאה.</div></div>

  return (
    <RecordLayout
      title={`שיחה ${c.direction || ''}`}
      subtitle={c.occurred_at ? formatDateTime(c.occurred_at) : undefined}
      backTo="/phone-calls"
      recordType="phone_call" recordId={id} record={c}
      feed={false}
    >
      <div className="card">
        <div className="field-grid">
          <div className="ef">
            <span className="ef-label">לקוח</span>
            <span className="ef-val"><RelatedLink relatedType={c.related_type} relatedId={c.related_id} showType={false} /></span>
          </div>
          <EditField label="כיוון" value={c.direction} readOnly readOnlyReason="מגיע אוטומטית מהטלפוניה (Voicenter/Max)" />
          <EditField label="תאריך ושעה" value={formatDateTime(c.occurred_at)} readOnly readOnlyReason="מגיע אוטומטית מהטלפוניה" />
          <EditField label="משך (שניות)" value={c.duration_seconds} readOnly readOnlyReason="מגיע אוטומטית מהטלפוניה" />
          <EditField label="תוצאה" value={c.result} type="select" options={enumOpts(CALL_RESULTS)} onSave={v => save('result', v)} />
          <EditField label="הקלטה" value={c.recording_url} type="link" readOnly readOnlyReason="מגיע אוטומטית מהטלפוניה" />
          <div className="ef">
            <span className="ef-label">נציג משויך</span>
            <span className="ef-val">
              {assignedUser ? <UserAvatar user={assignedUser} showName /> : <span className="muted">לא שויך (לא נמצאה התאמת שם ל-Fireberry)</span>}
            </span>
          </div>
          <EditField label="יחידה עסקית" value={c.business_unit} readOnly readOnlyReason="נקבע אוטומטית ולא ניתן לשינוי" />
        </div>
        <div style={{ marginTop: 10 }}><EditField label="תמליל" value={c.transcript} type="textarea" readOnly readOnlyReason="מגיע אוטומטית מתמלול השיחה" /></div>
        <div style={{ marginTop: 10 }}><EditField label="סיכום AI" value={c.summary} type="textarea" readOnly readOnlyReason="מגיע אוטומטית מ-Fireberry (סיכום AI של Voicenter)" /></div>
      </div>
    </RecordLayout>
  )
}
