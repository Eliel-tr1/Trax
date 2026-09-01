import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from './Toaster'
import { deleteConfirmDialog } from './Dialogs'
import Icon from './Icon'
import EditableCell from './EditableCell'
import AddPassengerModal from './AddPassengerModal'
import { PhoneDisplay } from './PhoneInput'
import { PASSENGER_GENDERS, PASSENGER_LANGUAGES } from '../lib/constants'

// Additional-passengers section for RegistrationDetail — every row in
// registration_passengers for this registration. Shown as a compact
// name+key-info row per passenger (click to expand full inline-editable
// details, same EditableCell click-to-edit pattern as the rest of the app)
// so the whole registered party is visible at a glance. Adding a passenger
// opens AddPassengerModal instead of an inline quick-add row.
export default function RegistrationPassengers({ registrationId, onCountChange }) {
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('registration_passengers')
      .select('*').eq('registration_id', registrationId)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: true })
    setRows(data || [])
    onCountChange?.((data || []).length)
  }
  useEffect(() => { load() }, [registrationId])

  const removePassenger = async (row) => {
    if (!await deleteConfirmDialog(`להסיר את ${row.full_name || 'הנוסע'} מההרשמה?`, { confirmText: 'הסרה' })) return
    const { error } = await supabase.from('registration_passengers').delete().eq('id', row.id)
    if (error) { toast('ההסרה נכשלה: ' + error.message, 'err'); return }
    toast('הוסר'); load()
  }

  if (!rows) return <div className="empty small" style={{ padding: '10px 0' }}><span className="spinner" /></div>

  const genderOpts = PASSENGER_GENDERS.map(g => ({ value: g, label: g }))
  const languageOpts = PASSENGER_LANGUAGES.map(l => ({ value: l, label: l }))

  return (
    <div>
      {rows.length === 0 ? (
        <div className="empty small" style={{ marginBottom: 10 }}>אין עדיין נוסעים על ההרשמה הזו</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {rows.map(row => {
            const open = expanded === row.id
            const subtitle = [row.phone ? null : null, row.age != null ? `גיל ${row.age}` : null, row.gender || null].filter(Boolean).join(' · ')
            return (
              <div key={row.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div
                  className="row"
                  style={{ gap: 10, padding: '9px 12px', cursor: 'pointer', alignItems: 'center' }}
                  onClick={() => setExpanded(open ? null : row.id)}
                >
                  <Icon name="chevron" size={13} style={{ transform: open ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform .15s', flexShrink: 0, color: 'var(--text-3)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                      {row.is_primary && <span className="badge mp" title="הנוסע העיקרי, נוצר אוטומטית מפרטי הלקוח">★ לקוח</span>}
                      <strong style={{ fontSize: '0.92rem' }}>{row.full_name || 'נוסע ללא שם'}</strong>
                    </div>
                    {subtitle && <div className="muted small">{subtitle}</div>}
                  </div>
                  {row.phone && <span className="muted small" dir="ltr" style={{ flexShrink: 0 }}><PhoneDisplay value={row.phone} /></span>}
                  <button
                    className="btn subtle sm" style={{ color: 'var(--err)', padding: '2px 6px', flexShrink: 0 }}
                    onClick={e => { e.stopPropagation(); removePassenger(row) }} title="הסרת נוסע"
                  ><Icon name="x" size={13} /></button>
                </div>

                {open && (
                  <div style={{ padding: '4px 12px 12px', borderTop: '1px solid var(--border-soft)' }} onClick={e => e.stopPropagation()}>
                    <div className="ef"><span className="ef-label">שם מלא</span><span className="ef-val"><EditableCell row={row} field="full_name" table="registration_passengers" onSaved={load} /></span></div>
                    <div className="ef"><span className="ef-label">טלפון</span><span className="ef-val"><EditableCell row={row} field="phone" mode="phone" table="registration_passengers" onSaved={load} /></span></div>
                    <div className="ef"><span className="ef-label">אימייל</span><span className="ef-val" dir="ltr"><EditableCell row={row} field="email" table="registration_passengers" onSaved={load} /></span></div>
                    <div className="ef"><span className="ef-label">גיל</span><span className="ef-val"><EditableCell row={row} field="age" table="registration_passengers" type="number" onSaved={load} /></span></div>
                    <div className="ef"><span className="ef-label">מין</span><span className="ef-val"><EditableCell row={row} field="gender" table="registration_passengers" mode="select" options={genderOpts} onSaved={load} /></span></div>
                    <div className="ef"><span className="ef-label">שפה</span><span className="ef-val"><EditableCell row={row} field="language" table="registration_passengers" mode="select" options={languageOpts} onSaved={load} /></span></div>
                    <div className="ef"><span className="ef-label">מגבלות רפואיות / פיזיות</span><span className="ef-val"><EditableCell row={row} field="medical_notes" table="registration_passengers" onSaved={load} /></span></div>
                    <div className="ef" style={{ borderBottom: 'none' }}><span className="ef-label">העדפות תזונה</span><span className="ef-val"><EditableCell row={row} field="dietary_notes" table="registration_passengers" onSaved={load} /></span></div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button className="btn subtle sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> הוספת נוסע</button>

      {adding && (
        <AddPassengerModal registrationId={registrationId} onClose={() => setAdding(false)} onAdded={load} />
      )}
    </div>
  )
}
