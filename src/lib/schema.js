// ============================================================
// Central object registry — drives the generic create modal,
// dynamic related-record creation, and record deletion.
// TRAX rewrite of bina-crm's lib/schema.js: same mechanism, entities and
// Hebrew field values come from docs/domain-model.md +
// data/001_init_schema.sql (source of truth — do not rename values).
// ============================================================
import {
  BUSINESS_UNITS, LEAD_SOURCES, CUSTOMER_STATUSES, LEAD_RATINGS,
  EXPERIENCE_LEVELS, PREFERRED_LANGUAGES, SALE_STAGES, SALE_CHANNELS,
  LOSS_REASONS, QUALIFICATION_RATINGS, CURRENCIES, INTEREST_AREAS,
  JOURNEY_DESTINATIONS, JOURNEY_STATUSES, REGISTRATION_STATUSES,
  PAYMENT_METHODS, TASK_STATUSES, TASK_PRIORITIES, MEETING_TYPES, enumOpts,
} from './constants'

// field types: text | number | date | datetime | checkbox | textarea | select
// select: `options` = static [{value,label}] OR `optionsFrom` = dynamic key
//   resolved from loadOptions(): 'customers' | 'journeys' | 'users'
// wave: 1 | 2 — informational only (schema doesn't hide wave-2 fields, per
//   the spec: "build all fields now, just don't build wave-2 screens").
export const SCHEMA = {
  customer: {
    table: 'customers', labelOne: 'לקוח', labelMany: 'לקוחות', icon: 'users',
    listPath: '/customers', detailPath: (id) => `/customers/${id}`, softDelete: true, titleField: 'first_name',
    fields: [
      { key: 'first_name', label: 'שם פרטי', type: 'text', required: true, wave: 1 },
      { key: 'last_name', label: 'שם משפחה', type: 'text', required: true, wave: 1 },
      { key: 'mobile_phone', label: 'טלפון נייד', type: 'text', ltr: true, wave: 1 },
      { key: 'email', label: 'אימייל', type: 'text', ltr: true, wave: 1 },
      { key: 'business_unit', label: 'יחידה עסקית', type: 'select', options: enumOpts(BUSINESS_UNITS), default: 'TRAX', required: true, wave: 1 },
      { key: 'lead_source', label: 'מקור הגעה', type: 'select', options: enumOpts(LEAD_SOURCES), wave: 1 },
      { key: 'campaign', label: 'קמפיין', type: 'text', wave: 1 },
      { key: 'status', label: 'סטטוס לקוח', type: 'select', options: enumOpts(CUSTOMER_STATUSES), default: 'ליד חדש', wave: 1 },
      { key: 'notes', label: 'הערות', type: 'textarea', wave: 1 },
      { key: 'lead_rating', label: 'דירוג ליד', type: 'select', options: enumOpts(LEAD_RATINGS), wave: 2 },
      { key: 'club_member', label: 'חבר מועדון', type: 'checkbox', wave: 2 },
      { key: 'club_joined_at', label: 'תאריך הצטרפות למועדון', type: 'date', wave: 2 },
      { key: 'credit_balance', label: 'יתרת קרדיט', type: 'number', wave: 2 },
      { key: 'extreme_experience_level', label: 'רמת ניסיון באקסטרים', type: 'select', options: enumOpts(EXPERIENCE_LEVELS), wave: 2 },
      { key: 'preferred_language', label: 'שפה מועדפת', type: 'select', options: enumOpts(PREFERRED_LANGUAGES), wave: 2 },
      // Xcon-only
      { key: 'company', label: 'חברה', type: 'text', wave: 1, xconOnly: true },
      { key: 'job_title', label: 'תפקיד', type: 'text', wave: 1, xconOnly: true },
      { key: 'work_email', label: 'מייל עבודה', type: 'text', ltr: true, wave: 1, xconOnly: true },
    ],
    relations: [
      { childType: 'sale', fkOnChild: 'customer_id', label: 'מכירה' },
      { childType: 'contact', fkOnChild: 'customer_id', label: 'איש קשר' },
    ],
  },
  sale: {
    table: 'sales', labelOne: 'מכירה', labelMany: 'מכירות', icon: 'money',
    listPath: '/sales', detailPath: (id) => `/sales/${id}`, softDelete: true, titleField: 'deal_name',
    fields: [
      { key: 'customer_id', label: 'לקוח', type: 'select', optionsFrom: 'customers', required: true, wave: 1 },
      { key: 'business_unit', label: 'יחידה עסקית', type: 'select', options: enumOpts(BUSINESS_UNITS), default: 'TRAX', required: true, wave: 1 },
      { key: 'stage', label: 'שלב מכירה', type: 'select', options: enumOpts(SALE_STAGES), default: 'ליד חדש', wave: 1 },
      { key: 'channel', label: 'ערוץ פנייה', type: 'select', options: enumOpts(SALE_CHANNELS), wave: 1 },
      { key: 'lead_source', label: 'מקור הגעה', type: 'select', options: enumOpts(LEAD_SOURCES), wave: 1 },
      { key: 'campaign', label: 'קמפיין', type: 'text', wave: 1 },
      { key: 'owner_id', label: 'בעלים', type: 'select', optionsFrom: 'users', wave: 1 },
      { key: 'loss_reason', label: 'סיבת אי סגירה', type: 'select', options: enumOpts(LOSS_REASONS), wave: 1 },
      { key: 'journey_id', label: 'מסע מבוקש', type: 'select', optionsFrom: 'journeys', wave: 2 },
      { key: 'participants_count', label: 'מספר משתתפים', type: 'number', wave: 2 },
      { key: 'expected_value', label: 'שווי צפוי', type: 'number', wave: 2 },
      { key: 'currency', label: 'מטבע', type: 'select', options: CURRENCIES, wave: 2 },
      { key: 'qualification_rating', label: 'דירוג הסמכה', type: 'select', options: enumOpts(QUALIFICATION_RATINGS), wave: 2 },
      { key: 'qualification_summary', label: 'סיכום הסמכה מהסוכן', type: 'textarea', wave: 2 },
      { key: 'next_call_at', label: 'תאריך שיחה הבאה', type: 'datetime', wave: 2 },
      // Xcon-only
      { key: 'interest_area', label: 'תחום עניין', type: 'select', options: enumOpts(INTEREST_AREAS), wave: 1, xconOnly: true },
    ],
    relations: [],
  },
  journey: {
    table: 'journeys', labelOne: 'מסע', labelMany: 'מסעות', icon: 'calendar',
    listPath: '/journeys', detailPath: (id) => `/journeys/${id}`, softDelete: true, titleField: 'name',
    fields: [
      { key: 'name', label: 'שם היציאה', type: 'text', required: true, wave: 2 },
      { key: 'business_unit', label: 'יחידה עסקית', type: 'select', options: enumOpts(BUSINESS_UNITS), default: 'TRAX', required: true, wave: 2 },
      { key: 'destination', label: 'יעד', type: 'select', options: enumOpts(JOURNEY_DESTINATIONS), wave: 2 },
      { key: 'departure_date', label: 'תאריך יציאה', type: 'date', required: true, wave: 2 },
      { key: 'return_date', label: 'תאריך חזרה', type: 'date', wave: 2 },
      { key: 'seats_total', label: 'מספר מקומות', type: 'number', default: 22, wave: 2 },
      { key: 'min_seats', label: 'מינימום להוצאה לדרך', type: 'number', default: 18, wave: 2 },
      { key: 'status', label: 'סטטוס יציאה', type: 'select', options: enumOpts(JOURNEY_STATUSES), default: 'בתכנון', wave: 2 },
      { key: 'price_per_person', label: 'מחיר לאדם', type: 'number', wave: 2 },
      { key: 'currency', label: 'מטבע', type: 'select', options: CURRENCIES, wave: 2 },
      { key: 'includes_flights', label: 'כולל טיסות', type: 'checkbox', default: false, wave: 2 },
      { key: 'short_description', label: 'תיאור קצר', type: 'textarea', wave: 2 },
      { key: 'page_url', label: 'קישור לעמוד המסע', type: 'text', ltr: true, wave: 2 },
      { key: 'operations_notes', label: 'הערות תפעול', type: 'textarea', wave: 2 },
    ],
    relations: [
      { childType: 'registration', fkOnChild: 'journey_id', label: 'הרשמה' },
    ],
  },
  registration: {
    table: 'registrations', labelOne: 'הרשמה למסע', labelMany: 'הרשמות', icon: 'tag',
    listPath: '/registrations', detailPath: (id) => `/registrations/${id}`, softDelete: true, titleField: 'registration_name',
    fields: [
      { key: 'customer_id', label: 'לקוח', type: 'select', optionsFrom: 'customers', required: true, wave: 2 },
      { key: 'journey_id', label: 'מסע', type: 'select', optionsFrom: 'journeys', required: true, wave: 2 },
      { key: 'sale_id', label: 'מכירה', type: 'select', optionsFrom: 'sales', wave: 2 },
      { key: 'status', label: 'סטטוס הרשמה', type: 'select', options: enumOpts(REGISTRATION_STATUSES), default: 'משוריין', wave: 2 },
      { key: 'amount_paid', label: 'סכום ששולם', type: 'number', default: 0, wave: 2 },
      { key: 'currency', label: 'מטבע', type: 'select', options: CURRENCIES, wave: 2 },
      { key: 'last_payment_date', label: 'תאריך תשלום אחרון', type: 'date', wave: 2 },
      { key: 'payment_method', label: 'אמצעי תשלום', type: 'select', options: enumOpts(PAYMENT_METHODS), wave: 2 },
      { key: 'invoice_number', label: 'מספר חשבונית', type: 'text', wave: 2 },
      { key: 'passport_valid', label: 'דרכון בתוקף', type: 'checkbox', wave: 2 },
      { key: 'travel_insurance', label: 'ביטוח נסיעות', type: 'checkbox', wave: 2 },
      { key: 'medical_dietary_notes', label: 'הערות רפואיות או תזונתיות', type: 'textarea', wave: 2 },
      { key: 'emergency_contact', label: 'איש קשר לחירום', type: 'text', wave: 2 },
      { key: 'includes_flight_for_participant', label: 'כולל טיסה למשתתף זה', type: 'checkbox', default: false, wave: 2 },
    ],
    relations: [],
  },
  task: {
    table: 'tasks', labelOne: 'משימה', labelMany: 'משימות', icon: 'calendar',
    listPath: '/tasks', detailPath: null, softDelete: true, titleField: 'subject',
    fields: [
      { key: 'subject', label: 'נושא', type: 'text', required: true, wave: 1 },
      { key: 'related_type', label: 'משויך ל', type: 'select', options: enumOpts(['customer', 'sale', 'registration']), wave: 1 },
      { key: 'assignee_id', label: 'אחראי', type: 'select', optionsFrom: 'users', wave: 1 },
      { key: 'due_at', label: 'תאריך יעד', type: 'datetime', wave: 1 },
      { key: 'status', label: 'סטטוס', type: 'select', options: enumOpts(TASK_STATUSES), default: 'פתוחה', wave: 1 },
      { key: 'priority', label: 'עדיפות', type: 'select', options: enumOpts(TASK_PRIORITIES), default: 'רגילה', wave: 1 },
      { key: 'description', label: 'תיאור', type: 'textarea', wave: 1 },
    ],
    relations: [],
  },
  // Meeting (פגישה) — manual "add meeting" only; not a full list/detail
  // screen per the spec (mostly auto-created by calendar sync). Used by
  // RecordFormModal from Customer/Sale detail pages.
  meeting: {
    table: 'meetings', labelOne: 'פגישה', labelMany: 'פגישות', icon: 'calendar',
    listPath: null, detailPath: null, softDelete: false, titleField: 'subject',
    fields: [
      { key: 'subject', label: 'נושא', type: 'text', required: true, wave: 1 },
      { key: 'start_at', label: 'תאריך ושעה', type: 'datetime', required: true, wave: 1 },
      { key: 'duration_minutes', label: 'משך (דקות)', type: 'number', wave: 1 },
      { key: 'type', label: 'סוג', type: 'select', options: enumOpts(MEETING_TYPES), wave: 1 },
      { key: 'summary', label: 'סיכום', type: 'textarea', wave: 1 },
    ],
    relations: [],
  },
  contact: {
    table: 'contacts', labelOne: 'איש קשר', labelMany: 'אנשי קשר', icon: 'users',
    listPath: null, detailPath: null, softDelete: false, titleField: 'name',
    fields: [
      { key: 'customer_id', label: 'לקוח', type: 'select', optionsFrom: 'customers', required: true, wave: 1 },
      { key: 'name', label: 'שם', type: 'text', required: true, wave: 1 },
      { key: 'phone', label: 'טלפון', type: 'text', ltr: true, wave: 1 },
      { key: 'email', label: 'אימייל', type: 'text', ltr: true, wave: 1 },
      { key: 'role', label: 'תפקיד', type: 'text', wave: 1 },
    ],
    relations: [],
  },
}

// Resolve a field's select options given a loadOptions() result.
export function fieldOptions(field, opts) {
  if (field.options) return field.options
  if (!field.optionsFrom || !opts) return []
  const src = opts[field.optionsFrom] || []
  const labelFor = (x) => x.full_name || x.name || String(x.id)
  return src.map((x) => ({ value: x.id, label: labelFor(x) }))
}
