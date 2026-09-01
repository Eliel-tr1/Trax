import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { supabase } from '../lib/supabase'
import { updateField, loadOptions } from '../lib/api'
import { toast } from '../components/Toaster'
import {
  SALE_STAGES, SALE_CHANNELS, LEAD_SOURCES, LOSS_REASONS, INTEREST_AREAS,
  CURRENCIES, QUALIFICATION_RATINGS, enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import UserPicker from '../components/UserPicker'
import EntityPicker from '../components/EntityPicker'
import FieldTabs from '../components/FieldTabs'
import SystemFieldsTab from '../components/SystemFieldsTab'
import { meetingsColumns } from './Meetings'
import CardcomChargeModal from '../components/CardcomChargeModal'
import Modal from '../components/Modal'
import RecordFormModal from '../components/RecordFormModal'
import { formatCurrency, formatDateTime } from '../lib/format'
import StatusBadge, { badgeClassFor } from '../components/StatusBadge'
import { celebrateWin } from '../lib/celebration'

const LOST_STAGE = 'עסקה הופסדה'
const WON_STAGE = 'נסגר בהצלחה'

const STAGES = SALE_STAGES.map(s => ({ key: s, label: s }))

export default function SaleDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const refresh = useRefresh()
  const [s, setS] = useState(null)
  const [opts, setOpts] = useState({ users: [], journeys: [] })
  const [meetings, setMeetings] = useState([])
  const [showCharge, setShowCharge] = useState(false)
  const [showNewRegistration, setShowNewRegistration] = useState(false)
  const [lossReasonPrompt, setLossReasonPrompt] = useState(false)
  const [savingLossReason, setSavingLossReason] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [{ data }, o, { data: mt }] = await Promise.all([
      supabase.from('sales').select('*, customer:customers(id,first_name,last_name,business_unit)').eq('id', id).single(),
      loadOptions(),
      supabase.from('meetings').select('*').eq('related_type', 'sale').eq('related_id', id).is('deleted_at', null).order('start_at', { ascending: false }),
    ])
    setS(data); setOpts(o); setMeetings(mt || []); setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const save = async (field, value) => { setS(x => ({ ...x, [field]: value })); await updateField('sales', s, field, value) }

  // Saves stage + loss_reason together in one update — used both by the
  // loss-reason modal below (first time the deal is marked lost) and later
  // edits of the field once it's already showing on the record.
  const saveStageAndLossReason = async (reason) => {
    setS(x => ({ ...x, stage: LOST_STAGE, loss_reason: reason }))
    const { error } = await supabase.from('sales').update({ stage: LOST_STAGE, loss_reason: reason }).eq('id', s.id)
    if (error) { toast('השמירה נכשלה', 'err'); throw error }
    toast('נשמר')
  }

  // "Closing as unsuccessful without a reason is not allowed" (domain-model.md).
  // Per the client's repeated request: picking the lost stage must pop a
  // modal asking for the reason IMMEDIATELY, before anything is saved —
  // not save the stage first and then reveal a hidden field, and not just
  // toast an error telling the user to go find it themselves.
  const setStage = async (stage) => {
    if (stage === LOST_STAGE) { setLossReasonPrompt(true); return }
    // Fire the celebration only on the actual transition INTO the won stage
    // (not on every render, and not when it's already won) — a random
    // effect (fireworks/jeep/skier/skydiver) plays via CelebrationHost.
    // save() already applies the stage optimistically before awaiting the
    // network write, so the UI (and the user's sense of "I just won this
    // deal") moves on even if that write later rejects (e.g. an unrelated
    // server-side trigger error) — the celebration is wrapped in
    // try/finally so it stays in sync with what's on screen either way,
    // instead of silently vanishing whenever save() throws.
    const enteringWon = stage === WON_STAGE && s.stage !== WON_STAGE
    try { await save('stage', stage) } finally { if (enteringWon) celebrateWin() }
  }

  const confirmLossReason = async (reason) => {
    setSavingLossReason(true)
    try { await saveStageAndLossReason(reason); setLossReasonPrompt(false) }
    finally { setSavingLossReason(false) }
  }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!s) return <div className="card"><div className="empty">מכירה לא נמצאה.</div></div>

  const isXcon = s.business_unit === 'Xcon'

  const related = [
    // Resource-mode chip (paginated, links to the standalone MeetingDetail
    // screen) instead of a static inline table — see the same comment on
    // CustomerDetail.jsx's identical `meetings` entry.
    // listColumns reuses Meetings.jsx's own column builder (meetingsColumns)
    // instead of a hardcoded 3-field subset — see the comment on
    // CustomerDetail.jsx's `related` array for why.
    { key: 'meetings', label: 'פגישות', count: meetings.length, onOpen: r => `/meetings/${r.id}`,
      resource: 'meetings', filter: { related_type: 'sale', related_id: id },
      listColumns: meetingsColumns(opts, refresh) },
  ]

  return (
    <RecordLayout
      title={s.deal_name || 'עסקה חדשה'}
      subtitle={s.customer ? `${s.customer.first_name} ${s.customer.last_name} · ${s.business_unit}` : s.business_unit}
      backTo="/sales"
      status={{ label: s.stage, badge: badgeClassFor('sale', 'stage', s.stage) }}
      actions={[
        { icon: 'money', title: 'חיוב לקוח באשראי', onClick: () => setShowCharge(true) },
        { icon: 'tag', title: 'הוספת הרשמה חדשה', onClick: () => setShowNewRegistration(true) },
      ]}
      objectType="sale" recordId={id}
      recordType="sale" record={s} onRelatedCreated={() => load()}
      stage={{ stages: STAGES, current: s.stage, onSet: setStage }}
      related={related}
    >
      <div className="card">
        <div className="field-grid">
          <EditField label="לקוח" value={s.customer ? `${s.customer.first_name} ${s.customer.last_name}` : ''} linkTo={s.customer_id ? `/customers/${s.customer_id}` : undefined} />
          <EditField label="שלב מכירה" value={s.stage} type="select" options={enumOpts(SALE_STAGES)} required
            display={<StatusBadge value={s.stage} field="stage" resource="sale" />} onSave={setStage} />
          <div className="ef">
            <span className="ef-label">נציג מכירות</span>
            <UserPicker users={opts.users} value={s.owner_id} onChange={v => save('owner_id', v)} placeholder="בחרו נציג מכירות" />
          </div>
          {/* Only rendered at all when the deal is in the lost stage — not
              just greyed out, per the client's spec for this field. */}
          {s.stage === LOST_STAGE && (
            <EditField label="סיבת אי סגירה" value={s.loss_reason} type="select" options={enumOpts(LOSS_REASONS)} onSave={v => save('loss_reason', v)} />
          )}
          <div className="ef">
            <span className="ef-label">מסע מבוקש</span>
            <EntityPicker resource="journeys" value={s.journey_id} onChange={v => save('journey_id', v)} placeholder="בחרו מסע" />
          </div>
          <EditField label="מספר משתתפים" value={s.participants_count} type="number" onSave={v => save('participants_count', v)} />
          <EditField label="שווי צפוי" value={s.expected_value} display={formatCurrency(s.expected_value, s.currency)} type="number" onSave={v => save('expected_value', v)} />
          <EditField label="מטבע" value={s.currency} type="select" options={CURRENCIES} onSave={v => save('currency', v)} />
          <EditField label="דירוג הסמכה" value={s.qualification_rating} type="select" options={enumOpts(QUALIFICATION_RATINGS)} onSave={v => save('qualification_rating', v)} />
          <EditField label="תאריך שיחה הבאה" value={s.next_call_at?.slice(0, 16)} display={formatDateTime(s.next_call_at)} type="datetime" onSave={v => save('next_call_at', v)} />
          {isXcon && <EditField label="תחום עניין" value={s.interest_area} type="select" options={enumOpts(INTEREST_AREAS)} onSave={v => save('interest_area', v)} />}
        </div>
        <div style={{ marginTop: 10 }}><EditField label="סיכום הסמכה מהסוכן" value={s.qualification_summary} type="textarea" onSave={v => save('qualification_summary', v)} /></div>

        <FieldTabs tabs={[
          {
            key: 'system', label: 'נתוני מערכת', content: <SystemFieldsTab record={s} users={opts.users} onSaveBusinessUnit={v => save('business_unit', v)} />,
          },
          {
            key: 'marketing', label: 'נתונים שיווקיים', content: <>
              <EditField label="ערוץ פנייה" value={s.channel} type="select" options={enumOpts(SALE_CHANNELS)} onSave={v => save('channel', v)} />
              <EditField label="מקור הגעה" value={s.lead_source} type="select" options={enumOpts(LEAD_SOURCES)} onSave={v => save('lead_source', v)} />
              <EditField label="קמפיין" value={s.campaign} onSave={v => save('campaign', v)} />
              <EditField label="שם טופס" value={s.form_name} onSave={v => save('form_name', v)} />
              <EditField label="אישור דיוור" value={s.marketing_consent} type="checkbox" onSave={v => save('marketing_consent', v)} />
              {/* UTM — written automatically by the WF05a lead-intake integration
                  (docs/decisions/0006), editable here like everything else. */}
              <EditField label="UTM Source" value={s.utm_source} onSave={v => save('utm_source', v)} />
              <EditField label="UTM Medium" value={s.utm_medium} onSave={v => save('utm_medium', v)} />
              <EditField label="UTM Campaign" value={s.utm_campaign} onSave={v => save('utm_campaign', v)} />
              <EditField label="UTM Content" value={s.utm_content} onSave={v => save('utm_content', v)} />
              <EditField label="UTM Term" value={s.utm_term} onSave={v => save('utm_term', v)} />
              <EditField label="Funnel" value={s.funnel} onSave={v => save('funnel', v)} />
              <EditField label="UTM Ad Set" value={s.utm_adset} onSave={v => save('utm_adset', v)} />
              <EditField label="UTM Ad" value={s.utm_ad} onSave={v => save('utm_ad', v)} />
              <EditField label="UTM Placement" value={s.utm_placement} onSave={v => save('utm_placement', v)} />
              <EditField label="עמוד נחיתה" value={s.landing_page} onSave={v => save('landing_page', v)} />
              <EditField label="מפנה (Referrer)" value={s.referrer} onSave={v => save('referrer', v)} />
            </>,
          },
        ]} />
      </div>
      {showCharge && <CardcomChargeModal onClose={() => setShowCharge(false)} />}
      {showNewRegistration && (
        <RecordFormModal type="registration"
          defaults={{ sale_id: s.id, customer_id: s.customer_id, journey_id: s.journey_id, business_unit: s.business_unit, participants_count: 1 }}
          onClose={() => setShowNewRegistration(false)}
          onCreated={row => nav(`/registrations/${row.id}`)} />
      )}
      {lossReasonPrompt && (
        <LossReasonModal
          onClose={() => setLossReasonPrompt(false)}
          onConfirm={confirmLossReason}
          saving={savingLossReason}
        />
      )}
    </RecordLayout>
  )
}

// Pops the moment "עסקה הופסדה" is picked from the stage selector — the
// reason is collected here BEFORE anything is written, then stage+loss_reason
// save together in one update (see saveStageAndLossReason above). Cancelling
// leaves the record untouched (the stage selector never changed).
function LossReasonModal({ onClose, onConfirm, saving }) {
  const [reason, setReason] = useState('')
  const options = enumOpts(LOSS_REASONS)

  return (
    <Modal title="סיבת אי סגירה" icon="x" onClose={onClose} maxWidth={420}>
      <div style={{ padding: '4px 0 2px' }}>
        <p className="muted small" style={{ marginBottom: 10 }}>
          כדי לסמן את העסקה כ"עסקה הופסדה" יש לבחור סיבת אי סגירה.
        </p>
        <select className="input" style={{ width: '100%' }} value={reason} onChange={e => setReason(e.target.value)} autoFocus>
          <option value="">בחרו סיבה...</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn subtle" onClick={onClose} disabled={saving}>ביטול</button>
          <button className="btn" disabled={!reason || saving} onClick={() => onConfirm(reason)}>
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
