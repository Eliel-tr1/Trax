import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { SCHEMA } from '../lib/schema'
import { loadOptions } from '../lib/api'
import { toast } from './Toaster'
import Icon from './Icon'
import ActivityFeed from './ActivityFeed'
import RecordFormModal from './RecordFormModal'
import ResourceList from './ResourceList'
import UserAvatar from './UserAvatar'
import { confirmDialog } from './Dialogs'
import { formatDateTime } from '../lib/format'

// Ported from bina-crm — Fireberry-style record shell (header, optional
// stage bar, related-record chips, field sections + activity feed).
// REL_STYLE re-keyed for TRAX's own relation names.
const REL_STYLE = {
  sales: { icon: 'money', hue: 262 },
  registrations: { icon: 'tag', hue: 199 },
  contacts: { icon: 'users', hue: 291 },
  customers: { icon: 'users', hue: 291 },
  journeys: { icon: 'calendar', hue: 45 },
  meetings: { icon: 'calendar', hue: 155 },
  phone_calls: { icon: 'phone', hue: 20 },
}
const relStyle = (key) => REL_STYLE[key] || { icon: 'grid', hue: 270 }

// related: [{ key, label, count, resource, fk, recordId, columns, onOpen }]
// actions: [{ icon, title, href?, onClick? }]
// stage: { stages:[{key,label}], current, onSet }
// objectType/recordId: for the polymorphic ActivityFeed (notes/tasks)
export default function RecordLayout({ title, subtitle, status, backTo, actions = [], related = [], stage, objectType, recordId, recordType, record, onRelatedCreated, feed = true, feedProps = {}, children }) {
  const nav = useNavigate()
  const [openRel, setOpenRel] = useState(null)
  const [createRel, setCreateRel] = useState(null)

  const def = recordType ? SCHEMA[recordType] : null
  const relations = def?.relations || []

  const del = async () => {
    if (!def) return
    if (!await confirmDialog(`למחוק ${def.labelOne} "${title}"? ${def.softDelete ? '(ניתן לשחזר)' : ''}`)) return
    if (def.softDelete) {
      const { error } = await supabase.from(def.table).update({ deleted_at: new Date().toISOString() }).eq('id', recordId)
      if (error) return toast('המחיקה נכשלה', 'err')
    } else {
      const { error } = await supabase.from(def.table).delete().eq('id', recordId)
      if (error) return toast('המחיקה נכשלה (ייתכן שיש רשומות מקושרות)', 'err')
    }
    toast('נמחק')
    nav(backTo || def.listPath || '/')
  }

  return (
    <div>
      <div className="rec-header" data-tour="rec-header">
        <div className="row flex-wrap" style={{ gap: 10 }}>
          {backTo && <button className="btn ghost sm" onClick={() => nav(backTo)}><Icon name="chevron" size={16} style={{ transform: 'scaleX(-1)' }} /></button>}
          <div className="min-w-[60%] flex-1 sm:min-w-0">
            <div className="rec-title">{title}</div>
            {subtitle && <div className="muted small">{subtitle}</div>}
          </div>
          {status && <span className={`badge ${status.badge || 'gray'}`}>{status.label}</span>}
          {actions.map((a, i) => {
            const inner = <><Icon name={a.icon} size={15} /><span className="qa-label">{a.title}</span></>
            return a.href
              ? <a key={i} className="qa-btn" href={a.href} target="_blank" rel="noreferrer" title={a.title}>{inner}</a>
              : <button key={i} className="qa-btn" onClick={a.onClick} title={a.title}>{inner}</button>
          })}
          {def && <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" aria-hidden="true" />}
          {def && <button className="qa-btn danger" onClick={del} title={`מחק ${def.labelOne}`}><Icon name="trash" size={15} /><span className="qa-label">מחק</span></button>}
        </div>

        {stage && (
          <div className="stage-bar" ref={el => {
            const cur = el?.querySelector('.stage.current')
            if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' })
          }}>
            {stage.stages.map((s, i) => {
              const curIdx = stage.stages.findIndex(x => x.key === stage.current)
              const cls = s.key === stage.current ? 'current' : i < curIdx ? 'done' : ''
              return <div key={s.key} className={`stage ${cls}`} onClick={() => stage.onSet?.(s.key)}>{s.label}</div>
            })}
          </div>
        )}

        {(() => {
          const withRows = related.filter(r => (r.count ?? r.rows?.length ?? 0) > 0)
          if (!withRows.length && !relations.length) return null
          return (
            <div className="rel-chips" data-tour="rec-related">
              {withRows.map(r => {
                const st = relStyle(r.key)
                const active = openRel === r.key
                return (
                  <div key={r.key} className={`rel-chip ${active ? 'active' : ''}`}
                    style={{
                      '--rel-h': st.hue,
                      background: `hsl(${st.hue} 78% ${active ? 86 : 94}%)`,
                      borderColor: `hsl(${st.hue} 60% ${active ? 52 : 74}%)`,
                      color: `hsl(${st.hue} 72% 27%)`,
                    }}
                    onClick={() => setOpenRel(active ? null : r.key)}>
                    <Icon name={st.icon} size={14} />
                    {r.label}
                    <span className="cnt" style={{ background: `hsl(${st.hue} 55% 42%)` }}>
                      {r.count ?? (r.rows?.length || 0)}
                    </span>
                  </div>
                )
              })}
              {relations.map(rel => (
                <button key={rel.childType} className="rel-add" onClick={() => setCreateRel(rel)} title={`צור ${rel.label}`}>
                  <Icon name="plus" size={12} /> {rel.label}
                </button>
              ))}
            </div>
          )
        })()}
        {openRel && <RelatedPanel r={related.find(x => x.key === openRel)} nav={nav} />}
      </div>

      <div className="rec-grid" style={{ gridTemplateColumns: feed ? '1fr 1fr' : '1fr' }}>
        <div data-tour="rec-fields" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
          {record && <AuditFooter record={record} />}
        </div>
        {feed && <ActivityFeed objectType={objectType} recordId={recordId} record={record} {...feedProps} />}
      </div>

      {createRel && (
        <RecordFormModal
          type={createRel.childType}
          defaults={buildInherit(createRel, record, recordId)}
          onClose={() => setCreateRel(null)}
          onCreated={(row) => { setCreateRel(null); onRelatedCreated ? onRelatedCreated(createRel.childType, row) : nav(SCHEMA[createRel.childType].detailPath?.(row.id) || backTo || '/') }}
        />
      )}
    </div>
  )
}

function buildInherit(rel, record, recordId) {
  const d = { [rel.fkOnChild]: recordId }
  if (rel.inherit && record) {
    for (const [parentField, childField] of Object.entries(rel.inherit)) {
      if (record[parentField] != null) d[childField] = record[parentField]
    }
  }
  return d
}

// Small metadata footer: who/when created and last updated, plus a link to
// the automation run that wrote the record (execution_url) when present.
// Names are resolved from loadOptions()'s cached users list — created_by/
// updated_by are auth.users uuids (see data/004_audit_fields.sql), null
// meaning "מערכת" (system/API write, no human rep attached).
function AuditFooter({ record }) {
  const [users, setUsers] = useState(null)
  useEffect(() => { loadOptions().then(o => setUsers(o.users || [])) }, [])

  if (!('created_at' in record) && !('updated_at' in record)) return null
  const userFor = (id) => id ? users?.find(u => u.id === id) : null
  const fmt = (v) => v ? formatDateTime(v) : null

  const createdAt = fmt(record.created_at)
  const updatedAt = fmt(record.updated_at)

  return (
    <div className="muted small" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', padding: '10px 2px 0', borderTop: '1px solid var(--border-soft)', marginTop: 4 }}>
      {createdAt && (
        <span className="inline-flex items-center gap-1.5">
          נוצר ב-{createdAt} על ידי {record.created_by ? <UserAvatar user={userFor(record.created_by)} size="xs" /> : 'מערכת'}
        </span>
      )}
      {updatedAt && updatedAt !== createdAt && (
        <span className="inline-flex items-center gap-1.5">
          עודכן ב-{updatedAt} על ידי {record.updated_by ? <UserAvatar user={userFor(record.updated_by)} size="xs" /> : 'מערכת'}
        </span>
      )}
      {record.execution_url && (
        <a href={record.execution_url} target="_blank" rel="noreferrer" style={{ color: 'var(--mp)' }}>צפייה בהרצה ↗</a>
      )}
    </div>
  )
}

function RelatedPanel({ r, nav }) {
  if (!r) return null

  // r.filter is an escape hatch for polymorphic relations (meetings/
  // phone_calls: related_type + related_id, not a single FK column) — a
  // plain fk/recordId pair can't express a two-field filter.
  if (r.resource && (r.filter || (r.fk && r.recordId))) {
    const cols = r.listColumns || (r.columns || []).map((c, i) => ({
      source: c.source || `c${i}`,
      label: c.label,
      render: c.get,
      csv: c.get,
      sortable: false,
    }))
    return (
      <div className="mt-3">
        <ResourceList
          resource={r.resource}
          storeKey={`rel_${r.resource}`}
          filter={r.filter || { [r.fk]: r.recordId }}
          sort={r.sort || { field: 'created_at', order: 'DESC' }}
          perPage={r.perPage || 10}
          columns={cols}
          presets={r.presets}
          facets={r.facets}
          search={r.search ?? false}
          rowPath={r.onOpen}
          bulkActions={r.bulkActions}
          exportName={r.resource}
        />
      </div>
    )
  }

  const rows = r.rows || []
  return (
    <div className="table-wrap" style={{ marginTop: 12 }}>
      {rows.length === 0 ? <div className="empty small">אין רשומות</div> : (
        <table className="grid">
          <thead><tr>{r.columns.map((c, i) => <th key={i}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className={r.onOpen ? 'clickable' : ''} onClick={() => r.onOpen && nav(r.onOpen(row))}>
                {r.columns.map((c, i) => <td key={i}>{c.get(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
