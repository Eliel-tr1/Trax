import { useEffect, useState } from 'react'
import xconLogoUrl from '../assets/xcon-logo.png'
import traxLogoUrl from '../assets/logo-header.png'

/* Full-screen unit-switch transition (Goldi: "something bold that says the
   system changed"). Rendered into a TOP-LEVEL portal — inside the Sidebar
   tree it was clipped by the sidebar's own stacking context and the header
   stayed on top (the user saw menu fragments during the transition). A
   portal to document.body escapes all of that: z-index 2147483647 sits
   above everything the app can ever render.

   The "page not clickable after the transition" report was the overlay
   dying mid-flow (e.g. reload racing the timers) and LEAVING nothing —
   actually the reload never happening while the theme had already flipped;
   here the overlay only fades once the reload is already underway, and a
   hard safety timeout forces the reload even if something hangs. */
export default function UnitTransitionOverlay({ to }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 800)
    const t2 = setTimeout(() => {
      window.location.assign(window.location.origin + window.location.pathname + '#/')
    }, 1050)
    // Safety: if the reload is somehow blocked, unblock the page anyway.
    const t3 = setTimeout(() => { try { window.location.reload() } catch { /* ignore */ } }, 2500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  const isXcon = to === 'Xcon'
  const bg = isXcon ? '#0b1220' : '#0a0a0a'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2147483647,
      background: bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18,
      opacity: fading ? 0 : 1,
      transition: 'opacity 0.3s ease',
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