// Service worker REGISTRATION REMOVED (2026-09-02).
//
// Why: the SW was a workaround for the Vitrue static host ignoring
// cache headers. On Cloudflare Pages the host serves correct no-store
// HTML + immutable assets, so the SW adds nothing — and its
// skipWaiting()+clients.claim() combo made every open tab re-render
// (white screen + spinner) whenever a new SW version activated, which
// users felt as "the tab reloads whenever I come back to it" —
// popups closed, unsaved edits lost. Also happened in incognito.
//
// This file still UNREGISTERS any previously-installed SW on every
// load, so existing users are cleaned up automatically. No redeploy
// dance needed.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker?.getRegistrations?.().then(rs => {
    rs.forEach(r => r.unregister())
    if (rs.length) console.log('[TRAX] service worker unregistered (retired)')
  }).catch(() => {})
}
