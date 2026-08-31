import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField } from '../lib/api'
import {
  JOURNEY_DESTINATIONS, JOURNEY_STATUSES, CURRENCIES, enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import Icon from '../components/Icon'
import { toast } from '../components/Toaster'
import { exportJourneyPdf } from '../lib/pdf'
import { JOURNEY_STATUS_BADGE } from './Journeys'
import { REGISTRATION_STATUS_BADGE } from './Registrations'

export default function JourneyDetail() {
  const { id } = useParams()
  const [j, setJ] = useState(null)
  const [regs, setRegs] = useState([])
  const [passengersByReg, setPassengersByReg] = useState({})
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('journeys').select('*').eq('id', id).single()
    setJ(data)
    const { data: r } = await supabase.from('registrations')
      .select('id, registration_name, status, amount_paid, currency')
      .eq('journey_id', id).is('deleted_at', null).order('created_at', { ascending: false })
    setRegs(r || [])
    const regIds = (r || []).map(x => x.id)
    if (regIds.length) {
      // Combined passenger list across every registration on this journey
      // (registration_passengers joined through registrations) — used both
      // by the on-screen table below and the PDF export.
      const { data: p } = await supabase.from('registration_passengers').select('*').in('registration_id', regIds)
      const byReg = {}
      for (const passenger of p || []) (byReg[passenger.registration_id] ||= []).push(passenger)
      setPassengersByReg(byReg)
    } else {
      setPassengersByReg({})
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const save = async (field, value) => { setJ(x => ({ ...x, [field]: value })); await updateField('journeys', j, field, value) }

  const doExport = async () => {
    setExporting(true)
    try {
      const groups = regs.map(r => ({ registration: r, passengers: passengersByReg[r.id] || [] }))
      await exportJourneyPdf(j, groups)
    } catch (e) {
      toast('ייצוא ה-PDF נכשל: ' + e.message, 'err')
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!j) return <div className="card"><div className="empty">מסע לא נמצא.</div></div>

  const totalPassengers = Object.values(passengersByReg).reduce((n, arr) => n + arr.length, 0)

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
      subtitle={`${j.destination || ''} · ${j.business_unit}${totalPassengers ? ` · ${totalPassengers} נוסעים` : ''}`}
      backTo="/journeys"
      status={{ label: j.status, badge: JOURNEY_STATUS_BADGE[j.status] || 'gray' }}
      actions={[{ icon: 'file', title: exporting ? 'מייצא…' : 'ייצוא PDF', onClick: exporting ? undefined : doExport }]}
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><Icon name="users" /> נוסעים במסע ({totalPassengers})</div>
        {!regs.length ? (
          <div className="empty small">אין עדיין הרשמות למסע זה</div>
        ) : (
          <>
            {/* Desktop/tablet: 8-column grid, grouped by registration. Below
                `sm` this collapses to a card per passenger (same split as
                RegistrationPassengers) — an 8-column table in a 375px page
                forced horizontal scroll inside a sliver of a container. */}
            <div className="table-wrap hidden sm:block">
              <table className="grid">
                <thead>
                  <tr>
                    <th>הרשמה</th><th>שם מלא</th><th>טלפון</th><th>אימייל</th><th>גיל</th><th>מין</th>
                    <th>מגבלות רפואיות / פיזיות</th><th>העדפות תזונה</th>
                  </tr>
                </thead>
                <tbody>
                  {regs.flatMap(r => {
                    const passengers = passengersByReg[r.id] || []
                    if (!passengers.length) {
                      return [
                        <tr key={r.id}>
                          <td style={{ fontWeight: 600 }}>{r.registration_name || '-'}</td>
                          <td colSpan={7} className="muted small">אין נוסעים רשומים</td>
                        </tr>,
                      ]
                    }
                    return passengers.map((p, i) => (
                      <tr key={p.id}>
                        {i === 0 && <td rowSpan={passengers.length} style={{ fontWeight: 600, verticalAlign: 'top' }}>{r.registration_name || '-'}</td>}
                        <td>{p.is_primary && <span className="badge mp" style={{ marginInlineEnd: 6 }}>לקוח</span>}{p.full_name}</td>
                        <td dir="ltr">{p.phone || '-'}</td>
                        <td dir="ltr">{p.email || '-'}</td>
                        <td>{p.age ?? '-'}</td>
                        <td>{p.gender || '-'}</td>
                        <td>{p.medical_notes || '-'}</td>
                        <td>{p.dietary_notes || '-'}</td>
                      </tr>
                    ))
                  })}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {regs.map(r => {
                const passengers = passengersByReg[r.id] || []
                return (
                  <div key={r.id}>
                    <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>{r.registration_name || '-'}</div>
                    {!passengers.length ? (
                      <div className="muted small">אין נוסעים רשומים</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {passengers.map(p => (
                          <div key={p.id} className="card" style={{ padding: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.is_primary && <span className="badge mp" style={{ marginInlineEnd: 6 }}>לקוח</span>}{p.full_name}</div>
                            <div className="ef"><span className="ef-label">טלפון</span><span className="ef-val" dir="ltr">{p.phone || '-'}</span></div>
                            <div className="ef"><span className="ef-label">אימייל</span><span className="ef-val" dir="ltr">{p.email || '-'}</span></div>
                            <div className="ef"><span className="ef-label">גיל</span><span className="ef-val">{p.age ?? '-'}</span></div>
                            <div className="ef"><span className="ef-label">מין</span><span className="ef-val">{p.gender || '-'}</span></div>
                            <div className="ef"><span className="ef-label">מגבלות רפואיות / פיזיות</span><span className="ef-val">{p.medical_notes || '-'}</span></div>
                            <div className="ef" style={{ borderBottom: 'none' }}><span className="ef-label">העדפות תזונה</span><span className="ef-val">{p.dietary_notes || '-'}</span></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </RecordLayout>
  )
}
