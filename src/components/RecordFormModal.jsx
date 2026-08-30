import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadOptions } from '../lib/api'
import { SCHEMA, fieldOptions } from '../lib/schema'
import { toast } from './Toaster'
import Modal from './Modal'

// Ported from bina-crm, unchanged mechanism — generic schema-driven create
// form. Fill fields -> save -> insert -> onCreated(row).
export default function RecordFormModal({ type, defaults = {}, title, onCreated, onClose }) {
  const def = SCHEMA[type]
  const [opts, setOpts] = useState(null)
  const [form, setForm] = useState(() => {
    const init = {}
    for (const f of def.fields) init[f.key] = defaults[f.key] ?? f.default ?? ''
    return init
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const missingRequired = def.fields.some(f => f.required && !String(form[f.key] ?? '').trim())

  const create = async () => {
    if (missingRequired) return
    setBusy(true)
    const payload = { ...defaults }
    for (const f of def.fields) {
      let v = form[f.key]
      if (v === '' || v == null) v = null
      else if (f.type === 'number') v = Number(v)
      payload[f.key] = v
    }
    const { data, error } = await supabase.from(def.table).insert(payload).select().single()
    setBusy(false)
    if (error) { toast('היצירה נכשלה: ' + error.message, 'err'); return }
    toast('נוצר בהצלחה')
    onCreated?.(data)
    onClose()
  }

  return (
    <Modal title={title || `יצירת ${def.labelOne}`} icon={def.icon} onClose={onClose} maxWidth={520}>
      <div className="field-grid">
        {def.fields.map(f => (
          <Field key={f.key} f={f} value={form[f.key]} onChange={v => set(f.key, v)} opts={opts} />
        ))}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" disabled={busy || missingRequired} onClick={create}>
          {busy ? <span className="spinner light" style={{ width: 15, height: 15 }} /> : 'יצירה'}
        </button>
        <button className="btn subtle" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  )
}

function Field({ f, value, onChange, opts }) {
  const label = <label>{f.label}{f.required && <span className="req"> *</span>}</label>
  if (f.type === 'checkbox') {
    return <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />{label}
    </div>
  }
  if (f.type === 'select') {
    const options = fieldOptions(f, opts)
    return <div className="field">{label}
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">-</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  }
  if (f.type === 'textarea') {
    return <div className="field" style={{ gridColumn: '1 / -1' }}>{label}
      <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ minHeight: 64 }} />
    </div>
  }
  return <div className="field">{label}
    <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'}
      dir={f.ltr ? 'ltr' : undefined} value={value ?? ''} onChange={e => onChange(e.target.value)} />
  </div>
}
