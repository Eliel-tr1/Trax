import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { SALE_STAGES, SALE_STAGES_CLOSED, LOSS_REASONS, enumOpts } from '../lib/constants'
import { extraHiddenColumns, metadataColumns } from '../lib/schema'
import { useDrillInitialFilter } from './Customers'
import { formatDateTime } from '../lib/format'
import { loadOptions } from '../lib/api'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { useAuthStore } from '../stores/authStore'
import useSchemaFilterGroups from '../hooks/useSchemaFilterGroups'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import BulkEditButton from '../components/list/BulkEditButton'
import EditableCell from '../components/EditableCell'
import UserEditableCell from '../components/UserEditableCell'
import ReferenceEditableCell from '../components/ReferenceEditableCell'
import RecordFormModal from '../components/RecordFormModal'
import Icon from '../components/Icon'
import StatusBadge from '../components/StatusBadge'

const stageOpts = enumOpts(SALE_STAGES)
const OPEN_STAGES = SALE_STAGES.filter(s => !SALE_STAGES_CLOSED.includes(s))

// Exported (opts/refresh passed in, since owner_id/journey_id are editable
// and need both) so a nested "מכירות" chip (CustomerDetail's related
// panel) uses the identical column set as the standalone Sales screen —
// see the same comment on Registrations.jsx's registrationColumns().
export function salesColumns(opts, refresh) {
  const users = opts.users || []
  const journeys = opts.journeys || []
  return [
    { source: 'created_at', label: 'נוצר בתאריך', csv: r => r.created_at,
      render: r => <span className="small">{formatDateTime(r.created_at)}</span> },
    { source: 'deal_name', label: 'עסקה', csv: r => r.deal_name,
      render: r => <span style={{ fontWeight: 600, color: 'var(--mp)' }}>{r.deal_name || '-'}</span> },
    { source: 'customer_id', label: 'לקוח', csv: r => r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : '',
      render: r => r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : '-' },
    { source: 'stage', label: 'שלב מכירה', csv: r => r.stage,
      render: r => <Cell row={r} field="stage" mode="select" options={stageOpts} required
        display={v => <StatusBadge value={v} field="stage" resource="sale" />} /> },
    { source: 'channel', label: 'ערוץ פנייה', csv: r => r.channel, render: r => r.channel || '-' },
    { source: 'lead_source', label: 'מקור הגעה', hidden: true, csv: r => r.lead_source, render: r => r.lead_source || '-' },
    { source: 'owner_id', label: 'נציג מכירות', csv: r => users.find(u => u.id === r.owner_id)?.full_name || '',
      render: r => <UserEditableCell row={r} table="sales" field="owner_id" users={users} placeholder="בחרו נציג מכירות"
        onSaved={() => refresh()} /> },
    // Was showing the raw journey_id (never resolved to a name) and had no
    // inline edit at all — SaleDetail.jsx already lets you set this via
    // EntityPicker, so the table gets the same ReferenceEditableCell
    // pattern owner_id/account_manager_id use for user references.
    { source: 'journey_id', label: 'מסע מבוקש', csv: r => journeys.find(j => j.id === r.journey_id)?.name || '',
      render: r => <ReferenceEditableCell row={r} table="sales" field="journey_id" resource="journeys" items={journeys}
        placeholder="בחרו מסע" onSaved={() => refresh()} /> },
    { source: 'loss_reason', label: 'סיבת אי סגירה', hidden: true, csv: r => r.loss_reason, render: r => r.loss_reason || '-' },
    ...extraHiddenColumns('sale', ['created_at', 'deal_name', 'customer_id', 'stage', 'channel', 'lead_source', 'owner_id', 'journey_id', 'loss_reason'], { table: 'sales', users, opts, refresh }),
    ...metadataColumns('sale', ['created_at'], { users }),
  ]
}

export default function Sales() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const user = useAuthStore(s => s.user)
  const drillFilter = useDrillInitialFilter()
  const [showNew, setShowNew] = useState(false)
  const [opts, setOpts] = useState({})
  const users = opts.users || []
  const refresh = useRefresh()
  const filterGroups = useSchemaFilterGroups('sale', ['business_unit'])

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const columns = salesColumns(opts, refresh)

  const presets = [
    { key: 'all', label: 'הכול' },
    { key: 'open', label: 'עסקאות פתוחות', filter: { 'stage@in': OPEN_STAGES } },
    ...(user?.id ? [{ key: 'mine_due', label: 'ממתין לי', filter: { owner_id: user.id, 'next_call_at@lte': new Date().toISOString() } }] : []),
  ]

  return (
    <>
      <ResourceList
        emptyLabel="מכירות"
        resource="sales" storeKey="sales" exportName="sales"
        filter={{ business_unit: unit }}
        initialFilter={drillFilter}
        sort={{ field: 'created_at', order: 'DESC' }}
        columns={columns} presets={presets}
        search="שם עסקה / קמפיין"
        facets={[
          { field: 'stage', title: 'שלב מכירה', options: stageOpts },
          { field: 'loss_reason', title: 'סיבת אי סגירה', options: enumOpts(LOSS_REASONS) },
        ]}
        filters={filterGroups}
        rowPath={r => `/sales/${r.id}`}
        bulkActions={<><BulkEditButton resource="sale" table="sales" /><BulkDeleteButton /></>}
        actions={<button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> מכירה חדשה</button>}
      />
      {showNew && (
        <RecordFormModal type="sale" defaults={{ business_unit: unit }} onClose={() => setShowNew(false)}
          onCreated={row => nav(`/sales/${row.id}`)} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display, required }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="sales" field={field} mode={mode} options={options} display={display} required={required} onSaved={() => refresh()} />
}
