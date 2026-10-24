// Live check of the WhatsApp AI agent UI on staging (decisions/0010): the
// send checkbox in the create forms, the read-only WhatsApp panel and AI fields
// on a customer and a sale, the sales presets/column, the dashboard tiles and
// the Settings tab. Read-only: opens forms and closes them without saving.
// Run from the repo root: node scripts/verify-whatsapp-agent.mjs <customerId> <saleId> <outDir>
import { chromium } from 'playwright-core'
import { config } from 'dotenv'
config({ path: process.env.TRAX_ENV || new globalThis.URL('../.env', import.meta.url).pathname, quiet: true })

const [customerId, saleId, outDir = '.'] = process.argv.slice(2)
const BASE = 'https://staging.trax-crm.pages.dev'
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
const go = async (hash, sel, t = 20000) => {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(sel, { timeout: t })
  await page.waitForTimeout(1500)
}

// 1. Customer screen: panel + WhatsApp tab
await go(`/customers/${customerId}`, '#whatsapp-panel')
await page.waitForSelector('#whatsapp-panel .wa-msg, #whatsapp-panel .empty', { timeout: 20000 })
const custMsgs = await page.locator('#whatsapp-panel .wa-msg').count()
check('customer panel renders messages', custMsgs > 0, `${custMsgs} messages`)
check('customer panel has CloudChat link', await page.locator('#whatsapp-panel a:has-text("פתיחה בקלאודצ׳אט")').count() === 1)
check('panel has no input (read-only)', await page.locator('#whatsapp-panel input, #whatsapp-panel textarea').count() === 0)
await (await page.$('#whatsapp-panel')).screenshot({ path: `${outDir}/wa-customer-panel.png` })
await page.locator('.sec-tab:has-text("וואטסאפ")').click()
await page.waitForTimeout(600)
const tabText = await page.locator('.field-grid').first().innerText()
check('customer WhatsApp tab fields', tabText.includes("מזהה קלאודצ'אט") && tabText.includes("קישור לצ'אט") && tabText.includes('f296163u'), '')
await (await page.$('.card')).screenshot({ path: `${outDir}/wa-customer-tab.png` })

// 2. Sale screen: panel + AI tab with mirrored customer fields
await go(`/sales/${saleId}`, '#whatsapp-panel')
await page.waitForSelector('#whatsapp-panel .wa-msg, #whatsapp-panel .empty', { timeout: 20000 })
check('sale panel renders messages', await page.locator('#whatsapp-panel .wa-msg').count() > 0)
await (await page.$('#whatsapp-panel')).screenshot({ path: `${outDir}/wa-sale-panel.png` })
await page.locator('text=סוכן AI בוואטסאפ').first().click()
await page.waitForTimeout(600)
const saleText = await page.locator('body').innerText()
check('sale AI tab: status + mirrored customer fields', saleText.includes('סטטוס שיחה עם סוכן AI') && saleText.includes("מזהה קלאודצ'אט (מהלקוח)") && saleText.includes('f296163u'))
await page.screenshot({ path: `${outDir}/wa-sale-full.png`, fullPage: true })

// 3. Create forms: checkbox default ON (opened, not saved)
for (const [path, btn] of [['/customers', 'לקוח חדש'], ['/sales', 'מכירה חדשה']]) {
  await go(path, `button:has-text("${btn}")`)
  await page.locator(`button:has-text("${btn}")`).first().click()
  await page.waitForTimeout(800)
  const box = page.locator('.field:has(label:has-text("לשלוח וואטסאפ ליד חדש")) input[type=checkbox]')
  const n = await box.count()
  check(`${path} create form checkbox present and checked`, n === 1 && await box.isChecked())
  if (path === '/sales') await page.screenshot({ path: `${outDir}/wa-new-sale-form.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const cancel = page.locator('button:has-text("ביטול")')
  if (await cancel.count()) await cancel.first().click().catch(() => {})
}

// 4. Sales list: preset + column
await go('/sales', 'text=ענו לסוכן')
check('sales presets present', (await page.locator('body').innerText()).includes('לא נשלחה הודעה'))

// 5. Dashboard tiles
await go('/', 'text=אחוז מענה לסוכן', 30000).catch(() => {})
const dash = await page.locator('body').innerText()
check('dashboard AI tiles', dash.includes('אחוז מענה לסוכן') && dash.includes('קיבלו הודעה מהסוכן'))
await page.screenshot({ path: `${outDir}/wa-dashboard.png` })

// 6. Settings tab
await go('/settings', '.sec-tab')
await page.locator('.sec-tab:has-text("וואטסאפ וסוכן AI")').click()
await page.waitForSelector('text=וובהוקים יוצאים', { timeout: 15000 })
await page.waitForTimeout(1500)
const st = await page.locator('body').innerText()
check('settings tab: test mode + webhook + log', st.includes('מצב בדיקה') && st.includes('sale.created') && st.includes('HTTP 200'))
await (await page.$('.card')).screenshot({ path: `${outDir}/wa-settings.png` })

check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))
console.log(results.join('\n'))
await browser.close()
