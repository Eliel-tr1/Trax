import { useEffect, useState } from 'react'
import { useRefresh } from 'ra-core'
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLOR, enumOpts } from '../lib/constants'
import { extraHiddenColumns, metadataColumns } from '../lib/schema'
import { formatDateTime } from '../lib/format'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { useAuthStore } from '../stores/authStore'
import { loadOptions, getOptionsSync } from '../lib/api'
import useSchemaFilterGroups from '../hooks/useSchemaFilterGroups'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import EditableCell from '../components/EditableCell'
import UserEditableCell from '../components/UserEditableCell'
import RecordFormModal from '../components/RecordFormModal'
import RelatedLink from '../components/RelatedLink'
import Icon from '../components/Icon'

const statusOpts = enumOpts(TASK_STATUSES)
const STATUS_BADGE = { 'פתוחה': 'warn', 'בוצעה': 'ok', 'בוטלה': 'gray' }
const RELATED_LABEL = { customer: 'לקוח', sale: 'מכירה', registration: 'הרשמה' }

// CSV export can't await RelatedLink's async resolution, so it reads
// whatever loadOptions() has already cached (populated on mount below —
// see lib/api.js's getOptionsSync). Falls back to the type label if the
// specific record can't be resolved (deleted, or cache not warm yet).
const relatedNameFor = (r) => {
  const opts = getOptionsSync()
  const name = !opts ? null
    : r.related_type === 'customer' ? opts.customers.find(c => c.id === r.related_id)?.name
    : r.related_type === 'sale' ? opts.sales.find(s => s.id === r.related_id)?.deal_name
    : r.related_type === 'registration' ? opts.registrations?.find(x => x.id === r.related_id)?.registration_name
    : null
  return name || RELATED_LABEL[r.related_type] || r.related_type
}

// Wave 1: manual list + create only. Tasks open automatically in Wave 2
// (agent handoff, next-call-date automation — see docs/domain-model.md).
export default function Tasks() {
  const unit = useBusinessUnitStore(s => s.unit)
  const user = useAuthStore(s => s.user)
  const [showNew, setShowNew] = useState(false)
  const [opts, setOpts] = useState({})
  const users = opts.users || []
  const refresh = useRefresh()
  const filterGroups = useSchemaFilterGroups('task', ['business_unit'])

  useEffect(() => { loadOptions().then(setOpts) }, [])
  const nameFor = (id) => users.find(u => u.id === id)?.full_name || '-'

  const columns = [
    { source: 'created_at', label: 'נוצר בתאריך', csv: r => r.created_at,
      render: r => <span className="small">{formatDateTime(r.created_at)}</span> },
    { source: 'subject', label: 'נושא', csv: r => r.subject,
      render: r => <span style={{ fontWeight: 600 }}>{r.subject}</span> },
    { source: 'related_type', label: 'משויך ל', csv: r => relatedNameFor(r),
      render: r => <RelatedLink relatedType={r.related_type} relatedId={r.related_id} showType={false} /> },
    { source: 'assignee_id', label: 'אחראי', csv: r => nameFor(r.assignee_id),
      render: r => <UserEditableCell row={r} table="tasks" field="assignee_id" users={users} placeholder="בחרו אחראי"
        onSaved={() => refresh()} /> },
    { source: 'due_at', label: 'תאריך יעד', csv: r => r.due_at,
      render: r => <span className="small">{formatDateTime(r.due_at)}</span> },
    { source: 'priority', label: 'עדיפות', csv: r => r.priority,
      render: r => <span className="badge" style={{ background: TASK_PRIORITY_COLOR[r.priority], color: '#fff' }}>{r.priority}</span> },
    { source: 'status', label: 'סטטוס', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts} required
        display={v => <span className={`badge ${STATUS_BADGE[v] || 'gray'}`}>{v}</span>} /> },
    ...extraHiddenColumns('task', ['created_at', 'subject', 'related_type', 'assignee_id', 'due_at', 'priority', 'status'], { table: 'tasks', users, opts, refresh }),
    ...metadataColumns('task', ['created_at'], { users }),
  ]

  const presets = [
    { key: 'all', label: 'הכול' },
    { key: 'open', label: 'פתוחות', filter: { status: 'פתוחה' } },
    ...(user?.id ? [{ key: 'mine', label: 'שלי', filter: { assignee_id: user.id, status: 'פתוחה' } }] : []),
  ]

  return (
    <>
      <ResourceList
        emptyLabel="משימות"
        resource="tasks" storeKey="tasks" exportName="tasks"
        filter={{ business_unit: unit }}
        sort={{ field: 'created_at', order: 'DESC' }}
        columns={columns} presets={presets}
        search="נושא"
        facets={[
          { field: 'status', title: 'סטטוס', options: statusOpts },
          { field: 'priority', title: 'עדיפות', options: enumOpts(TASK_PRIORITIES) },
        ]}
        filters={filterGroups}
        bulkActions={<BulkDeleteButton />}
        actions={<button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> משימה חדשה</button>}
      />
      {showNew && (
        <RecordFormModal type="task" defaults={{ business_unit: unit }} onClose={() => setShowNew(false)} onCreated={() => {}} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display, required }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="tasks" field={field} mode={mode} options={options} display={display} required={required} onSaved={() => refresh()} />
}
