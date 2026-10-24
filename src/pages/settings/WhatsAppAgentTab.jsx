import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/Toaster'
import { Switch } from '../../components/ui/switch'
import EditField from '../../components/EditField'
import { confirmDialog } from '../../components/Dialogs'
import { formatDateTime } from '../../lib/format'

// Settings > "וואטסאפ וסוכן AI" (migration 053, docs/decisions/0010).
// 1. Outbound webhooks (event sale.created -> n8n "TRAX - WhatsApp ליד חדש").
// 2. Opening-message settings read by the Edge Function cloudchat-bridge.
// 3. Delivery log (pg_net result per webhook call).

const PLACEHOLDERS_JOURNEY = '{first_name} {trip_name} {destination} {start_date} {end_date} {participants} {days_to_trip} {trip_url}'
const JOURNEY_SETTINGS = [
  { key: 'whatsapp_reserved_template_name', label: 'תבנית "שמירת מקום" (הרשמה במשוריין)', ltr: true, hint: 'ריק = לא נשלחת הודעה.' },
  { key: 'whatsapp_reserved_template_lang', label: 'שפת תבנית שמירת מקום', ltr: true },
  { key: 'whatsapp_reserved_template_params', label: 'משתני תבנית שמירת מקום (JSON)', ltr: true, type: 'textarea', hint: `אפשר: ${PLACEHOLDERS_JOURNEY}. תאריכים בפורמט DD.MM.YYYY. משתנה שיוצא ריק עוצר את השליחה ופותח משימה לנציג.` },
  { key: 'whatsapp_welcome_template_name', label: 'תבנית "ברוך הבא למסע" (מקדמה או תשלום מלא)', ltr: true, hint: 'ריק = לא נשלחת הודעה.' },
  { key: 'whatsapp_welcome_template_lang', label: 'שפת תבנית ברוך הבא', ltr: true },
  { key: 'whatsapp_welcome_template_params', label: 'משתני תבנית ברוך הבא (JSON)', ltr: true, type: 'textarea', hint: `אפשר: ${PLACEHOLDERS_JOURNEY}.` },
]

const SETTINGS = [
  { key: 'whatsapp_lead_template_name', label: 'שם תבנית הפתיחה (כפי שאושרה במטא)', ltr: true,
    hint: 'ריק = לא נשלחת הודעה, והמכירה מסומנת "השליחה נכשלה" עם הסבר.' },
  { key: 'whatsapp_lead_template_lang', label: 'שפת התבנית', ltr: true, hint: 'למשל he או en' },
  { key: 'whatsapp_lead_template_params', label: 'משתני התבנית (JSON)', ltr: true, type: 'textarea',
    hint: 'למשל {"BODY_{{1}}":"{first_name}"}. אפשר: {first_name} {last_name} {full_name} {journey_name} {owner_name}. ריק {} = אם בתבנית משתנה אחד, הוא מקבל את השם הפרטי.' },
  { key: 'whatsapp_test_phones', label: 'טלפונים לבדיקה (במצב בדיקה)', ltr: true, hint: 'מופרדים בפסיק, למשל +972501234567' },
  { key: 'whatsapp_dedupe_days', label: 'לא לשלוח שוב לאותו לקוח תוך (ימים)', ltr: true },
  { key: 'whatsapp_noreply_hours', label: 'משימת שיחה לנציג אם לא ענה תוך (שעות)', ltr: true },
]

