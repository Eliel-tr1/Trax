// Get the real service_role JWT via the management API's auth keys endpoint,
// then list auth.users and cross-check against app_users.
import { execSync } from 'node:child_process'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const raw = execSync(
  `curl -s "https://api.supabase.com/v1/projects/bkjqwroclpefwtyxjfkl/config/auth" -H "Authorization: Bearer ${TOKEN}"`,
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
)
// That endpoint doesn't expose the SRK. Use the dedicated endpoint:
const keys = JSON.parse(execSync(
  `curl -s "https://api.supabase.com/v1/projects/bkjqwroclpefwtyxjfkl/api-keys" -H "Authorization: Bearer ${TOKEN}"`,
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
))
const srk = (Array.isArray(keys) ? keys : keys.keys || []).find(k => (k.name || k.type || '').includes('service'))?.api_key
  || (Array.isArray(keys) ? keys : []).map(k => k.api_key || k.value).find(v => v && v.startsWith('eyJ') && v.split('.').length === 3 && (k => true))
if (!srk) { console.log('no SRK from api-keys endpoint:', JSON.stringify(keys).slice(0, 200)); process.exit(1) }
console.log('got SRK (jwt):', srk.slice(0, 20) + '...')

const { createClient } = await import('@supabase/supabase-js')
const admin = createClient('https://bkjqwroclpefwtyxjfkl.supabase.co', srk)
const { data, error } = await admin.auth.admin.listUsers({ perPage: 50 })
if (error) { console.log('err:', error.message); process.exit(1) }
const map = {}
for (const u of data.users) map[u.id] = u
const { data: apps } = await admin.from('app_users').select('id, full_name, created_at').order('created_at')
for (const a of apps || []) {
  const u = map[a.id]
  console.log(`${a.full_name}: ${u ? `auth OK email=${u.email} confirmed=${!!u.email_confirmed_at}` : 'NO AUTH USER'}`)
}
console.log('--- auth.users without app_users row:')
for (const [id, u] of Object.entries(map)) {
  if (!(apps || []).some(a => a.id === id)) console.log(`${u.email} (${u.created_at})`)
}
