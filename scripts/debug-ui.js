// Debug: what page are we actually on after login to #/settings?
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const pass = process.env.TRAX_PASS
await page.goto('https://staging.trax-crm.pages.dev/#/settings', { waitUntil: 'networkidle', timeout: 45000 })
if (await page.locator('input[type=password]').count()) {
  await page.locator('input[type=email], input:not([type=password])').first().fill('goldi@trax-crm.test')
  await page.locator('input[type=password]').fill(pass)
  await page.locator('button:has-text("התחברות")').click()
  await page.waitForSelector('input[type=password]', { state: 'detached', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(3000)
}
console.log('URL now:', page.url())
console.log('h1s:', await page.locator('h1,h2').allTextContents().then(a => a.slice(0,5)))
console.log('tabs:', (await page.locator('button').allTextContents()).filter(t => t && t.length < 25).slice(0, 25))
console.log('body snippet:', (await page.locator('body').innerText()).slice(0, 400).replace(/\n+/g, ' | '))
await browser.close()
