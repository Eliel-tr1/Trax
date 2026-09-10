import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { JOURNEY_STATUSES, JOURNEY_DESTINATIONS, enumOpts } from '../lib/constants'
import { extraHiddenColumns, metadataColumns } from '../lib/schema'
import { formatDate, formatDateTime, formatCurrency } from '../lib/format'
import { loadOptions } from '../lib/api'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import useSchemaFilterGroups from '../hooks/useSchemaFilterGroups'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import BulkEditButton from '../components/list/BulkEditButton'
import EditableCell from '../components/EditableCell'
import RecordFormModal from '../components/RecordFormModal'
import AiJourneyImportModal from '../components/AiJourneyImportModal'
import Icon from '../components/Icon'
import StatusBadge from '../components/StatusBadge'

const statusOpts = enumOpts(JOURNEY_STATUSES)
const destOpts = enumOpts(JOURNEY_DESTINATIONS)

// Trip duration in days: return_date minus departure_date, INCLUSIVE (a
// trip departing 01/09 and returning 08/09 is 8 days, not 7 — the return
// day is a travel day). Null unless both dates parse.
function journeyDays(r) {
  if (!r.departure_date || !r.return_date) return null
  const d1 = new Date(r.departure_date)
  const d2 = new Date(r.return_date)
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null
  const days = Math.round((d2 - d1) / 86400000) + 1
  return days > 0 ? days : null
}

function isoInMonths(n) {
  const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10)
}
function todayIso() { return new Date().toISOString().slice(0, 10) }

export default function Journeys() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const [showNew, setShowNew] = useState(false)
  const [showAiImport, setShowAiImport] = useState(false)
  const [opts, setOpts] = useState({})
  const refresh = useRefresh()
  const filterGroups = useSchemaFilterGroups('journey', ['business_unit'])

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const columns = [
    { source: 'created_at', label: 'נוצר בתאריך', csv: r => r.created_at,
      render: r => <span className="small">{formatDateTime(r.created_at)}</span> },
    { source: 'name', label: 'שם היציאה', csv: r => r.name,
      render: r => <span style={{ fontWeight: 600, color: 'var(--mp)' }}>{r.name}</span> },
    { source: 'destination', label: 'יעד', csv: r => r.destination,
      render: r => <Cell row={r} field="destination" mode="select" options={destOpts} display={v => v || '-'} /> },
    { source: 'departure_date', label: 'תאריך יציאה', csv: r => r.departure_date,
      render: r => <span className="small">{formatDate(r.departure_date)}</span> },
    { source: 'status', label: 'סטטוס', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts} required
        display={v => <StatusBadge value={v} field="status" resource="journey" />} /> },
    { source: 'seats_sold', label: 'מקומות שנמכרו', sortable: true, csv: r => r.seats_sold,
      render: r => <span className="small">{r.seats_sold} / {r.seats_total}</span> },
    { source: 'seats_available', label: 'מקומות פנויים', sortable: true, csv: r => r.seats_available,
      render: r => <span className="small">{r.seats_available}</span> },
    // משך הטיול — computed, read-only (return_date minus departure_date, inclusive).
    { source: 'duration_days', label: 'משך הטיול', sortable: false, csv: r => journeyDays(r) != null ? `${journeyDays(r)} ימים` : '',
      render: r => journeyDays(r) != null ? <span className="small">{journeyDays(r)} ימים</span> : <span className="cell-empty">-</span> },
    // מחיר לאדם — currency-marked, same display as the record screen.
    { source: 'price_per_person', label: 'מחיר לאדם', csv: r => r.price_per_person,
      render: r => <span className="small">{formatCurrency(r.price_per_person, r.currency)}</span> },
    ...extraHiddenColumns('journey', ['created_at', 'name', 'destination', 'departure_date', 'status', 'seats_sold', 'seats_available', 'price_per_person'], { table: 'journeys', opts, refresh }),
    ...metadataColumns('journey', ['created_at'], { users: opts.users || [] }),
  ]

  const presets = [
    { key: 'all', label: 'כל היציאות' },
    { key: 'upcoming', label: 'יציאות קרובות', filter: {
      'status@in': ['פתוח להרשמה', 'כמעט מלא'], 'departure_date@gte': todayIso(), 'departure_date@lte': isoInMonths(6),
    } },
  ]

  return (
    <>
      <ResourceList
        emptyLabel="מסעות"
        resource="journeys" storeKey="journeys" exportName="journeys"
        filter={{ business_unit: unit }}
        sort={{ field: 'created_at', order: 'DESC' }}
        columns={columns} presets={presets}
        search="שם היציאה / יעד"
        facets={[
          { field: 'status', title: 'סטטוס', options: statusOpts },
          { field: 'destination', title: 'יעד', options: destOpts },
        ]}
        filters={filterGroups}
        rowPath={r => `/journeys/${r.id}`}
        bulkActions={<><BulkEditButton resource="journey" table="journeys" /><BulkDeleteButton /></>}
        actions={
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> מסע חדש</button>
            <button className="btn sm" style={{ background: 'var(--mp2)' }} onClick={() => setShowAiImport(true)}>
              <Icon name="sparkles" size={15} /> יצירה ב-AI
            </button>
          </div>
        }
      />
      {showNew && (
        <RecordFormModal type="journey" defaults={{ business_unit: unit }} onClose={() => setShowNew(false)}
          onCreated={row => nav(`/journeys/${row.id}`)} />
      )}
      {showAiImport && (
        <AiJourneyImportModal defaultUnit={unit} onClose={() => setShowAiImport(false)}
          onSaved={id => { setShowAiImport(false); nav(`/journeys/${id}`) }} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display, required }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="journeys" field={field} mode={mode} options={options} display={display} required={required} onSaved={() => refresh()} />
}
