import { SCHEMA } from './schema'

// Fields whose free text is long-form prose, not something worth filtering
// by substring in a UI control (they're already covered by full-text `q`
// search where relevant). Kept as a denylist so a new schema field is
// filterable by default unless explicitly excluded here or by the caller.
const LONG_TEXT_SKIP = new Set([
  'notes', 'summary', 'transcript', 'recording_url', 'page_url',
  'qualification_summary', 'operations_notes', 'medical_dietary_notes',
  'short_description', 'description',
])

const relationLabel = (x) => x.full_name || x.name || x.deal_name || String(x.id)

/* Derives the full "every field is filterable" set for one SCHEMA[type],
   grouped for the advanced filters panel. `relationOptions` supplies the
   option lists for select fields whose choices come from another table
   (optionsFrom: 'customers' | 'journeys' | 'sales' | 'users') — pass what
   loadOptions() returned. A relation without a matching list is silently
   skipped rather than rendered with no options. */
export function buildSchemaFilters(type, { relationOptions = {}, exclude = [] } = {}) {
  const def = SCHEMA[type]
  if (!def) return []
  const skip = new Set(exclude)
  const groups = [
    { key: 'status', title: 'סטטוס ותהליך', items: [] },
    { key: 'people', title: 'אחראים', items: [] },
    { key: 'dates', title: 'תאריכים', items: [] },
    { key: 'numbers', title: 'מספרים וסכומים', items: [] },
    { key: 'flags', title: 'סימונים', items: [] },
    { key: 'text', title: 'פרטים חופשיים', items: [] },
  ]
  const g = (key) => groups.find((x) => x.key === key)

  for (const f of def.fields) {
    if (skip.has(f.key) || f.type === 'textarea' || LONG_TEXT_SKIP.has(f.key)) continue

    if (f.type === 'select' && f.optionsFrom === 'users') {
      g('people').items.push({ kind: 'user', field: f.key, title: f.label })
    } else if (f.type === 'select' && f.options) {
      g('status').items.push({ kind: 'select', field: f.key, title: f.label, options: f.options })
    } else if (f.type === 'select' && f.optionsFrom && relationOptions[f.optionsFrom]?.length) {
      const options = relationOptions[f.optionsFrom].map((x) => ({ value: x.id, label: relationLabel(x) }))
      g('status').items.push({ kind: 'select', field: f.key, title: f.label, options })
    } else if (f.type === 'date' || f.type === 'datetime') {
      g('dates').items.push({ kind: 'range', field: f.key, title: f.label, mode: f.type })
    } else if (f.type === 'number') {
      g('numbers').items.push({ kind: 'numrange', field: f.key, title: f.label })
    } else if (f.type === 'checkbox') {
      g('flags').items.push({ kind: 'bool', field: f.key, title: f.label })
    } else if (f.type === 'text' || f.type === 'phone') {
      g('text').items.push({ kind: 'text', field: f.key, title: f.label })
    }
  }

  return groups.filter((gr) => gr.items.length)
}
