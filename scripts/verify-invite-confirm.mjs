// Verify the LIVE invite-user function confirms emails: create a throwaway,
// check email_confirmed_at via admin API, delete it.
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { config } from 'dotenv'
config({ path: new globalThis.URL('../.env', import.meta.url).pathname, quiet: true })

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const keys = JSON.parse(execSync(
  `curl -s "https://api.supabase.com/v1/projects/bkjqwroclpefwtyxjfkl/api-keys" -H "Authorization: Bearer ${TOKEN}"`,
  { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
))
const srk = (Array.isArray(keys) ? keys : keys.keys || []).find(k => k.name === 'service_role')?.api_key
const admin = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await admin.auth.signInWithPassword({ email: process.env.QA_USER_1_EMAIL, password: process.env.QA_USER_PASSWORD })
const srkAdmin = createClient(process.env.VITE_SUPABASE_URL, srk)

const EMAIL = `e2e_confirm_${Date.now()}@trax-crm.test`
const { data: inv, error: invErr } = await admin.functions.invoke('invite-user', {
  body: { email: EMAIL, full_name: 'E2E אימות', role_key: 'sales_rep', department: 'מכירות', permission_profile: 'נציג', password: 'Confirm123!' },
})
if (invErr || !inv?.user_id) { console.log('FAIL: create:', invErr?.message); process.exit(1) }
const { data: u } = await srkAdmin.auth.admin.getUserById(inv.user_id)
console.log(`email_confirmed_at: ${u?.user?.email_confirmed_at ? 'CONFIRMED (PASS)' : 'NULL (FAIL)'}`)
// cleanup
await srkAdmin.auth.admin.deleteUser(inv.user_id)
await srkAdmin.from('app_users').delete().eq('id', inv.user_id)
console.log('cleanup done')
