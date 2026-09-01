import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { REGISTRATION_STATUSES, enumOpts } from '../lib/constants'
import { extraHiddenColumns, metadataColumns } from '../lib/schema'
import { formatCurrency, formatDateTime } from '../lib/format'
import { loadOptions } from '../lib/api'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import useSchemaFilterGroups from '../hooks/useSchemaFilterGroups'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import BulkEditButton from '../components/list/BulkEditButton'
import EditableCell from '../components/EditableCell'
import RecordFormModal from '../components/RecordFormModal'
import Icon from '../components/Icon'
import StatusBadge from '../components/StatusBadge'

const statusOpts = enumOpts(REGISTRATION_STATUSES)
const UNPAID_STATUSES = ['משוריין', 'שולמה מקדמה']

// Exported so nested "הרשמות" chips embedded inside CustomerDetail/
// SaleDetail/JourneyDetail (RecordLayout's RelatedPanel, resource-mode)
// render the exact same column set — order, labels, editability and the
// extraHiddenColumns() tail — as the standalone Registrations screen,
// instead of each detail page hand-rolling its own 2-3-column subset (which
// also meant the columns picker there could only ever hide those 2-3
// columns, never add any other real column — see the fix on those pages).
export function registrationColumns(opts = {}, refresh) {
  return [
    { source: 'created_at', label: 'נוצר בתאריך', csv: r => r.created_at,
      render: r => <span className="small">{formatDateTime(r.created_at)}</span> },
    { source: 'registration_name', label: 'שם ההרשמה', csv: r => r.registration_name,
      render: r => <span style={{ fontWeight: 600, color: 'var(--mp)' }}>{r.registration_name || '-'}</span> },
    { source: 'customer_id', label: 'לקוח', csv: r => r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : '',
      render: r => r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : '-' },
    { source: 'journey_id', label: 'מסע', csv: r => r.journey?.name,
      render: r => r.journey?.name || '-' },
    { source: 'status', label: 'סטטוס הרשמה', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts} required
        display={v => <StatusBadge value={v} field="status" resource="registration" />} /> },
    { source: 'amount_paid', label: 'סכום ששולם', csv: r => r.amount_paid,
      render: r => <span className="small">{formatCurrency(r.amount_paid, r.currency)}</span> },
    ...extraHiddenColumns('registration', ['created_at', 'registration_name', 'customer_id', 'journey_id', 'status', 'amount_paid'], { table: 'registrations', opts, refresh }),
    ...metadataColumns('registration', ['created_at'], { users: opts.users || [] }),
  ]
}

export default function Registrations() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const [showNew, setShowNew] = useState(false)
  const [opts, setOpts] = useState({})
  const refresh = useRefresh()
  const filterGroups = useSchemaFilterGroups('registration')

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const columns = registrationColumns(opts, refresh)

  const presets = [
    { key: 'all', label: 'כל ההרשמות' },
    { key: 'unpaid', label: 'הרשמות שלא שולמו', filter: { 'status@in': UNPAID_STATUSES } },
  ]

  return (
    <>
      <ResourceList
        emptyLabel="הרשמות"
        resource="registrations" storeKey="registrations" exportName="registrations"
        filter={{ 'journey.business_unit': unit }}
        sort={{ field: 'created_at', order: 'DESC' }}
        columns={columns} presets={presets}
        search="שם ההרשמה / מספר חשבונית"
        facets={[{ field: 'status', title: 'סטטוס הרשמה', options: statusOpts }]}
        filters={filterGroups}
        rowPath={r => `/registrations/${r.id}`}
        bulkActions={<><BulkEditButton resource="registration" table="registrations" /><BulkDeleteButton /></>}
        actions={<button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> הרשמה חדשה</button>}
      />
      {showNew && (
        <RecordFormModal type="registration" defaults={{}} onClose={() => setShowNew(false)}
          onCreated={row => nav(`/registrations/${row.id}`)} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display, required }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="registrations" field={field} mode={mode} options={options} display={display} required={required} onSaved={() => refresh()} />
}
