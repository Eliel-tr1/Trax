import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField, loadOptions } from '../lib/api'
import { CALL_RESULTS, enumOpts } from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import UserPicker from '../components/UserPicker'
import EntityPicker from '../components/EntityPicker'
import CallRecordingPlayer from '../components/CallRecordingPlayer'
import { formatDateTime } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import FieldTabs from '../components/FieldTabs'
import SystemFieldsTab from '../components/SystemFieldsTab'

// Detail-only screen — phone calls are never created by hand (auto-created
// from Voicenter/Max, see schema.js's comment on `phone_call`). Everything
// telephony-owns (direction, timing, duration, transcript, AI summary) is
// read-only with an explanatory reason. Editable: the outcome tag (`result`,
// so a rep can correct/annotate it), plus `assigned_user_id` and the linked
// customer (`related_id`/`related_type`) — the ingestion doc (0005) matches
// both by best-effort heuristics (phone number / name normalization) and can
// miss, so a rep needs a manual override here.
export default function PhoneCallDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [loading, setLoading] = useState(true)
  const [opts, setOpts] = useState({ users: [], customers: [] })

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('phone_calls').select('*').eq('id', id).single()
    setC(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])
  useEffect(() => { loadOptions().then(setOpts) }, [])
  const users = opts.users || []

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
            {/* related_id is NOT NULL on phone_calls (see docs/decisions/0005),
                so this picker never offers a "none" option — only a swap to a
                different customer, e.g. to fix a bad phone-match from the sync. */}
            <EntityPicker resource="customers" value={c.related_type === 'customer' ? c.related_id : null}
              placeholder="בחרו לקוח" allowEmpty={false}
              onChange={v => { if (!v) return; save('related_id', v); if (c.related_type !== 'customer') save('related_type', 'customer') }} />
          </div>
          <EditField label="כיוון" value={c.direction} readOnly readOnlyReason="מגיע אוטומטית מהטלפוניה (Voicenter/Max)" />
          <EditField label="תאריך ושעה" value={formatDateTime(c.occurred_at)} readOnly readOnlyReason="מגיע אוטומטית מהטלפוניה" />
          <EditField label="משך (שניות)" value={c.duration_seconds} readOnly readOnlyReason="מגיע אוטומטית מהטלפוניה" />
          <EditField label="תוצאה" value={c.result} type="select" options={enumOpts(CALL_RESULTS)}
            display={<StatusBadge value={c.result} field="result" resource="phone_call" />}
            onSave={v => save('result', v)} />
          <div className="ef">
            <span className="ef-label">נציג משויך</span>
            <UserPicker users={users} value={c.assigned_user_id} onChange={v => save('assigned_user_id', v)}
              placeholder="בחרו נציג" emptyLabel="לא שויך" />
          </div>
        </div>
        <div style={{ marginTop: 10 }}><CallRecordingPlayer url={c.recording_url} /></div>
        <div style={{ marginTop: 10 }}><EditField label="תמליל" value={c.transcript} type="textarea" readOnly readOnlyReason="מגיע אוטומטית מתמלול השיחה" /></div>
        <div style={{ marginTop: 10 }}><EditField label="סיכום AI" value={c.summary} type="textarea" readOnly readOnlyReason="מגיע אוטומטית מ-Fireberry (סיכום AI של Voicenter)" /></div>

        {/* Wasn't rendered before despite the import — phone_calls had no
            system-fields tab at all, so execution_url/business_unit/audit
            fields never showed here. Same generic tab every other detail
            screen uses. */}
        <FieldTabs tabs={[
          {
            key: 'system', label: 'שדות מערכת', content: <SystemFieldsTab record={c} users={users} />,
          },
        ]} />
      </div>
    </RecordLayout>
  )
}
