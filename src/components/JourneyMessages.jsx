import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/format'
import { PhoneDisplay } from './PhoneInput'

// "ברוך הבא למסע" WhatsApp messages of one registration (migration 054,
// docs/decisions/0011): one row per message type and phone, with why a
// message was not sent. Read-only; sending is automatic on status change.
const KIND = { seat_reserved: 'שמירת מקום', welcome: 'ברוך הבא למסע' }
const STATUS = {
  sent: ['נשלחה', 'ok'], failed: ['נכשלה', 'err'], skipped: ['לא נשלחה', 'gray'], pending: ['בשליחה', 'info'],
}

export default function JourneyMessages({ registrationId }) {
  const [rows, setRows] = useState(null)
  const load = async () => {
    const { data } = await supabase.from('journey_messages')
      .select('id, kind, phone, recipient_name, status, reason, template, sent_at, updated_at')
      .eq('registration_id', registrationId).order('created_at')
    setRows(data || [])
  }
  useEffect(() => { load() }, [registrationId])
  if (!rows) return null
  return (
    <div className="card" id="journey-messages">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <b style={{ color: 'var(--heading)' }}>הודעות וואטסאפ למשתתפים</b>
        <button className="btn subtle sm" onClick={load}>רענון</button>
      </div>
      <div className="small muted" style={{ marginBottom: 8 }}>
        נשלחות אוטומטית כשההרשמה עוברת ל"משוריין" (שמירת מקום) או ל"שולמה מקדמה" / "שולם במלואו" (ברוך הבא), ללקוח ולכל נוסע עם טלפון. כל הודעה נשלחת פעם אחת בלבד.
      </div>
      {!rows.length ? <div className="empty">עדיין לא נשלחו הודעות להרשמה הזו.</div> : (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>הודעה</th><th>נמען</th><th>טלפון</th><th>מצב</th><th>פירוט</th><th>זמן</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const [label, cls] = STATUS[r.status] || [r.status, 'gray']
                return (
                  <tr key={r.id}>
                    <td>{KIND[r.kind] || r.kind}</td>
                    <td>{r.recipient_name || '-'}</td>
                    <td><PhoneDisplay value={'+' + r.phone} /></td>
                    <td><span className={`badge ${cls}`}>{label}</span></td>
                    <td className="small">{r.status === 'sent' ? (r.template || '') : (r.reason || '')}</td>
                    <td className="small">{formatDateTime(r.sent_at || r.updated_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
