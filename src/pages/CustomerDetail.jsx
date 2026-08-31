import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField } from '../lib/api'
import {
  CUSTOMER_STATUSES, LEAD_SOURCES, LEAD_RATINGS, EXPERIENCE_LEVELS,
  PREFERRED_LANGUAGES, enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import { MeetingFormModal } from './Meetings'
import { REGISTRATION_STATUS_BADGE } from './Registrations'

const STATUS_BADGE = { 'ליד חדש': 'mp', 'בטיפול': 'warn', 'לקוח פעיל': 'ok', 'לקוח עבר': 'gray', 'לא רלוונטי': 'gray' }
const SECTIONS = ['פרטים', 'מועדון']

export default function CustomerDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [sales, setSales] = useState([])
  const [contacts, setContacts] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [meetings, setMeetings] = useState([])
  const [calls, setCalls] = useState([])
  const [sec, setSec] = useState('פרטים')
  const [showNewMeeting, setShowNewMeeting] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').eq('id', id).single()
    setC(data)
    const [{ data: s }, { data: ct }, { data: reg }, { data: mt }, { data: pc }] = await Promise.all([
      supabase.from('sales').select('id, deal_name, stage').eq('customer_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
      supabase.from('registrations').select('id, registration_name, status').eq('customer_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('meetings').select('*').eq('related_type', 'customer').eq('related_id', id).is('deleted_at', null).order('start_at', { ascending: false }),
      supabase.from('phone_calls').select('*').eq('related_type', 'customer').eq('related_id', id).order('occurred_at', { ascending: false }),
    ])
    setSales(s || []); setContacts(ct || []); setRegistrations(reg || []); setMeetings(mt || []); setCalls(pc || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const save = async (field, value) => { setC(x => ({ ...x, [field]: value })); await updateField('customers', c, field, value) }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!c) return <div className="card"><div className="empty">לקוח לא נמצא.</div></div>

  const isXcon = c.business_unit === 'Xcon'

  const related = [
    { key: 'sales', label: 'מכירות', count: sales.length, rows: sales, onOpen: r => `/sales/${r.id}`,
      resource: 'sales', fk: 'customer_id', recordId: id,
      listColumns: [
        { source: 'deal_name', label: 'עסקה', render: r => r.deal_name || '-' },
        { source: 'stage', label: 'שלב', render: r => <span className="badge mp">{r.stage}</span> },
      ],
      columns: [{ label: 'עסקה', get: r => r.deal_name || '-' }, { label: 'שלב', get: r => <span className="badge mp">{r.stage}</span> }] },
    { key: 'registrations', label: 'הרשמות', count: registrations.length, rows: registrations, onOpen: r => `/registrations/${r.id}`,
      resource: 'registrations', fk: 'customer_id', recordId: id,
      listColumns: [
        { source: 'registration_name', label: 'הרשמה', render: r => r.registration_name || '-' },
        { source: 'status', label: 'סטטוס', render: r => <span className={`badge ${REGISTRATION_STATUS_BADGE[r.status] || 'gray'}`}>{r.status}</span> },
      ],
      columns: [{ label: 'הרשמה', get: r => r.registration_name || '-' }, { label: 'סטטוס', get: r => <span className={`badge ${REGISTRATION_STATUS_BADGE[r.status] || 'gray'}`}>{r.status}</span> }] },
    { key: 'contacts', label: 'אנשי קשר', count: contacts.length, rows: contacts,
      columns: [{ label: 'שם', get: r => r.name }, { label: 'טלפון', get: r => r.phone || '-' }, { label: 'תפקיד', get: r => r.role || '-' }] },
    // Resource-mode chips (paginated, sortable, exportable — the same
    // mechanism JourneyDetail uses for its "הרשמות" chip), not a static
    // inline table: meetings/phone_calls are now standalone entities with
    // their own list+detail screens (Meetings.jsx/PhoneCalls.jsx), so the
    // chip here is just a filtered view into them, not a duplicate of them.
    // `filter` (not `fk`/`recordId`) because the relation is polymorphic
    // (related_type + related_id, not a single FK column).
    { key: 'meetings', label: 'פגישות', count: meetings.length, onOpen: r => `/meetings/${r.id}`,
      resource: 'meetings', filter: { related_type: 'customer', related_id: id },
      listColumns: [
        { source: 'subject', label: 'נושא', render: r => r.subject },
        { source: 'start_at', label: 'תאריך ושעה', render: r => r.start_at ? new Date(r.start_at).toLocaleString('he-IL') : '-' },
        { source: 'type', label: 'סוג', render: r => r.type || '-' },
      ] },
    { key: 'calls', label: 'שיחות', count: calls.length, onOpen: r => `/phone-calls/${r.id}`,
      resource: 'phone_calls', filter: { related_type: 'customer', related_id: id },
      listColumns: [
        { source: 'direction', label: 'כיוון', render: r => r.direction },
        { source: 'occurred_at', label: 'תאריך', render: r => r.occurred_at ? new Date(r.occurred_at).toLocaleString('he-IL') : '-' },
        { source: 'result', label: 'תוצאה', render: r => r.result || '-' },
      ] },
  ]

  const waHref = c.mobile_phone
    ? `https://wa.me/972${c.mobile_phone.replace(/\D/g, '').replace(/^0/, '')}`
    : null

  const actions = [
    ...(waHref ? [{ icon: 'message', title: 'וואטסאפ', href: waHref }] : []),
    { icon: 'calendar', title: 'פגישה חדשה', onClick: () => setShowNewMeeting(true) },
  ]

  return (
    <RecordLayout
      title={`${c.first_name} ${c.last_name}`}
      subtitle={c.business_unit}
      backTo="/customers"
      status={{ label: c.status, badge: STATUS_BADGE[c.status] || 'gray' }}
      actions={actions}
      objectType="customer" recordId={id}
      recordType="customer" record={c} onRelatedCreated={() => load()}
      related={related}
    >
      <div className="card">
        <div className="sections-tabs">{SECTIONS.map(s => <div key={s} className={`sec-tab ${sec === s ? 'active' : ''}`} onClick={() => setSec(s)}>{s}</div>)}</div>
        {sec === 'פרטים' && <div className="field-grid">
          <EditField label="שם פרטי" value={c.first_name} onSave={v => save('first_name', v)} />
          <EditField label="שם משפחה" value={c.last_name} onSave={v => save('last_name', v)} />
          <EditField label="טלפון נייד" value={c.mobile_phone} ltr onSave={v => save('mobile_phone', v)} />
          <EditField label="אימייל" value={c.email} ltr onSave={v => save('email', v)} />
          <EditField label="יחידה עסקית" value={c.business_unit} readOnly readOnlyReason="נקבע בעת יצירת הלקוח ולא ניתן לשינוי" />
          <EditField label="מקור הגעה" value={c.lead_source} type="select" options={enumOpts(LEAD_SOURCES)} onSave={v => save('lead_source', v)} />
          <EditField label="קמפיין" value={c.campaign} onSave={v => save('campaign', v)} />
          <EditField label="סטטוס לקוח" value={c.status} type="select" options={enumOpts(CUSTOMER_STATUSES)} onSave={v => save('status', v)} />
          <EditField label="תאריך פנייה ראשונה" value={c.first_contact_at?.slice(0, 10)} readOnly readOnlyReason="נחתם אוטומטית ביצירת הרשומה" />
          {isXcon && <EditField label="חברה" value={c.company} onSave={v => save('company', v)} />}
          {isXcon && <EditField label="תפקיד" value={c.job_title} onSave={v => save('job_title', v)} />}
          {isXcon && <EditField label="מייל עבודה" value={c.work_email} ltr onSave={v => save('work_email', v)} />}
        </div>}
        {sec === 'מועדון' && <div className="field-grid">
          <EditField label="דירוג ליד" value={c.lead_rating} type="select" options={enumOpts(LEAD_RATINGS)} onSave={v => save('lead_rating', v)} />
          <EditField label="חבר מועדון" value={c.club_member} type="checkbox" onSave={v => save('club_member', v)} />
          <EditField label="תאריך הצטרפות למועדון" value={c.club_joined_at} type="date" onSave={v => save('club_joined_at', v)} />
          <EditField label="יתרת קרדיט" value={c.credit_balance} type="number" onSave={v => save('credit_balance', v)} />
          <EditField label="רמת ניסיון באקסטרים" value={c.extreme_experience_level} type="select" options={enumOpts(EXPERIENCE_LEVELS)} onSave={v => save('extreme_experience_level', v)} />
          <EditField label="שפה מועדפת" value={c.preferred_language} type="select" options={enumOpts(PREFERRED_LANGUAGES)} onSave={v => save('preferred_language', v)} />
        </div>}
        <div style={{ marginTop: 10 }}><EditField label="הערות" value={c.notes} type="textarea" onSave={v => save('notes', v)} /></div>
      </div>
      {showNewMeeting && (
        <MeetingFormModal defaultRelatedType="customer" defaultRelatedId={id} defaultUnit={c.business_unit}
          onClose={() => setShowNewMeeting(false)} onCreated={() => { setShowNewMeeting(false); load() }} />
      )}
    </RecordLayout>
  )
}
