import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from './Toaster'
import { confirmDialog } from './Dialogs'
import Icon from './Icon'
import EditableCell from './EditableCell'
import { PASSENGER_GENDERS, PASSENGER_LANGUAGES } from '../lib/constants'

// Additional-passengers section for RegistrationDetail — every row in
// registration_passengers for this registration, each cell inline-editable
// (EditableCell, same click-to-edit pattern as the rest of the app), plus a
// lightweight "+" quick-add row (no modal) so adding a group of travellers
// stays fast. onCountChange bubbles the live count up so the parent can
// show "X נוסעים" next to the record title.
export default function RegistrationPassengers({ registrationId, onCountChange }) {
  const [rows, setRows] = useState(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('registration_passengers')
      .select('*').eq('registration_id', registrationId)
      .order('is_primary', { ascending: false }).order('created_at', { ascending: true })
    setRows(data || [])
    onCountChange?.((data || []).length)
  }
  useEffect(() => { load() }, [registrationId])

  const addPassenger = async () => {
    if (!newName.trim()) return
    setBusy(true)
    const { error } = await supabase.from('registration_passengers')
      .insert({ registration_id: registrationId, full_name: newName.trim() })
    setBusy(false)
    if (error) { toast('הוספת הנוסע נכשלה: ' + error.message, 'err'); return }
    setNewName('')
    load()
  }

  const removePassenger = async (row) => {
    if (!await confirmDialog(`להסיר את ${row.full_name || 'הנוסע'} מההרשמה?`, { danger: true, confirmText: 'הסרה' })) return
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
        <div className="empty small">אין עדיין נוסעים על ההרשמה הזו</div>
      ) : (
        <>
          {/* Desktop/tablet: full grid, same as every other table in the app.
              Below `sm` a 10-column table forced horizontal scroll inside a
              tiny box, unusable for the inline-edit fields — collapsed to
              stacked cards instead (same hidden/sm:block split ResourceList
              uses for its own table -> MobileCards swap). */}
          <div className="table-wrap hidden sm:block" style={{ marginBottom: 10 }}>
            <table className="grid">
              <thead>
                <tr>
                  <th></th>
                  <th>שם מלא</th>
                  <th>טלפון</th>
                  <th>אימייל</th>
                  <th>גיל</th>
                  <th>מין</th>
                  <th>שפה</th>
                  <th>מגבלות רפואיות / פיזיות</th>
                  <th>העדפות תזונה</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td>{row.is_primary && <span className="badge mp" title="הנוסע העיקרי — נוצר אוטומטית מפרטי הלקוח">★ לקוח</span>}</td>
                    <td><EditableCell row={row} field="full_name" table="registration_passengers" onSaved={load} /></td>
                    <td dir="ltr"><EditableCell row={row} field="phone" table="registration_passengers" onSaved={load} /></td>
                    <td dir="ltr"><EditableCell row={row} field="email" table="registration_passengers" onSaved={load} /></td>
                    <td><EditableCell row={row} field="age" table="registration_passengers" type="number" onSaved={load} /></td>
                    <td><EditableCell row={row} field="gender" table="registration_passengers" mode="select" options={genderOpts} onSaved={load} /></td>
                    <td><EditableCell row={row} field="language" table="registration_passengers" mode="select" options={languageOpts} onSaved={load} /></td>
                    <td><EditableCell row={row} field="medical_notes" table="registration_passengers" onSaved={load} /></td>
                    <td><EditableCell row={row} field="dietary_notes" table="registration_passengers" onSaved={load} /></td>
                    <td><button className="btn subtle sm" style={{ color: 'var(--err)', padding: '2px 6px' }} onClick={() => removePassenger(row)} title="הסרת נוסע"><Icon name="x" size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: one card per passenger, fields stacked label/value —
              same .ef/.ef-label/.ef-val pattern the record detail screens
              use, so it reads as the same system, not a bespoke layout. */}
          <div className="sm:hidden" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>
            {rows.map(row => (
              <div key={row.id} className="card" style={{ padding: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <strong style={{ fontSize: '0.95rem' }}><EditableCell row={row} field="full_name" table="registration_passengers" onSaved={load} /></strong>
                    {row.is_primary && <span className="badge mp" title="הנוסע העיקרי — נוצר אוטומטית מפרטי הלקוח">★ לקוח</span>}
                  </div>
                  <button className="btn subtle sm" style={{ color: 'var(--err)', padding: '2px 6px', minHeight: 32, minWidth: 32 }} onClick={() => removePassenger(row)} title="הסרת נוסע"><Icon name="x" size={14} /></button>
                </div>
                <div className="ef"><span className="ef-label">טלפון</span><span className="ef-val" dir="ltr"><EditableCell row={row} field="phone" table="registration_passengers" onSaved={load} /></span></div>
                <div className="ef"><span className="ef-label">אימייל</span><span className="ef-val" dir="ltr"><EditableCell row={row} field="email" table="registration_passengers" onSaved={load} /></span></div>
                <div className="ef"><span className="ef-label">גיל</span><span className="ef-val"><EditableCell row={row} field="age" table="registration_passengers" type="number" onSaved={load} /></span></div>
                <div className="ef"><span className="ef-label">מין</span><span className="ef-val"><EditableCell row={row} field="gender" table="registration_passengers" mode="select" options={genderOpts} onSaved={load} /></span></div>
                <div className="ef"><span className="ef-label">שפה</span><span className="ef-val"><EditableCell row={row} field="language" table="registration_passengers" mode="select" options={languageOpts} onSaved={load} /></span></div>
                <div className="ef"><span className="ef-label">מגבלות רפואיות / פיזיות</span><span className="ef-val"><EditableCell row={row} field="medical_notes" table="registration_passengers" onSaved={load} /></span></div>
                <div className="ef" style={{ borderBottom: 'none' }}><span className="ef-label">העדפות תזונה</span><span className="ef-val"><EditableCell row={row} field="dietary_notes" table="registration_passengers" onSaved={load} /></span></div>
              </div>
            ))}
          </div>
        </>
      )}

      {adding ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input" style={{ maxWidth: 240, flex: '1 1 160px' }} autoFocus placeholder="שם הנוסע החדש"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addPassenger(); if (e.key === 'Escape') setAdding(false) }} />
          <button className="btn sm" disabled={busy || !newName.trim()} onClick={addPassenger}>
            {busy ? <span className="spinner light" style={{ width: 14, height: 14 }} /> : 'הוספה'}
          </button>
          <button className="btn subtle sm" onClick={() => { setAdding(false); setNewName('') }}>סיום</button>
        </div>
      ) : (
        <button className="btn subtle sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> הוספת נוסע</button>
      )}
    </div>
  )
}
