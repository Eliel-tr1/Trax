/* ============================================================
   ra-core providers: data, auth, i18n, store.

   TRAX rewrite of bina-crm's lib/ra/providers.js — same mechanism
   (dataProvider written directly on supabase-js, not ra-data-postgrest,
   for the same reasons: multi-field Hebrew search via PostgREST `or=`,
   embedded relation selects, soft-delete semantics).

   Every table in data/001_init_schema.sql carries `deleted_at` (except
   `contacts`, `app_users`, `audit_log`), so soft-delete is the default
   here — the opposite of bina-crm where only some tables had it.

   FK relationships are NOT guessed — every one below matches an actual
   `references` clause in data/001_init_schema.sql:
     sales.customer_id -> customers.id
     sales.journey_id -> journeys.id
     registrations.customer_id/journey_id/sale_id
     contacts.customer_id
   tasks/meetings/phone_calls/notes/documents are polymorphic via
   related_type + related_id — NOT a real FK, so they are never embedded
   in a PostgREST select; they're queried explicitly (see ActivityFeed.jsx).
   ============================================================ */

import { supabaseAuthProvider } from 'ra-supabase-core'
import polyglotI18nProvider from 'ra-i18n-polyglot'
import { usePermissionStore } from '../../stores/permissionStore'
import { localStorageStore } from 'ra-core'
import { supabase } from '../supabase'
import he from '../../i18n/he'

const SOFT_DELETE = new Set([
  'customers', 'sales', 'journeys', 'registrations', 'tasks', 'meetings',
])

// NOTE: sales.owner_id and tasks.assignee_id reference auth.users(id), not
// app_users — app_users.id happens to equal the same uuid (1:1 mirror) but
// there is no actual FK from sales/tasks to app_users, so PostgREST cannot
// embed `owner:app_users!...` (schema-cache 400: "Could not find a
// relationship"). Owner/assignee display names are resolved client-side
// via loadOptions()'s `users` list instead (see lib/api.js, SaleDetail.jsx,
// Tasks.jsx) rather than embedded here.
export const SELECTS = {
  customers: '*',
  sales: '*, customer:customers(id,first_name,last_name,mobile_phone,business_unit), journey:journeys(id,name)',
  journeys: '*',
  // journey:journeys!inner (not a plain left-embed) is load-bearing: a
  // top-level filter on an embedded column like `journey.business_unit`
  // only NULLS the embed on a non-matching row with a plain embed — it
  // does NOT exclude the row (verified live against this project). !inner
  // makes it a real filter. Safe here because registrations.journey_id is
  // NOT NULL, so every row always has a matching journey to join against.
  registrations: '*, customer:customers(id,first_name,last_name), journey:journeys!inner(id,name,departure_date,business_unit), sale:sales(id,deal_name)',
  tasks: '*',
  contacts: '*, customer:customers(id,first_name,last_name)',
  // meetings/phone_calls are polymorphic (related_type + related_id, not a
  // real FK) — never embedded, resolved client-side in the list/detail
  // pages via loadOptions()/direct lookups instead.
  meetings: '*',
  phone_calls: '*',
}

/* Free-text search targets for the `q` filter. */
const SEARCH = {
  customers: ['first_name', 'last_name', 'mobile_phone', 'email', 'company', 'work_email'],
  sales: ['deal_name', 'campaign'],
  journeys: ['name'],
  registrations: ['registration_name', 'invoice_number'],
  tasks: ['subject'],
  contacts: ['name', 'phone', 'email'],
  meetings: ['subject'],
  phone_calls: [],
}

/* Related-table search: sales/registrations are searched by the customer's
   name, which lives in a related table — PostgREST cannot embed a related
   column into a top-level `or`, so ids are resolved first and folded in as
   `<fk>.in.(...)`. */
const SEARCH_REL = {
  sales: { fk: 'customer_id', table: 'customers', fields: ['first_name', 'last_name', 'mobile_phone', 'email'] },
  registrations: { fk: 'customer_id', table: 'customers', fields: ['first_name', 'last_name', 'mobile_phone', 'email'] },
}

