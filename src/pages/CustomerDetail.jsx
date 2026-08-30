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

const STATUS_BADGE = { 'ליד חדש': 'mp', 'בטיפול': 'warn', 'לקוח פעיל': 'ok', 'לקוח עבר': 'gray', 'לא רלוונטי': 'gray' }
const SECTIONS = ['פרטים', 'מועדון']

export default function CustomerDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [sales, setSales] = useState([])
  const [contacts, setContacts] = useState([])
  const [sec, setSec] = useState('פרטים')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').eq('id', id).single()
    setC(data)
    const [{ data: s }, { data: ct }] = await Promise.all([
      supabase.from('sales').select('id, deal_name, stage').eq('customer_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
    ])
    setSales(s || []); setContacts(ct || []); setLoading(false)
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
    { key: 'contacts', label: 'אנשי קשר', count: contacts.length, rows: contacts,
      columns: [{ label: 'שם', get: r => r.name }, { label: 'טלפון', get: r => r.phone || '-' }, { label: 'תפקיד', get: r => r.role || '-' }] },
  ]

  const waHref = c.mobile_phone
    ? `https://wa.me/972${c.mobile_phone.replace(/\D/g, '').replace(/^0/, '')}`
    : null

  return (
    <RecordLayout
      title={`${c.first_name} ${c.last_name}`}
      subtitle={c.business_unit}
      backTo="/customers"
      status={{ label: c.status, badge: STATUS_BADGE[c.status] || 'gray' }}
      actions={waHref ? [{ icon: 'message', title: 'וואטסאפ', href: waHref }] : []}
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
          <EditField label="יחידה עסקית" value={c.business_unit} readOnly />
          <EditField label="מקור הגעה" value={c.lead_source} type="select" options={enumOpts(LEAD_SOURCES)} onSave={v => save('lead_source', v)} />
          <EditField label="קמפיין" value={c.campaign} onSave={v => save('campaign', v)} />
          <EditField label="סטטוס לקוח" value={c.status} type="select" options={enumOpts(CUSTOMER_STATUSES)} onSave={v => save('status', v)} />
          <EditField label="תאריך פנייה ראשונה" value={c.first_contact_at?.slice(0, 10)} readOnly />
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
    </RecordLayout>
  )
}
