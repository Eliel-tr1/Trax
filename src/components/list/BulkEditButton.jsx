import { useEffect, useState } from 'react'
import { useListContext, useDataProvider, useRefresh, useResourceContext } from 'ra-core'
import { SCHEMA, fieldOptions } from '../../lib/schema'
import { loadOptions } from '../../lib/api'
import { toast } from '../Toaster'
import Modal from '../Modal'
import Icon from '../Icon'
import PhoneInput from '../PhoneInput'
import { Button } from '../ui/button'
import { Pencil } from 'lucide-react'

// Looks up the schema.js entity definition from the ra-core resource name
// (the DB table, e.g. 'customers') rather than requiring every call site to
// pass its own schema key — `resource`/`table` props are accepted for
// clarity at the call site but unused; both list screens' `resource` prop
// to ResourceList already IS the table name, and every SCHEMA entry's
// `table` matches it 1:1.
function defForTable(table) {
  return Object.values(SCHEMA).find(d => d.table === table)
}

// Fields nobody should bulk-set: identity/relation keys, computed fields,
// and free-text long fields that don't make sense applied identically to N
// rows at once are still allowed (the user asked for a general mechanism,
// not a curated allowlist) — only structurally unsafe fields are excluded.
const EXCLUDE_KEYS = new Set(['id'])

function bulkEditableFields(def) {
  return def.fields.filter(f => !EXCLUDE_KEYS.has(f.key))
}

// One shared bulk-edit entry point for every list screen (Customers/Sales/
// Registrations/Journeys/Meetings/PhoneCalls) — offers "edit one field
// across all selected rows" and "edit up to a few fields at once", both
// applying only the field(s) the user actually filled in, via ra-core's
// dataProvider.updateMany (see lib/ra/providers.js — already respects the
// soft-delete/hard-delete split per table, though updates never touch
// deleted_at so that split doesn't matter here).
export default function BulkEditButton() {
  const table = useResourceContext()
  const def = defForTable(table)
  const { selectedIds, onUnselectItems } = useListContext()
  const dataProvider = useDataProvider()
  const refresh = useRefresh()
  const [open, setOpen] = useState(false)

  if (!def) return null
  const fields = bulkEditableFields(def)
  if (!fields.length) return null

  return (
    <>
      <Button variant="outline" size="sm" className="h-9" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> עריכה קבוצתית
      </Button>
      {open && (
        <BulkEditModal
          def={def} fields={fields} table={table} ids={selectedIds || []}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onUnselectItems?.(); refresh() }}
          dataProvider={dataProvider}
        />
      )}
    </>
  )
}

const MODES = [
  { key: 'single', label: 'שדה בודד' },
  { key: 'multi', label: 'כמה שדות' },
]

function BulkEditModal({ def, fields, table, ids, onClose, onDone, dataProvider }) {
  const [mode, setMode] = useState('single')
  const [opts, setOpts] = useState(null)
  const [singleField, setSingleField] = useState(fields[0]?.key || '')
  const [singleValue, setSingleValue] = useState('')
  const [multiKeys, setMultiKeys] = useState([])
  const [multiValues, setMultiValues] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const n = ids.length
  const fieldByKey = (k) => fields.find(f => f.key === k)

  const coerce = (f, v) => {
    if (v === '' || v === undefined) return null
    if (f.type === 'number') return Number(v)
    if (f.type === 'checkbox') return !!v
    return v
  }

  const apply = async () => {
    let patch = {}
    if (mode === 'single') {
      const f = fieldByKey(singleField)
      if (!f) return
      // Checkboxes have no "untouched" state (false is a real value), but
      // every other field type left at its blank default means the user
      // never actually chose a value here — applying that as-is would
      // silently null the column on every selected row (constraint error
      // on a NOT NULL column like stage/status, silent data loss on a
      // nullable one). Block it the same way "multi" mode already does.
      if (f.type !== 'checkbox' && (singleValue === '' || singleValue === undefined)) {
        toast('לא הוזן ערך לשדה', 'err'); return
      }
      patch = { [f.key]: coerce(f, singleValue) }
    } else {
      for (const k of multiKeys) {
        const f = fieldByKey(k)
        const raw = multiValues[k]
        if (raw === undefined || raw === '') continue
        patch[f.key] = coerce(f, raw)
      }
      if (!Object.keys(patch).length) { toast('לא הוזן ערך לאף שדה', 'err'); return }
    }
    setBusy(true)
    try {
      await dataProvider.updateMany(table, { ids, data: patch })
      toast(`עודכנו ${n} רשומות`)
      onDone()
    } catch (e) {
      toast('העדכון נכשל: ' + e.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  const toggleMultiKey = (k) => {
    setMultiKeys(ks => ks.includes(k) ? ks.filter(x => x !== k) : ks.length < 3 ? [...ks, k] : ks)
  }

  return (
    <Modal title={`עריכה קבוצתית (${n} רשומות)`} icon="edit" onClose={onClose} maxWidth={520}>
      <div className="sections-tabs" style={{ marginBottom: 12 }}>
        {MODES.map(m => (
          <div key={m.key} className={`sec-tab ${mode === m.key ? 'active' : ''}`} onClick={() => setMode(m.key)}>{m.label}</div>
        ))}
      </div>

      {mode === 'single' ? (
        <div className="field-grid">
          <div className="field">
            <label>שדה לעריכה</label>
            <select value={singleField} onChange={e => { setSingleField(e.target.value); setSingleValue('') }}>
              {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <ValueInput f={fieldByKey(singleField)} value={singleValue} onChange={setSingleValue} opts={opts} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted small">בחרו עד 3 שדות ומלאו ערך רק לאלה שברצונכם לעדכן</div>
          <div className="field-grid">
            {fields.map(f => (
              <label key={f.key} className="row" style={{ gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={multiKeys.includes(f.key)} onChange={() => toggleMultiKey(f.key)} />
                {f.label}
              </label>
            ))}
          </div>
          {multiKeys.length > 0 && (
            <div className="field-grid">
              {multiKeys.map(k => (
                <ValueInput key={k} f={fieldByKey(k)} value={multiValues[k] ?? ''}
                  onChange={v => setMultiValues(s => ({ ...s, [k]: v }))} opts={opts} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn" disabled={busy} onClick={apply}>
          {busy ? <span className="spinner light" style={{ width: 15, height: 15 }} /> : `עדכון ${n} רשומות`}
        </button>
        <button className="btn subtle" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  )
}

function ValueInput({ f, value, onChange, opts }) {
  if (!f) return null
  const label = <label>{f.label}</label>

  if (f.type === 'checkbox') {
    return <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />{label}
    </div>
  }
  if (f.type === 'select') {
    const options = fieldOptions(f, opts)
    return <div className="field">{label}
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}>
        <option value="">- ללא שינוי -</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  }
  if (f.type === 'textarea') {
    return <div className="field" style={{ gridColumn: '1 / -1' }}>{label}
      <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ minHeight: 60 }} />
    </div>
  }
  if (f.type === 'phone') {
    return <div className="field">{label}<PhoneInput value={value} onChange={onChange} /></div>
  }
  return <div className="field">{label}
    <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'}
      dir={f.ltr ? 'ltr' : undefined} value={value ?? ''} onChange={e => onChange(e.target.value)} />
  </div>
}
