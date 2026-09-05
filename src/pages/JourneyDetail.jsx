import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { supabase } from '../lib/supabase'
import { updateField, loadOptions } from '../lib/api'
import {
  JOURNEY_DESTINATIONS, JOURNEY_STATUSES, CURRENCIES, enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'
import { PhoneDisplay } from '../components/PhoneInput'
import Icon from '../components/Icon'
import { toast } from '../components/Toaster'
import { exportJourneyPdf } from '../lib/pdf'
import { formatDate, formatCurrency } from '../lib/format'
import StatusBadge, { badgeClassFor } from '../components/StatusBadge'
import FieldTabs from '../components/FieldTabs'
import SystemFieldsTab from '../components/SystemFieldsTab'
import Checklist from '../components/RegistrationChecklist'
import { registrationColumns } from './Registrations'
import { salesColumns } from './Sales'

export default function JourneyDetail() {
  const { id } = useParams()
  const refresh = useRefresh()
  const [j, setJ] = useState(null)
  const [regs, setRegs] = useState([])
  const [salesRows, setSalesRows] = useState([])
  const [passengersByReg, setPassengersByReg] = useState({})
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [opts, setOpts] = useState({})
  const users = opts.users || []

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('journeys').select('*').eq('id', id).single()
    setJ(data)
    loadOptions().then(setOpts)
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('registrations')
        .select('id, registration_name, status, amount_paid, currency')
        .eq('journey_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
      // Sales processes linked to this journey (Sahar: "אני רוצה לראות גם
      // כמה תהליכי מכירה יש לי משם, ולא רק כמה הרשמות")
      supabase.from('sales')
        .select('id, deal_name, stage, status, amount, currency')
        .eq('journey_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
    ])
    setRegs(r || [])
    setSalesRows(s || [])
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

  // listColumns reuses Registrations.jsx's own column builder — see the
  // comment on CustomerDetail.jsx's `related` array for why.
  const related = [
    { key: 'sales', label: 'תהליכי מכירה', count: salesRows.length, rows: salesRows, onOpen: s => `/sales/${s.id}`,
      resource: 'sales', fk: 'journey_id', recordId: id,
      listColumns: salesColumns(opts, refresh) },
    { key: 'registrations', label: 'הרשמות', count: regs.length, rows: regs, onOpen: r => `/registrations/${r.id}`,
      resource: 'registrations', fk: 'journey_id', recordId: id,
      listColumns: registrationColumns(opts, refresh) },
  ]

  return (
    <RecordLayout
      title={j.name}
      subtitle={`${j.destination || ''} · ${j.business_unit}${totalPassengers ? ` · ${totalPassengers} נוסעים` : ''}`}
      backTo="/journeys"
      status={{ label: j.status, badge: badgeClassFor('journey', 'status', j.status) }}
      actions={[{ icon: 'file', title: exporting ? 'מייצא…' : 'ייצוא PDF', onClick: exporting ? undefined : doExport }]}
      objectType="journey" recordId={id}
      recordType="journey" record={j} onRelatedCreated={() => load()}
      related={related}
      feedProps={{ allowTasks: false }}
    >
      <div className="card">
        <div className="field-grid">
          <EditField label="שם היציאה" value={j.name} onSave={v => save('name', v)} />
          <EditField label="יעד" value={j.destination} type="select" options={enumOpts(JOURNEY_DESTINATIONS)} onSave={v => save('destination', v)} />
          <EditField label="תאריך יציאה" value={j.departure_date} display={formatDate(j.departure_date)} type="date" onSave={v => save('departure_date', v)} />
          <EditField label="תאריך חזרה" value={j.return_date} display={formatDate(j.return_date)} type="date" onSave={v => save('return_date', v)} />
          <EditField label="סטטוס יציאה" value={j.status} type="select" options={enumOpts(JOURNEY_STATUSES)} required
            display={<StatusBadge value={j.status} field="status" resource="journey" />} onSave={v => save('status', v)} />
          <EditField label="מספר מקומות" value={j.seats_total} type="number" onSave={v => save('seats_total', v)} />
          <EditField label="מינימום להוצאה לדרך" value={j.min_seats} type="number" onSave={v => save('min_seats', v)} />
          <EditField label="מקומות שנמכרו" value={j.seats_sold} readOnly readOnlyReason="שדה מחושב אוטומטית, ספירת ההרשמות הפעילות למסע זה" />
          <EditField label="מקומות פנויים" value={j.seats_available} readOnly readOnlyReason="שדה מחושב אוטומטית, מספר מקומות פחות מקומות שנמכרו" />
          <EditField label="מחיר לאדם" value={j.price_per_person} display={formatCurrency(j.price_per_person, j.currency)} type="number" onSave={v => save('price_per_person', v)} />
          <EditField label="מטבע" value={j.currency} type="select" options={CURRENCIES} onSave={v => save('currency', v)} />
          <EditField label="כולל טיסות" value={j.includes_flights} type="checkbox" onSave={v => save('includes_flights', v)} />
          <EditField label="קישור לעמוד המסע" value={j.page_url} ltr type="link" onSave={v => save('page_url', v)} />
        </div>
        <div style={{ marginTop: 10 }}><EditField label="תיאור קצר" value={j.short_description} type="textarea" onSave={v => save('short_description', v)} /></div>
        <div style={{ marginTop: 10 }}><EditField label="פירוט מלא (מסלול, ימים, מקומות)" value={j.itinerary} type="textarea" onSave={v => save('itinerary', v)} /></div>
        <div style={{ marginTop: 10 }}><EditField label="הערות תפעול" value={j.operations_notes} type="textarea" onSave={v => save('operations_notes', v)} /></div>

        <Checklist ownerTable="journeys" ownerId={j.id} title="צ'קליסט התארגנות המסע" />

        <FieldTabs tabs={[
          {
            key: 'system', label: 'שדות מערכת', content: <SystemFieldsTab record={j} users={users} onSaveBusinessUnit={v => save('business_unit', v)} />,
          },
        ]} />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><Icon name="users" /> נוסעים במסע ({totalPassengers})</div>
        {!regs.length ? (
          <div className="empty small">אין עדיין הרשמות למסע זה</div>
        ) : (
          // One compact row per passenger, grouped under its registration —
          // same dense-list look as ActivityFeed's feed-task rows, instead
          // of the old wide multi-column table whose rows wrapped across
          // several lines and cluttered the screen (client feedback).
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {regs.map(r => {
              const passengers = passengersByReg[r.id] || []
              return (
                <div key={r.id}>
                  <div className="small" style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-2)' }}>{r.registration_name || '-'}</div>
                  {!passengers.length ? (
                    <div className="muted small">אין נוסעים רשומים</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {passengers.map(p => {
                        const subtitle = [p.age != null ? `גיל ${p.age}` : null, p.gender || null].filter(Boolean).join(' · ')
                        return (
                          <div key={p.id} className="row" style={{ gap: 10, padding: '9px 13px', borderRadius: 'var(--r)', background: 'var(--surface)', border: '1.5px solid var(--border-soft)', alignItems: 'center' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                                {p.is_primary && <span className="badge mp">לקוח</span>}
                                <strong style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.full_name || 'נוסע ללא שם'}</strong>
                              </div>
                              {subtitle && <div className="muted small">{subtitle}</div>}
                            </div>
                            <span className="small" dir="ltr" style={{ flexShrink: 0 }}><PhoneDisplay value={p.phone} /></span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </RecordLayout>
  )
}
