import { useRefresh } from 'ra-core'
import { CALL_DIRECTIONS, CALL_RESULTS, enumOpts } from '../lib/constants'
import { extraHiddenColumns } from '../lib/schema'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import ResourceList from '../components/ResourceList'
import EditableCell from '../components/EditableCell'
import RelatedLink from '../components/RelatedLink'

const directionOpts = enumOpts(CALL_DIRECTIONS)
const resultOpts = enumOpts(CALL_RESULTS)
const RESULT_BADGE = { 'נענתה': 'ok', 'לא נענתה': 'err', 'תפוס': 'warn', 'השאיר הודעה': 'gray' }

// List + detail only, no create button — phone calls are auto-created from
// Voicenter/Max voice integrations (docs/domain-model.md). The table has 0
// rows today (no telephony integration wired up yet), so the empty state is
// the expected real-world state, not a bug — EmptyState (via ResourceList)
// shows a plain "no records" message with no misleading "create one" hint
// since no `actions` create button is passed here.
export default function PhoneCalls() {
  const unit = useBusinessUnitStore(s => s.unit)

  const columns = [
    { source: 'related_id', label: 'לקוח', sortable: false, csv: r => r.related_id,
      render: r => <RelatedLink relatedType={r.related_type} relatedId={r.related_id} showType={false} /> },
    { source: 'direction', label: 'כיוון', csv: r => r.direction,
      render: r => <span className={`badge ${r.direction === 'נכנסת' ? 'mp' : 'gray'}`}>{r.direction}</span> },
    { source: 'occurred_at', label: 'תאריך ושעה', csv: r => r.occurred_at,
      render: r => <span className="small">{r.occurred_at ? new Date(r.occurred_at).toLocaleString('he-IL') : '-'}</span> },
    { source: 'duration_seconds', label: 'משך (שניות)', csv: r => r.duration_seconds,
      render: r => r.duration_seconds != null ? `${r.duration_seconds} שנ׳` : '-' },
    { source: 'result', label: 'תוצאה', csv: r => r.result,
      render: r => <Cell row={r} field="result" mode="select" options={resultOpts}
        display={v => v ? <span className={`badge ${RESULT_BADGE[v] || 'gray'}`}>{v}</span> : '-'} /> },
    { source: 'recording_url', label: 'הקלטה', hidden: true, sortable: false, csv: r => r.recording_url,
      render: r => r.recording_url ? <a href={r.recording_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>▶ האזנה</a> : '-' },
    { source: 'business_unit', label: 'יחידה עסקית', hidden: true, csv: r => r.business_unit, render: r => r.business_unit || '-' },
    ...extraHiddenColumns('phone_call', ['related_id', 'direction', 'occurred_at', 'duration_seconds', 'result', 'recording_url', 'business_unit']),
  ]

  return (
    <ResourceList
      emptyLabel="שיחות טלפון"
      resource="phone_calls" storeKey="phone_calls" exportName="phone_calls"
      filter={{ business_unit: unit }}
      sort={{ field: 'occurred_at', order: 'DESC' }}
      columns={columns}
      search={false}
      facets={[
        { field: 'direction', title: 'כיוון', options: directionOpts },
        { field: 'result', title: 'תוצאה', options: resultOpts },
      ]}
      rowPath={r => `/phone-calls/${r.id}`}
    />
  )
}

function Cell({ row, field, mode, options, display }) {
  const refresh = useRefresh()
  return <EditableCell row={row} table="phone_calls" field={field} mode={mode} options={options} display={display} onSaved={() => refresh()} />
}
