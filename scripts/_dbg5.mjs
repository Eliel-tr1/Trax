import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env', quiet: true })
const BASE = 'https://staging.trax-crm.pages.dev'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)
await sb.auth.signInWithPassword({ email: process.env.QA_USER_1_EMAIL, password: process.env.QA_USER_PASSWORD })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1900, height: 1000 } })
await page.goto(BASE + '/#/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('input[type=password]', { timeout: 20000 })
await page.locator('input[type=email], input:not([type=password])').first().fill(process.env.QA_USER_1_EMAIL)
await page.locator('input[type=password]').fill(process.env.QA_USER_PASSWORD)
await page.locator('button:has-text("התחברות")').click()
await page.waitForSelector('input[type=password]', { state: 'detached', timeout: 30000 })
await page.waitForTimeout(3500)
await page.evaluate(() => { window.location.hash = '/sales' })
await page.waitForTimeout(3000)
await page.getByText('מכירה חדשה', { exact: true }).first().click({ force: true })
await page.waitForTimeout(1500)
await page.getByText('+ לקוח חדש', { exact: true }).first().click({ force: true })
await page.waitForTimeout(500)
// mini-form inputs are .input class with placeholders — target THEM specifically
await page.locator('input[placeholder="שם פרטי *"]').fill('בדיקת3')
await page.locator('input[placeholder="שם משפחה"]').fill('אינליין3')
// the mini form's PhoneInput is inside the mini-form container (after the muted div)
await page.locator('input[placeholder="אימייל (לא חובה)"]').locator('xpath=preceding-sibling::*[1]').count()
// phone: it's the PhoneInput inside mini form — use the container scope
const mini = page.locator('div', { hasText: 'לקוח חדש, ייווצר וישויך למכירה זו' }).last()
await mini.locator('.phone-input-number').fill('0548675313')
await page.waitForTimeout(300)
await page.getByRole('button', { name: 'יצירת לקוח ושיוך' }).click()
await page.waitForTimeout(2500)
const picked = await page.evaluate(() => {
  const field = [...document.querySelectorAll('.field')].find(f => f.querySelector('label')?.textContent?.includes('לקוח'))
  return field?.querySelector('button span')?.textContent?.trim()
})
console.log('picker shows after create:', picked)
const { data: chk } = await sb.from('customers').select('id, owner_id, first_name').eq('first_name', 'בדיקת3').maybeSingle()
console.log('probe:', JSON.stringify(chk))
if (chk) {
  await sb.from('sales').delete().eq('customer_id', chk.id)
  await sb.from('customers').delete().eq('id', chk.id)
}
console.log('cleaned')
await browser.close()
