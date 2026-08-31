import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { REGISTRATION_STATUSES, enumOpts } from '../lib/constants'
import { extraHiddenColumns } from '../lib/schema'
import { formatCurrency } from '../lib/format'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import EditableCell from '../components/EditableCell'
import RecordFormModal from '../components/RecordFormModal'
import Icon from '../components/Icon'

const statusOpts = enumOpts(REGISTRATION_STATUSES)
export const REGISTRATION_STATUS_BADGE = {
  'משוריין': 'gray', 'שולמה מקדמה': 'warn', 'שולם במלואו': 'ok', 'בוטל': 'err',
}
const UNPAID_STATUSES = ['משוריין', 'שולמה מקדמה']

export default function Registrations() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const [showNew, setShowNew] = useState(false)

  const columns = [
    { source: 'registration_name', label: 'שם ההרשמה', csv: r => r.registration_name,
      render: r => <span style={{ fontWeight: 600, color: 'var(--mp)' }}>{r.registration_name || '-'}</span> },
    { source: 'customer_id', label: 'לקוח', csv: r => r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : '',
      render: r => r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : '-' },
    { source: 'journey_id', label: 'מסע', csv: r => r.journey?.name,
      render: r => r.journey?.name || '-' },
    { source: 'status', label: 'סטטוס הרשמה', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts}
        display={v => <span className={`badge ${REGISTRATION_STATUS_BADGE[v] || 'gray'}`}>{v}</span>} /> },
    { source: 'amount_paid', label: 'סכום ששולם', csv: r => r.amount_paid,
      render: r => <span className="small">{formatCurrency(r.amount_paid, r.currency)}</span> },
    ...extraHiddenColumns('registration', ['registration_name', 'customer_id', 'journey_id', 'status', 'amount_paid']),
  ]

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
        sort={{ field: 'registered_at', order: 'DESC' }}
        columns={columns} presets={presets}
        search="שם ההרשמה / מספר חשבונית"
        facets={[{ field: 'status', title: 'סטטוס הרשמה', options: statusOpts }]}
        rowPath={r => `/registrations/${r.id}`}
        bulkActions={<BulkDeleteButton />}
        actions={<button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> הרשמה חדשה</button>}
      />
      {showNew && (
        <RecordFormModal type="registration" defaults={{}} onClose={() => setShowNew(false)}
          onCreated={row => nav(`/registrations/${row.id}`)} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="registrations" field={field} mode={mode} options={options} display={display} onSaved={() => refresh()} />
}
