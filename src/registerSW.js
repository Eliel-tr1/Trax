// Service worker REGISTRATION REMOVED (2026-09-02), but OneSignal's push SW
// (Sahar 16.09) is now an intentional exception - see push.js.
//
// Why the old blanket-unregister existed: it was a workaround for the
// Vitrue static host ignoring cache headers. On Cloudflare Pages the host
// serves correct no-store HTML + immutable assets, so a caching SW adds
// nothing - and its skipWaiting()+clients.claim() combo made every open tab
// re-render (white screen + spinner) whenever a new SW version activated,
// which users felt as "the tab reloads whenever I come back to it" -
// popups closed, unsaved edits lost. Also happened in incognito.
//
// OneSignalSDKWorker.js is NOT a caching SW - it only relays push events,
// so it doesn't cause that reload behavior. Every OTHER SW registration is
// still unregistered automatically, so a stray caching SW from before this
// change gets cleaned up without a redeploy dance.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker?.getRegistrations?.().then(rs => {
    rs.forEach(r => {
      const isOneSignal = r.active?.scriptURL?.includes('OneSignalSDKWorker')
      if (!isOneSignal) r.unregister()
    })
  }).catch(() => {})
}
