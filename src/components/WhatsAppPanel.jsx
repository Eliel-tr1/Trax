import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import StatusBadge from './StatusBadge'
import { formatDateTime } from '../lib/format'

// Read-only view of the lead's WhatsApp conversation with the AI agent (Max).
// Shown on the customer and the sale screens. No sending from here, on
// purpose (Sahar 24/10).
// Data: Edge Function cloudchat-bridge {action:'chat'}, which reads the agent
// portal API (the whole chat: templates with full text, console agents, flow
// replies, Meta errors, media and voice transcripts), not CloudChat directly
// (rate limit). Media bytes come through {action:'media'}. No key reaches the
// browser; the function reads the record under the caller's own RLS.

const WHO = {
  customer: 'ליד',
  agent: 'מקס (בוט)',
  template: 'תבנית וואטסאפ',
  flow: 'הודעה אוטומטית',
  system: 'מערכת',
  error: 'שגיאת שליחה',
  external: 'מערכת חיצונית',
}

const TYPE_HE = { image: 'תמונה', video: 'סרטון', audio: 'הקלטה', document: 'קובץ' }

function MediaView({ m }) {
  const [url, setUrl] = useState(null)
  const [err, setErr] = useState(false)
  const media = m.media || {}
  useEffect(() => {
    let alive = true
    let made = null
    if (!media.url) return
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cloudchat-bridge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: 'media', id: media.id }),
        })
        if (!r.ok) throw new Error(String(r.status))
        made = URL.createObjectURL(await r.blob())
        if (alive) setUrl(made)
      } catch { if (alive) setErr(true) }
    })()
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [media.id, media.url])

  const label = TYPE_HE[m.type] || 'קובץ'
  if (!media.url || err) return <div className="wa-media-missing">[{label}{media.name ? `: ${media.name}` : ''}, לא זמין לתצוגה]</div>
  if (!url) return <div className="wa-media-missing"><span className="spinner" style={{ width: 12, height: 12 }} /> טוען {label}</div>
  if (m.type === 'image') return <a href={url} target="_blank" rel="noreferrer"><img className="wa-media" src={url} alt={media.name || label} /></a>
  if (m.type === 'video') return <video className="wa-media" src={url} controls preload="metadata" />
  if (m.type === 'audio') return <audio className="wa-audio" src={url} controls preload="metadata" />
  return <a className="btn subtle sm" href={url} download={media.name || 'file'}><Icon name="file" size={13} /> {media.name || label}</a>
}

export default function WhatsAppPanel({ customerId, saleId, status }) {
  const [state, setState] = useState({ loading: true })
  const boxRef = useRef(null)

  const load = async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    const body = saleId ? { action: 'chat', sale_id: saleId } : { action: 'chat', customer_id: customerId }
    const { data, error } = await supabase.functions.invoke('cloudchat-bridge', { body })
    if (error || data?.error) setState({ loading: false, error: 'לא ניתן לטעון את השיחה כרגע' })
    else setState({ loading: false, ...data })
  }
  useEffect(() => { load() }, [customerId, saleId])
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [state.messages])

  const msgs = state.messages || []

  return (
    <div className="card wa-panel" id="whatsapp-panel">
      <div className="wa-head">
        <div className="wa-title">
          <Icon name="message" size={16} />
          <b>שיחת וואטסאפ עם הסוכן</b>
          {status !== undefined && (status
            ? <StatusBadge value={status} field="ai_chat_status" resource="sale" />
            : <span className="badge gray">לא נשלחה הודעה</span>)}
        </div>
        <div className="wa-actions">
          {state.chat_url && (
            <a className="btn subtle sm" href={state.chat_url} target="_blank" rel="noreferrer">פתיחה בקלאודצ׳אט</a>
          )}
          <button className="btn subtle sm" onClick={load} disabled={state.loading} title="רענון">
            {state.loading ? <span className="spinner" style={{ width: 13, height: 13 }} /> : 'רענון'}
          </button>
        </div>
      </div>
      <div className="small muted" style={{ marginBottom: 8 }}>צפייה בלבד. ההתכתבות עצמה מתנהלת בקלאודצ׳אט.</div>
      {state.error && <div className="empty">{state.error}</div>}
      {!state.error && !state.loading && msgs.length === 0 && (
        <div className="empty">עדיין אין הודעות בשיחת הוואטסאפ עם הליד.</div>
      )}
      {msgs.length > 0 && (
        <div className="wa-box" ref={boxRef}>
          {state.has_more && <div className="small muted" style={{ textAlign: 'center' }}>מוצגות 200 ההודעות האחרונות</div>}
          {msgs.map(m => {
            const kind = m.sender === 'error' ? 'error'
              : m.direction === 'in' ? 'in'
              : m.sender === 'system' ? 'system'
              : 'out'
            let who = WHO[m.sender] || 'הודעה'
            if (m.sender === 'human') who = m.sender_name ? `נציג: ${m.sender_name}` : 'נציג'
            if (m.sender === 'template' && m.template) who = `תבנית וואטסאפ (${m.template})`
            if (m.sender === 'error' && m.error_code) who = `שגיאת שליחה (${m.error_code})`
            return (
              <div key={m.id} className={`wa-msg wa-${kind}`}>
                <div className="wa-meta">{who} · {formatDateTime(m.at)}</div>
                {m.media && <MediaView m={m} />}
                {m.text && <div className="wa-text">{m.text}</div>}
                {m.type === 'audio' && (
                  m.transcript
                    ? <div className="wa-transcript"><b>תמלול:</b> {m.transcript}</div>
                    : <div className="wa-transcript muted">{m.transcript_status === 'failed' ? 'התמלול נכשל' : 'התמלול בהכנה, יופיע ברענון'}</div>
                )}
                {!m.text && !m.media && m.type !== 'audio' && m.type !== 'text' && <div className="wa-text muted">[{TYPE_HE[m.type] || m.type}]</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
