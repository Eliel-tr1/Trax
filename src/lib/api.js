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
  const [users, customers, journeys] = await Promise.all([
    supabase.from('app_users').select('id, full_name, avatar_url').order('full_name'),
    supabase.from('customers').select('id, first_name, last_name, business_unit').is('deleted_at', null).order('first_name'),
    supabase.from('journeys').select('id, name, business_unit').is('deleted_at', null).order('departure_date'),
  ])
  _cache = {
    reps: users.data || [],
    users: users.data || [],
    customers: (customers.data || []).map(c => ({ ...c, name: `${c.first_name} ${c.last_name}` })),
    journeys: journeys.data || [],
  }
  return _cache
}
export function clearOptionsCache() { _cache = null }
