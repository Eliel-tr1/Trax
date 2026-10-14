import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Inline call-recording player for table rows (Sahar 14/10/2026: play straight
// from the calls table, small timeline, no navigation into the record).
// Recordings live in the private bucket call-recordings (data/051), so the
// signed URL is fetched lazily on the first click, not for every row on render.
// Only one row plays at a time: starting one pauses the previous.
let current = null

function fmt(s) {
  if (!Number.isFinite(s)) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export default function MiniCallPlayer({ path }) {
  const audioRef = useRef(null)
  const [src, setSrc] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)

  useEffect(() => () => { if (current === audioRef.current) current = null }, [])

  if (!path) return <span className="muted">-</span>

  const toggle = async (e) => {
    e.stopPropagation()
    const a = audioRef.current
    if (!a) return
    if (playing) { a.pause(); return }
    if (!src) {
      setLoading(true)
      const { data } = await supabase.storage.from('call-recordings').createSignedUrl(path, 3600)
      setLoading(false)
      if (!data?.signedUrl) return
      a.src = data.signedUrl
      setSrc(data.signedUrl)
    }
    if (current && current !== a) current.pause()
    current = a
    a.play()
  }

  const seek = (e) => {
    e.stopPropagation()
    const v = parseFloat(e.target.value)
    if (audioRef.current) audioRef.current.currentTime = v
    setT(v)
  }

  return (
    // Fixed width: the time counter appearing on play used to widen the cell and
    // push the play/pause button out of view (Sahar 14/10: "no pause").
    <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 6, width: 196, direction: 'ltr' }}>
      <button type="button" className={playing ? 'btn sm' : 'btn subtle sm'} onClick={toggle} disabled={loading}
        aria-label={playing ? 'השהיה' : 'השמעה'} title={playing ? 'השהיה' : 'השמעה'}
        style={{ padding: '2px 6px', lineHeight: 1, flexShrink: 0 }}>
        {loading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <input type="range" min={0} max={dur || 0} step={0.1} value={t} onChange={seek} onClick={e => e.stopPropagation()}
        disabled={!src} style={{ width: 84, minWidth: 0, flexShrink: 1, accentColor: 'var(--mp)' }} aria-label="ציר זמן" />
      <span className="small muted" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', width: 62, flexShrink: 0 }}>
        {src ? `${fmt(t)}/${fmt(dur)}` : ''}
      </span>
      <audio ref={audioRef} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setT(0) }}
        onTimeUpdate={e => setT(e.currentTarget.currentTime)} onLoadedMetadata={e => setDur(e.currentTarget.duration)} />
    </span>
  )
}
