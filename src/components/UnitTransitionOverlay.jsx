import { useEffect, useState } from 'react'

/* Full-screen unit-switch transition (Goldi: "something bold that says the
   system changed"). Covers the viewport in the INCOMING brand's deep color
   + logo, holds ~900ms, then a full page reload lands the user on the
   dashboard of the other system — a clean remount with the new theme. */
export default function UnitTransitionOverlay({ to }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 750)
    const t2 = setTimeout(() => {
      // Full reload: clears all in-memory state and remounts with the new
      // [data-bu] theme + dashboard route as the default landing.
      window.location.assign(window.location.origin + window.location.pathname + '#/')
    }, 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const isXcon = to === 'Xcon'
  const bg = isXcon ? '#0b1220' : '#0a0a0a'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.35s ease',
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

// Vite statically resolves these imports at build time.
import xconLogoUrl from '../assets/xcon-logo.png'
import traxLogoUrl from '../assets/logo-header.png'