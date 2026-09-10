import { useRef, useState } from 'react'
import PhoneInput, { PhoneDisplay } from './PhoneInput'

// Ported verbatim from bina-crm — generic inline-editable field
// (Fireberry-style: click value -> edit -> save on blur/enter).
// type: text | number | date | select | checkbox | textarea | link
// readOnlyReason: short Hebrew explanation shown via a lock icon + tooltip
// whenever readOnly is set — every readOnly usage across the app should
// pass one (computed field, auto-set timestamp, no permission, etc.).
// linkTo: renders the value as an in-app navigable link (`#${linkTo}`,
// matching the HashRouter convention used elsewhere, e.g. Tasks.jsx) instead
// of plain text — a relation display, never itself editable here.
export default function EditField({ label, value, display, type = 'text', options = [], onSave, ltr, placeholder, readOnly, readOnlyReason, linkTo, required }) {
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const rowRef = useRef(null)

  const commit = async (v) => {
    const next = v === '' ? null : v
    // Required select fields (status/stage/priority-style columns that are
    // NOT NULL in the DB) never offer an empty option below, but guard here
    // too in case a caller forgets required/options are out of sync — a
    // friendly inline message beats a raw Postgres 23502 message reaching
    // the user as a mystifying toast.
    if (required && next === null) { setEdit(false); return }
    // Save must not scroll the page (Sahar 05.09): when the editor unmounts,
    // focus falls to <body> and the browser re-anchors the scroll to the top
    // of the re-rendered subtree. Re-anchor the field row to its position.
    setSaving(true)
    try { await onSave(next) } catch { /* keep */ } finally {
      setSaving(false); setEdit(false)
      requestAnimationFrame(() => rowRef.current?.scrollIntoView({ block: 'nearest' }))
    }
      }

      const shown = display !== undefined ? display : value
  const shownEl = (shown === null || shown === undefined || shown === '')
    ? <span className="muted" style={{ fontWeight: 400 }}>-</span>
    : type === 'link' ? <a href={value} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} dir="ltr">{shown}</a>
    : type === 'checkbox' ? <span className={`badge ${value ? 'ok' : 'gray'}`}>{value ? '✓ כן' : '✗ לא'}</span>
    : type === 'phone' ? <PhoneDisplay value={value} />
    : shown

  const row = (control) => (
      <div className="ef" ref={rowRef}>
        <span className="ef-label">
        {label}
        {readOnly && readOnlyReason && (
          <span className="ro-lock" title={readOnlyReason} style={{ display: 'inline-flex', verticalAlign: 'middle', marginInlineStart: 4, color: 'var(--text-3)', cursor: 'help' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
        )}
      </span>
      {control}
    </div>
  )

  if (linkTo) {
    return row(
      (shown === null || shown === undefined || shown === '')
        ? <span className="ef-val"><span className="muted" style={{ fontWeight: 400 }}>-</span></span>
        /* tabIndex=-1: this link must not join the Tab order — when an
           inline editor commits, focus falls to the next focusable element
           and if that's this (top-of-card) link the browser scrolls to it
           and the page appears to jump to the top (Sahar 05.09). Mouse
           users still click it normally. */
        : <span className="ef-val"><a href={`#${linkTo}`} tabIndex={-1} onClick={e => e.stopPropagation()}>{shown}</a></span>
    )
  }

  if (readOnly) return row(<span className="ef-val" style={{ direction: ltr ? 'ltr' : undefined }}>{shownEl}</span>)

  if (type === 'checkbox') {
    return row(<button className={`badge ${value ? 'ok' : 'gray'}`} style={{ border: 'none', cursor: 'pointer', alignSelf: 'start' }} disabled={saving} onClick={() => commit(!value)}>{value ? '✓ כן' : '✗ לא'}</button>)
  }

  if (!edit) {
    return row(<span className="ef-val cell-edit" style={{ direction: ltr ? 'ltr' : undefined, opacity: saving ? 0.5 : 1 }} onClick={() => setEdit(true)} title="לחצו לעריכה">{shownEl}</span>)
  }

  if (type === 'phone') {
    return row(<PhoneEditControl value={value} saving={saving} autoFocus onCommit={commit} onCancel={() => setEdit(false)} />)
  }

  if (type === 'select') {
    return row(
      <select className="input" defaultValue={value ?? ''} disabled={saving} autoFocus
        onBlur={() => setEdit(false)} onChange={e => commit(e.target.value)}>
        {!required && <option value="">-</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }
  if (type === 'textarea') {
    return row(<textarea className="input" autoFocus defaultValue={value ?? ''} disabled={saving} onBlur={e => commit(e.target.value.trim())} style={{ minHeight: 60 }} />)
  }
  return row(
    <input className="input" type={type === 'datetime' ? 'datetime-local' : type} dir={ltr ? 'ltr' : undefined} defaultValue={value ?? ''} disabled={saving} placeholder={placeholder} autoFocus
      onBlur={e => commit(type === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : e.target.value.trim())}
      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEdit(false) }} />
  )
}

// Holds the phone value locally while editing (PhoneInput fires onChange on
// every keystroke, unlike a plain <input>'s onBlur-commit pattern used
// above) and commits once on blur — including a blur caused by opening the
// country popover, which is deferred a tick so it doesn't close mid-pick.
function PhoneEditControl({ value, saving, autoFocus, onCommit, onCancel }) {
  const [v, setV] = useState(value || '')
  return (
    <PhoneInput value={v} disabled={saving} autoFocus={autoFocus}
      onChange={setV}
      onBlur={() => setTimeout(() => { if (document.activeElement?.closest('.phone-input, .phone-country-popover')) return; onCommit(v) }, 150)}
    />
  )
}