/* "which column says this record belongs to me" — used by the "ממתין לי"
   preset (sales I own) via a plain filter, not record-scoping; TRAX has no
   per-user row restriction yet (RLS gives every authenticated user full
   access — see data/001_init_schema.sql's RLS section). */
export const OWNER_FIELD = {
  sales: 'owner_id', tasks: 'assignee_id', customers: 'owner_id',
  journeys: 'owner_id', registrations: 'owner_id',
  meetings: 'owner_id', phone_calls: 'assigned_user_id',
}

// Impersonation scope simulation: while a manager "views as" a limited user,
// the real JWT (and therefore RLS) is still the manager's — RLS can't scope
// the rows. To make the impersonation view HONEST (match what the target
// would actually see), inject a client-side owner filter for resources the
// target's role holds with scope='mine'. This is a UI mirror, not security —
// RLS remains the real gate (see permissionStore.js's impersonation note).
const impersonationOwnerFilter = () => {
  try {
    const { impersonating, matrix } = usePermissionStore.getState()
    if (!impersonating) return null
    return { userId: impersonating.id, matrix }
  } catch { return null }
}

const sel = (resource) => SELECTS[resource] || '*'

const relatedIds = async (resource, term) => {
  const rel = SEARCH_REL[resource]
  if (!rel) return null
  const { data } = await supabase.from(rel.table).select('id')
    .or(rel.fields.map(f => `${f}.ilike.%${term}%`).join(',')).limit(200)
  return (data || []).map(r => r.id)
}

/* Applies ra's filter object to a supabase query builder.
   Supported key forms:
     field            -> eq
     field@ilike      -> ilike %value%
     field@in         -> in (array)
     field@gte/@lte   -> range
     field@is         -> is (null)
     field@neq        -> neq
     q                -> or(ilike) across SEARCH[resource]  */
const applyFilters = (q, resource, filter = {}, relIds = null) => {
  for (const [rawKey, value] of Object.entries(filter)) {
    // field@is is the one filter form where null IS the value ("show me the
    // rows where this is unset" — the dashboard's 'לא צוין' drill buckets).
    // Every other form: empty means "no filter", skip it.
    if (rawKey.endsWith('@is') ? value === undefined : (value === undefined || value === null || value === '')) continue

    if (rawKey === 'q') {
      const clauses = (SEARCH[resource] || []).map(f => `${f}.ilike.%${value}%`)
      if (relIds?.length) clauses.push(`${SEARCH_REL[resource].fk}.in.(${relIds.join(',')})`)
      if (!clauses.length) continue
      q = q.or(clauses.join(','))
      continue
    }

    const [field, op = 'eq'] = rawKey.split('@')
    switch (op) {
      case 'ilike': q = q.ilike(field, `%${value}%`); break
      case 'in': q = q.in(field, Array.isArray(value) ? value : [value]); break
      case 'gte': q = q.gte(field, value); break
      case 'lte': q = q.lte(field, value); break
      case 'gt': q = q.gt(field, value); break
      case 'lt': q = q.lt(field, value); break
      case 'neq': q = q.neq(field, value); break
      case 'is': q = q.is(field, value === 'null' ? null : value); break
      default: q = Array.isArray(value) ? q.in(field, value) : q.eq(field, value)
    }
  }
  return q
}

