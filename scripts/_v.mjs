// Verify: new-sale modal opens clean (no inlineCreated error), inline
// customer create works and gets auto-selected.
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: new globalThis.URL('../.env', import.meta.url).pathname, quiet: true })
const BASE = 'https://staging.trax-crm.pages.dev'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.QA_USER_1_EMAIL, password: process.env.QA_USER_PASSWORD })
const pageErrors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1900, height: 1000 } })
page.on('pageerror', e => pageErrors.push(e.message.slice(0, 100)))
await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('input[type=password]', { timeout: 20000 })
await page.locator('input[type=email], input:not([type=password])').first().fill(process.env.QA_USER_1_EMAIL)
await page.locator('input[type=password]').fill(process.env.QA_USER_PASSWORD)
await page.locator('button:has-text("התחברות")').click()
await page.waitForSelector('input[type=password]', { state: 'detached', timeout: 30000 })
await page.waitForTimeout(3500)
await page.evaluate(() => { window.location.hash = '/sales' })
await page.waitForTimeout(3500)
await page.getByText('מכירה חדשה', { exact: true }).first().click({ force: true })
await page.waitForTimeout(1800)
console.log('page errors after open:', pageErrors.length ? JSON.stringify(pageErrors) : 'NONE')
// inline create
await page.getByText('+ לקוח חדש', { exact: true }).first().click({ force: true })
await page.waitForTimeout(600)
const filled = await page.evaluate(() => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  const out = []
  for (const inp of document.querySelectorAll('input[type=text], input:not([type])')) {
    if (!inp.offsetWidth && !inp.offsetHeight) continue
    const ph = inp.placeholder || ''
    let v = null
    if (ph.includes('פרטי')) v = 'בדיקת'
    else if (ph.includes('משפחה')) v = 'אינליין'
    if (v) { setter.call(inp, v); inp.dispatchEvent(new Event('input', { bubbles: true })); out.push(v) }
  }
  return out
})
await page.locator('.phone-input-number:visible').last().click()
await page.locator('.phone-input-number:visible').last().pressSequentially('0548675311')
await page.waitForTimeout(400)
await page.getByRole('button', { name: 'יצירת לקוח ושיוך' }).click()
await page.waitForTimeout(2000)
console.log('inline filled:', JSON.stringify(filled))
// the picker should now show the new customer as selected
const picked = await page.evaluate(() => {
  const field = [...document.querySelectorAll('.field')].find(f => f.querySelector('label')?.textContent?.includes('לקוח'))
  return field?.querySelector('button span')?.textContent?.trim()
})
console.log('picker shows:', picked)
const { data: chk } = await sb.from('customers').select('id, owner_id').eq('first_name', 'בדיקת').eq('last_name', 'אינליין').maybeSingle()
console.log('probe customer:', JSON.stringify(chk))
if (chk) await sb.from('customers').delete().eq('id', chk.id)
console.log('probe deleted | page errors:', pageErrors.length ? JSON.stringify(pageErrors) : 'NONE')
await browser.close()