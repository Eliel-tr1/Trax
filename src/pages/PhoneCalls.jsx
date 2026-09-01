import { useEffect, useState } from 'react'
import { useRefresh } from 'ra-core'
import { CALL_DIRECTIONS, CALL_RESULTS, enumOpts } from '../lib/constants'
import { extraHiddenColumns, metadataColumns } from '../lib/schema'
import { formatDateTime } from '../lib/format'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { loadOptions } from '../lib/api'
import useSchemaFilterGroups from '../hooks/useSchemaFilterGroups'
import ResourceList from '../components/ResourceList'
import { BulkDeleteButton } from '../components/admin/bulk-delete-button'
import BulkEditButton from '../components/list/BulkEditButton'
import EditableCell from '../components/EditableCell'
import UserEditableCell from '../components/UserEditableCell'
import RelatedLink from '../components/RelatedLink'
import StatusBadge from '../components/StatusBadge'

const directionOpts = enumOpts(CALL_DIRECTIONS)
const resultOpts = enumOpts(CALL_RESULTS)

// List + detail only, no create button — phone calls are auto-created from
// Voicenter/Max voice integrations (docs/domain-model.md). The table has 0
// rows today (no telephony integration wired up yet), so the empty state is
// the expected real-world state, not a bug — EmptyState (via ResourceList)
// shows a plain "no records" message with no misleading "create one" hint
// since no `actions` create button is passed here.
// Exported so a nested "שיחות" chip (CustomerDetail's related panel) uses
// the identical column set as the standalone PhoneCalls screen — see the
// same comment on Registrations.jsx's registrationColumns(). Takes `users`
// (loadOptions()'s users list) since assigned_user_id resolves a name/avatar
// from it — the caller is expected to have already loaded it. `refresh` is
// optional so the (rare) caller that only wants read-only CSV/labels can
// still omit it — passing it turns assigned_user_id into the same inline
// UserEditableCell pattern owner_id/assignee_id/account_manager_id use
// everywhere else (PhoneCallDetail already lets you set this via UserPicker,
// so the table gets the same edit path).
export function phoneCallsColumns(users, refresh) {
  const userFor = (id) => users.find(u => u.id === id)
  const nameFor = (id) => userFor(id)?.full_name || '-'

  return [
    { source: 'created_at', label: 'נוצר בתאריך', csv: r => r.created_at,
      render: r => <span className="small">{formatDateTime(r.created_at)}</span> },
    { source: 'related_id', label: 'לקוח', sortable: false, csv: r => r.related_id,
      render: r => <RelatedLink relatedType={r.related_type} relatedId={r.related_id} showType={false} /> },
    { source: 'direction', label: 'כיוון', csv: r => r.direction,
      render: r => <StatusBadge value={r.direction} field="direction" resource="phone_call" /> },
    { source: 'occurred_at', label: 'תאריך ושעה', csv: r => r.occurred_at,
      render: r => <span className="small">{formatDateTime(r.occurred_at)}</span> },
    { source: 'duration_seconds', label: 'משך (שניות)', csv: r => r.duration_seconds,
      render: r => r.duration_seconds != null ? `${r.duration_seconds} שנ׳` : '-' },
    { source: 'result', label: 'תוצאה', csv: r => r.result,
      render: r => <Cell row={r} field="result" mode="select" options={resultOpts}
        display={v => <StatusBadge value={v} field="result" resource="phone_call" />} /> },
    { source: 'assigned_user_id', label: 'נציג משויך', sortable: false, csv: r => nameFor(r.assigned_user_id),
      render: r => refresh
        ? <UserEditableCell row={r} table="phone_calls" field="assigned_user_id" users={users} placeholder="בחרו נציג" onSaved={() => refresh()} />
        : <span className="muted">{nameFor(r.assigned_user_id)}</span> },
    { source: 'recording_url', label: 'הקלטה', hidden: true, sortable: false, csv: r => r.recording_url,
      render: r => r.recording_url ? <a href={r.recording_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>▶ האזנה</a> : '-' },
    { source: 'summary', label: 'סיכום AI', hidden: true, sortable: false, csv: r => r.summary,
      render: r => r.summary ? <span className="small">{r.summary}</span> : '-' },
    { source: 'business_unit', label: 'יחידה עסקית', hidden: true, csv: r => r.business_unit, render: r => r.business_unit || '-' },
    ...extraHiddenColumns('phone_call', ['created_at', 'related_id', 'direction', 'occurred_at', 'duration_seconds', 'result', 'assigned_user_id', 'recording_url', 'summary', 'business_unit'], { table: 'phone_calls', users, refresh }),
    ...metadataColumns('phone_call', ['created_at'], { users }),
  ]
}

export default function PhoneCalls() {
  const unit = useBusinessUnitStore(s => s.unit)
  const [users, setUsers] = useState([])
  const refresh = useRefresh()
  const filterGroups = useSchemaFilterGroups('phone_call', ['business_unit'])
  useEffect(() => { loadOptions().then(o => setUsers(o.users || [])) }, [])

  const columns = phoneCallsColumns(users, refresh)

  return (
    <ResourceList
      emptyLabel="שיחות טלפון"
      resource="phone_calls" storeKey="phone_calls" exportName="phone_calls"
      filter={{ business_unit: unit }}
      sort={{ field: 'created_at', order: 'DESC' }}
      columns={columns}
      search={false}
      facets={[
        { field: 'direction', title: 'כיוון', options: directionOpts },
        { field: 'result', title: 'תוצאה', options: resultOpts },
      ]}
      filters={filterGroups}
      rowPath={r => `/phone-calls/${r.id}`}
      bulkActions={<><BulkEditButton resource="phone_call" table="phone_calls" /><BulkDeleteButton /></>}
    />
  )
}

function Cell({ row, field, mode, options, display }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="phone_calls" field={field} mode={mode} options={options} display={display} onSaved={() => refresh()} />
}