export default function WhatsAppAgentTab() {
  const [hooks, setHooks] = useState(null)
  const [settings, setSettings] = useState({})
  const [log, setLog] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = async () => {
    const [{ data: h }, { data: s }, { data: l }] = await Promise.all([
      supabase.from('outbound_webhooks').select('id, name, event, url, is_active, created_at').order('created_at'),
      supabase.from('system_settings').select('key, value').like('key', 'whatsapp_%'),
      supabase.rpc('webhook_delivery_log', { p_limit: 30 }),
    ])
    setHooks(h || [])
    setSettings(Object.fromEntries((s || []).map(r => [r.key, r.value])))
    setLog(l || [])
  }
  useEffect(() => { load() }, [])

  const saveSetting = async (key, value) => {
    if (key.endsWith('_template_params') && value) {
      try { JSON.parse(value) } catch { toast('JSON לא תקין', 'err'); throw new Error('bad json') }
    }
    const { error } = await supabase.from('system_settings').update({ value: value ?? '', updated_at: new Date().toISOString() }).eq('key', key)
    if (error) { toast('השמירה נכשלה', 'err'); throw error }
    setSettings(s => ({ ...s, [key]: value ?? '' }))
    toast('נשמר')
  }

  const toggleTestMode = async () => {
    const live = settings.whatsapp_test_mode !== 'false'
    if (live) {
      const ok = await confirmDialog('מעכשיו כל ליד חדש ב-TRAX (גם מפייסבוק ומהאתר) יקבל הודעת וואטסאפ מהסוכן, אם הצ\'קבוקס מסומן. להמשיך?', { danger: true, confirmText: 'כן, לשלוח לכולם' })
      if (!ok) return
    }
    await saveSetting('whatsapp_test_mode', live ? 'false' : 'true')
  }

  const toggleHook = async (h) => {
    const { error } = await supabase.from('outbound_webhooks').update({ is_active: !h.is_active, updated_at: new Date().toISOString() }).eq('id', h.id)
    if (error) return toast('העדכון נכשל', 'err')
    load()
  }
  const saveHookUrl = async (h, url) => {
    if (!/^https:\/\//.test(url || '')) { toast('כתובת חייבת להתחיל ב-https://', 'err'); throw new Error('bad url') }
    const { error } = await supabase.from('outbound_webhooks').update({ url, updated_at: new Date().toISOString() }).eq('id', h.id)
    if (error) { toast('השמירה נכשלה', 'err'); throw error }
    toast('נשמר'); load()
  }
  const testHook = async (h) => {
    setBusy(h.id)
    const { error } = await supabase.rpc('send_test_webhook', { p_webhook_id: h.id })
    setBusy(null)
    if (error) return toast('שליחת הבדיקה נכשלה: ' + error.message, 'err')
    toast('נשלחה קריאת בדיקה (event: test). התוצאה תופיע ביומן בעוד כמה שניות.')
    setTimeout(load, 4000)
  }

  if (!hooks) return <div className="empty"><span className="spinner" /></div>
  const testMode = settings.whatsapp_test_mode !== 'false'

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="small muted" style={{ lineHeight: 1.7 }}>
        כל מכירה חדשה ב-CRM מפעילה וובהוק (sale.created) אל n8n. אחרי כדקה n8n מבקש מה-CRM לשלוח ללקוח את תבנית הפתיחה של הסוכן בוואטסאפ,
        אם בצ'קבוקס "לשלוח וואטסאפ ליד חדש" מסומן, הלקוח לא ביקש להפסיק, ולא נשלחה לו הודעה בימים האחרונים.
        הסטטוס במכירה מתעדכן לבד: נשלחה הודעה, ענה לסוכן או השליחה נכשלה. שדה ריק = לא נשלחה הודעה.
      </div>

      <section>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8, color: 'var(--heading)' }}>מצב שליחה</h3>
        <div className="row" style={{ alignItems: 'center', gap: 10 }}>
          <Switch checked={testMode} onCheckedChange={toggleTestMode} />
          <b>{testMode ? 'מצב בדיקה: נשלח רק לטלפונים שברשימת הבדיקה' : 'פעיל: נשלח לכל ליד חדש ב-TRAX'}</b>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8, color: 'var(--heading)' }}>הודעת הפתיחה לליד חדש</h3>
        <div className="field-grid">
          {SETTINGS.map(f => (
            <div key={f.key}>
              <EditField label={f.label} value={settings[f.key] ?? ''} ltr={f.ltr} type={f.type || 'text'} onSave={v => saveSetting(f.key, v)} />
              {f.hint && <div className="small muted" style={{ marginTop: -4 }}>{f.hint}</div>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8, color: 'var(--heading)' }}>ברוך הבא למסע</h3>
        <div className="small muted" style={{ marginBottom: 8 }}>
          הרשמה שעוברת ל"משוריין" מקבלת "שמירת מקום", ול"שולמה מקדמה" או "שולם במלואו" מקבלת "ברוך הבא". נשלח ללקוח ולכל נוסע עם טלפון, פעם אחת לכל הרשמה, הודעה וטלפון.
        </div>
        <div className="field-grid">
          {JOURNEY_SETTINGS.map(f => (
            <div key={f.key}>
              <EditField label={f.label} value={settings[f.key] ?? ''} ltr={f.ltr} type={f.type || 'text'} onSave={v => saveSetting(f.key, v)} />
              {f.hint && <div className="small muted" style={{ marginTop: -4 }}>{f.hint}</div>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8, color: 'var(--heading)' }}>וובהוקים יוצאים</h3>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>שם</th><th>אירוע</th><th>כתובת</th><th>פעיל</th><th></th></tr></thead>
            <tbody>
              {hooks.map(h => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td dir="ltr">{h.event}</td>
                  <td style={{ minWidth: 280 }}><EditField label="" value={h.url} ltr onSave={v => saveHookUrl(h, v)} /></td>
                  <td><Switch checked={h.is_active} onCheckedChange={() => toggleHook(h)} /></td>
                  <td><button className="btn subtle sm" disabled={busy === h.id} onClick={() => testHook(h)}>שליחת בדיקה</button></td>
                </tr>
              ))}
              {!hooks.length && <tr><td colSpan={5} className="muted">אין וובהוקים.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="small muted">כל קריאה נשלחת עם header בשם X-Trax-Webhook-Secret, ו-n8n מאמת אותו.</div>
      </section>

      <section>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 8, color: 'var(--heading)' }}>יומן קריאות (אחרונות)</h3>
          <button className="btn subtle sm" onClick={load}>רענון</button>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>זמן</th><th>אירוע</th><th>רשומה</th><th>תוצאה</th></tr></thead>
            <tbody>
              {(log || []).map(r => (
                <tr key={r.id}>
                  <td className="small">{formatDateTime(r.created_at)}</td>
                  <td dir="ltr">{r.event}</td>
                  <td>{r.record_id ? <a href={`#/${r.event === 'registration.changed' ? 'registrations' : 'sales'}/${r.record_id}`}>פתיחה</a> : '-'}</td>
                  <td>{r.error
                    ? <span className="badge err" title={r.error}>שגיאה</span>
                    : r.status_code
                      ? <span className={`badge ${r.status_code < 300 ? 'ok' : 'err'}`}>HTTP {r.status_code}</span>
                      : <span className="badge gray">ממתין / לא זמין</span>}</td>
                </tr>
              ))}
              {!(log || []).length && <tr><td colSpan={4} className="muted">אין קריאות עדיין.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
