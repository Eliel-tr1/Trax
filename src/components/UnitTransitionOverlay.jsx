import { useEffect, useState } from 'react'
import xconLogoUrl from '../assets/xcon-logo.png'
import traxLogoUrl from '../assets/logo-header.png'

/* Full-screen unit-switch transition (Goldi: "something bold that says the
   system changed"). Rendered into a TOP-LEVEL portal so it truly covers
   everything. NO page reload: the flip is pure SPA — theme data-attribute
   flips live, all list caches are purged, and the router navigates to the
   dashboard. The old reload approach double-refreshed (overlay showed, then
   the browser reloaded again after the transition ended) and dropped the
   user out of the SPA. */
export default function UnitTransitionOverlay({ to, onDone }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 900)
    const t2 = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('unit-switched', { detail: { to } }))
    }, 950)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const isXcon = to === 'Xcon'
  const bg = isXcon ? '#0b1220' : '#0a0a0a'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2147483647,
      background: bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.35s ease',
      pointerEvents: 'all',
    }}>
      <img src={isXcon ? xconLogoUrl : traxLogoUrl} alt={to}
        style={{ width: isXcon ? 190 : 120, maxWidth: '60vw', objectFit: 'contain' }} />
      <div style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 800, letterSpacing: 1 }}>
        {isXcon ? 'Xcon CRM' : 'TRAX CRM'}
      </div>
      <span className="spinner light" style={{ width: 26, height: 26 }} />
    </div>
  )
}