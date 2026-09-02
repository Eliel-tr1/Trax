import { useState } from 'react'
import { updateField } from '../lib/api'
import UserAvatar from './UserAvatar'
import UserPicker from './UserPicker'

/* Inline-editable user-reference list column: avatar (+ tooltip full name,
   UserAvatar's own pattern) when idle, UserPicker popup when clicked — the
   click-to-edit dichotomy EditableCell uses for text/select cells, but
   EditableCell has no 'user' mode (its <select> can't show a face), so this
   is the user-column equivalent, built directly on UserPicker/UserAvatar. */
export default function UserEditableCell({ row, table, field, users = [], onSaved, placeholder = 'בחרו נציג' }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const user = users.find(u => u.id === row[field])

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
        <UserPicker users={users} value={row[field]} onChange={save} autoOpen avatarsOnly
          onClose={() => setEditing(false)} placeholder={placeholder} />
      </span>
    )
  }

  return (
    <span
      className="cell-edit" style={{ opacity: saving ? 0.5 : 1, cursor: 'pointer', display: 'inline-flex' }}
      onClick={e => { e.stopPropagation(); setEditing(true) }} title="לחצו לעריכה"
    >
      <UserAvatar user={user} />
    </span>
  )
}
