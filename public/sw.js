/* TRAX CRM service worker — full cache control from our side, because the
   static host ignores .htaccess (verified: direct /journeys 404s instead of
   rewriting, so no server headers ever applied and Chrome cached stale HTML
   for days).

   Strategy:
   - Documents (index.html): NETWORK-FIRST. A deploy is picked up on the
     next load, always. Offline fallback to the cached copy.
   - Hashed /assets/*: CACHE-FIRST (immutable content, names change per build).
   - build-id.txt: network only (it's the change detector).
   - Supabase/API: never intercepted. */

const CACHE = 'trax-shell-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ).then(() => self.clients.claim()))
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)

  // Only our own origin; never touch API/DB traffic.
  if (url.origin !== self.location.origin) return
  if (url.pathname.includes('build-id.txt')) return // always straight to network
  if (url.pathname.startsWith('/assets/') || url.pathname.includes('/assets/')) {
    // Immutable hashed asset: cache-first.
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(req, copy))
        return res
      }))
    )
    return
  }

  // Everything else (index.html, SPA entry): network-first.
  if (req.mode === 'navigate' || req.destination === 'document' || req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(req, copy))
        return res
      }).catch(() => caches.match(req).then(hit => hit || caches.match(self.registration.scope)))
    )
  }
})
