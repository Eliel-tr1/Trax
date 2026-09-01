import { useEffect, useState } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { CUSTOMER_STATUSES, LEAD_SOURCES, enumOpts } from '../lib/constants'
import { extraHiddenColumns, metadataColumns } from '../lib/schema'
import { formatDate, formatDateTime } from '../lib/format'
import { loadOptions } from '../lib/api'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import useSchemaFilterGroups from '../hooks/useSchemaFilterGroups'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import BulkEditButton from '../components/list/BulkEditButton'
import EditableCell from '../components/EditableCell'
import UserEditableCell from '../components/UserEditableCell'
import RecordFormModal from '../components/RecordFormModal'
import Icon from '../components/Icon'
import StatusBadge from '../components/StatusBadge'

const statusOpts = enumOpts(CUSTOMER_STATUSES)
const sourceOpts = enumOpts(LEAD_SOURCES)

function daysAgoIso(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString()
}

export default function Customers() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const drillFilter = useDrillInitialFilter()
  const [showNew, setShowNew] = useState(false)
  const [opts, setOpts] = useState({})
  const users = opts.users || []
  const refresh = useRefresh()
  const filterGroups = useSchemaFilterGroups('customer', ['business_unit'])

  useEffect(() => { loadOptions().then(setOpts) }, [])

  const columns = [
    { source: 'created_at', label: 'נוצר בתאריך', csv: r => r.created_at,
      render: r => <span className="small">{formatDateTime(r.created_at)}</span> },
    { source: 'first_name', label: 'שם', csv: r => `${r.first_name} ${r.last_name}`,
      render: r => <span style={{ fontWeight: 600, color: 'var(--mp)' }}>{r.first_name} {r.last_name}</span> },
    { source: 'mobile_phone', label: 'טלפון', csv: r => r.mobile_phone,
      render: r => <Cell row={r} field="mobile_phone" mode="phone" /> },
    { source: 'email', label: 'אימייל', csv: r => r.email,
      render: r => <Cell row={r} field="email" display={v => <span className="small" dir="ltr">{v || '-'}</span>} /> },
    { source: 'lead_source', label: 'מקור הגעה', csv: r => r.lead_source,
      render: r => <Cell row={r} field="lead_source" mode="select" options={sourceOpts} display={v => v || '-'} /> },
    { source: 'campaign', label: 'קמפיין', hidden: true, csv: r => r.campaign, render: r => r.campaign || '-' },
    { source: 'status', label: 'סטטוס', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts} required
        display={v => <StatusBadge value={v} field="status" resource="customer" />} /> },
    { source: 'first_contact_at', label: 'פנייה ראשונה', csv: r => r.first_contact_at,
      render: r => <span className="small">{formatDate(r.first_contact_at)}</span> },
    { source: 'account_manager_id', label: 'מנהל לקוח', csv: r => users.find(u => u.id === r.account_manager_id)?.full_name || '',
      render: r => <UserEditableCell row={r} table="customers" field="account_manager_id" users={users} placeholder="בחרו מנהל לקוח"
        onSaved={() => refresh()} /> },
    // Every remaining customer schema field, hidden by default — makes the
    // columns picker offer the full field set, not just this curated view.
    // ctx makes these real inline-editable cells (field-parity fix), not
    // just plain text.
    ...extraHiddenColumns('customer', ['created_at', 'first_name', 'mobile_phone', 'email', 'lead_source', 'campaign', 'status', 'first_contact_at', 'account_manager_id'], { table: 'customers', users, opts, refresh }),
    ...metadataColumns('customer', ['created_at'], { users }),
  ]

  const presets = [
    { key: 'all', label: 'כל הלקוחות' },
    { key: 'new_leads', label: 'לידים חדשים', filter: { status: 'ליד חדש', 'first_contact_at@gte': daysAgoIso(7) } },
  ]

  return (
    <>
      <ResourceList
        emptyLabel="לקוחות"
        resource="customers" storeKey="customers" exportName="customers"
        filter={{ business_unit: unit }}
        initialFilter={drillFilter}
        sort={{ field: 'created_at', order: 'DESC' }}
        columns={columns} presets={presets}
        search="שם / טלפון / אימייל"
        facets={[
          { field: 'status', title: 'סטטוס', options: statusOpts },
          { field: 'lead_source', title: 'מקור הגעה', options: sourceOpts },
        ]}
        filters={filterGroups}
        rowPath={r => `/customers/${r.id}`}
        bulkActions={<><BulkEditButton resource="customer" table="customers" /><BulkDeleteButton /></>}
        actions={<button className="btn sm" data-tour="new-record" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> לקוח חדש</button>}
      />
      {showNew && (
        <RecordFormModal type="customer" defaults={{ business_unit: unit }} onClose={() => setShowNew(false)}
          onCreated={row => nav(`/customers/${row.id}`)} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display, required }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="customers" field={field} mode={mode} options={options} display={display} required={required} onSaved={() => refresh()} />
}

/* Drill-down support: the Dashboard navigates here with URL params
   (?drill_stage=...&drill_from=...) instead of location.state — search
   params survive hard refreshes and work identically in every browser. */
export function useDrillInitialFilter() {
  const [params] = useSearchParams()
  const filter = {}
  for (const [key, value] of params.entries()) {
    if (key.startsWith('drill_')) {
      const field = key.slice(6) // strip the drill_ prefix
      // encoded 'null' means the dashboard bucket was "(empty)" → is-null
      if (value === '__null__') filter[`${field}@is`] = null
      else filter[field] = value
    }
  }
  return Object.keys(filter).length ? filter : undefined
}
