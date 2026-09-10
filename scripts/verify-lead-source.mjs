// Verify the deployed WF05a: post a lead with utm_source=facebook and one
// with no utm (real site), then check the created customer's lead_source.
// Uses a throwaway phone so nothing real is touched. Cleanup after.
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
const admin = createClient(process.env.VITE_SUPABASE_URL, srk)

const fnUrl = `${process.env.VITE_SUPABASE_URL}/functions/v1/wf05a-crm-sync`
const post = (payload) => fetch(fnUrl, {
  method: 'POST',
  headers: { Authorization: `Bearer ${srk}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
}).then(r => r.json())

const stamp = Date.now().toString().slice(-4)
const mkPhone = p => `+9725000000${p}`

// 1. Meta lead (utm_source=facebook)
const r1 = await post({
  first_name: 'בדיקת', last_name: `מקור ${stamp}`,
  phone_e164: mkPhone(stamp.slice(0, 3)), email: `e2e_src_${stamp}@test.co.il`,
  utm: { utm_source: 'facebook', utm_campaign: 'e2e-source-check' },
  execution_url: 'e2e://test',
})
console.log('meta lead result:', JSON.stringify(r1))
const { data: c1 } = await admin.from('customers').select('id, lead_source, account_manager_id').eq('email', `e2e_src${stamp}@test.co.il`).maybeSingle()
// email normalized? look by notes-free key: mobile
const { data: c1b } = await admin.from('customers').select('id, lead_source').eq('mobile_phone', mkPhone(stamp.slice(0, 3))).is('deleted_at', null).maybeSingle()
console.log('meta lead lead_source:', c1b?.lead_source, '(expected פייסבוק)')

// 2. sale's journey — should be nearest OPEN (Montenegro Oct 18)
const { data: sale1 } = await admin.from('sales').select('id, journey_id, journeys(name)').eq('customer_id', c1b.id).is('deleted_at', null).maybeSingle()
console.log('sale journey:', sale1?.journeys?.name)

// 3. plain site lead (no utm) → אתר TRAX
const r2 = await post({
  first_name: 'בדיקת', last_name: `אתר ${stamp}`,
  phone_e164: mkPhone(`1${stamp.slice(0, 3)}`),
  execution_url: 'e2e://test',
})
const { data: c2 } = await admin.from('customers').select('id, lead_source').eq('mobile_phone', mkPhone(`1${stamp.slice(0, 3)}`)).is('deleted_at', null).maybeSingle()
console.log('site lead lead_source:', c2?.lead_source, '(expected אתר TRAX)')

// cleanup
for (const c of [c1b, c2]) {
  if (c) {
    await admin.from('sales').delete().eq('customer_id', c.id)
    await admin.from('customers').delete().eq('id', c.id)
  }
}
console.log('cleanup done')