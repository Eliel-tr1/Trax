import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { onCelebrateWin } from '../lib/celebration'
import { playSuccessChime } from '../lib/chime'
import './celebration.css'

// Four distinct "deal won" celebrations, picked at random each time. Fired
// once per transition into the won stage (see SaleDetail.jsx's setStage).
// (a) is a real particle system (canvas-confetti) + a synthesized chime.
// (b)-(d) are hand-built CSS/SVG scenes — flat, silhouette-style, so they
// read cleanly at a glance instead of looking sketched.
const EFFECTS = ['fireworks', 'jeep', 'skier', 'skydiver']

function runFireworks() {
  playSuccessChime()
  const duration = 2600
  const end = Date.now() + duration
  const colors = ['#d65a1f', '#f0b28c', '#ffffff', '#b64d1a']
  ;(function frame() {
    confetti({ particleCount: 3, angle: 60, spread: 55, startVelocity: 55, origin: { x: 0, y: 0.7 }, colors, zIndex: 2100 })
    confetti({ particleCount: 3, angle: 120, spread: 55, startVelocity: 55, origin: { x: 1, y: 0.7 }, colors, zIndex: 2100 })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
  const burst = setInterval(() => {
    const timeLeft = end - Date.now()
    if (timeLeft <= 0) { clearInterval(burst); return }
    confetti({
      particleCount: Math.round(60 * (timeLeft / duration)),
      startVelocity: 30, spread: 360, ticks: 60, zIndex: 2100, colors,
      origin: { x: 0.2 + Math.random() * 0.2, y: 0.25 + Math.random() * 0.2 },
    })
    confetti({
      particleCount: Math.round(60 * (timeLeft / duration)),
      startVelocity: 30, spread: 360, ticks: 60, zIndex: 2100, colors,
      origin: { x: 0.6 + Math.random() * 0.2, y: 0.2 + Math.random() * 0.2 },
    })
  }, 300)
}

function JeepScene() {
  const dust = [0, 1, 2, 3].map(i => ({ delay: i * 0.18, size: 26 + i * 6 }))
  return (
    <div className="celeb-scene">
      <div className="celeb-jeep-sky" />
      <div className="celeb-jeep-ground" />
      {dust.map((d, i) => (
        <div key={i} className="celeb-dust" style={{
          width: d.size, height: d.size, left: `-${8 + i * 4}%`, bottom: '19%',
          animationDelay: `${d.delay}s`,
        }} />
      ))}
      <div className="celeb-jeep-rig">
        <svg width="150" height="80" viewBox="0 0 150 80">
          <ellipse cx="75" cy="70" rx="70" ry="6" fill="rgba(0,0,0,0.25)" />
          <rect x="18" y="32" width="100" height="24" rx="4" fill="#141414" />
          <path d="M28 32 L36 12 H92 L104 32 Z" fill="#141414" />
          <path d="M40 30 L46 16 H72 L74 30 Z" fill="#f0b28c" opacity="0.85" />
          <path d="M78 30 L80 16 H90 L96 30 Z" fill="#f0b28c" opacity="0.85" />
          <rect x="4" y="38" width="16" height="10" rx="2" fill="#141414" />
          <rect x="6" y="16" width="4" height="20" fill="#141414" />
          <circle cx="42" cy="58" r="15" fill="#0a0a0a" />
          <circle cx="42" cy="58" r="6" fill="#3a3a3a" />
          <circle cx="104" cy="58" r="15" fill="#0a0a0a" />
          <circle cx="104" cy="58" r="6" fill="#3a3a3a" />
          <rect x="30" y="40" width="6" height="6" fill="#d65a1f" />
        </svg>
      </div>
    </div>
  )
}

function SkierScene() {
  const spray = [0, 1, 2].map(i => ({ delay: i * 0.14, size: 14 + i * 5 }))
  return (
    <div className="celeb-scene">
      <div className="celeb-ski-slope" />
      <div className="celeb-finish-flag">
        <svg width="60" height="90" viewBox="0 0 60 90">
          <rect x="26" y="0" width="4" height="90" fill="#141414" />
          <rect x="30" y="4" width="26" height="16" fill="#d65a1f" />
          <rect x="30" y="20" width="26" height="16" fill="#141414" />
        </svg>
      </div>
      <div className="celeb-ski-rig">
        {spray.map((s, i) => (
          <div key={i} className="celeb-snow-spray" style={{
            width: s.size, height: s.size, left: -6 - i * 6, bottom: 4,
            animationDelay: `${s.delay}s`,
          }} />
        ))}
        <svg width="70" height="70" viewBox="0 0 70 70">
          <rect x="6" y="56" width="58" height="4" rx="2" fill="#141414" transform="rotate(-6 6 56)" />
          <circle cx="34" cy="24" r="8" fill="#141414" />
          <rect x="28" y="18" width="12" height="6" rx="2" fill="#d65a1f" />
          <path d="M34 32 L26 50 L34 46 L42 50 Z" fill="#141414" />
          <path d="M34 34 L14 26" stroke="#141414" strokeWidth="3" strokeLinecap="round" />
          <path d="M34 34 L52 30" stroke="#141414" strokeWidth="3" strokeLinecap="round" />
          <path d="M27 46 L10 40" stroke="#141414" strokeWidth="3" strokeLinecap="round" />
          <path d="M41 46 L58 40" stroke="#141414" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

function SkydiverScene() {
  const clouds = [
    { top: '18%', left: '70%', w: 90, h: 30, dur: '9s' },
    { top: '32%', left: '10%', w: 70, h: 24, dur: '11s' },
    { top: '55%', left: '75%', w: 60, h: 20, dur: '13s' },
  ]
  return (
    <div className="celeb-scene">
      <div className="celeb-sky-bg" />
      {clouds.map((c, i) => (
        <div key={i} className="celeb-cloud" style={{ top: c.top, left: c.left, width: c.w, height: c.h, animationDuration: c.dur }} />
      ))}
      <div className="celeb-diver-rig">
        <svg width="140" height="150" viewBox="0 0 140 150">
          <g className="celeb-chute">
            <path d="M20 40 Q70 -10 120 40 L100 50 Q70 30 40 50 Z" fill="#d65a1f" />
            <path d="M35 45 L52 76 M105 45 L88 76 M70 30 L70 78" stroke="#141414" strokeWidth="2" />
          </g>
          <circle cx="70" cy="90" r="9" fill="#141414" />
          <rect x="62" y="98" width="16" height="18" rx="6" fill="#d65a1f" />
          <path d="M62 100 L30 92 M78 100 L110 92" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
          <path d="M64 114 L42 140 M76 114 L98 140" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
          <line x1="52" y1="76" x2="30" y2="92" stroke="#141414" strokeWidth="2" />
          <line x1="88" y1="76" x2="110" y2="92" stroke="#141414" strokeWidth="2" />
        </svg>
      </div>
    </div>
  )
}

const SCENES = { jeep: JeepScene, skier: SkierScene, skydiver: SkydiverScene }

export default function CelebrationHost() {
  const [active, setActive] = useState(null)
  const timeoutRef = useRef(null)

  useEffect(() => onCelebrateWin(() => {
    const effect = EFFECTS[Math.floor(Math.random() * EFFECTS.length)]
    setActive({ effect, key: Date.now() })
    if (effect === 'fireworks') runFireworks()
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setActive(null), 3600)
  }), [])

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  if (!active) return null
  const Scene = SCENES[active.effect]

  return (
    <div className="celeb-overlay" key={active.key}>
      {Scene && <Scene />}
      <div className="celeb-banner">🎉 עסקה נסגרה בהצלחה!</div>
    </div>
  )
}
