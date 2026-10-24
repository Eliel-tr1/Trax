import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import StatusBadge from './StatusBadge'
import { formatDateTime } from '../lib/format'

// Read-only view of the lead's WhatsApp conversation with the AI agent (Max
// on CloudChat). Shown on the customer and the sale screens. No sending from
// here, on purpose (Sahar 24/10): the conversation is run by the agent and by
// people in the CloudChat inbox, linked from the header.
// Data: Edge Function cloudchat-bridge {action:'chat'} (docs/decisions/0010).
// The CloudChat key never reaches the browser; the function reads the record
// under the caller's own RLS.

const WHO = {
  in: 'ליד',
  out: 'מקס (בוט)',
  agent: 'נציג',
  note: 'הערה פנימית',
  system: 'מערכת',
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
      {!state.error && !state.loading && !state.user_ns && (
        <div className="empty">עדיין אין שיחת וואטסאפ עם הליד.</div>
      )}
      {!state.error && state.user_ns && !state.loading && msgs.length === 0 && (
        <div className="empty">אין הודעות בשיחה.</div>
      )}
      {msgs.length > 0 && (
        <div className="wa-box" ref={boxRef}>
          {msgs.map(m => {
            const isErr = m.msg_type === 'error'
            const kind = isErr ? 'error' : (m.type === 'in' ? 'in' : m.type === 'note' ? 'note' : m.type === 'system' ? 'system' : 'out')
            const who = isErr ? 'שגיאת שליחה' : (m.type === 'agent' && m.username ? `נציג: ${m.username}` : WHO[m.type] || m.type)
            return (
              <div key={m.id} className={`wa-msg wa-${kind}`}>
                <div className="wa-meta">{who} · {formatDateTime(new Date(m.ts * 1000).toISOString())}</div>
                <div className="wa-text">{m.text || (m.msg_type && m.msg_type !== 'text' ? `[${m.msg_type}]` : '')}</div>
              </div>
            )
          })}
        </div>
      )}
      {state.user_ns && !state.linked && (
        <div className="small muted" style={{ marginTop: 6 }}>השיחה אותרה לפי מספר הטלפון. מזהה הקלאודצ׳אט יישמר בלקוח עם שליחת הודעת הפתיחה.</div>
      )}
    </div>
  )
}
