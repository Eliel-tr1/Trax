// Live check on staging: a new registration opened from a sale comes with the
// sale's customer preselected, the customer picker finds a customer by phone
// (0533435240 style) and by name, and the sale shows שווי צפוי / מטבע filled
// from the journey (data/055). Read-only: opens the form and closes it.
// Run from the repo root: node scripts/verify-sale-registration-picker.mjs <saleId> <customerName> <phone> <outDir>
import { chromium } from 'playwright-core'
import { config } from 'dotenv'
config({ path: process.env.TRAX_ENV || new globalThis.URL('../.env', import.meta.url).pathname, quiet: true })

const [saleId, customerName, phone, outDir = '.'] = process.argv.slice(2)
const BASE = process.env.TRAX_BASE || 'https://staging.trax-crm.pages.dev'
const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: process.env.QA_USER_1_EMAIL, password: process.env.QA_USER_PASSWORD }),
})
const session = await res.json()
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, timezoneId: 'Asia/Jerusalem', locale: 'he-IL' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
await page.evaluate(s => localStorage.setItem('sb-bkjqwroclpefwtyxjfkl-auth-token', JSON.stringify(s)), session)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)

const results = []
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' :: ' + extra : ''}`) }

await page.goto(`${BASE}/#/sales/${saleId}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('text=שווי צפוי', { timeout: 20000 })
await page.waitForTimeout(2000)
const valueRow = await page.locator('.field:has(label:text-is("שווי צפוי")), div:has(> label:text-is("שווי צפוי"))').first().innerText().catch(() => '')
check('sale shows expected value', /\d/.test(valueRow), valueRow.replace(/\s+/g, ' ').slice(0, 80))

// Open "הוספת הרשמה חדשה" (from the actions menu when collapsed)
let opener = page.getByText('הוספת הרשמה חדשה', { exact: true })
if (!(await opener.isVisible().catch(() => false))) {
  const more = page.locator('button[aria-label="פעולות"], button:has-text("פעולות")').first()
  if (await more.count()) await more.click()
  opener = page.getByText('הוספת הרשמה חדשה', { exact: true })
}
await opener.first().click()
await page.waitForSelector('.modal, [role="dialog"]', { timeout: 10000 })
await page.waitForTimeout(1500)
const modal = page.locator('.modal, [role="dialog"]').last()
const custField = modal.locator('.field:has(label:has-text("לקוח"))').first()
const custText = (await custField.innerText()).replace(/\s+/g, ' ')
check('customer preselected from the sale', custText.includes(customerName), custText.slice(0, 80))
if (outDir) await modal.screenshot({ path: `${outDir}/registration-from-sale.png` })

// Search by phone and by name in the picker
await custField.locator('button').first().click()
const search = page.locator('input[placeholder="חיפוש…"]').last()
await search.fill(phone)
await page.waitForTimeout(800)
const byPhone = await page.locator('div.max-h-56 button').allInnerTexts()
check('picker finds the customer by phone', byPhone.some(t => t.includes(customerName)), byPhone.slice(0, 4).join(' | '))
await search.fill(customerName)
await page.waitForTimeout(800)
const byName = await page.locator('div.max-h-56 button').allInnerTexts()
check('picker finds the customer by name', byName.some(t => t.includes(customerName)), String(byName.length))
await page.keyboard.press('Escape')

check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
console.log(results.join('\n'))
await browser.close()
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
