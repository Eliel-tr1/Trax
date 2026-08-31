import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField } from '../lib/api'
import {
  REGISTRATION_STATUSES, CURRENCIES, PAYMENT_METHODS, enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import RegistrationPassengers from '../components/RegistrationPassengers'
import { REGISTRATION_STATUS_BADGE } from './Registrations'
import { formatDate, formatCurrency } from '../lib/format'

const SECTIONS = ['פרטים', 'נוסעים', 'תשלום ומסמכים']

export default function RegistrationDetail() {
  const { id } = useParams()
  const [r, setR] = useState(null)
  const [sec, setSec] = useState('פרטים')
  const [passengerCount, setPassengerCount] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [{ data }, { count }] = await Promise.all([
      supabase.from('registrations')
        .select('*, customer:customers(id,first_name,last_name), journey:journeys(id,name,departure_date), sale:sales(id,deal_name)')
        .eq('id', id).single(),
      supabase.from('registration_passengers').select('id', { count: 'exact', head: true }).eq('registration_id', id),
    ])
    setR(data)
    setPassengerCount(count ?? 0)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const save = async (field, value) => { setR(x => ({ ...x, [field]: value })); await updateField('registrations', r, field, value) }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!r) return <div className="card"><div className="empty">הרשמה לא נמצאה.</div></div>

  return (
    <RecordLayout
      title={r.registration_name || 'הרשמה חדשה'}
      subtitle={[
        r.journey ? `${r.journey.name}${r.journey.departure_date ? ' · ' + formatDate(r.journey.departure_date) : ''}` : null,
        passengerCount != null ? `${passengerCount} נוסעים` : null,
      ].filter(Boolean).join(' · ') || undefined}
      backTo="/registrations"
      status={{ label: r.status, badge: REGISTRATION_STATUS_BADGE[r.status] || 'gray' }}
      objectType="registration" recordId={id}
      recordType="registration" record={r} onRelatedCreated={() => load()}
    >
      <div className="card">
        <div className="sections-tabs">{SECTIONS.map(s => <div key={s} className={`sec-tab ${sec === s ? 'active' : ''}`} onClick={() => setSec(s)}>{s}</div>)}</div>
        {sec === 'פרטים' && <div className="field-grid">
          <EditField label="לקוח" value={r.customer_id} readOnly readOnlyReason="קישור ללקוח, נערך רק בעת יצירת ההרשמה"
            display={r.customer ? <Link to={`/customers/${r.customer_id}`} style={{ color: 'var(--mp)', fontWeight: 600 }}>{r.customer.first_name} {r.customer.last_name}</Link> : null} />
          <EditField label="מסע" value={r.journey_id} readOnly readOnlyReason="קישור למסע, נערך רק בעת יצירת ההרשמה"
            display={r.journey ? <Link to={`/journeys/${r.journey_id}`} style={{ color: 'var(--mp)', fontWeight: 600 }}>{r.journey.name}</Link> : null} />
          <EditField label="מכירה" value={r.sale_id} readOnly readOnlyReason="קישור למכירה, נערך רק בעת יצירת ההרשמה"
            display={r.sale ? <Link to={`/sales/${r.sale_id}`} style={{ color: 'var(--mp)', fontWeight: 600 }}>{r.sale.deal_name || 'עסקה'}</Link> : null} />
          <EditField label="סטטוס הרשמה" value={r.status} type="select" options={enumOpts(REGISTRATION_STATUSES)} onSave={v => save('status', v)} />
          <EditField label="כולל טיסה למשתתף זה" value={r.includes_flight_for_participant} type="checkbox" onSave={v => save('includes_flight_for_participant', v)} />
          <EditField label="איש קשר לחירום" value={r.emergency_contact} onSave={v => save('emergency_contact', v)} />
          <EditField label="תאריך הרשמה" value={r.registered_at} display={formatDate(r.registered_at)} readOnly readOnlyReason="נחתם אוטומטית ביצירת ההרשמה" />
        </div>}
        {sec === 'נוסעים' && <RegistrationPassengers registrationId={id} onCountChange={setPassengerCount} />}
        {sec === 'תשלום ומסמכים' && <div className="field-grid">
          <EditField label="סכום ששולם" value={r.amount_paid} display={formatCurrency(r.amount_paid, r.currency)} type="number" onSave={v => save('amount_paid', v)} />
          <EditField label="מטבע" value={r.currency} type="select" options={CURRENCIES} onSave={v => save('currency', v)} />
          <EditField label="תאריך תשלום אחרון" value={r.last_payment_date} display={formatDate(r.last_payment_date)} type="date" onSave={v => save('last_payment_date', v)} />
          <EditField label="אמצעי תשלום" value={r.payment_method} type="select" options={enumOpts(PAYMENT_METHODS)} onSave={v => save('payment_method', v)} />
          <EditField label="מספר חשבונית" value={r.invoice_number} onSave={v => save('invoice_number', v)} />
          <EditField label="דרכון בתוקף" value={r.passport_valid} type="checkbox" onSave={v => save('passport_valid', v)} />
          <EditField label="ביטוח נסיעות" value={r.travel_insurance} type="checkbox" onSave={v => save('travel_insurance', v)} />
        </div>}
        {sec === 'תשלום ומסמכים' && <div style={{ marginTop: 10 }}>
          <EditField label="הערות רפואיות או תזונתיות" value={r.medical_dietary_notes} type="textarea" onSave={v => save('medical_dietary_notes', v)} />
        </div>}
      </div>
    </RecordLayout>
  )
}
