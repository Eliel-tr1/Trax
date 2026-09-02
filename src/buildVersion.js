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
    if (server && server !== currentBuildId) {
      // One auto-reload per deploy: after it, if the mismatch persists (an
      // intermediate proxy serving stale HTML), DO NOT loop — reloading on
      // every tab focus was the reported "screen refreshes when I switch
      // tabs" bug. Show a one-time notice instead.
      try {
        if (sessionStorage.getItem('trax_reload_done') === server) {
          if (!document.getElementById('trax-stale-note')) {
            const note = document.createElement('div')
            note.id = 'trax-stale-note'
            note.style.cssText = 'position:fixed;bottom:16px;insetInlineEnd:16px;background:var(--mp,#b64d1a);color:#fff;padding:10px 16px;border-radius:10px;z-index:2147483646;font-size:0.85rem;font-weight:600'
            note.textContent = 'קיימת גרסה חדשה — סגור ופתח את המערכת מחדש (פעם אחת) כדי לקבל אותה'
            document.body.appendChild(note)
          }
          return
        }
        sessionStorage.setItem('trax_reload_done', server)
      } catch { /* ignore */ }
      const el = document.createElement('div')
      el.style.cssText = 'position:fixed;bottom:16px;insetInlineEnd:16px;background:var(--mp,#b64d1a);color:#fff;padding:12px 18px;border-radius:10px;z-index:2147483646;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,.25);font-weight:600'
      el.textContent = 'מעדכן את המערכת לגרסה החדשה…'
      document.body.appendChild(el)
      setTimeout(() => window.location.reload(), 1200)
    } else {
      try { sessionStorage.removeItem('trax_reload_done') } catch {}
    }
  } catch { /* offline etc. — retry next tick */ }
}

export function startBuildPolling() {
  if (!currentBuildId) return
  check()
  setInterval(check, 60000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
}