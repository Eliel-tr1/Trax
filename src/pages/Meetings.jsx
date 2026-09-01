import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { supabase } from '../lib/supabase'
import { loadOptions } from '../lib/api'
import { toast } from '../components/Toaster'
import { MEETING_TYPES, MEETING_STATUSES, enumOpts } from '../lib/constants'
import { extraHiddenColumns, metadataColumns } from '../lib/schema'
import { formatDateTime } from '../lib/format'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import useSchemaFilterGroups from '../hooks/useSchemaFilterGroups'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import BulkEditButton from '../components/list/BulkEditButton'
import EditableCell from '../components/EditableCell'
import RelatedLink from '../components/RelatedLink'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { MultiUserPicker } from '../components/UserPicker'
import EntityPicker from '../components/EntityPicker'

const typeOpts = enumOpts(MEETING_TYPES)
const statusOpts = enumOpts(MEETING_STATUSES)

// Exported so nested "פגישות" chips (CustomerDetail/SaleDetail's related
// panel) use the identical column set as the standalone Meetings screen —
// see the same comment on Registrations.jsx's registrationColumns().
// opts/refresh: same field-parity ctx every other *Columns() builder takes
// now — meetings previously had NO extraHiddenColumns() tail at all, so its
// columns picker could only ever offer the 8 fields hardcoded below.
export function meetingsColumns(opts = {}, refresh) {
  return [
    { source: 'created_at', label: 'נוצר בתאריך', csv: r => r.created_at,
      render: r => <span className="small">{formatDateTime(r.created_at)}</span> },
    { source: 'subject', label: 'נושא', csv: r => r.subject,
      render: r => <span style={{ fontWeight: 600, color: 'var(--mp)' }}>{r.subject}</span> },
    { source: 'related_id', label: 'משויך ל', sortable: false, csv: r => r.related_id,
      render: r => <RelatedLink relatedType={r.related_type} relatedId={r.related_id} /> },
    { source: 'start_at', label: 'תאריך ושעה', csv: r => r.start_at,
      render: r => <span className="small">{formatDateTime(r.start_at)}</span> },
    { source: 'duration_minutes', label: 'משך (דקות)', hidden: true, csv: r => r.duration_minutes,
      render: r => r.duration_minutes ?? '-' },
    { source: 'type', label: 'סוג', csv: r => r.type,
      render: r => <Cell row={r} field="type" mode="select" options={typeOpts} display={v => v || '-'} /> },
    // Marking related_type='sale' rows 'לא התקיימה' here auto-follows-up the
    // linked sale (stage -> פולואפ, note, task) via a DB trigger — see
    // data/023_meeting_noshow_and_customer_auto_sale.sql.
    { source: 'status', label: 'סטטוס', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts} display={v => v || '-'} /> },
    { source: 'summary', label: 'סיכום', hidden: true, csv: r => r.summary, render: r => r.summary || '-' },
    { source: 'business_unit', label: 'יחידה עסקית', hidden: true, csv: r => r.business_unit, render: r => r.business_unit || '-' },
    ...extraHiddenColumns('meeting', ['created_at', 'subject', 'start_at', 'duration_minutes', 'type', 'status', 'summary'], { table: 'meetings', opts, refresh }),
    ...metadataColumns('meeting', ['created_at'], { users: opts.users || [] }),
  ]
}

export default function Meetings() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const [opts, setOpts] = useState({})
  const refresh = useRefresh()
  const filterGroups = useSchemaFilterGroups('meeting', ['business_unit'])

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const columns = meetingsColumns(opts, refresh)

  return (
    <>
      <ResourceList
        emptyLabel="פגישות"
        resource="meetings" storeKey="meetings" exportName="meetings"
        filter={{ business_unit: unit }}
        sort={{ field: 'created_at', order: 'DESC' }}
        columns={columns}
        search="נושא"
        facets={[{ field: 'type', title: 'סוג', options: typeOpts }]}
        filters={filterGroups}
        rowPath={r => `/meetings/${r.id}`}
        bulkActions={<><BulkEditButton resource="meeting" table="meetings" /><BulkDeleteButton /></>}
        /* No header create button — meetings are created from a record's
           "פעילות" activity area (client request: no duplicate entry point). */
      />
    </>
  )
}

