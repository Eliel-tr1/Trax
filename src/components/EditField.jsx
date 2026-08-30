import { useState } from 'react'

// Ported verbatim from bina-crm — generic inline-editable field
// (Fireberry-style: click value -> edit -> save on blur/enter).
// type: text | number | date | select | checkbox | textarea | link
export default function EditField({ label, value, display, type = 'text', options = [], onSave, ltr, placeholder, readOnly }) {
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)

  const commit = async (v) => {
    setSaving(true)
    try { await onSave(v === '' ? null : v) } catch { /* keep */ } finally { setSaving(false); setEdit(false) }
  }

  const shown = display !== undefined ? display : value
  const shownEl = (shown === null || shown === undefined || shown === '')
    ? <span className="muted" style={{ fontWeight: 400 }}>-</span>
    : type === 'link' ? <a href={value} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} dir="ltr">{shown}</a>
    : type === 'checkbox' ? <span className={`badge ${value ? 'ok' : 'gray'}`}>{value ? '✓ כן' : '✗ לא'}</span>
    : shown

  const row = (control) => (
    <div className="ef">
      <span className="ef-label">{label}</span>
      {control}
    </div>
  )

  if (readOnly) return row(<span className="ef-val" style={{ direction: ltr ? 'ltr' : undefined }}>{shownEl}</span>)

  if (type === 'checkbox') {
    return row(<button className={`badge ${value ? 'ok' : 'gray'}`} style={{ border: 'none', cursor: 'pointer', alignSelf: 'start' }} disabled={saving} onClick={() => commit(!value)}>{value ? '✓ כן' : '✗ לא'}</button>)
  }

  if (!edit) {
    return row(<span className="ef-val cell-edit" style={{ direction: ltr ? 'ltr' : undefined, opacity: saving ? 0.5 : 1 }} onClick={() => setEdit(true)} title="לחצו לעריכה">{shownEl}</span>)
  }

  if (type === 'select') {
    return row(
      <select className="input" autoFocus defaultValue={value ?? ''} disabled={saving}
        onBlur={() => setEdit(false)} onChange={e => commit(e.target.value)}>
        <option value="">-</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  if (type === 'textarea') {
    return row(<textarea className="input" autoFocus defaultValue={value ?? ''} disabled={saving} onBlur={e => commit(e.target.value.trim())} style={{ minHeight: 60 }} />)
  }
  return row(
    <input className="input" autoFocus type={type === 'datetime' ? 'datetime-local' : type} dir={ltr ? 'ltr' : undefined} defaultValue={value ?? ''} disabled={saving} placeholder={placeholder}
      onBlur={e => commit(type === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : e.target.value.trim())}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEdit(false) }} />
  )
}
