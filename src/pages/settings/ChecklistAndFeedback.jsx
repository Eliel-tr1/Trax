import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toast } from '../../components/Toaster'
import { formatDateTime } from '../../lib/format'

/* ============================================================
   צ'קליסטים — the dynamic checklist templates (Goldi 01.09: "configurable
   from Settings what's in the registration checklist and the journey
   checklist; add/remove items, mark which ones require a file"). Two scopes:
   'registration' (shown on every registration) and 'journey' (shown on the
   journey's own screen). */
export function ChecklistTemplatesTab() {
  const [scope, setScope] = useState('registration')
  const [items, setItems] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('checklist_templates')
      .select('*').eq('scope', scope).order('position')
    setItems(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [scope])

  const addItem = async () => {
    if (!newLabel.trim()) return
    const position = items.length ? Math.max(...items.map(i => i.position)) + 1 : 1
    const { error } = await supabase.from('checklist_templates')
      .insert({ scope, label: newLabel.trim(), position, needs_file: false })
    if (error) return toast('ההוספה נכשלה: ' + error.message, 'err')
    setNewLabel('')
    load()
  }

  const patch = async (id, fields) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...fields } : i))
    const { error } = await supabase.from('checklist_templates').update(fields).eq('id', id)
    if (error) { toast('השמירה נכשלה', 'err'); load() }
  }

  const remove = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id))
    const { error } = await supabase.from('checklist_templates').delete().eq('id', id)
    if (error) { toast('המחיקה נכשלה', 'err'); load() }
  }

  const move = async (index, dir) => {
    const other = items[index + dir]
    if (!other) return
    const me = items[index]
    await Promise.all([
      supabase.from('checklist_templates').update({ position: other.position }).eq('id', me.id),
      supabase.from('checklist_templates').update({ position: me.position }).eq('id', other.id),
    ])
    load()
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <div className="sections-tabs" style={{ marginBottom: 0 }}>
          {[['registration', 'צ׳קליסט הרשמה'], ['journey', 'צ׳קליסט מסע']].map(([k, l]) => (
            <div key={k} className={`sec-tab ${scope === k ? 'active' : ''}`} onClick={() => setScope(k)}>{l}</div>
          ))}
        </div>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        {scope === 'registration'
          ? 'הפריטים יופיעו בצ׳קליסט לקראת נסיעה של כל הרשמה חדשה.'
          : 'הפריטים יופיעו בצ׳קליסט התארגנות של כל מסע.'}
        {' '}פריט עם קובץ = הנציג יכול לצרף אליו מסמך.
      </p>

      {loading ? <div className="empty"><span className="spinner" /></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it, idx) => (
            <div key={it.id} className="row" style={{ gap: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button className="btn subtle sm" style={{ padding: '0 4px', lineHeight: 1 }} onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
                <button className="btn subtle sm" style={{ padding: '0 4px', lineHeight: 1 }} onClick={() => move(idx, 1)} disabled={idx === items.length - 1}>↓</button>
              </div>
              <input className="input" style={{ flex: 1 }} value={it.label}
                onChange={e => patch(it.id, { label: e.target.value })} />
              <label className="row" style={{ gap: 5, cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={it.needs_file} onChange={e => patch(it.id, { needs_file: e.target.checked })} />
                דורש קובץ
              </label>
              <button className="btn subtle sm" onClick={() => remove(it.id)} title="מחיקה">✕</button>
            </div>
          ))}
          <div className="row" style={{ gap: 8, marginTop: 6 }}>
            <input className="input" style={{ flex: 1 }} placeholder="פריט חדש..."
              value={newLabel} onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()} />
            <button className="btn sm" onClick={addItem}>הוספה</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   דיווחים — the bug/idea reports submitted via the sidebar icon. Lives only
   here, per the client: documented centrally, never a nav entity. */
export function FeedbackReportsTab() {
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState('הכל')

  const load = async () => {
    const { data } = await supabase.from('feedback_reports')
      .select('*').order('created_at', { ascending: false })
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const setStatus = async (id, status) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    const { error } = await supabase.from('feedback_reports').update({ status }).eq('id', id)
    if (error) { toast('העדכון נכשל', 'err'); load() }
  }

  if (!rows) return <div className="empty"><span className="spinner" /></div>
  const shown = filter === 'הכל' ? rows : rows.filter(r => r.kind === filter)
  const STATUSES = ['חדש', 'בטיפול', 'טופל', 'נדחה']

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        {['הכל', 'באג', 'רעיון'].map(k => (
          <button key={k} className={`btn sm ${filter === k ? '' : 'subtle'}`} onClick={() => setFilter(k)}>{k}</button>
        ))}
        <span className="muted small">{shown.length} דיווחים</span>
      </div>
      {!shown.length ? <div className="empty">אין דיווחים</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map(r => (
            <div key={r.id} className="card" style={{ padding: '10px 14px' }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <span className={`badge ${r.kind === 'באג' ? 'err' : 'ok'}`}>{r.kind}</span>
                <span className="muted small">{formatDateTime(r.created_at)}</span>
              </div>
              <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>{r.content}</p>
              {r.screenshot_url && (
                <a href={r.screenshot_url} target="_blank" rel="noreferrer" className="small" style={{ color: 'var(--mp)' }}>
                  צילום מסך מצורף
                </a>
              )}
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {STATUSES.map(s => (
                  <button key={s} className={`badge ${r.status === s ? (s === 'טופל' ? 'ok' : s === 'נדחה' ? 'gray' : 'warn') : 'gray'}`}
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => setStatus(r.id, s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}