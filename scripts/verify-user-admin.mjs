// E2E: verify set_password + delete via the deployed update-user function —
// create a throwaway user through invite-user, reset its password through
// update-user, log in with it, then delete it and confirm login fails.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new globalThis.URL('../.env', import.meta.url).pathname, quiet: true })
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
let fails = 0
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++ }

const admin = createClient(URL, ANON)
await admin.auth.signInWithPassword({ email: process.env.QA_USER_1_EMAIL, password: process.env.QA_USER_PASSWORD })

// 1. create throwaway user via invite-user
const EMAIL = `e2e_del_${Date.now()}@trax-crm.test`
const PW1 = 'e2ePass123!'
const { data: inv, error: invErr } = await admin.functions.invoke('invite-user', {
  body: { email: EMAIL, full_name: 'E2E מחיקה', role_key: 'sales_rep', department: 'מכירות', permission_profile: 'נציג', password: PW1 },
})
check('invite-user creates throwaway', !invErr && !!inv?.user_id, invErr?.message || '')
if (!inv?.user_id) { console.log('aborting — no throwaway user'); process.exit(1) }

// 2. login with it
const v = createClient(URL, ANON)
const { error: loginErr1 } = await v.auth.signInWithPassword({ email: EMAIL, password: PW1 })
check('login with initial password', !loginErr1, loginErr1?.message)
await v.auth.signOut()

// 3. admin resets password via update-user
const { error: pwErr } = await admin.functions.invoke('update-user', {
  body: { action: 'set_password', user_id: inv.user_id, password: 'NewPass456!' },
})
check('set_password via update-user', !pwErr, pwErr?.message)

// 4. old password fails, new works
const { error: oldErr } = await v.auth.signInWithPassword({ email: EMAIL, password: PW1 })
check('old password rejected', !!oldErr)
const { error: newErr } = await v.auth.signInWithPassword({ email: EMAIL, password: 'NewPass456!' })
check('new password works', !newErr, newErr?.message)
await v.auth.signOut()

// 5. delete via update-user
const { error: delErr } = await admin.functions.invoke('update-user', {
  body: { action: 'delete', user_id: inv.user_id },
})
check('delete via update-user', !delErr, delErr?.message)

// 6. app_users row gone + login fails
const { count } = await admin.from('app_users').select('*', { count: 'exact', head: true }).eq('id', inv.user_id)
check('app_users row removed', count === 0, `count=${count}`)
const { error: deadErr } = await v.auth.signInWithPassword({ email: EMAIL, password: 'NewPass456!' })
check('deleted user cannot login', !!deadErr)

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS')
process.exit(fails ? 1 : 0)
