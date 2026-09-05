// Set the password Sahar expects (Ok102938etz) for all three interface-created
// users + confirm email — one definitive reset aligned with what he types.
import { createClient } from '@supabase/supabase-js'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const res = await fetch('https://api.supabase.com/v1/projects/bkjqwroclpefwtyxjfkl/api-keys', {
  headers: { Authorization: `Bearer ${TOKEN}` },
})
const all = await res.json()
const srk = (Array.isArray(all) ? all : all.keys || []).find(k => k.name === 'service_role')?.api_key
const admin = createClient('https://bkjqwroclpefwtyxjfkl.supabase.co', srk)

const { data: apps } = await admin.from('app_users').select('id, full_name')
const byName = Object.fromEntries((apps || []).map(a => [a.full_name, a.id]))
const targets = [
  ['ירדן עקיבא', 'yarden@vitrue.co.il'],
  ['ויטרו פיתוח', 'support@vitrue.co.il'],
  ['סער וינברג', 'sahar@vitrue.co.il'],
]
const PW = 'Ok102938etz'
for (const [name, email] of targets) {
  const id = byName[name]
  const { error } = await admin.auth.admin.updateUserById(id, { email_confirm: true, password: PW })
  console.log(`${name} (${email}): ${error ? 'FAILED ' + error.message : 'password set'}`)
}
// Verify by real login:
const anon = (Array.isArray(all) ? all : all.keys || []).find(k => k.name === 'anon')?.api_key
const verify = createClient('https://bkjqwroclpefwtyxjfkl.supabase.co', anon)
for (const [, email] of targets) {
  const { error } = await verify.auth.signInWithPassword({ email, password: PW })
  console.log(`verify ${email}: ${error ? 'FAIL ' + error.message : 'LOGIN OK'}`)
}