function Cell({ row, field, mode, options, display }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="meetings" field={field} mode={mode} options={options} display={display} onSaved={() => refresh()} />
}

// Custom (not schema-driven) create modal: meetings need a related_type +
// related_id pair that the generic RecordFormModal can't represent (the
// second select's options depend on the first select's value). When opened
// from Customer/Sale detail, those two fields are supplied directly instead
// via RecordFormModal's `defaults` — see schema.js's comment on `meeting`.
export function MeetingFormModal({ defaultUnit, defaultRelatedType, defaultRelatedId, onClose, onCreated }) {
  const [opts, setOpts] = useState(null)
  const [relatedType, setRelatedType] = useState(defaultRelatedType || 'customer')
  const [relatedId, setRelatedId] = useState(defaultRelatedId || '')
  const [subject, setSubject] = useState('')
  const [startAt, setStartAt] = useState('')
  const [duration, setDuration] = useState('')
  const [type, setType] = useState('')
  const [summary, setSummary] = useState('')
  const [businessUnit, setBusinessUnit] = useState(defaultUnit || 'TRAX')
  const [participants, setParticipants] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const relatedOptions = relatedType === 'customer'
    ? (opts?.customers || []).filter(c => c.business_unit === businessUnit)
    : (opts?.sales || []).filter(s => s.business_unit === businessUnit)

  const missing = !subject.trim() || !startAt || !relatedId

  const create = async () => {
    if (missing) return
    setBusy(true)
    const { data, error } = await supabase.from('meetings').insert({
      subject: subject.trim(),
      related_type: relatedType,
      related_id: relatedId,
      start_at: new Date(startAt).toISOString(),
      duration_minutes: duration === '' ? null : Number(duration),
      type: type || null,
      summary: summary.trim() || null,
      business_unit: businessUnit,
      participants: participants.length ? participants : null,
    }).select().single()
    setBusy(false)
    if (error) { toast('היצירה נכשלה: ' + error.message, 'err'); return }
    toast('נוצר בהצלחה')
    onCreated?.(data)
    onClose()
  }

  return (
    <Modal title="פגישה חדשה" icon="calendar" onClose={onClose} maxWidth={520}>
      <div className="field-grid">
        <div className="field"><label>יחידה עסקית</label>
          <select value={businessUnit} onChange={e => { setBusinessUnit(e.target.value); setRelatedId('') }}>
            <option value="TRAX">TRAX</option><option value="Xcon">Xcon</option>
          </select>
        </div>
        <div className="field"><label>משויך ל</label>
          <select value={relatedType} onChange={e => { setRelatedType(e.target.value); setRelatedId('') }}>
            <option value="customer">לקוח</option>
            <option value="sale">מכירה</option>
          </select>
        </div>
        <div className="field"><label>{relatedType === 'customer' ? 'לקוח' : 'מכירה'}<span className="req"> *</span></label>
          <EntityPicker items={relatedOptions} value={relatedId || null} onChange={setRelatedId} disabled={!opts}
            allowEmpty={false} labelField={o => o.name || o.deal_name || '(ללא שם)'}
            placeholder={relatedType === 'customer' ? 'בחרו לקוח' : 'בחרו מכירה'} />
        </div>
        <div className="field"><label>נושא<span className="req"> *</span></label>
          <input value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div className="field"><label>תאריך ושעה<span className="req"> *</span></label>
          <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} />
        </div>
        <div className="field"><label>משך (דקות)</label>
          <input type="number" value={duration} onChange={e => setDuration(e.target.value)} />
        </div>
        <div className="field"><label>סוג</label>
          <select value={type} onChange={e => setType(e.target.value)}>
            <option value="">-</option>
            {typeOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>סיכום</label>
          <textarea value={summary} onChange={e => setSummary(e.target.value)} style={{ minHeight: 64 }} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>משתתפים</label>
          <MultiUserPicker users={opts?.users || []} value={participants} onChange={setParticipants} />
        </div>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" disabled={busy || missing} onClick={create}>
          {busy ? <span className="spinner light" style={{ width: 15, height: 15 }} /> : 'יצירה'}
        </button>
        <button className="btn subtle" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  )
}
