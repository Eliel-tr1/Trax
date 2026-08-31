import { useEffect, useState } from 'react'
import { useRefresh } from 'ra-core'
import { TASK_STATUSES, TASK_PRIORITIES, TASK_PRIORITY_COLOR, enumOpts } from '../lib/constants'
import { extraHiddenColumns } from '../lib/schema'
import { formatDateTime } from '../lib/format'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { useAuthStore } from '../stores/authStore'
import { loadOptions } from '../lib/api'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import EditableCell from '../components/EditableCell'
import RecordFormModal from '../components/RecordFormModal'
import Icon from '../components/Icon'
import UserAvatar from '../components/UserAvatar'

const statusOpts = enumOpts(TASK_STATUSES)
const STATUS_BADGE = { 'פתוחה': 'warn', 'בוצעה': 'ok', 'בוטלה': 'gray' }
const RELATED_PATH = { customer: id => `/customers/${id}`, sale: id => `/sales/${id}` }
const RELATED_LABEL = { customer: 'לקוח', sale: 'מכירה', registration: 'הרשמה' }

// Wave 1: manual list + create only. Tasks open automatically in Wave 2
// (agent handoff, next-call-date automation — see docs/domain-model.md).
export default function Tasks() {
  const unit = useBusinessUnitStore(s => s.unit)
  const user = useAuthStore(s => s.user)
  const [showNew, setShowNew] = useState(false)
  const [users, setUsers] = useState([])

  useEffect(() => { loadOptions().then(o => setUsers(o.users || [])) }, [])
  const nameFor = (id) => users.find(u => u.id === id)?.full_name || '-'
  const userFor = (id) => users.find(u => u.id === id)

  const columns = [
    { source: 'subject', label: 'נושא', csv: r => r.subject,
      render: r => <span style={{ fontWeight: 600 }}>{r.subject}</span> },
    { source: 'related_type', label: 'משויך ל', csv: r => RELATED_LABEL[r.related_type] || r.related_type,
      render: r => {
        const path = RELATED_PATH[r.related_type]?.(r.related_id)
        return path ? <a href={`#${path}`} className="small" style={{ color: 'var(--mp)' }}>{RELATED_LABEL[r.related_type]}</a> : (RELATED_LABEL[r.related_type] || '-')
      } },
    { source: 'assignee_id', label: 'אחראי', csv: r => nameFor(r.assignee_id),
      render: r => <UserAvatar user={userFor(r.assignee_id)} /> },
    { source: 'due_at', label: 'תאריך יעד', csv: r => r.due_at,
      render: r => <span className="small">{formatDateTime(r.due_at)}</span> },
    { source: 'priority', label: 'עדיפות', csv: r => r.priority,
      render: r => <span className="badge" style={{ background: TASK_PRIORITY_COLOR[r.priority], color: '#fff' }}>{r.priority}</span> },
    { source: 'status', label: 'סטטוס', csv: r => r.status,
      render: r => <Cell row={r} field="status" mode="select" options={statusOpts}
        display={v => <span className={`badge ${STATUS_BADGE[v] || 'gray'}`}>{v}</span>} /> },
    ...extraHiddenColumns('task', ['subject', 'related_type', 'assignee_id', 'due_at', 'priority', 'status']),
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
        sort={{ field: 'due_at', order: 'ASC' }}
        columns={columns} presets={presets}
        search="נושא"
        facets={[
          { field: 'status', title: 'סטטוס', options: statusOpts },
          { field: 'priority', title: 'עדיפות', options: enumOpts(TASK_PRIORITIES) },
        ]}
        bulkActions={<BulkDeleteButton />}
        actions={<button className="btn sm" onClick={() => setShowNew(true)}><Icon name="plus" size={15} /> משימה חדשה</button>}
      />
      {showNew && (
        <RecordFormModal type="task" defaults={{ business_unit: unit }} onClose={() => setShowNew(false)} onCreated={() => {}} />
      )}
    </>
  )
}

function Cell({ row, field, mode, options, display }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="tasks" field={field} mode={mode} options={options} display={display} onSaved={() => refresh()} />
}
