import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../components/Toaster'
import { Switch } from '../components/ui/switch'
import EditField from '../components/EditField'
import Icon from '../components/Icon'

const SECTIONS = ['פרטי מערכת', 'אוטומציות', 'מפתחות API']

export default function Settings() {
  const [sec, setSec] = useState('פרטי מערכת')

  return (
    <div className="card">
      <div className="sections-tabs">{SECTIONS.map(s => <div key={s} className={`sec-tab ${sec === s ? 'active' : ''}`} onClick={() => setSec(s)}>{s}</div>)}</div>
      {sec === 'פרטי מערכת' && <SystemSettings />}
      {sec === 'אוטומציות' && <AutomationRules />}
      {sec === 'מפתחות API' && <ApiKeys />}
    </div>
  )
}

function SystemSettings() {
  const [rows, setRows] = useState(null)

  const load = async () => {
    const { data } = await supabase.from('system_settings').select('*').order('key')
    setRows(data || [])
  }
  useEffect(() => { load() }, [])

  const save = async (key, value) => {
    const { error } = await supabase.from('system_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    if (error) { toast('השמירה נכשלה', 'err'); throw error }
    setRows(rs => rs.map(r => r.key === key ? { ...r, value } : r))
    toast('נשמר')
  }

  const LABELS = { system_name: 'שם המערכת', system_logo_url: 'קישור ללוגו המערכת' }

  if (!rows) return <div className="empty"><span className="spinner" /></div>

  return (
    <div className="field-grid">
      {rows.map(r => (
        <EditField key={r.key} label={LABELS[r.key] || r.key} value={r.value} ltr={r.key === 'system_logo_url'} onSave={v => save(r.key, v)} />
      ))}
    </div>
  )
}

function AutomationRules() {
  const [rules, setRules] = useState(null)
  const [logCounts, setLogCounts] = useState({})

  const load = async () => {
    const { data } = await supabase.from('automation_rules').select('*').order('created_at')
    setRules(data || [])
    const counts = {}
    for (const r of data || []) {
      const { count } = await supabase.from('automation_logs').select('id', { count: 'exact', head: true }).eq('rule_id', r.id)
      counts[r.id] = count ?? 0
    }
    setLogCounts(counts)
  }
  useEffect(() => { load() }, [])

  const toggle = async (rule) => {
    const is_active = !rule.is_active
    setRules(rs => rs.map(r => r.id === rule.id ? { ...r, is_active } : r))
    const { error } = await supabase.from('automation_rules').update({ is_active }).eq('id', rule.id)
    if (error) { toast('העדכון נכשל', 'err'); setRules(rs => rs.map(r => r.id === rule.id ? { ...r, is_active: !is_active } : r)); return }
    toast('נשמר')
  }

  if (!rules) return <div className="empty"><span className="spinner" /></div>
  if (!rules.length) return <div className="empty small">אין חוקי אוטומציה</div>

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead><tr><th>שם</th><th>אובייקט</th><th>טריגר</th><th>הרצות</th><th>פעיל</th></tr></thead>
        <tbody>
          {rules.map(r => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.object_name}</td>
              <td>{r.trigger_event}</td>
              <td className="small">{logCounts[r.id] ?? '…'}</td>
              <td><Switch checked={r.is_active} onCheckedChange={() => toggle(r)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ApiKeys() {
  const [keys, setKeys] = useState(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('api_keys').select('id, name, key_prefix, role, is_active, last_used_at').order('created_at')
      setKeys(data || [])
    })()
  }, [])

  if (!keys) return <div className="empty"><span className="spinner" /></div>
  if (!keys.length) return <div className="empty small">אין מפתחות API</div>

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead><tr><th>שם</th><th>קידומת</th><th>תפקיד</th><th>שימוש אחרון</th><th>סטטוס</th></tr></thead>
        <tbody>
          {keys.map(k => (
            <tr key={k.id}>
              <td style={{ fontWeight: 600 }}>{k.name}</td>
              <td className="small" dir="ltr">{k.key_prefix}…</td>
              <td>{k.role}</td>
              <td className="small">{k.last_used_at ? new Date(k.last_used_at).toLocaleString('he-IL') : 'מעולם לא נעשה בו שימוש'}</td>
              <td><span className={`badge ${k.is_active ? 'ok' : 'gray'}`}>{k.is_active ? 'פעיל' : 'לא פעיל'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted small" style={{ marginTop: 10 }}>
        <Icon name="help" size={13} /> יצירת מפתח חדש דורשת פונקציית שרת (Edge Function) ואינה זמינה כאן עדיין.
      </div>
    </div>
  )
}
