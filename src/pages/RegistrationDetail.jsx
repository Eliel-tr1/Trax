import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField } from '../lib/api'
import {
  REGISTRATION_STATUSES, CURRENCIES, PAYMENT_METHODS, enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import { REGISTRATION_STATUS_BADGE } from './Registrations'

const SECTIONS = ['פרטים', 'תשלום ומסמכים']

export default function RegistrationDetail() {
  const { id } = useParams()
  const [r, setR] = useState(null)
  const [sec, setSec] = useState('פרטים')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('registrations')
      .select('*, customer:customers(id,first_name,last_name), journey:journeys(id,name,departure_date), sale:sales(id,deal_name)')
      .eq('id', id).single()
    setR(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const save = async (field, value) => { setR(x => ({ ...x, [field]: value })); await updateField('registrations', r, field, value) }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!r) return <div className="card"><div className="empty">הרשמה לא נמצאה.</div></div>

  return (
    <RecordLayout
      title={r.registration_name || 'הרשמה חדשה'}
      subtitle={r.journey ? `${r.journey.name}${r.journey.departure_date ? ' · ' + new Date(r.journey.departure_date).toLocaleDateString('he-IL') : ''}` : undefined}
      backTo="/registrations"
      status={{ label: r.status, badge: REGISTRATION_STATUS_BADGE[r.status] || 'gray' }}
      objectType="registration" recordId={id}
      recordType="registration" record={r} onRelatedCreated={() => load()}
    >
      <div className="card">
        <div className="sections-tabs">{SECTIONS.map(s => <div key={s} className={`sec-tab ${sec === s ? 'active' : ''}`} onClick={() => setSec(s)}>{s}</div>)}</div>
        {sec === 'פרטים' && <div className="field-grid">
          <EditField label="לקוח" value={r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : ''} readOnly />
          <EditField label="מסע" value={r.journey?.name} readOnly />
          <EditField label="מכירה" value={r.sale?.deal_name || '-'} readOnly />
          <EditField label="סטטוס הרשמה" value={r.status} type="select" options={enumOpts(REGISTRATION_STATUSES)} onSave={v => save('status', v)} />
          <EditField label="כולל טיסה למשתתף זה" value={r.includes_flight_for_participant} type="checkbox" onSave={v => save('includes_flight_for_participant', v)} />
          <EditField label="איש קשר לחירום" value={r.emergency_contact} onSave={v => save('emergency_contact', v)} />
          <EditField label="תאריך הרשמה" value={r.registered_at?.slice(0, 10)} readOnly />
        </div>}
        {sec === 'תשלום ומסמכים' && <div className="field-grid">
          <EditField label="סכום ששולם" value={r.amount_paid} type="number" onSave={v => save('amount_paid', v)} />
          <EditField label="מטבע" value={r.currency} type="select" options={CURRENCIES} onSave={v => save('currency', v)} />
          <EditField label="תאריך תשלום אחרון" value={r.last_payment_date} type="date" onSave={v => save('last_payment_date', v)} />
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