const listQuery = async (resource, { filter, sort, pagination }) => {
  const relIds = filter?.q ? await relatedIds(resource, filter.q) : null
  // Impersonation honesty layer: viewing-as a scope='mine' user injects the
  // same cut the target would see. 'mine' = associated via ANY rep field
  // (Sahar's rule): for customers that's owner OR account_manager → use an
  // `or` filter instead of a single-column eq.
  const imp = impersonationOwnerFilter()
  const impMine = imp && imp.matrix[resource]?.scope === 'mine'
  let q = supabase.from(resource).select(sel(resource), { count: 'exact' })
  if (impMine) {
    if (resource === 'customers') {
      // direct .or() — applyFilters has no raw-or form
      q = q.or(`owner_id.eq.${imp.userId},account_manager_id.eq.${imp.userId}`)
    } else {
      q = q.eq(OWNER_FIELD[resource], imp.userId)
    }
  }
  q = applyFilters(q, resource, filter, relIds)
  // Soft-delete filter applied LAST so drill/user filters can never override
  // it (a stale persisted filter containing deleted_at would otherwise drop
  // the guard — that's how deleted rows surfaced in a drilled table).
  if (SOFT_DELETE.has(resource)) q = q.is('deleted_at', null)
  if (sort?.field) q = q.order(sort.field, { ascending: sort.order !== 'DESC', nullsFirst: false })
  if (pagination) {
    const { page = 1, perPage = 50 } = pagination
    q = q.range((page - 1) * perPage, page * perPage - 1)
  }
  return q
}

const unwrap = ({ data, error, count }) => {
  if (error) throw new Error(error.message)
  return { data: data || [], total: count ?? (data || []).length }
}

export const dataProvider = {
  getList: async (resource, params) => unwrap(await listQuery(resource, params)),

  getManyReference: async (resource, params) => {
    const filter = { ...(params.filter || {}), [params.target]: params.id }
    return unwrap(await listQuery(resource, { ...params, filter }))
  },

  getOne: async (resource, { id }) => {
    const { data, error } = await supabase.from(resource).select(sel(resource)).eq('id', id).single()
    if (error) throw new Error(error.message)
    return { data }
  },

  getMany: async (resource, { ids }) => {
    const { data, error } = await supabase.from(resource).select(sel(resource)).in('id', ids)
    if (error) throw new Error(error.message)
    return { data: data || [] }
  },

  create: async (resource, { data }) => {
    const { data: row, error } = await supabase.from(resource).insert(data).select().single()
    if (error) throw new Error(error.message)
    return { data: row }
  },

  update: async (resource, { id, data }) => {
    const patch = { ...data }
    delete patch.id
    const { data: row, error } = await supabase.from(resource).update(patch).eq('id', id).select().single()
    if (error) throw new Error(error.message)
    return { data: row }
  },

  updateMany: async (resource, { ids, data }) => {
    const { error } = await supabase.from(resource).update(data).in('id', ids)
    if (error) throw new Error(error.message)
    return { data: ids }
  },

  // Soft-delete stamps deleted_at (every table above has the column); hard
  // delete otherwise (contacts has no deleted_at column, per schema).
  delete: async (resource, { id, previousData }) => {
    const { error } = SOFT_DELETE.has(resource)
      ? await supabase.from(resource).update({ deleted_at: new Date().toISOString() }).eq('id', id)
      : await supabase.from(resource).delete().eq('id', id)
    if (error) throw new Error(error.message)
    return { data: previousData || { id } }
  },

  deleteMany: async (resource, { ids }) => {
    const { error } = SOFT_DELETE.has(resource)
      ? await supabase.from(resource).update({ deleted_at: new Date().toISOString() }).in('id', ids)
      : await supabase.from(resource).delete().in('id', ids)
    if (error) throw new Error(error.message)
    return { data: ids }
  },
}

export const authProvider = supabaseAuthProvider(supabase, {
  getIdentity: async (user) => {
    const { data } = await supabase.from('app_users').select('id, full_name').eq('id', user.id).maybeSingle()
    return { id: data?.id ?? user.id, fullName: data?.full_name || user.email }
  },
})

// Hebrew only (spec: "Hebrew-only agent, multilingual out of scope" — same
// applies to this internal tool). `allowMissing` keeps an unmapped key from
// throwing in production.
export const i18nProvider = polyglotI18nProvider(() => he, 'he', [{ locale: 'he', name: 'עברית' }], {
  allowMissing: true,
})

export const raStore = localStorageStore(undefined, 'trax')
