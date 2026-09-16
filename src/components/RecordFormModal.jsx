import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { loadOptions } from '../lib/api'
import { SCHEMA, fieldOptions } from '../lib/schema'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { useAuthStore } from '../stores/authStore'
import { toast } from './Toaster'
import Modal from './Modal'
import PhoneInput from './PhoneInput'
import EntityPicker from './EntityPicker'

// Ported from bina-crm, unchanged mechanism — generic schema-driven create
// form. Fill fields -> save -> insert -> onCreated(row).
export default function RecordFormModal({ type, defaults = {}, title, onCreated, onClose }) {
  const def = SCHEMA[type]
  const unit = useBusinessUnitStore(s => s.unit)
  const [opts, setOpts] = useState(null)
  const [form, setForm] = useState(() => {
    const init = {}
    for (const f of def.fields) {
      // Checkbox fields must never init as '' — the create() coercion turns
      // '' into null, and NOT NULL boolean columns (customers.club_member)
      // reject that with a raw Postgres error toast (client-reported 15.09).
      // A checkbox's natural "empty" state is false, not null.
      init[f.key] = defaults[f.key] ?? f.default ?? (f.type === 'checkbox' ? false : '')
    }
    return init
  })
  const [busy, setBusy] = useState(false)
  // The inline-created customer, held so the EntityPicker can show him as
  // an selectable+selected option immediately (cache refresh is async).
  const [inlineCreated, setInlineCreated] = useState(null)

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  // Per-active-business-unit form (Sahar 05.09): entity pickers list only the
  // current unit's rows, and unit-specific fields hide outside their unit
  // (xconOnly / traxOnly).
  const visibleFields = def.fields.filter(f =>
    !((f.xconOnly && unit !== 'Xcon') || (f.traxOnly && unit !== 'TRAX')))
  const missingRequired = visibleFields.some(f => f.required && !String(form[f.key] ?? '').trim())

  const create = async () => {
    if (missingRequired) return
    setBusy(true)
    const payload = { ...defaults }
    for (const f of def.fields) {
      const v = form[f.key]
      // Empty optional fields are OMITTED from the payload entirely — not
      // sent as null. NOT NULL columns with DB defaults (customers.
      // club_member, credit_balance) then take their default instead of
      // erroring with a raw 23502 toast (client-reported 15.09: both
      // columns hit this in the new-customer form). Explicit nulls are
      // still honored for fields the user deliberately cleared to null
      // (none in practice — every empty input is '' here).
      if (v === '' || v == null) continue
      payload[f.key] = f.type === 'number' ? Number(v) : v
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
        {visibleFields.map(f => (
          <Field key={f.key} f={f} value={form[f.key]} onChange={v => set(f.key, v)} opts={opts}
            businessUnit={unit} />
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

// Every new הרשמה למסע gets its "anchor" passenger row auto-created from
// the linked customer's own identity fields (is_primary: true) — that's
// the seat the customer themself occupies; additional travellers are added
// by hand afterwards on the registration screen (RegistrationPassengers.jsx).
// This is guaranteed by a DB trigger (create_primary_passenger, AFTER INSERT
// ON registrations) so it applies no matter how the row was created — this
// manual UI form, the api-v1 REST endpoint, or the Max AI chat agent.

function Field({ f, value, onChange, opts, businessUnit }) {
  const label = <label>{f.label}{f.required && <span className="req"> *</span>}</label>
  if (f.type === 'checkbox') {
    return <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />{label}
    </div>
  }
  if (f.type === 'select') {
    // Entity-reference fields (optionsFrom: a loadOptions() resource key —
    // customers/journeys/sales/users) get the searchable EntityPicker
    // instead of a plain <select> that forces scrolling a long list.
    // Entity lists are FILTERED to the active business unit (Sahar 05.09:
    // in Xcon show only Xcon rows, in TRAX only TRAX).
    if (f.optionsFrom) {
      // "Create and link" (Sahar 10.09, item 4): on the sale form the
      // customer picker offers an inline "לקוח חדש" toggle — a mini
      // customer form embedded in THIS modal — so a brand-new caller can
      // become customer + sale in one pass. Only for customers (the only
      // entity with a real create flow that makes sense inline).
      const inlineNew = f.optionsFrom === 'customers'
      const buFiltered = f.optionsFrom !== 'users'
        ? { filter: x => !x.business_unit || x.business_unit === businessUnit }
        : undefined
      return <div className="field">{label}
        <EntityPicker resource={f.optionsFrom} value={value || null} onChange={onChange} placeholder="בחירה…" {...buFiltered}
          extraItem={inlineCreated} />
        {inlineNew && <NewCustomerInline
          businessUnit={businessUnit}
          onCreated={row => {
            // Select the new customer immediately (he's merged into the
            // picker via extraItem) and refresh the shared cache in the
            // background so other pickers see him too (Sahar 10.09 round 2).
            setInlineCreated({ id: row.id, first_name: row.first_name, last_name: row.last_name, business_unit: businessUnit })
            loadOptions(true)
          }}
        />}
      </div>
    }
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
  if (f.type === 'phone') {
    return <div className="field">{label}
      <PhoneInput value={value} onChange={onChange} />
    </div>
  }
  return <div className="field">{label}
    <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'}
      dir={f.ltr ? 'ltr' : undefined} value={value ?? ''} onChange={e => onChange(e.target.value)} />
  </div>
}

// Inline "create a new customer" mini-form, embedded under the customer
// EntityPicker inside the new-sale modal (Sahar 10.09, item 4 — "צור גם
// וגם, בטופס אחד"): fill first/last/phone (+optional email), hit יצירה,
// and the freshly created customer becomes the sale's customer_id. The
// EntityPicker above stays usable — picking an existing customer simply
// overrides the inline one.
function NewCustomerInline({ businessUnit, onCreated }) {
  const user = useAuthStore(s => s.user)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', mobile_phone: '', email: '' })
  const [createdName, setCreatedName] = useState(null)
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const valid = form.first_name.trim() && form.mobile_phone

  const create = async () => {
    if (!valid || busy) return
    setBusy(true)
    const { data, error } = await supabase.from('customers').insert({
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || '-',
      mobile_phone: form.mobile_phone,
      email: form.email.trim() || null,
      business_unit: businessUnit,
      status: 'ליד חדש',
      // Attribution: the user who created the customer owns it (Sahar
      // 10.09 round 2) — not the default rep.
      owner_id: user?.id || null,
    }).select('id, first_name, last_name').single()
    setBusy(false)
    if (error) { toast('יצירת הלקוח נכשלה: ' + error.message, 'err'); return }
    toast('הלקוח נוצר ושויך למכירה')
    setCreatedName(`${data.first_name} ${data.last_name}`)
    setOpen(false)
    onCreated(data)
  }

  if (createdName) {
    return <div className="small muted" style={{ marginTop: 4 }}>
      לקוח חדש נוצר: <b style={{ color: 'var(--mp)' }}>{createdName}</b>
    </div>
  }
  return <>
    {!open
      ? <button type="button" className="btn subtle sm" style={{ marginTop: 4 }} onClick={() => setOpen(true)}>
          + לקוח חדש
        </button>
      : <div style={{ marginTop: 6, padding: 10, border: '1px solid var(--border)', borderRadius: 'var(--rs)', display: 'grid', gap: 6 }}>
          <div className="small muted">לקוח חדש, ייווצר וישויך למכירה זו:</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <input className="input" placeholder="שם פרטי *" value={form.first_name} onChange={e => set('first_name', e.target.value)} />
            <input className="input" placeholder="שם משפחה" value={form.last_name} onChange={e => set('last_name', e.target.value)} />
          </div>
          <PhoneInput value={form.mobile_phone} onChange={v => set('mobile_phone', v || '')} />
          <input className="input" dir="ltr" placeholder="אימייל (לא חובה)" value={form.email} onChange={e => set('email', e.target.value)} />
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn sm" disabled={busy || !valid} onClick={create}>
              {busy ? <span className="spinner light" style={{ width: 13, height: 13 }} /> : 'יצירת לקוח ושיוך'}
            </button>
            <button type="button" className="btn subtle sm" onClick={() => setOpen(false)}>ביטול</button>
          </div>
        </div>}
  </>
}
