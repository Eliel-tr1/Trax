import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from './Toaster'
import Modal from './Modal'
import PhoneInput from './PhoneInput'
import { PASSENGER_GENDERS, PASSENGER_LANGUAGES } from '../lib/constants'

// Popup add-passenger form for RegistrationPassengers — replaces the old
// inline quick-add row. full_name/phone/email/gender are required (blocked
// client-side until filled); age/language/medical_notes/dietary_notes are
// optional and can be filled in later by editing the passenger in the list.
// Same Modal shell used by CardcomChargeModal.
export default function AddPassengerModal({ registrationId, onClose, onAdded }) {
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', age: '', gender: '', language: '', medical_notes: '', dietary_notes: '',
  })
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (field) => (v) => setForm(f => ({ ...f, [field]: typeof v === 'object' && v?.target ? v.target.value : v }))

  const errors = {
    full_name: !form.full_name.trim(),
    phone: !form.phone,
    email: !form.email.trim(),
    gender: !form.gender,
  }
  const hasErrors = Object.values(errors).some(Boolean)

  const save = async () => {
    setTouched(true)
    if (hasErrors) return
    setBusy(true)
    const { error } = await supabase.from('registration_passengers').insert({
      registration_id: registrationId,
      full_name: form.full_name.trim(),
      phone: form.phone || null,
      email: form.email.trim(),
      age: form.age === '' || form.age === null ? null : Number(form.age),
      gender: form.gender,
      language: form.language || null,
      medical_notes: form.medical_notes.trim() || null,
      dietary_notes: form.dietary_notes.trim() || null,
    })
    setBusy(false)
    if (error) { toast('הוספת הנוסע נכשלה: ' + error.message, 'err'); return }
    toast('הנוסע נוסף')
    onAdded?.()
    onClose()
  }

  const errField = (cond) => touched && cond ? { borderColor: 'var(--err)' } : undefined

  return (
    <Modal title="הוספת נוסע" icon="plus" onClose={onClose} maxWidth={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
        <div>
          <label className="ef-label" style={{ display: 'block', marginBottom: 4 }}>שם מלא *</label>
          <input className="input" style={{ width: '100%', ...errField(errors.full_name) }} value={form.full_name}
            onChange={e => set('full_name')(e.target.value)} placeholder="שם הנוסע" autoFocus />
        </div>

        <div>
          <label className="ef-label" style={{ display: 'block', marginBottom: 4 }}>טלפון *</label>
          <PhoneInput value={form.phone} onChange={set('phone')} className={touched && errors.phone ? 'phone-err' : ''} />
          {touched && errors.phone && <div style={{ color: 'var(--err)', fontSize: '0.75rem', marginTop: 3 }}>שדה חובה</div>}
        </div>

        <div>
          <label className="ef-label" style={{ display: 'block', marginBottom: 4 }}>אימייל *</label>
          <input className="input" style={{ width: '100%', ...errField(errors.email) }} dir="ltr" value={form.email}
            onChange={e => set('email')(e.target.value)} placeholder="email@example.com" />
        </div>

        <div className="row wrap" style={{ gap: 12 }}>
          <div style={{ flex: '1 1 120px' }}>
            <label className="ef-label" style={{ display: 'block', marginBottom: 4 }}>גיל</label>
            <input className="input" style={{ width: '100%' }} type="number" value={form.age}
              onChange={e => set('age')(e.target.value)} placeholder="גיל" />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label className="ef-label" style={{ display: 'block', marginBottom: 4 }}>מין *</label>
            <select className="input" style={{ width: '100%', ...errField(errors.gender) }} value={form.gender}
              onChange={e => set('gender')(e.target.value)}>
              <option value="">בחר</option>
              {PASSENGER_GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="ef-label" style={{ display: 'block', marginBottom: 4 }}>שפה</label>
          <select className="input" style={{ width: '100%' }} value={form.language} onChange={e => set('language')(e.target.value)}>
            <option value="">-</option>
            {PASSENGER_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div>
          <label className="ef-label" style={{ display: 'block', marginBottom: 4 }}>מגבלות רפואיות / פיזיות</label>
          <textarea className="input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={form.medical_notes}
            onChange={e => set('medical_notes')(e.target.value)} />
        </div>

        <div>
          <label className="ef-label" style={{ display: 'block', marginBottom: 4 }}>העדפות תזונה</label>
          <textarea className="input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={form.dietary_notes}
            onChange={e => set('dietary_notes')(e.target.value)} />
        </div>

        {touched && hasErrors && (
          <div style={{ color: 'var(--err)', fontSize: '0.82rem' }}>יש למלא את כל שדות החובה (שם מלא, טלפון, אימייל, מין) לפני השמירה.</div>
        )}

        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn subtle" onClick={onClose}>ביטול</button>
          <button className="btn" disabled={busy} onClick={save}>
            {busy ? <span className="spinner light" style={{ width: 14, height: 14 }} /> : 'הוספת נוסע'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
