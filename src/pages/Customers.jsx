import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRefresh } from 'ra-core'
import { CUSTOMER_STATUSES, LEAD_SOURCES, enumOpts } from '../lib/constants'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import EditableCell from '../components/EditableCell'
import RecordFormModal from '../components/RecordFormModal'
import Icon from '../components/Icon'

const statusOpts = enumOpts(CUSTOMER_STATUSES)
const sourceOpts = enumOpts(LEAD_SOURCES)
const STATUS_BADGE = { 'ליד חדש': 'mp', 'בטיפול': 'warn', 'לקוח פעיל': 'ok', 'לקוח עבר': 'gray', 'לא רלוונטי': 'gray' }

function daysAgoIso(n) {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString()
}

export default function Customers() {
  const nav = useNavigate()
  const unit = useBusinessUnitStore(s => s.unit)
  const [showNew, setShowNew] = useState(false)

  const columns = [
    { source: 'first_name', label: 'שם', csv: r => `${r.first_name} ${r.last_name}`,
      render: r => <span style={{ fontWeight: 600, color: 'var(--mp)' }}>{r.first_name} {r.last_name}</span> },
    { source: 'mobile_phone', label: 'טלפון', csv: r => r.mobile_phone,
      render: r => <Cell row={r} field="mobile_phone" display={v => <span className="small" dir="ltr">{v || '-'}</span>} /> },
    { source: 'email', label: 'אימייל', csv: r => r.email,
      render: r => <Cell row={r} field="email" display={v => <span className="small" dir="ltr">{v || '-'}</span>} /> },
    { source: 'lead_source', label: 'מקור הגעה', csv: r => r.lead_source,
      render: r => <Cell row={r} field="lead_source" mode="select" options={sourceOpts} display={v => v || '-'} /> },
    { source: 'campaign', label: 'קמפיין', hidden: true, csv: r => r.campaign, render: r => r.campaign || '-' },
    { source: 'status', label: 'סטטוס', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts}
        display={v => <span className={`badge ${STATUS_BADGE[v] || 'gray'}`}>{v}</span>} /> },
    { source: 'first_contact_at', label: 'פנייה ראשונה', csv: r => r.first_contact_at,
      render: r => <span className="small">{r.first_contact_at ? new Date(r.first_contact_at).toLocaleDateString('he-IL') : '-'}</span> },
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
        sort={{ field: 'first_contact_at', order: 'DESC' }}
        columns={columns} presets={presets}
        search="שם / טלפון / אימייל"
        facets={[
          { field: 'status', title: 'סטטוס', options: statusOpts },
          { field: 'lead_source', title: 'מקור הגעה', options: sourceOpts },
        ]}
        rowPath={r => `/customers/${r.id}`}
        bulkActions={<BulkDeleteButton />}
        actions={<button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> לקוח חדש</button>}
      />
      {showNew && (
        <RecordFormModal type="customer" defaults={{ business_unit: unit }} onClose={() => setShowNew(false)}
          onCreated={row => nav(`/customers/${row.id}`)} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="customers" field={field} mode={mode} options={options} display={display} onSaved={() => refresh()} />
}
