import { supabase } from './supabase'
import { useAuthStore } from '../stores/authStore'
import { toast } from '../components/Toaster'

// Update a single field on a row. TRAX has a DB-level audit_log trigger on
// the four core entities (customers/sales/journeys/registrations) already
// (see data/001_init_schema.sql) driven by auth.uid(), so — unlike
// bina-crm's lib/api.js — there is no separate manual audit insert here.
export async function updateField(table, row, field, newValue) {
  let { error } = await supabase.from(table).update({ [field]: newValue }).eq('id', row.id)
  if (error) { toast('השמירה נכשלה', 'err'); throw error }
  toast('נשמר')
  return true
}

// Reference options for filters/selects (cached per session).
// customers/users kept light (id + display name) — full rows are fetched
// per-screen, not here.
let _cache = null
export async function loadOptions(force = false) {
  if (_cache && !force) return _cache
  const [users, customers, journeys, sales] = await Promise.all([
    supabase.from('app_users').select('id, full_name, avatar_url').order('full_name'),
    supabase.from('customers').select('id, first_name, last_name, business_unit').is('deleted_at', null).order('first_name'),
    supabase.from('journeys').select('id, name, business_unit').is('deleted_at', null).order('departure_date'),
    // Used to resolve meetings/phone_calls' polymorphic related_id -> a
    // display name without an N+1 query per row (PostgREST can't embed a
    // relation that isn't a real FK — see lib/ra/providers.js's note).
    supabase.from('sales').select('id, deal_name, business_unit').is('deleted_at', null).order('created_at', { ascending: false }),
  ])
  _cache = {
    reps: users.data || [],
    users: users.data || [],
    customers: (customers.data || []).map(c => ({ ...c, name: `${c.first_name} ${c.last_name}` })),
    journeys: journeys.data || [],
    sales: sales.data || [],
  }
  return _cache
}
export function clearOptionsCache() { _cache = null }

// Single system_settings value (key/value table, see Settings.jsx > פרטי
// מערכת). Not cached — these are rarely read (opened once per modal) and
// should always reflect the latest value an admin just saved.
export async function loadSystemSetting(key) {
  const { data } = await supabase.from('system_settings').select('value').eq('key', key).maybeSingle()
  return data?.value ?? null
}
