// Force-update: users should NEVER need to clear cache manually.
// index.html carries a BUILD_ID baked at build time; a poller compares it to
// the served /build-id.txt (cache-busted) every minute + on every tab focus.
// A mismatch means a newer deploy exists -> toast + auto reload. First load
// after a deploy always fetches fresh HTML (no-store meta), so this only
// matters for tabs that stayed open ACROSS a deploy.
let currentBuildId = null

export function initBuildId(id) {
  currentBuildId = id
}

async function check() {
  if (!currentBuildId) return
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}build-id.txt?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const server = (await res.text()).trim()
    // SPA fallback guard: on hosts without the file (or before the first
    // deploy that includes it) the server returns index.html — comparing
    // that to the build id produced a permanent phantom "new version"
    // banner. Only trust a real id (our ids never contain '<').
    if (!server || server.includes('<') || server.length > 64) return
    if (server === currentBuildId) {
      try { sessionStorage.removeItem('trax_reload_done') } catch { /* ignore */ }
      return
    }
    // One auto-reload per deploy: after it, if the mismatch persists (an
    // intermediate proxy serving stale HTML), DO NOT loop — reloading on
    // every tab focus was the reported "screen refreshes when I switch
    // tabs" bug. Show a one-time notice instead.
    try {
      if (sessionStorage.getItem('trax_reload_done') === server) {
        if (!document.getElementById('trax-stale-note')) {
          const note = document.createElement('div')
          note.id = 'trax-stale-note'
          note.style.cssText = 'position:fixed;bottom:16px;insetInlineEnd:16px;background:var(--mp,#b64d1a);color:#fff;padding:10px 12px;border-radius:10px;z-index:2147483646;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:10px'
          const btn = document.createElement('button')
          btn.textContent = 'רענן עכשיו'
          btn.style.cssText = 'background:#fff;color:#b64d1a;border:0;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer;font-size:0.8rem'
          btn.onclick = () => window.location.reload()
          const x = document.createElement('button')
          x.textContent = '✕'
          x.setAttribute('aria-label', 'סגור')
          x.style.cssText = 'background:transparent;color:#fff;border:0;font-size:0.9rem;cursor:pointer;padding:2px 4px'
          // Dismiss for this tab session — comes back only on the NEXT
          // deploy (new server id), never blocks the logout button again.
          x.onclick = () => { note.remove(); sessionStorage.setItem('trax_stale_dismissed', server) }
          const txt = document.createElement('span')
          txt.textContent = 'קיימת גרסה חדשה'
          note.append(txt, btn, x)
          document.body.appendChild(note)
        }
        return
      }
      if (sessionStorage.getItem('trax_stale_dismissed') === server) return
      sessionStorage.setItem('trax_reload_done', server)
    } catch { /* ignore */ }
    const el = document.createElement('div')
    el.style.cssText = 'position:fixed;bottom:16px;insetInlineEnd:16px;background:var(--mp,#b64d1a);color:#fff;padding:12px 18px;border-radius:10px;z-index:2147483646;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,.25);font-weight:600'
    el.textContent = 'מעדכן את המערכת לגרסה החדשה…'
    document.body.appendChild(el)
    setTimeout(() => window.location.reload(), 1200)
  } catch { /* offline etc. — retry next tick */ }
}

export function startBuildPolling() {
  if (!currentBuildId) return
  check()
  // Minute-interval only. Do NOT also check on visibilitychange: that made
  // every tab-switch trigger a fetch + possible reload, which users felt as
  // "the screen refreshes whenever I come back to the tab" (open popups and
  // unsaved edits lost). A deploy is picked up within a minute anyway.
  setInterval(check, 60000)
}
