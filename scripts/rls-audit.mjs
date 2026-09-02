// RLS posture audit — lists exposed tables via the PostgREST OpenAPI spec, then
// probes each as (a) anonymous and (b) an authenticated QA user, reporting how
// many rows each identity can see. Reveals tables readable without login.
// Run: node scripts/rls-audit.mjs   (reads .env; prints statuses/counts only)
import 'dotenv/config'

const BASE = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY

const spec = await fetch(`${BASE}/rest/v1/`, {
  headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
}).then((r) => r.json())

const tables = Object.keys(spec.paths)
  .map((p) => p.replace(/^\//, ''))
  .filter((p) => !p.startsWith('rpc/'))

let userToken = null
if (process.env.QA_USER_1_EMAIL && process.env.QA_USER_PASSWORD) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.QA_USER_1_EMAIL,
      password: process.env.QA_USER_PASSWORD,
    }),
  }).then((r) => r.json())
  userToken = r.access_token || null
  console.log('QA login:', userToken ? 'ok' : `FAILED (${r.msg || r.error_description || '?'})`)
} else {
  console.log('QA login: skipped (no creds in .env)')
}

console.log(`\n${tables.length} tables exposed via REST\n`)
console.log('table | anon sees | logged-in user sees')
console.log('-'.repeat(70))

for (const t of tables) {
  const probe = async (tok) => {
    const headers = { apikey: ANON, Prefer: 'count=exact' }
    if (tok) headers.Authorization = `Bearer ${tok}`
    try {
      const r = await fetch(`${BASE}/rest/v1/${t}?select=*&limit=1`, { headers })
      if (r.status !== 200) return `${r.status}`
      const range = r.headers.get('content-range') || ''
      const total = range.split('/')[1]
      return `200, ${total ?? '?'} rows`
    } catch (e) {
      return `ERR ${e.message}`
    }
  }
  console.log(`${t} | ${await probe(null)} | ${userToken ? await probe(userToken) : 'n/a'}`)
}
