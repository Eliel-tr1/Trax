import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { supabase } from '../lib/supabase'
import { updateField, loadOptions } from '../lib/api'
import {
  CUSTOMER_STATUSES, LEAD_SOURCES, LEAD_RATINGS, EXPERIENCE_LEVELS,
  PREFERRED_LANGUAGES, enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import UserPicker from '../components/UserPicker'
import { PhoneDisplay } from '../components/PhoneInput'
import { salesColumns } from './Sales'
import { registrationColumns } from './Registrations'
import { meetingsColumns } from './Meetings'
import { phoneCallsColumns } from './PhoneCalls'
import { formatDate } from '../lib/format'
import StatusBadge, { badgeClassFor } from '../components/StatusBadge'
import FieldTabs from '../components/FieldTabs'
import SystemFieldsTab from '../components/SystemFieldsTab'

const SECTIONS = ['פרטים', 'מועדון']

export default function CustomerDetail() {
  const { id } = useParams()
  const refresh = useRefresh()
  const [c, setC] = useState(null)
  const [sales, setSales] = useState([])
  const [contacts, setContacts] = useState([])
  const [registrations, setRegistrations] = useState([])
  const [meetings, setMeetings] = useState([])
  const [calls, setCalls] = useState([])
  const [sec, setSec] = useState('פרטים')
  const [loading, setLoading] = useState(true)
  const [opts, setOpts] = useState({})
  const users = opts.users || []

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').eq('id', id).single()
    setC(data)
    loadOptions().then(setOpts)
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

  // listColumns for the resource-mode chips below reuse the exact same
  // column builders as the standalone Sales/Registrations/Meetings/
  // PhoneCalls screens (see the comment on registrationColumns() in
  // Registrations.jsx) — before this, each chip declared its own hardcoded
  // 2-3 column subset, so the columns picker on a nested list could only
  // ever HIDE those 2-3 columns, never add any of the entity's real
  // columns. Reusing the same builder also keeps column order/defaults/
  // saved layout in sync with the main list screen (both write the same
  // app_users.prefs.columnLayout.<resource> key, keyed by `resource`, not
  // by this chip's own storeKey).
  const related = [
    { key: 'sales', label: 'מכירות', count: sales.length, rows: sales, onOpen: r => `/sales/${r.id}`,
      resource: 'sales', fk: 'customer_id', recordId: id,
      listColumns: salesColumns(opts, refresh) },
    { key: 'registrations', label: 'הרשמות', count: registrations.length, rows: registrations, onOpen: r => `/registrations/${r.id}`,
      resource: 'registrations', fk: 'customer_id', recordId: id,
      listColumns: registrationColumns(opts, refresh) },
    { key: 'contacts', label: 'אנשי קשר', count: contacts.length, rows: contacts,
      columns: [{ label: 'שם', get: r => r.name }, { label: 'טלפון', get: r => <PhoneDisplay value={r.phone} /> }, { label: 'תפקיד', get: r => r.role || '-' }] },
    // Resource-mode chips (paginated, sortable, exportable — the same
    // mechanism JourneyDetail uses for its "הרשמות" chip), not a static
    // inline table: meetings/phone_calls are now standalone entities with
    // their own list+detail screens (Meetings.jsx/PhoneCalls.jsx), so the
    // chip here is just a filtered view into them, not a duplicate of them.
    // `filter` (not `fk`/`recordId`) because the relation is polymorphic
    // (related_type + related_id, not a single FK column).
    { key: 'meetings', label: 'פגישות', count: meetings.length, onOpen: r => `/meetings/${r.id}`,
      resource: 'meetings', filter: { related_type: 'customer', related_id: id },
      listColumns: meetingsColumns(opts, refresh) },
    { key: 'calls', label: 'שיחות', count: calls.length, onOpen: r => `/phone-calls/${r.id}`,
      resource: 'phone_calls', filter: { related_type: 'customer', related_id: id },
      listColumns: phoneCallsColumns(users, refresh) },
  ]

  // mobile_phone is stored E.164 (e.g. "+972501234567") via PhoneInput —
  // wa.me wants the digits only, no leading '+' and no local-dial munging.
  const waHref = c.mobile_phone
    ? `https://wa.me/${c.mobile_phone.replace(/\D/g, '')}`
    : null

  const actions = [
    ...(waHref ? [{ icon: 'message', title: 'וואטסאפ', href: waHref }] : []),
  ]

  return (
    <RecordLayout
      title={`${c.first_name} ${c.last_name}`}
      subtitle={c.business_unit}
      backTo="/customers"
      status={{ label: c.status, badge: badgeClassFor('customer', 'status', c.status) }}
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
          <EditField label="טלפון נייד" value={c.mobile_phone} type="phone" onSave={v => save('mobile_phone', v)} />
          <EditField label="אימייל" value={c.email} ltr onSave={v => save('email', v)} />
          <EditField label="סטטוס לקוח" value={c.status} type="select" options={enumOpts(CUSTOMER_STATUSES)} required
            display={<StatusBadge value={c.status} field="status" resource="customer" />} onSave={v => save('status', v)} />
          <EditField label="תאריך פנייה ראשונה" value={c.first_contact_at} display={formatDate(c.first_contact_at)} readOnly readOnlyReason="נחתם אוטומטית ביצירת הרשומה" />
          <div className="ef">
            <span className="ef-label">מנהל לקוח</span>
            <UserPicker users={users} value={c.account_manager_id} onChange={v => save('account_manager_id', v)} placeholder="בחרו מנהל לקוח" />
          </div>
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

        <FieldTabs tabs={[
          {
            key: 'system', label: 'שדות מערכת', content: <SystemFieldsTab record={c} users={users} onSaveBusinessUnit={v => save('business_unit', v)} />,
          },
          // Same "נתונים שיווקיים" tab pattern SaleDetail.jsx uses for its
          // marketing fields — customers only carry lead_source/campaign
          // (no channel field, unlike sales, per schema.js/domain-model.md).
          {
            key: 'marketing', label: 'נתונים שיווקיים', content: <>
              <EditField label="מקור הגעה" value={c.lead_source} type="select" options={enumOpts(LEAD_SOURCES)} onSave={v => save('lead_source', v)} />
              <EditField label="קמפיין" value={c.campaign} onSave={v => save('campaign', v)} />
              <EditField label="שם טופס" value={c.form_name} onSave={v => save('form_name', v)} />
              <EditField label="אישור דיוור" value={c.marketing_consent} type="checkbox" onSave={v => save('marketing_consent', v)} />
              {/* UTM — written automatically by the WF05a lead-intake integration
                  (docs/decisions/0006), editable here like everything else. */}
              <EditField label="UTM Source" value={c.utm_source} onSave={v => save('utm_source', v)} />
              <EditField label="UTM Medium" value={c.utm_medium} onSave={v => save('utm_medium', v)} />
              <EditField label="UTM Campaign" value={c.utm_campaign} onSave={v => save('utm_campaign', v)} />
              <EditField label="UTM Content" value={c.utm_content} onSave={v => save('utm_content', v)} />
              <EditField label="UTM Term" value={c.utm_term} onSave={v => save('utm_term', v)} />
              <EditField label="Funnel" value={c.funnel} onSave={v => save('funnel', v)} />
              <EditField label="UTM Ad Set" value={c.utm_adset} onSave={v => save('utm_adset', v)} />
              <EditField label="UTM Ad" value={c.utm_ad} onSave={v => save('utm_ad', v)} />
              <EditField label="UTM Placement" value={c.utm_placement} onSave={v => save('utm_placement', v)} />
              <EditField label="עמוד נחיתה" value={c.landing_page} onSave={v => save('landing_page', v)} />
              <EditField label="מפנה (Referrer)" value={c.referrer} onSave={v => save('referrer', v)} />
            </>,
          },
        ]} />
      </div>
    </RecordLayout>
  )
}
