import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField } from '../lib/api'
import {
  JOURNEY_DESTINATIONS, JOURNEY_STATUSES, CURRENCIES, enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import { JOURNEY_STATUS_BADGE } from './Journeys'
import { REGISTRATION_STATUS_BADGE } from './Registrations'

export default function JourneyDetail() {
  const { id } = useParams()
  const [j, setJ] = useState(null)
  const [regs, setRegs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('journeys').select('*').eq('id', id).single()
    setJ(data)
    const { data: r } = await supabase.from('registrations')
      .select('id, registration_name, status, amount_paid, currency')
      .eq('journey_id', id).is('deleted_at', null).order('created_at', { ascending: false })
    setRegs(r || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const save = async (field, value) => { setJ(x => ({ ...x, [field]: value })); await updateField('journeys', j, field, value) }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!j) return <div className="card"><div className="empty">מסע לא נמצא.</div></div>

  const related = [
    { key: 'registrations', label: 'הרשמות', count: regs.length, rows: regs, onOpen: r => `/registrations/${r.id}`,
      resource: 'registrations', fk: 'journey_id', recordId: id,
      listColumns: [
        { source: 'registration_name', label: 'הרשמה', render: r => r.registration_name || '-' },
        { source: 'status', label: 'סטטוס', render: r => <span className={`badge ${REGISTRATION_STATUS_BADGE[r.status] || 'gray'}`}>{r.status}</span> },
        { source: 'amount_paid', label: 'שולם', render: r => r.amount_paid != null ? `${r.amount_paid} ${r.currency || ''}` : '-' },
      ],
      columns: [
        { label: 'הרשמה', get: r => r.registration_name || '-' },
        { label: 'סטטוס', get: r => <span className={`badge ${REGISTRATION_STATUS_BADGE[r.status] || 'gray'}`}>{r.status}</span> },
      ] },
  ]

  return (
    <RecordLayout
      title={j.name}
      subtitle={`${j.destination || ''} · ${j.business_unit}`}
      backTo="/journeys"
      status={{ label: j.status, badge: JOURNEY_STATUS_BADGE[j.status] || 'gray' }}
      objectType="journey" recordId={id}
      recordType="journey" record={j} onRelatedCreated={() => load()}
      related={related}
      feedProps={{ allowTasks: false }}
    >
      <div className="card">
        <div className="field-grid">
          <EditField label="שם היציאה" value={j.name} onSave={v => save('name', v)} />
          <EditField label="יחידה עסקית" value={j.business_unit} readOnly readOnlyReason="נקבע בעת יצירת המסע ולא ניתן לשינוי" />
          <EditField label="יעד" value={j.destination} type="select" options={enumOpts(JOURNEY_DESTINATIONS)} onSave={v => save('destination', v)} />
          <EditField label="תאריך יציאה" value={j.departure_date} type="date" onSave={v => save('departure_date', v)} />
          <EditField label="תאריך חזרה" value={j.return_date} type="date" onSave={v => save('return_date', v)} />
          <EditField label="סטטוס יציאה" value={j.status} type="select" options={enumOpts(JOURNEY_STATUSES)} onSave={v => save('status', v)} />
          <EditField label="מספר מקומות" value={j.seats_total} type="number" onSave={v => save('seats_total', v)} />
          <EditField label="מינימום להוצאה לדרך" value={j.min_seats} type="number" onSave={v => save('min_seats', v)} />
          <EditField label="מקומות שנמכרו" value={j.seats_sold} readOnly readOnlyReason="שדה מחושב אוטומטית — ספירת ההרשמות הפעילות למסע זה" />
          <EditField label="מקומות פנויים" value={j.seats_available} readOnly readOnlyReason="שדה מחושב אוטומטית — מספר מקומות פחות מקומות שנמכרו" />
          <EditField label="מחיר לאדם" value={j.price_per_person} type="number" onSave={v => save('price_per_person', v)} />
          <EditField label="מטבע" value={j.currency} type="select" options={CURRENCIES} onSave={v => save('currency', v)} />
          <EditField label="כולל טיסות" value={j.includes_flights} type="checkbox" onSave={v => save('includes_flights', v)} />
          <EditField label="קישור לעמוד המסע" value={j.page_url} ltr type="link" onSave={v => save('page_url', v)} />
        </div>
        <div style={{ marginTop: 10 }}><EditField label="תיאור קצר" value={j.short_description} type="textarea" onSave={v => save('short_description', v)} /></div>
        <div style={{ marginTop: 10 }}><EditField label="הערות תפעול" value={j.operations_notes} type="textarea" onSave={v => save('operations_notes', v)} /></div>
      </div>
    </RecordLayout>
  )
}
