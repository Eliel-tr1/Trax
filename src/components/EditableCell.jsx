import { useEffect, useRef, useState } from 'react'
import { updateField } from '../lib/api'
import PhoneInput, { PhoneDisplay } from './PhoneInput'

// Ported verbatim from bina-crm — generic inline-editable table cell.
// mode: 'select' | 'text'. options: [{ value, label }] for select.
// type: 'text' | 'number' — 'number' renders a <input type="number"> and
// coerces to a JS number (or null) before saving, so numeric columns (e.g.
// registration_passengers.age) don't get written as raw strings.
export default function EditableCell({ row, field, table = 'customers', mode = 'text', type = 'text', options = [], display, placeholder, onSaved, required }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const selectRef = useRef(null)
  const value = row[field]

  useEffect(() => {
    if (editing && mode === 'select') selectRef.current?.focus()
  }, [editing, mode])

  const save = async (newVal) => {
    if (newVal === value || (newVal === '' && value == null)) { setEditing(false); return }
    // Required select fields (NOT NULL columns like tasks.status) never
    // render the empty option below, but guard here too — same reasoning
    // as EditField.jsx's commit() — so a raw constraint error can never
    // reach the user even if a caller's `required` gets out of sync.
    if (required && newVal === '') { setEditing(false); return }
    setSaving(true)
    try {
      await updateField(table, row, field, newVal === '' ? null : newVal)
      onSaved?.(field, newVal === '' ? null : newVal)
    } catch { /* keep old */ } finally { setSaving(false); setEditing(false) }
  }

  // Checkbox fields commit immediately on click, same as EditField's pattern
  // — no separate "editing" state, there's nothing to type.
  if (type === 'checkbox') {
    return (
      <button className={`badge ${value ? 'ok' : 'gray'}`} style={{ border: 'none', cursor: 'pointer' }}
        disabled={saving} onClick={e => { e.stopPropagation(); save(!value) }}>
        {value ? '✓ כן' : '✗ לא'}
      </button>
    )
  }

  if (editing && mode === 'select') {
    return (
      <select
        ref={selectRef}
        className="input" style={{ padding: '4px 8px', fontSize: '0.85rem', minWidth: 110, opacity: saving ? 0.5 : 1 }}
        value={value ?? ''} disabled={saving}
        onClick={e => e.stopPropagation()}
        onBlur={() => setEditing(false)}
        onChange={e => { e.stopPropagation(); save(e.target.value) }}
      >
        {!required && <option value="">-</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  if (editing && (type === 'phone' || mode === 'phone')) {
    return (
      <span onClick={e => e.stopPropagation()}>
        <PhoneEditCell value={value} onSave={save} onCancel={() => setEditing(false)} />
      </span>
    )
  }

  if (editing) {
    // date -> <input type=date>, datetime -> <input type=datetime-local>
    // (matches EditField's own type mapping); datetime values come in as
    // full ISO timestamps, sliced to the minute the input control expects.
    const inputType = type === 'number' ? 'number' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime-local' : 'text'
    const initial = type === 'datetime' && value ? String(value).slice(0, 16) : (value ?? '')
    return (
      <input
        className="input" style={{ padding: '4px 8px', fontSize: '0.85rem' }} autoFocus type={inputType} defaultValue={initial}
        onClick={e => e.stopPropagation()}
        onBlur={e => save(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value.trim())}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false) }}
      />
    )
  }

  const shown = display ? display(value) : (type === 'phone' || mode === 'phone')
    ? <PhoneDisplay value={value} />
    : (value || <span className="cell-empty">{placeholder || '-'}</span>)
  return (
    <span className="cell-edit" style={{ opacity: saving ? 0.5 : 1 }}
      onClick={e => { e.stopPropagation(); setEditing(true) }} title="לחצו לעריכה">
      {shown}
    </span>
  )
}

// Local value while editing, same reasoning as EditField's PhoneEditControl
// (PhoneInput fires onChange per keystroke; commit only on blur).
function PhoneEditCell({ value, onSave, onCancel }) {
  const [v, setV] = useState(value || '')
  return (
    <PhoneInput autoFocus value={v} onChange={setV}
      onBlur={() => setTimeout(() => { if (document.activeElement?.closest('.phone-input, .phone-country-popover')) return; onSave(v) }, 150)} />
  )
}
