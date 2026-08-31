import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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
import FieldTabs from '../components/FieldTabs'
import { MeetingFormModal } from './Meetings'
import CardcomChargeModal from '../components/CardcomChargeModal'
import { formatCurrency, formatDateTime } from '../lib/format'

const LOST_STAGE = 'עסקה הופסדה'

const STAGES = SALE_STAGES.map(s => ({ key: s, label: s }))
const STAGE_BADGE = {
  'ליד חדש': 'mp', 'נוצר קשר על ידי AI': 'mp', 'שיחת מכירה עם נציג אנושי': 'warn',
  'הצעה נשלחה': 'warn', 'ממתין להחלטה': 'warn', 'נסגר בהצלחה': 'ok', 'עסקה הופסדה': 'gray',
}

export default function SaleDetail() {
  const { id } = useParams()
  const [s, setS] = useState(null)
  const [opts, setOpts] = useState({ users: [], journeys: [] })
  const [meetings, setMeetings] = useState([])
  const [showNewMeeting, setShowNewMeeting] = useState(false)
  const [showCharge, setShowCharge] = useState(false)
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

  // "Closing as unsuccessful without a reason is not allowed" (domain-model.md)
  // — enforced here in the UI, on top of the DB CHECK constraint.
  const setStage = async (stage) => {
    if (stage === LOST_STAGE && !s.loss_reason) {
      toast('יש לבחור סיבת אי סגירה לפני סגירת העסקה כלא מוצלחת', 'err')
      return
    }
    await save('stage', stage)
  }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!s) return <div className="card"><div className="empty">מכירה לא נמצאה.</div></div>

  const isXcon = s.business_unit === 'Xcon'
  const journeyOpts = (opts.journeys || []).map(j => ({ value: j.id, label: j.name }))

  const related = [
    // Resource-mode chip (paginated, links to the standalone MeetingDetail
    // screen) instead of a static inline table — see the same comment on
    // CustomerDetail.jsx's identical `meetings` entry.
    { key: 'meetings', label: 'פגישות', count: meetings.length, onOpen: r => `/meetings/${r.id}`,
      resource: 'meetings', filter: { related_type: 'sale', related_id: id },
      listColumns: [
        { source: 'subject', label: 'נושא', render: r => r.subject },
        { source: 'start_at', label: 'תאריך ושעה', render: r => formatDateTime(r.start_at) },
        { source: 'type', label: 'סוג', render: r => r.type || '-' },
      ] },
  ]

  return (
    <RecordLayout
      title={s.deal_name || 'עסקה חדשה'}
      subtitle={s.customer ? `${s.customer.first_name} ${s.customer.last_name} · ${s.business_unit}` : s.business_unit}
      backTo="/sales"
      status={{ label: s.stage, badge: STAGE_BADGE[s.stage] || 'gray' }}
      actions={[
        { icon: 'calendar', title: 'פגישה חדשה', onClick: () => setShowNewMeeting(true) },
        { icon: 'money', title: 'חיוב לקוח באשראי', onClick: () => setShowCharge(true) },
      ]}
      objectType="sale" recordId={id}
      recordType="sale" record={s} onRelatedCreated={() => load()}
      stage={{ stages: STAGES, current: s.stage, onSet: setStage }}
      related={related}
    >
      <div className="card">
        <div className="field-grid">
          <EditField label="לקוח" value={s.customer ? `${s.customer.first_name} ${s.customer.last_name}` : ''} linkTo={s.customer_id ? `/customers/${s.customer_id}` : undefined} />
          <EditField label="שלב מכירה" value={s.stage} type="select" options={enumOpts(SALE_STAGES)} onSave={setStage} />
          <div className="ef">
            <span className="ef-label">בעלים</span>
            <UserPicker users={opts.users} value={s.owner_id} onChange={v => save('owner_id', v)} placeholder="בחרו בעלים" />
          </div>
          {/* Only rendered at all when the deal is in the lost stage — not
              just greyed out, per the client's spec for this field. */}
          {s.stage === LOST_STAGE && (
            <EditField label="סיבת אי סגירה" value={s.loss_reason} type="select" options={enumOpts(LOSS_REASONS)} onSave={v => save('loss_reason', v)} />
          )}
          <EditField label="מסע מבוקש" value={s.journey_id} display={opts.journeys?.find(j => j.id === s.journey_id)?.name} type="select" options={journeyOpts} onSave={v => save('journey_id', v)} />
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
            key: 'system', label: 'נתוני מערכת', content: <>
              <EditField label="יחידה עסקית" value={s.business_unit} readOnly readOnlyReason="נקבע בעת יצירת העסקה ולא ניתן לשינוי" />
              <EditField label="נוצר בתאריך" value={s.created_at} display={formatDateTime(s.created_at)} readOnly readOnlyReason="נחתם אוטומטית ביצירת הרשומה" />
              <EditField label="עודכן בתאריך" value={s.updated_at} display={formatDateTime(s.updated_at)} readOnly readOnlyReason="מתעדכן אוטומטית בכל שינוי" />
            </>,
          },
          {
            key: 'marketing', label: 'נתונים שיווקיים', content: <>
              <EditField label="ערוץ פנייה" value={s.channel} type="select" options={enumOpts(SALE_CHANNELS)} onSave={v => save('channel', v)} />
              <EditField label="מקור הגעה" value={s.lead_source} type="select" options={enumOpts(LEAD_SOURCES)} onSave={v => save('lead_source', v)} />
              <EditField label="קמפיין" value={s.campaign} onSave={v => save('campaign', v)} />
            </>,
          },
        ]} />
      </div>
      {showNewMeeting && (
        <MeetingFormModal defaultRelatedType="sale" defaultRelatedId={id} defaultUnit={s.business_unit}
          onClose={() => setShowNewMeeting(false)} onCreated={() => { setShowNewMeeting(false); load() }} />
      )}
      {showCharge && <CardcomChargeModal onClose={() => setShowCharge(false)} />}
    </RecordLayout>
  )
}
