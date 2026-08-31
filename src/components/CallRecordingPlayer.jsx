import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

// Lightweight recording player for phone_calls.recording_url. No waveform
// library — checked package.json first (no wavesurfer.js or similar already
// in the app, and this build is already flagged as large elsewhere in the
// codebase/docs, see presentation_ram_fix-style warnings), so this wraps a
// plain <audio> element with custom play/pause + a scrub/progress bar
// (native <input type="range"> synced to currentTime), rather than pulling
// in a new dependency for a single field on one record type.
function fmt(s) {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function CallRecordingPlayer({ url }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setPlaying(false); setCurrent(0); setDuration(0)
  }, [url])

  if (!url) {
    return (
      <div className="ef">
        <span className="ef-label">הקלטה</span>
        <span className="ef-val muted" style={{ fontWeight: 400 }}>אין הקלטה זמינה</span>
      </div>
    )
  }

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) a.pause(); else a.play()
  }

  const seek = (e) => {
    const a = audioRef.current
    const v = parseFloat(e.target.value)
    if (a) a.currentTime = v
    setCurrent(v)
  }

  const pct = duration ? (current / duration) * 100 : 0

  return (
    <div className="ef" style={{ alignItems: 'start' }}>
      <span className="ef-label">הקלטה</span>
      <div className="ef-val" style={{ width: '100%' }}>
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={e => setDuration(e.target.duration || 0)}
          onTimeUpdate={e => setCurrent(e.target.currentTime || 0)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '8px 12px', maxWidth: 420 }}>
          <button type="button" onClick={toggle} title={playing ? 'השהיה' : 'נגינה'}
            style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--mp)', color: 'var(--text-inv)', cursor: 'pointer', flexShrink: 0 }}>
            {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" style={{ marginInlineStart: 1 }} />}
          </button>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input type="range" min={0} max={duration || 0} step={0.1} value={current} onChange={seek} dir="ltr"
              style={{ width: '100%', accentColor: 'var(--mp)', height: 4, cursor: 'pointer' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-3)', direction: 'ltr' }}>
              <span>{fmt(current)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 4 }}>
          <a href={url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="small" style={{ color: 'var(--text-3)' }}>
            פתיחה בכרטיסייה נפרדת
          </a>
        </div>
      </div>
    </div>
  )
}
