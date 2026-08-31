import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { supabase } from '../lib/supabase'
import { loadOptions } from '../lib/api'
import { toast } from '../components/Toaster'
import { MEETING_TYPES, enumOpts } from '../lib/constants'
import { formatDateTime } from '../lib/format'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import EditableCell from '../components/EditableCell'
import RelatedLink from '../components/RelatedLink'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { MultiUserPicker } from '../components/UserPicker'

const typeOpts = enumOpts(MEETING_TYPES)

export default function Meetings() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const [showNew, setShowNew] = useState(false)

  const columns = [
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
    { source: 'summary', label: 'סיכום', hidden: true, csv: r => r.summary, render: r => r.summary || '-' },
    { source: 'business_unit', label: 'יחידה עסקית', hidden: true, csv: r => r.business_unit, render: r => r.business_unit || '-' },
  ]

  return (
    <>
      <ResourceList
        emptyLabel="פגישות"
        resource="meetings" storeKey="meetings" exportName="meetings"
        filter={{ business_unit: unit }}
        sort={{ field: 'start_at', order: 'DESC' }}
        columns={columns}
        search="נושא"
        facets={[{ field: 'type', title: 'סוג', options: typeOpts }]}
        rowPath={r => `/meetings/${r.id}`}
        bulkActions={<BulkDeleteButton />}
        actions={<button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> פגישה חדשה</button>}
      />
      {showNew && (
        <MeetingFormModal defaultUnit={unit} onClose={() => setShowNew(false)}
          onCreated={row => nav(`/meetings/${row.id}`)} />
      )}
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
          <select value={relatedId} onChange={e => setRelatedId(e.target.value)} disabled={!opts}>
            <option value="">-</option>
            {relatedOptions.map(o => <option key={o.id} value={o.id}>{o.name || o.deal_name || '(ללא שם)'}</option>)}
          </select>
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
