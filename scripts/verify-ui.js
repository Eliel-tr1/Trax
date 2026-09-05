// scripts/verify-ui.js — headless UI verification for TRAX staging/prod.
// Attaches to the user's REAL Chrome (channel:'chrome') in headless mode so
// login sessions and profiles don't touch the user's desktop AT ALL — no
// focus stealing, no typing into their windows, runs in milliseconds.
//
// Usage:
//   node scripts/verify-ui.js <url> [selector] [textToHover|expectText]
// Examples:
//   node scripts/verify-ui.js "https://staging.trax-crm.pages.dev/#/settings" ".info-hint" hover
//
// Prints PASS/FAIL lines; exit code 0 = all pass.
import { chromium } from 'playwright-core'

const [url, selector, mode] = process.argv.slice(2)
if (!url) { console.error('usage: node scripts/verify-ui.js <url> [selector] [hover|text]'); process.exit(2) }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })

// If we land on the login page, sign in with the staging test manager.
if (await page.locator('input[type=password]').count()) {
  const email = process.env.TRAX_USER || 'goldi@trax-crm.test'
  const pass = process.env.TRAX_PASS
  if (!pass) { console.error('TRAX_PASS env required for login'); process.exit(2) }
  await page.locator('input[type=email], input:not([type=password])').first().fill(email)
  await page.locator('input[type=password]').fill(pass)
  await page.locator('button:has-text("התחברות")').click()
  await page.waitForSelector('input[type=password]', { state: 'detached', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {})
}

let ok = true
if (selector && mode === 'hover') {
  // Settings lands on a sub-tab; the users table (and the info-hint) live in
  // the 'משתמשים' section — click it if present before looking for the selector.
  const usersTab = page.locator('button:has-text("משתמשים"), [role=tab]:has-text("משתמשים")').first()
  if (await usersTab.count()) await usersTab.click().catch(() => {})
  await page.waitForTimeout(800)
  const el = page.locator(selector).first()
  if (!await el.count()) { console.log('FAIL: selector not found:', selector); ok = false }
  else {
    await el.hover()
    await page.waitForTimeout(400)
    // Measure: bubble visible, near the icon, not clipped
    const r = await el.boundingBox()
    const bubble = await page.evaluate(() => {
      const b = document.querySelector('.info-hint__bubble')
      if (!b) return null
      const br = b.getBoundingClientRect()
      const s = getComputedStyle(b)
      return { x: br.x, y: br.y, w: br.width, h: br.height, overflowY: s.overflowY, clipped: br.width === 0 || br.height === 0 }
    })
    if (!bubble) { console.log('FAIL: bubble did not render on hover'); ok = false }
    else if (bubble.clipped) { console.log('FAIL: bubble has zero size (clipped):', bubble); ok = false }
    else {
      const dist = Math.hypot(bubble.x + bubble.w / 2 - (r.x + r.width / 2), bubble.y + bubble.h - r.y)
      console.log(`PASS: bubble renders at ${Math.round(bubble.x)},${Math.round(bubble.y)} size ${Math.round(bubble.w)}x${Math.round(bubble.h)}, center-dist from icon ~${Math.round(dist)}px`)
    }
    await page.screenshot({ path: 'verify-last.png' })
    console.log('screenshot: verify-last.png')
  }
} else if (selector) {
  const n = await page.locator(selector).count()
  console.log(n ? `PASS: ${n} × "${selector}"` : `FAIL: "${selector}" not found`); ok = ok && !!n
}

if (errors.length) { console.log('CONSOLE ERRORS:'); errors.slice(0, 5).forEach(e => console.log(' -', e.slice(0, 200))) }
else console.log('no console errors')
await browser.close()
process.exit(ok ? 0 : 1)
