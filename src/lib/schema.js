// ============================================================
// Central object registry — drives the generic create modal,
// dynamic related-record creation, and record deletion.
// TRAX rewrite of bina-crm's lib/schema.js: same mechanism, entities and
// Hebrew field values come from docs/domain-model.md +
// data/001_init_schema.sql (source of truth — do not rename values).
// ============================================================
import { createElement } from 'react'
import {
  BUSINESS_UNITS, LEAD_SOURCES, CUSTOMER_STATUSES, LEAD_RATINGS,
  EXPERIENCE_LEVELS, PREFERRED_LANGUAGES, SALE_STAGES, SALE_CHANNELS,
  LOSS_REASONS, QUALIFICATION_RATINGS, CURRENCIES, INTEREST_AREAS,
  JOURNEY_DESTINATIONS, JOURNEY_STATUSES, REGISTRATION_STATUSES,
  PAYMENT_METHODS, TASK_STATUSES, TASK_PRIORITIES, MEETING_TYPES, MEETING_STATUSES,
  CALL_DIRECTIONS, CALL_RESULTS, enumOpts,
} from './constants'
import { formatDate, formatDateTime, formatNumber } from './format'
import UserEditableCell from '../components/UserEditableCell'
import ReferenceEditableCell from '../components/ReferenceEditableCell'
import EditableCell from '../components/EditableCell'

