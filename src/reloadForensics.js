// Reload forensic logger: runs in the CRM page. Persists evidence of every
// page load + visibility change into localStorage, so after the user
// reproduces the tab-switch reload we can READ the exact sequence and see
// what triggered the reload (navigation type = reload vs navigate vs
// back_forward, and whether a Service Worker was controlling the page).
export function installReloadForensics() {
  try {
    const key = 'trax_reload_forensics'
    const log = JSON.parse(localStorage.getItem(key) || '[]')
    const nav = performance.getEntriesByType('navigation')[0]
    log.push({
      t: new Date().toISOString(),
      type: nav?.type || 'unknown',           // 'reload' = someone reloaded; 'navigate' = fresh entry
      transferSize: nav?.transferSize,        // 0 + type reload = cache/SW
      hash: location.hash.slice(0, 80),
      swControlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      visible: document.visibilityState,
    })
    while (log.length > 30) log.shift()
    localStorage.setItem(key, JSON.stringify(log))

    document.addEventListener('visibilitychange', () => {
      try {
        const l = JSON.parse(localStorage.getItem(key) || '[]')
        l.push({ t: new Date().toISOString(), ev: 'visibility', state: document.visibilityState, hash: location.hash.slice(0, 60) })
        while (l.length > 30) l.shift()
        localStorage.setItem(key, JSON.stringify(l))
      } catch { /* ignore */ }
    })
  } catch { /* ignore */ }
}
