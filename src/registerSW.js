// Register the service worker (full cache control — the static host ignores
// .htaccess, so stale-HTML hell is fixed client-side). Also expose an
// emergency "unregister" escape hatch: ?nosw=1 unregisters and reloads.
if ('serviceWorker' in navigator && !location.search.includes('nosw=1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(err => {
      console.warn('[TRAX] SW registration failed (app works without it):', err)
    })
  })
} else if (location.search.includes('nosw=1')) {
  navigator.serviceWorker?.getRegistrations?.().then(rs => rs.forEach(r => r.unregister()))
}
