import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField, loadOptions } from '../lib/api'
import { CALL_RESULTS, LEAD_SOURCES, enumOpts } from '../lib/constants'
import Modal from '../components/Modal'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import UserPicker from '../components/UserPicker'
import EntityPicker from '../components/EntityPicker'
import CallRecordingPlayer from '../components/CallRecordingPlayer'
import { formatDateTime } from '../lib/format'
import StatusBadge from '../components/StatusBadge'
import FieldTabs from '../components/FieldTabs'
import SystemFieldsTab from '../components/SystemFieldsTab'
import { PhoneDisplay } from '../components/PhoneInput'
import { toast } from '../components/Toaster'

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

  // "הקמת ליד" (Sahar 11/10/2026): a call from/to a number not in the CRM is
  // stored unlinked. One click opens a lead for that number (or reuses a
  // customer that already has it) and links ALL unlinked calls with it,
  // server-side in create_lead_from_call (data/048).
  const [creating, setCreating] = useState(false)
  const [newLead, setNewLead] = useState(null) // shown in the picker before its cache refreshes
  // "הקמת ליד" opens a form first (Sahar 11/10/2026): full name REQUIRED,
  // the rest optional. The RPC (data/050) also refuses an empty name.
  const [leadForm, setLeadForm] = useState(null)
  // Recording copied into the private bucket by voicenter-call-enrich (data/051):
  // play + download through short-lived signed URLs.
  const [rec, setRec] = useState({ play: null, download: null })
  useEffect(() => {
    let live = true
    setRec({ play: null, download: null })
    if (c?.recording_path) {
      const b = supabase.storage.from('call-recordings')
      Promise.all([
        b.createSignedUrl(c.recording_path, 3600),
        b.createSignedUrl(c.recording_path, 3600, { download: `שיחה-${(c.occurred_at || '').slice(0, 10)}-${c.customer_phone || c.external_call_id}.mp3` }),
      ]).then(([p, d]) => { if (live) setRec({ play: p.data?.signedUrl || null, download: d.data?.signedUrl || null }) })
    }
    return () => { live = false }
  }, [c?.recording_path])
  const openLeadForm = () => setLeadForm({ full_name: '', email: '', lead_source: 'לא מוכר', note: '' })
  const createLead = async () => {
    if (!leadForm?.full_name.trim()) { toast('יש להזין שם מלא', 'err'); return }
    setCreating(true)
    const { data, error } = await supabase.rpc('create_lead_from_call', {
      p_call_id: id, p_full_name: leadForm.full_name.trim(), p_email: leadForm.email.trim() || null,
      p_lead_source: leadForm.lead_source || 'לא מוכר', p_note: leadForm.note.trim() || null,
    })
    setCreating(false)
    if (error) { toast(error.message || 'הקמת הליד נכשלה', 'err'); return }
    setLeadForm(null)
    toast(data.created ? `נפתח ליד חדש, שויכו ${data.linked_calls} שיחות` : `המספר כבר קיים במערכת, שויכו ${data.linked_calls} שיחות ללקוח הקיים`)
    if (data.customer_id) {
      const { data: cu } = await supabase.from('customers').select('id, first_name, last_name').eq('id', data.customer_id).single()
      if (cu) setNewLead(cu)
    }
    setOpts(await loadOptions(true))
    const { data: fresh } = await supabase.from('phone_calls').select('*').eq('id', id).single()
    if (fresh) setC(fresh)
  }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!c) return <div className="card"><div className="empty">שיחה לא נמצאה.</div></div>
  const out = c.direction === 'יוצאת'
  const voicenterPanel = /cpanel\.voicenter\.co\.il/i.test(c.recording_url || '')
  // Transcript/summary arrive one turn per line; render the line breaks.
  const multiline = (v) => v ? <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontWeight: 400 }}>{v}</div> : undefined

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
            {/* related_id is null when the number was not in the CRM at call
                time (data/048). The picker can still link it to an existing
                customer by hand; "הקמת ליד" opens a new one for this number. */}
            <EntityPicker resource="customers" value={c.related_type === 'customer' ? c.related_id : null}
              placeholder={c.related_id ? 'בחרו לקוח' : 'לא משויך, בחרו לקוח קיים'} allowEmpty={false}
              extraItem={newLead || undefined}
              onChange={v => { if (!v) return; save('related_id', v); if (c.related_type !== 'customer') save('related_type', 'customer') }} />
          </div>
          {/* Both sides of the call (Sahar 11/10/2026): the TRAX side ("יוצאת
              ממספר" / "נכנסת למספר") and the other side. data/049. */}
          <div className="ef">
            <span className="ef-label">{out ? 'שיחה יוצאת ממספר' : 'שיחה נכנסת למספר'}</span>
            <span className="ef-val"><PhoneDisplay value={c.trax_number} /></span>
          </div>
          <div className="ef">
            <span className="ef-label">{out ? 'שיחה יוצאת למספר' : 'שיחה נכנסת ממספר'}</span>
            <span className="ef-val" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <PhoneDisplay value={c.customer_phone} />
              {!c.related_id && c.customer_phone && (
                <button className="btn sm" onClick={openLeadForm}>הקמת ליד</button>
              )}
            </span>
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
        {/* Voicenter panel links (cpanel.voicenter.co.il/.../PlayRecord) only
            work inside a logged-in Voicenter session: the player stays silent
            and "download" opens the Voicenter dashboard. Until recordings are
            copied into our Storage, say so honestly instead of a dead player. */}
        {c.recording_path ? (
          <>
            <div style={{ marginTop: 10 }}><CallRecordingPlayer url={rec.play} /></div>
            {rec.download && (
              <div className="ef" style={{ marginTop: 6 }}>
                <span className="ef-label">הורדת השיחה</span>
                <span className="ef-val"><a href={rec.download}>הורדת קובץ ההקלטה (MP3)</a></span>
              </div>
            )}
          </>
        ) : voicenterPanel ? (
          /* Not copied yet (Voicenter panel links need a Voicenter session). */
          <div className="ef" style={{ marginTop: 10 }}>
            <span className="ef-label">הקלטה</span>
            <span className="ef-val" style={{ fontWeight: 400 }}>
              <span className="muted">ההקלטה עוד לא הועתקה למערכת. בינתיים: </span>
              <a href={c.recording_url} target="_blank" rel="noreferrer">פתיחת ההקלטה בפאנל Voicenter</a>
            </span>
          </div>
        ) : (
          <div style={{ marginTop: 10 }}><CallRecordingPlayer url={c.recording_url} /></div>
        )}
        <div style={{ marginTop: 10 }}><EditField label="תמליל" value={c.transcript} display={multiline(c.transcript)} type="textarea" readOnly readOnlyReason="מגיע אוטומטית מתמלול השיחה" /></div>
        <div style={{ marginTop: 10 }}><EditField label="סיכום AI" value={c.summary} display={multiline(c.summary)} type="textarea" readOnly readOnlyReason="מגיע אוטומטית מ-Voicenter (סיכום AI)" /></div>

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
      {leadForm && (
        <Modal title="הקמת ליד מהשיחה" icon="plus" onClose={() => !creating && setLeadForm(null)}>
          <div className="field-grid">
            <div className="field"><label>טלפון</label>
              <div style={{ padding: '6px 0' }}><PhoneDisplay value={c.customer_phone} /></div></div>
            <div className="field"><label>שם מלא<span className="req"> *</span></label>
              <input autoFocus value={leadForm.full_name} placeholder="שם פרטי ושם משפחה"
                onChange={e => setLeadForm(f => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="field"><label>אימייל</label>
              <input dir="ltr" type="email" value={leadForm.email}
                onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="field"><label>מקור הגעה</label>
              <select value={leadForm.lead_source} onChange={e => setLeadForm(f => ({ ...f, lead_source: e.target.value }))}>
                {LEAD_SOURCES.map(x => <option key={x} value={x}>{x}</option>)}
              </select></div>
          </div>
          <div className="field" style={{ marginTop: 10 }}><label>הערה</label>
            <textarea rows={3} value={leadForm.note} onChange={e => setLeadForm(f => ({ ...f, note: e.target.value }))} /></div>
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={() => setLeadForm(null)} disabled={creating}>ביטול</button>
              <button className="btn" onClick={createLead} disabled={creating || !leadForm.full_name.trim()}>
                {creating ? 'יוצר...' : 'יצירת ליד'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </RecordLayout>
  )
}
