// Live drill-down verification: log in, open /sales with drill params the
// same way the dashboard navigates, and compare the row count shown with the
// expected filtered count (queried straight from the API as the same user).
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new globalThis.URL('../.env', import.meta.url).pathname, quiet: true })

const BASE = 'https://staging.trax-crm.pages.dev'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

await page.goto(BASE + '/#/', { waitUntil: 'networkidle', timeout: 45000 })
if (await page.locator('input[type=password]').count()) {
  await page.locator('input[type=email], input:not([type=password])').first().fill(process.env.QA_USER_1_EMAIL)
  await page.locator('input[type=password]').fill(process.env.QA_USER_PASSWORD)
  await page.locator('button:has-text("התחברות")').click()
  await page.waitForSelector('input[type=password]', { state: 'detached', timeout: 30000 }).catch(() => {})
}
await page.waitForTimeout(2500)

// API-side expected count, same user context
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await s.auth.signInWithPassword({ email: process.env.QA_USER_1_EMAIL, password: process.env.QA_USER_PASSWORD })

const cases = [
  ['stage=ליד חדש', 'drill_stage=ליד חדש', q => q.eq('stage', 'ליד חדש')],
  ['lead_source=אתר TRAX', 'drill_lead_source=' + encodeURIComponent('אתר TRAX'), q => q.eq('lead_source', 'אתר TRAX')],
  ['utm_campaign=לאוס', 'drill_utm_campaign=' + encodeURIComponent('לאוס | לידים | 01.09'), q => q.eq('utm_campaign', 'לאוס | לידים | 01.09')],
]
for (const [name, qs, fn] of cases) {
  let q = s.from('sales').select('id', { count: 'exact', head: true }).is('deleted_at', null)
  q = fn(q)
  const { count } = await q
  page.on('request', r => {
    if (r.url().includes('/rest/v1/sales')) {
      const u = decodeURIComponent(r.url())
      const cut = u.match(/(stage|lead_source|utm_campaign)=eq[^&]+/)
      console.log(`  REST[${r.method()}]: drill-in-query=${cut ? cut[0] : 'NONE'}`)
    }
  })
  await page.goto(`${BASE}/#/sales?${encodeURIComponent(qs)}`, { waitUntil: 'networkidle' }).catch(() => {})
  await page.waitForTimeout(2500)
  const body = await page.locator('body').innerText()
  // DataTable shows "X-Y מתוך N" style totals; grab any total digits
  // Pagination.jsx renders "<total> רשומות · עמוד X מתוך Y" — capture the
  // number BEFORE the word רשומות, not the page numbers after מתוך.
  const m = body.match(/([\d,]+)\s*רשומות/)
  console.log(`${name}: API expected=${count}, table shows total=${m ? m[1] : '?'}`)
}
await browser.close()