// field types: text | number | date | datetime | checkbox | textarea | select | phone
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
      { key: 'mobile_phone', label: 'טלפון נייד', type: 'phone', ltr: true, wave: 1 },
      { key: 'email', label: 'אימייל', type: 'text', ltr: true, wave: 1 },
      { key: 'business_unit', label: 'יחידה עסקית', type: 'select', options: enumOpts(BUSINESS_UNITS), default: 'TRAX', required: true, wave: 1 },
      { key: 'lead_source', label: 'מקור הגעה', type: 'select', options: enumOpts(LEAD_SOURCES), wave: 1 },
      { key: 'campaign', label: 'קמפיין', type: 'text', wave: 1 },
      { key: 'status', label: 'סטטוס לקוח', type: 'select', options: enumOpts(CUSTOMER_STATUSES), default: 'ליד חדש', required: true, wave: 1 },
      { key: 'notes', label: 'הערות', type: 'textarea', wave: 1 },
      { key: 'account_manager_id', label: 'מנהל לקוח', type: 'select', optionsFrom: 'users', wave: 1 },
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
      { key: 'stage', label: 'שלב מכירה', type: 'select', options: enumOpts(SALE_STAGES), default: 'ליד חדש', required: true, wave: 1 },
      { key: 'channel', label: 'ערוץ פנייה', type: 'select', options: enumOpts(SALE_CHANNELS), wave: 1 },
      { key: 'lead_source', label: 'מקור הגעה', type: 'select', options: enumOpts(LEAD_SOURCES), wave: 1 },
      { key: 'campaign', label: 'קמפיין', type: 'text', wave: 1 },
      { key: 'owner_id', label: 'נציג מכירות', type: 'select', optionsFrom: 'users', wave: 1 },
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
      { key: 'status', label: 'סטטוס יציאה', type: 'select', options: enumOpts(JOURNEY_STATUSES), default: 'בתכנון', required: true, wave: 2 },
      { key: 'price_per_person', label: 'מחיר לאדם', type: 'number', wave: 2 },
      { key: 'currency', label: 'מטבע', type: 'select', options: CURRENCIES, wave: 2 },
      { key: 'includes_flights', label: 'כולל טיסות', type: 'checkbox', default: false, wave: 2 },
      { key: 'short_description', label: 'תיאור קצר', type: 'textarea', wave: 2 },
      { key: 'itinerary', label: 'פירוט מלא (מסלול, ימים, מקומות)', type: 'textarea', wave: 2 },
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
      { key: 'status', label: 'סטטוס הרשמה', type: 'select', options: enumOpts(REGISTRATION_STATUSES), default: 'משוריין', required: true, wave: 2 },
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
      { key: 'status', label: 'סטטוס', type: 'select', options: enumOpts(TASK_STATUSES), default: 'פתוחה', required: true, wave: 1 },
      { key: 'priority', label: 'עדיפות', type: 'select', options: enumOpts(TASK_PRIORITIES), default: 'רגילה', required: true, wave: 1 },
      { key: 'description', label: 'תיאור', type: 'textarea', wave: 1 },
    ],
    relations: [],
  },
  // Meeting (פגישה) — first-class entity: own list + detail screen. Created
  // via the dedicated MeetingFormModal (Meetings.jsx), NOT the generic
  // RecordFormModal — related_type/related_id is a dependent-select pair
  // the generic schema-driven form can't represent, so those two fields are
  // deliberately left out of `fields` below (MeetingFormModal inserts
  // directly, passing related_type/related_id itself; when opened from
  // Customer/Sale detail it takes defaultRelatedType/defaultRelatedId).
  meeting: {
    table: 'meetings', labelOne: 'פגישה', labelMany: 'פגישות', icon: 'calendar',
    listPath: '/meetings', detailPath: (id) => `/meetings/${id}`, softDelete: true, titleField: 'subject',
    fields: [
      { key: 'subject', label: 'נושא', type: 'text', required: true, wave: 1 },
      { key: 'start_at', label: 'תאריך ושעה', type: 'datetime', required: true, wave: 1 },
      { key: 'duration_minutes', label: 'משך (דקות)', type: 'number', wave: 1 },
      { key: 'type', label: 'סוג', type: 'select', options: enumOpts(MEETING_TYPES), wave: 1 },
      { key: 'status', label: 'סטטוס', type: 'select', options: enumOpts(MEETING_STATUSES), default: 'מתוכננה', wave: 1 },
      { key: 'summary', label: 'סיכום', type: 'textarea', wave: 1 },
    ],
    relations: [],
  },
  // Phone call (שיחת טלפון) — list + detail only, per domain-model.md:
  // "auto-created from Voicenter + every Max voice call". No manual create
  // button anywhere in the UI; softDelete:false matches the DB (no
  // deleted_at column on phone_calls).
  phone_call: {
    table: 'phone_calls', labelOne: 'שיחת טלפון', labelMany: 'שיחות טלפון', icon: 'phone',
    listPath: '/phone-calls', detailPath: (id) => `/phone-calls/${id}`, softDelete: false, titleField: 'direction',
    fields: [
      { key: 'related_id', label: 'לקוח', type: 'select', optionsFrom: 'customers', required: true, wave: 1 },
      { key: 'direction', label: 'כיוון', type: 'select', options: enumOpts(CALL_DIRECTIONS), required: true, wave: 1 },
      { key: 'occurred_at', label: 'תאריך ושעה', type: 'datetime', wave: 1 },
      { key: 'duration_seconds', label: 'משך (שניות)', type: 'number', wave: 1 },
      { key: 'result', label: 'תוצאה', type: 'select', options: enumOpts(CALL_RESULTS), wave: 1 },
      { key: 'recording_url', label: 'קישור להקלטה', type: 'text', ltr: true, wave: 1 },
      { key: 'transcript', label: 'תמליל', type: 'textarea', wave: 1 },
      { key: 'summary', label: 'סיכום AI', type: 'textarea', wave: 1 },
      { key: 'assigned_user_id', label: 'נציג משויך', type: 'select', optionsFrom: 'users', wave: 1 },
      { key: 'external_call_id', label: 'מזהה שיחה (Fireberry)', type: 'text', ltr: true, wave: 2 },
    ],
    relations: [],
  },
  contact: {
    table: 'contacts', labelOne: 'איש קשר', labelMany: 'אנשי קשר', icon: 'users',
    listPath: null, detailPath: null, softDelete: false, titleField: 'name',
    fields: [
      { key: 'customer_id', label: 'לקוח', type: 'select', optionsFrom: 'customers', required: true, wave: 1 },
      { key: 'name', label: 'שם', type: 'text', required: true, wave: 1 },
      { key: 'phone', label: 'טלפון', type: 'phone', ltr: true, wave: 1 },
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

// Plain-text rendering of a scalar value per its schema field type — used
// by extraHiddenColumns() below for fields that don't have a bespoke
// column render in a given list screen.
function renderScalarText(v, field) {
  if (v === null || v === undefined || v === '') return '-'
  if (field.type === 'checkbox') return v ? '✓ כן' : '✗ לא'
  if (field.type === 'date') return formatDate(v)
  if (field.type === 'datetime') return formatDateTime(v)
  if (field.type === 'number') return formatNumber(v)
  if (Array.isArray(v)) return v.length ? String(v.length) : '-'
  return String(v)
}

// Every list screen's `columns` array only declares a curated subset of
// fields, and the columns picker can only ever offer what's declared — a
// field missing from `columns` can never be toggled on, regardless of
// `hidden: true` on some OTHER column. Fix: call this at the end of each
// page's `columns` array to append every schema field not already covered
// (matched by column `source`), marked `hidden: true` so the visible set is
// unchanged, but now toggleable from the columns picker.
//
// ctx wires these up as REAL inline-editable cells (same click-to-edit
// pattern as the page's own curated columns), not just plain text — a
// field editable on the record's detail page must also be editable from
// here, per the field-parity fix. ctx: { table, users, opts, refresh }.
// `table` defaults to the schema's own table name. Without a `refresh`
// callback (a caller that hasn't been wired up, or a read-only/export-only
// consumer) this falls back to the old plain-text render, since a save
// path with nowhere to report success/failure back to isn't safe to offer.
export function extraHiddenColumns(type, existingSources, ctx = {}) {
  const def = SCHEMA[type]
  if (!def) return []
  const seen = existingSources instanceof Set ? existingSources : new Set(existingSources || [])
  const { table = def.table, users = [], opts = {}, refresh } = ctx
  const onSaved = refresh ? () => refresh() : undefined
  const refLabel = (resource, id) => {
    const x = (opts[resource] || []).find(i => i.id === id)
    return x ? (x.name || x.deal_name || `${x.first_name || ''} ${x.last_name || ''}`.trim()) : ''
  }

  return def.fields
    .filter(f => !seen.has(f.key))
    .map(f => {
      const base = { source: f.key, label: f.label, hidden: true, sortable: f.type !== 'textarea' }

      if (!refresh) {
        return { ...base, csv: r => r[f.key], render: r => createElement('span', { className: 'small' }, renderScalarText(r[f.key], f)) }
      }

      if (f.optionsFrom === 'users') {
        return {
          ...base,
          csv: r => users.find(u => u.id === r[f.key])?.full_name || '',
          render: r => createElement(UserEditableCell, { row: r, table, field: f.key, users, onSaved, placeholder: `בחרו ${f.label}` }),
        }
      }
      if (f.optionsFrom) {
        return {
          ...base,
          csv: r => refLabel(f.optionsFrom, r[f.key]),
          render: r => createElement(ReferenceEditableCell, { row: r, table, field: f.key, resource: f.optionsFrom, items: opts[f.optionsFrom], onSaved, placeholder: `בחרו ${f.label}` }),
        }
      }
      if (f.type === 'checkbox') {
        return { ...base, csv: r => r[f.key] ? 'כן' : 'לא', render: r => createElement(EditableCell, { row: r, table, field: f.key, type: 'checkbox', onSaved }) }
      }
      if (f.type === 'select') {
        return {
          ...base,
          csv: r => r[f.key],
          render: r => createElement(EditableCell, { row: r, table, field: f.key, mode: 'select', options: fieldOptions(f, opts), required: f.required, onSaved }),
        }
      }
      // date | datetime | number | phone | text | textarea
      return {
        ...base,
        csv: r => r[f.key],
        render: r => createElement(EditableCell, { row: r, table, field: f.key, type: f.type === 'textarea' ? 'text' : f.type, onSaved }),
      }
    })
}

// Tables that carry the standard audit-trail columns from
// data/004_audit_fields.sql (created_by/updated_by/execution_url, on top of
// created_at/updated_at). contacts also has them but has no list screen
// (SCHEMA.contact.listPath is null), so it's omitted here.
const AUDIT_TABLES = new Set(['customers', 'sales', 'journeys', 'registrations', 'tasks', 'meetings', 'phone_calls'])
// Tables that additionally carry status_changed_at (data/011_status_tab_and_shared_views.sql).
const STATUS_CHANGED_TABLES = new Set(['customers', 'sales', 'journeys', 'registrations', 'tasks'])

// Metadata/system columns (created_by, updated_at/by, execution_url,
// status_changed_at) — same "offer everything in the columns picker" fix as
// extraHiddenColumns, but for the audit-trail fields that live outside
// SCHEMA.fields entirely (they're system-written, never part of the create/
// edit form). Read-only: these are stamped by DB triggers, not user edits.
// Callers should also add their own visible `created_at` column (per the
// "נוצר בתאריך first column" rule) and include 'created_at' in
// existingSources so it isn't duplicated here.
export function metadataColumns(type, existingSources, ctx = {}) {
  const def = SCHEMA[type]
  if (!def) return []
  const seen = existingSources instanceof Set ? existingSources : new Set(existingSources || [])
  const { users = [] } = ctx
  const userLabel = (id) => id ? (users.find(u => u.id === id)?.full_name || '-') : 'מערכת'
  const cols = []

  if (AUDIT_TABLES.has(def.table)) {
    if (!seen.has('created_at')) cols.push({
      source: 'created_at', label: 'נוצר בתאריך', hidden: true, sortable: true,
      csv: r => r.created_at,
      render: r => createElement('span', { className: 'small' }, formatDateTime(r.created_at)),
    })
    if (!seen.has('created_by')) cols.push({
      source: 'created_by', label: 'נוצר על ידי', hidden: true, sortable: false,
      csv: r => userLabel(r.created_by),
      render: r => createElement('span', { className: 'small' }, userLabel(r.created_by)),
    })
    if (!seen.has('updated_at')) cols.push({
      source: 'updated_at', label: 'עודכן בתאריך', hidden: true, sortable: true,
      csv: r => r.updated_at,
      render: r => createElement('span', { className: 'small' }, formatDateTime(r.updated_at)),
    })
    if (!seen.has('updated_by')) cols.push({
      source: 'updated_by', label: 'עודכן על ידי', hidden: true, sortable: false,
      csv: r => userLabel(r.updated_by),
      render: r => createElement('span', { className: 'small' }, userLabel(r.updated_by)),
    })
    if (!seen.has('execution_url')) cols.push({
      source: 'execution_url', label: 'קישור להרצה', hidden: true, sortable: false,
      csv: r => r.execution_url || '',
      render: r => r.execution_url
        ? createElement('a', { href: r.execution_url, target: '_blank', rel: 'noreferrer', onClick: e => e.stopPropagation() }, 'צפייה בהרצה ↗')
        : createElement('span', { className: 'small' }, '-'),
    })
  }
  if (STATUS_CHANGED_TABLES.has(def.table) && !seen.has('status_changed_at')) {
    cols.push({
      source: 'status_changed_at', label: 'סטטוס שונה בתאריך', hidden: true, sortable: true,
      csv: r => r.status_changed_at,
      render: r => createElement('span', { className: 'small' }, formatDateTime(r.status_changed_at)),
    })
  }
  return cols
}
