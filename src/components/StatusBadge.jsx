// Central color mapping for every "picklist"-style (select/status) field
// across every entity — so a color, once chosen for a value, is defined in
// exactly one place and reused everywhere that value can appear (list
// column, detail-page field, related-record chip), instead of every screen
// hand-rolling its own `STAGE_BADGE`/`STATUS_BADGE` object.
//
// Badge classes come from index.css's existing `.badge.*` set: ok (green),
// warn (orange), err (red), info (blue), mp (brand purple), gray (neutral).
//
// BADGES is keyed `${resource}.${field}` (resource = schema.js SCHEMA key,
// e.g. 'sale' not 'sales') -> { value: badgeClass }. A value missing from
// its map (or a field/resource missing from BADGES entirely) falls back to
// classifyByWord(), which reads success/danger/warning wording straight out
// of the Hebrew label — good enough for fields nobody has explicitly mapped
// yet, and harmless once they are (the explicit map always wins).
export const BADGES = {
  'customer.status': {
    'ליד חדש': 'mp', 'בטיפול': 'warn', 'לקוח פעיל': 'ok', 'לקוח עבר': 'gray', 'לא רלוונטי': 'gray',
  },
  'customer.lead_rating': {
    'חם': 'err', 'פושר': 'warn', 'קר': 'info', 'לא רלוונטי': 'gray',
  },
  'customer.extreme_experience_level': {
    'מתחיל': 'gray', 'בינוני': 'info', 'מנוסה': 'mp', 'מקצועי': 'ok',
  },
  'customer.business_unit': {
    'TRAX': 'mp', 'Xcon': 'info',
  },
  'sale.stage': {
    'ליד חדש': 'mp', 'נוצר קשר על ידי AI': 'mp', 'שיחת מכירה עם נציג אנושי': 'warn',
    'הצעה נשלחה': 'warn', 'ממתין להחלטה': 'warn', 'נסגר בהצלחה': 'ok', 'עסקה הופסדה': 'err',
  },
  'sale.qualification_rating': {
    'עומד בקריטריונים': 'ok', 'חלקי': 'warn', 'לא עומד': 'err', 'ספאם': 'gray',
  },
  'journey.status': {
    'בתכנון': 'gray', 'פתוח להרשמה': 'mp', 'כמעט מלא': 'warn', 'מלא': 'err', 'יצא לדרך': 'ok', 'בוטל': 'gray',
  },
  'registration.status': {
    'משוריין': 'gray', 'שולמה מקדמה': 'warn', 'שולם במלואו': 'ok', 'בוטל': 'err',
  },
  'task.status': {
    'פתוחה': 'mp', 'בוצעה': 'ok', 'בוטלה': 'gray',
  },
  'task.priority': {
    'רגילה': 'gray', 'גבוהה': 'warn', 'דחופה': 'err',
  },
  'phone_call.result': {
    'נענתה': 'ok', 'לא נענתה': 'err', 'תפוס': 'warn', 'השאיר הודעה': 'gray',
  },
  'phone_call.direction': {
    'נכנסת': 'mp', 'יוצאת': 'gray',
  },
}

const SUCCESS_WORDS = ['פעיל', 'הצלחה', 'שולם', 'תקין', 'זמין', 'פתוח', 'בוצע']
const DANGER_WORDS = ['הופסד', 'בוטל', 'לא רלוונטי', 'ספאם', 'לא עומד', 'לא נענתה', 'מלא', 'דחוף']
const WARN_WORDS = ['ממתין', 'בטיפול', 'חלקי', 'מקדמה', 'תפוס', 'כמעט', 'גבוה']

function classifyByWord(value) {
  const v = String(value)
  if (DANGER_WORDS.some(w => v.includes(w))) return 'err'
  if (SUCCESS_WORDS.some(w => v.includes(w))) return 'ok'
  if (WARN_WORDS.some(w => v.includes(w))) return 'warn'
  return 'gray'
}

export function badgeClassFor(resource, field, value) {
  if (value === null || value === undefined || value === '') return 'gray'
  return BADGES[`${resource}.${field}`]?.[value] ?? classifyByWord(value)
}

// <StatusBadge value={row.status} field="status" resource="sale" />
// resource matches schema.js SCHEMA keys (singular: 'customer', 'sale',
// 'journey', 'registration', 'task', 'phone_call').
export default function StatusBadge({ value, field, resource, fallback = '-' }) {
  if (value === null || value === undefined || value === '') {
    return <span className="muted">{fallback}</span>
  }
  return <span className={`badge ${badgeClassFor(resource, field, value)}`}>{value}</span>
}
