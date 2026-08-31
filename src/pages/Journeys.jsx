import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { JOURNEY_STATUSES, JOURNEY_DESTINATIONS, enumOpts } from '../lib/constants'
import { extraHiddenColumns } from '../lib/schema'
import { formatDate, formatCurrency } from '../lib/format'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import EditableCell from '../components/EditableCell'
import RecordFormModal from '../components/RecordFormModal'
import Icon from '../components/Icon'

const statusOpts = enumOpts(JOURNEY_STATUSES)
const destOpts = enumOpts(JOURNEY_DESTINATIONS)
export const JOURNEY_STATUS_BADGE = {
  'בתכנון': 'gray', 'פתוח להרשמה': 'mp', 'כמעט מלא': 'warn',
  'מלא': 'err', 'יצא לדרך': 'ok', 'בוטל': 'gray',
}

function isoInMonths(n) {
  const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10)
}
function todayIso() { return new Date().toISOString().slice(0, 10) }

export default function Journeys() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const [showNew, setShowNew] = useState(false)

  const columns = [
    { source: 'name', label: 'שם היציאה', csv: r => r.name,
      render: r => <span style={{ fontWeight: 600, color: 'var(--mp)' }}>{r.name}</span> },
    { source: 'destination', label: 'יעד', csv: r => r.destination,
      render: r => <Cell row={r} field="destination" mode="select" options={destOpts} display={v => v || '-'} /> },
    { source: 'departure_date', label: 'תאריך יציאה', csv: r => r.departure_date,
      render: r => <span className="small">{formatDate(r.departure_date)}</span> },
    { source: 'status', label: 'סטטוס', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts}
        display={v => <span className={`badge ${JOURNEY_STATUS_BADGE[v] || 'gray'}`}>{v}</span>} /> },
    { source: 'seats_sold', label: 'מקומות שנמכרו', sortable: true, csv: r => r.seats_sold,
      render: r => <span className="small">{r.seats_sold} / {r.seats_total}</span> },
    { source: 'seats_available', label: 'מקומות פנויים', sortable: true, csv: r => r.seats_available,
      render: r => <span className="small">{r.seats_available}</span> },
    ...extraHiddenColumns('journey', ['name', 'destination', 'departure_date', 'status', 'seats_sold', 'seats_available']),
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
        sort={{ field: 'departure_date', order: 'ASC' }}
        columns={columns} presets={presets}
        search="שם היציאה / יעד"
        facets={[
          { field: 'status', title: 'סטטוס', options: statusOpts },
          { field: 'destination', title: 'יעד', options: destOpts },
        ]}
        rowPath={r => `/journeys/${r.id}`}
        bulkActions={<BulkDeleteButton />}
        actions={<button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> מסע חדש</button>}
      />
      {showNew && (
        <RecordFormModal type="journey" defaults={{ business_unit: unit }} onClose={() => setShowNew(false)}
          onCreated={row => nav(`/journeys/${row.id}`)} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="journeys" field={field} mode={mode} options={options} display={display} onSaved={() => refresh()} />
}
