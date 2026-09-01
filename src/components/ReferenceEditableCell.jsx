import { useState } from 'react'
import { updateField } from '../lib/api'
import EntityPicker from './EntityPicker'

/* Inline-editable entity-reference list column — the same click-to-edit
   dichotomy UserEditableCell uses for user-reference columns (owner_id/
   assignee_id/account_manager_id), but for a reference to any other entity
   (journeys/customers/sales/…) resolved through EntityPicker instead of
   UserPicker. Built so extraHiddenColumns() in lib/schema.js can promote
   ANY schema field with `optionsFrom` to a real, editable table column, not
   just plain resolved-but-static text. */
export default function ReferenceEditableCell({
  row, table, field, resource, items, labelField, placeholder = 'בחירה…', onSaved,
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const list = items || []
  const current = list.find(x => x.id === row[field])
  const labelFn = labelField || (x => x?.name || x?.deal_name || `${x?.first_name || ''} ${x?.last_name || ''}`.trim() || '(ללא שם)')

  const save = async (newVal) => {
    setEditing(false)
    if (newVal === row[field]) return
    setSaving(true)
    try { await updateField(table, row, field, newVal); onSaved?.(field, newVal) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <span onClick={e => e.stopPropagation()}>
        <EntityPicker resource={resource} items={items} labelField={labelField} value={row[field]} onChange={save}
          autoOpen onClose={() => setEditing(false)} placeholder={placeholder} />
      </span>
    )
  }

  return (
    <span className="cell-edit" style={{ opacity: saving ? 0.5 : 1 }}
      onClick={e => { e.stopPropagation(); setEditing(true) }} title="לחצו לעריכה">
      {current ? labelFn(current) : <span className="cell-empty">-</span>}
    </span>
  )
}
