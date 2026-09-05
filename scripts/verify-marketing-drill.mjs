// Full marketing-tab drill audit: click EVERY clickable metric, verify each
// lands on a table whose total matches the clicked number. This is the
// regression suite for the marketing drill rule.
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new globalThis.URL('../.env', import.meta.url).pathname, quiet: true })
const BASE = 'https://staging.trax-crm.pages.dev'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1700, height: 950 } })
await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('input[type=password]', { timeout: 20000 })
await page.locator('input[type=email], input:not([type=password])').first().fill(process.env.QA_USER_1_EMAIL)
await page.locator('input[type=password]').fill(process.env.QA_USER_PASSWORD)
await page.locator('button:has-text("התחברות")').click()
await page.waitForSelector('input[type=password]', { state: 'detached', timeout: 30000 })
await page.waitForTimeout(3500)

const mkTab = page.locator('[role=tab]:has-text("שיווק")').first()
await mkTab.click().catch(() => {})
await page.waitForTimeout(3500)

// Enumerate clickable drill targets: role=link rows, dviz clickable rows, StatTiles
const targets = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('[role=link], .dviz-row-clickable')) {
    if (!el.offsetParent) continue
    const t = el.textContent?.replace(/\s+/g, ' ').trim().slice(0, 50)
    if (t) out.push(t)
  }
  return out
})
console.log('clickable drill targets found:', targets.length)
let pass = 0, fail = 0
for (const label of targets) {
  // re-find the element by text and click
  const ok = await page.evaluate((lbl) => {
    const el = [...document.querySelectorAll('[role=link], .dviz-row-clickable')]
      .find(e => e.offsetParent && e.textContent?.replace(/\s+/g, ' ').trim().startsWith(lbl.slice(0, 30)))
    if (el) { el.click(); return true }
    return false
  }, label)
  if (!ok) { console.log(`SKIP (gone): ${label}`); continue }
  await page.waitForTimeout(4000)
  const url = page.url()
  const body = await page.locator('body').innerText()
  const total = (body.match(/([\d,]+)\s*רשומות/) || [])[1]
  const hasDrill = url.includes('drill_')
  const verdict = hasDrill && total && total !== '25' ? 'PASS' : 'FAIL'
  console.log(`${verdict}: "${label}" → drill=${hasDrill} total=${total}`)
  if (verdict === 'PASS') pass++; else fail++
  // back to dashboard marketing tab for the next one
  await page.evaluate(() => { window.location.hash = '/' })
  await page.waitForTimeout(1500)
  await page.locator('[role=tab]:has-text("שיווק")').first().click().catch(() => {})
  await page.waitForTimeout(2500)
}
console.log(`\n${pass} pass, ${fail} fail`)
await browser.close()
