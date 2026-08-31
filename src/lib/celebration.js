// Tiny pub/sub so any part of the app can fire a full-screen "deal won"
// celebration without threading props through the tree. SaleDetail calls
// celebrateWin() when it detects a transition into the won stage;
// CelebrationHost (mounted once near the app root) is the only subscriber.
const listeners = new Set()

export function celebrateWin() {
  listeners.forEach(fn => fn())
}

export function onCelebrateWin(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
