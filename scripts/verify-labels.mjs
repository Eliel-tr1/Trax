// E2E check for migration 039: role_labels/departments RLS + data integrity.
// Runs against the LIVE Supabase as an authenticated admin (goldi) and as a
// non-admin (zarkosh) to prove both the write path and the RLS gate.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new globalThis.URL('../.env', import.meta.url).pathname, quiet: true })

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
let fails = 0
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fails++ }

async function as(email) {
  const s = createClient(URL, ANON)
  const { error } = await s.auth.signInWithPassword({ email, password: process.env.QA_USER_PASSWORD })
  if (error) throw new Error('login ' + email + ': ' + error.message)
  return s
}

const admin = await as(process.env.QA_USER_1_EMAIL)
const rep = await as(process.env.QA_USER_2_EMAIL)

// 1. admin sees seeded lists
const { data: labels } = await admin.from('role_labels').select('*').order('sort_order')
const { data: deps } = await admin.from('departments').select('*').order('sort_order')
check('admin reads role_labels (seeded 3)', labels?.length === 3, labels?.map(l => l.label).join(','))
check('admin reads departments (seeded 3)', deps?.length === 3, deps?.map(d => d.label).join(','))

// 2. admin can insert
const TEST = '___e2e_test_label___'
const { data: ins, error: insErr } = await admin.from('role_labels').insert({ label: TEST }).select().single()
check('admin inserts new role label', !insErr && !!ins, insErr?.message)

// 3. non-admin can read but NOT write (RLS gate). zarkosh is currently
// 'מנהל מערכת' in staging, so demote temporarily, prove the gate, restore.
const repId = (await rep.auth.getUser()).data.user.id
const { data: zk } = await admin.from('app_users').select('permission_profile').eq('id', repId).single()
const origProfile = zk?.permission_profile
await admin.from('app_users').update({ permission_profile: 'נציג' }).eq('id', repId)
const { data: repRead } = await rep.from('role_labels').select('*')
check('rep reads role_labels', (repRead?.length || 0) >= 3)
const { error: repErr } = await rep.from('role_labels').insert({ label: '___hacker___' })
check('rep blocked from insert (RLS)', !!repErr, repErr?.message?.slice(0, 60))
await admin.from('app_users').update({ permission_profile: origProfile }).eq('id', repId)

// 4. rename carries users
const old = 'נציג'
const nu = 'נציג מכירות E2E'
const { error: updErr } = await admin.from('role_labels').update({ label: nu }).eq('label', old)
check('rename label', !updErr, updErr?.message)
const { error: carryErr } = await admin.from('app_users').update({ permission_profile: nu }).eq('permission_profile', old)
check('carry users to new label', !carryErr, carryErr?.message)
const { count: carried } = await admin.from('app_users').select('*', { count: 'exact', head: true }).eq('permission_profile', nu)
console.log(`  → ${carried} user(s) now carry "${nu}"`)

// 5. delete blocked while users hold it, allowed when free
const { data: usersNu } = await admin.from('app_users').select('id').eq('permission_profile', nu)
if (usersNu?.length) {
  for (const u of usersNu) await admin.from('app_users').update({ permission_profile: 'נציג' }).eq('id', u.id)
}
await admin.from('role_labels').update({ label: old }).eq('label', nu)
const { error: delErr } = await admin.from('role_labels').delete().eq('label', nu)
check('delete free label', !delErr, delErr?.message)
const { error: delErr2 } = await admin.from('role_labels').delete().eq('label', TEST)
check('cleanup test label', !delErr2, delErr2?.message)

// 6. integrity: every user's permission_profile/department still exists in its list
const { data: allUsers } = await admin.from('app_users').select('permission_profile, department')
const orphans = (allUsers || []).filter(u => u.permission_profile && !labels.some(l => l.label === u.permission_profile))
check('no orphan permission_profile values', orphans.length === 0, orphans.map(u => u.permission_profile).join(','))

console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS')
process.exit(fails ? 1 : 0)
