import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { toast } from '../components/Toaster'
import { Switch } from '../components/ui/switch'
import EditField from '../components/EditField'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import UserAvatar from '../components/UserAvatar'
import RequirePermission from '../components/RequirePermission'
import TrashManager from '../components/TrashManager'
import { ChecklistTemplatesTab, FeedbackReportsTab } from './settings/ChecklistAndFeedback'
import { confirmDialog, deleteConfirmDialog, promptDialog } from '../components/Dialogs'
import { usePermissionStore, RESOURCES } from '../stores/permissionStore'
import { startOnboarding } from '../components/Onboarding'
import { applyTheme } from '../components/ThemeToggle'
import ImageCropDialog from '../components/ImageCropDialog'
import AvatarUpload from '../components/AvatarUpload'
import PhoneInput, { PhoneDisplay } from '../components/PhoneInput'
import { formatDateTime } from '../lib/format'

// Fixed dropdown values for the two new app_users columns (see MEMORY.md /
// project brief: department text, permission_profile text). permission_profile
// is deliberately NOT the same thing as the existing RBAC role/role_id pair —
// it's a simple 3-tier label mapped onto one of those roles at invite time
// (see ROLE_KEY_FOR_PROFILE below and RolesTab further down, which is the
// real, editable permission matrix these three map onto).
const PERMISSION_PROFILES = ['מנהל מערכת', 'מנהל צוות', 'נציג']
const DEPARTMENTS = ['ניהול', 'מכירות', 'שירות לקוחות']
// Which roles.key each profile provisions a new user with. owner/team_manager/
// sales_rep already carry the exact permission shape described in the spec
// (seeded directly in the `permissions` table) — see RolesTab to edit them.
const ROLE_KEY_FOR_PROFILE = { 'מנהל מערכת': 'owner', 'מנהל צוות': 'team_manager', 'נציג': 'sales_rep' }

const SECTIONS = ['תצוגה', 'פרטי מערכת', 'אוטומציות', 'מפתחות API', 'דוקומנטציה API', 'שדות מותאמים', 'משתמשים', 'תפקידים והרשאות', 'מיזוג כפילויות', 'צ׳קליסטים', 'דיווחים', 'הדרכה', 'סל מיחזור']

export default function Settings() {
  const [sec, setSec] = useState('תצוגה')
  const canManageUsers = usePermissionStore(s => s.can('users', 'view'))

  const MANAGER_ONLY = new Set(['משתמשים', 'תפקידים והרשאות', 'מיזוג כפילויות'])
  const visibleSections = SECTIONS.filter(s => canManageUsers || !MANAGER_ONLY.has(s))

  return (
    <div className="card">
      <div className="sections-tabs">{visibleSections.map(s => <div key={s} className={`sec-tab ${sec === s ? 'active' : ''}`} onClick={() => setSec(s)}>{s}</div>)}</div>
      {sec === 'תצוגה' && <AppearanceTab />}
      {sec === 'פרטי מערכת' && <SystemSettings />}
      {sec === 'אוטומציות' && <AutomationRules />}
      {sec === 'מפתחות API' && <ApiKeys />}
      {sec === 'דוקומנטציה API' && <ApiDocsTab />}
      {sec === 'שדות מותאמים' && <SchemaTab />}
      {sec === 'משתמשים' && <RequirePermission resource="users"><UsersTab /></RequirePermission>}
      {sec === 'תפקידים והרשאות' && <RequirePermission resource="users"><RolesTab /></RequirePermission>}
      {sec === 'מיזוג כפילויות' && <RequirePermission resource="users"><DuplicatesTab /></RequirePermission>}
      {sec === 'הדרכה' && <OnboardingTab />}
      {sec === 'צ׳קליסטים' && <ChecklistTemplatesTab />}
      {sec === 'דיווחים' && <FeedbackReportsTab />}
      {sec === 'סל מיחזור' && <TrashManager />}
    </div>
  )
}

// ============================================================
// תצוגה — light/dark theme. index.css already ships the full
// [data-theme="dark"] palette; there's also an icon toggle in the topbar
// (ThemeToggle.jsx) — this labelled control is here for anyone who doesn't
// spot the icon. See docs/bina-crm-feature-audit.md item #1.
// ============================================================
function AppearanceTab() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const apply = (t) => { applyTheme(t); setTheme(t) }
  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <div className="card-title"><Icon name="cog" /> ערכת נושא</div>
      <p className="muted small" style={{ marginTop: -4, marginBottom: 14 }}>ניתן להחליף גם מהאייקון שבסרגל העליון.</p>
      <div className="row" style={{ gap: 10 }}>
        <button className={`btn ${theme === 'light' ? '' : 'ghost'}`} onClick={() => apply('light')}><Icon name="sun" size={15} /> בהיר</button>
        <button className={`btn ${theme === 'dark' ? '' : 'ghost'}`} onClick={() => apply('dark')}><Icon name="moon" size={15} /> כהה</button>
      </div>
    </div>
  )
}

function OnboardingTab() {
  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-title"><Icon name="help" /> סיור הדרכה במערכת</div>
      <div className="small muted" style={{ marginBottom: 12, lineHeight: 1.7 }}>
        הסיור רץ אוטומטית בכניסה הראשונה של כל משתמש ומוביל אותו מסך אחר מסך, כולל כרטיס לקוח אמיתי.
        המשתמש הוא זה שמנווט - הסיור ממתין ללחיצה שלו ואז ממשיך. אפשר להפעיל אותו שוב בכל שלב, גם מהפרופיל האישי.
      </div>
      <button className="btn" onClick={() => startOnboarding()}>
        <Icon name="help" size={15} /> הפעלת הסיור מחדש
      </button>
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

  const LABELS = { system_name: 'שם המערכת', system_logo_url: 'קישור ללוגו המערכת', cardcom_payment_url: 'קישור לדף סליקת אשראי (Cardcom)' }

  if (!rows) return <div className="empty"><span className="spinner" /></div>

  return (
    <div className="field-grid">
      {rows.map(r => (
        <EditField key={r.key} label={LABELS[r.key] || r.key} value={r.value} ltr={r.key === 'system_logo_url' || r.key === 'cardcom_payment_url'} onSave={v => save(r.key, v)} />
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

// ============================================================
// מפתחות API — was a bare read-only list. Now: generate a new key inline
// (real bcrypt hash via the create_api_key() SECURITY DEFINER RPC —
// data/007 migration — same crypt()/gen_salt('bf') approach verify_api_key()
// already reads), toggle active, delete.
// A manual "backup now" / restore flow needs a new Edge Function that
// doesn't exist yet — not built here, see the final report.
// ============================================================
function ApiKeys() {
  const [keys, setKeys] = useState(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('read')
  const [busy, setBusy] = useState(false)
  const [newKey, setNewKey] = useState(null)
  const canCreate = usePermissionStore(s => s.can('settings', 'create'))
  const canDelete = usePermissionStore(s => s.can('settings', 'delete'))

  const load = async () => {
    const { data } = await supabase.from('api_keys').select('id, name, key_prefix, role, is_active, last_used_at').order('created_at')
    setKeys(data || [])
  }
  useEffect(() => { load() }, [])

  const createKey = async () => {
    if (!name.trim()) { toast('יש להזין שם למפתח', 'err'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_api_key', { p_name: name.trim(), p_role: role })
    setBusy(false)
    if (error) { toast('יצירת המפתח נכשלה: ' + error.message, 'err'); return }
    const row = Array.isArray(data) ? data[0] : data
    setNewKey(row?.plaintext_key || null)
    setName(''); load()
  }
  const toggle = async (k) => {
    const is_active = !k.is_active
    setKeys(ks => ks.map(x => x.id === k.id ? { ...x, is_active } : x))
    const { error } = await supabase.from('api_keys').update({ is_active }).eq('id', k.id)
    if (error) { toast('העדכון נכשל', 'err'); load(); return }
    toast('נשמר')
  }
  const delKey = async (id) => {
    if (!await deleteConfirmDialog('למחוק מפתח API? כל שימוש עתידי בו יידחה.')) return
    const { error } = await supabase.from('api_keys').delete().eq('id', id)
    if (error) { toast('המחיקה נכשלה: ' + error.message, 'err'); return }
    toast('נמחק'); load()
  }

  if (!keys) return <div className="empty"><span className="spinner" /></div>

  return (
    <div>
      {canCreate && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 'var(--rs)', padding: 12, marginBottom: 14 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" style={{ maxWidth: 220 }} placeholder="שם המפתח (לדוגמה: n8n / אתר)" value={name} onChange={e => setName(e.target.value)} />
            <select className="input" style={{ maxWidth: 140 }} value={role} onChange={e => setRole(e.target.value)}>
              <option value="read">קריאה בלבד</option>
              <option value="write">קריאה וכתיבה</option>
              <option value="internal">פנימי</option>
            </select>
            <button className="btn sm" disabled={busy || !name.trim()} onClick={createKey}>
              {busy ? <span className="spinner light" style={{ width: 14, height: 14 }} /> : <><Icon name="plus" size={14} /> הפקת מפתח</>}
            </button>
          </div>
          {newKey && (
            <div className="small" style={{ marginTop: 10, wordBreak: 'break-all', color: 'var(--ok)' }}>
              המפתח החדש (העתיקו עכשיו - לא יוצג שוב): <b dir="ltr">{newKey}</b>
            </div>
          )}
        </div>
      )}
      {keys.length === 0 ? <div className="empty small">אין מפתחות API</div> : (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>שם</th><th>קידומת</th><th>תפקיד</th><th>שימוש אחרון</th><th>סטטוס</th>{canDelete && <th></th>}</tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id}>
                  <td style={{ fontWeight: 600 }}>{k.name}</td>
                  <td className="small" dir="ltr">{k.key_prefix}…</td>
                  <td>{k.role}</td>
                  <td className="small">{k.last_used_at ? formatDateTime(k.last_used_at) : 'מעולם לא נעשה בו שימוש'}</td>
                  <td><button className={`badge ${k.is_active ? 'ok' : 'gray'}`} style={{ border: 'none', cursor: 'pointer' }} onClick={() => toggle(k)}>{k.is_active ? 'פעיל' : 'לא פעיל'}</button></td>
                  {canDelete && <td><button className="btn subtle sm" style={{ color: 'var(--err)', padding: '2px 6px' }} onClick={() => delKey(k.id)}><Icon name="x" size={12} /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="muted small" style={{ marginTop: 10 }}>
        <Icon name="help" size={13} /> גיבוי/שחזור ידני דורש פונקציית שרת (Edge Function) שעדיין לא קיימת - לא זמין כאן.
      </div>
    </div>
  )
}

// ============================================================
// דוקומנטציה API — self-generating docs for the real /api-v1/{object}
// contract (supabase/functions/api-v1/index.ts's SCHEMA, exact field lists).
// ============================================================
const API_SCHEMA = {
  customers: { fields: ['first_name', 'last_name', 'mobile_phone', 'email', 'business_unit', 'lead_source', 'campaign', 'status', 'notes', 'lead_rating', 'club_member', 'club_joined_at', 'credit_balance', 'extreme_experience_level', 'preferred_language', 'company', 'job_title', 'work_email', 'owner_id', 'custom', 'execution_url'] },
  sales: { fields: ['customer_id', 'business_unit', 'stage', 'channel', 'lead_source', 'campaign', 'owner_id', 'loss_reason', 'journey_id', 'participants_count', 'expected_value', 'currency', 'qualification_rating', 'qualification_summary', 'next_call_at', 'interest_area', 'custom', 'execution_url'] },
  journeys: { fields: ['name', 'business_unit', 'destination', 'departure_date', 'return_date', 'seats_total', 'min_seats', 'status', 'price_per_person', 'currency', 'includes_flights', 'short_description', 'page_url', 'operations_notes', 'custom', 'execution_url'] },
  registrations: { fields: ['customer_id', 'journey_id', 'sale_id', 'status', 'amount_paid', 'currency', 'last_payment_date', 'payment_method', 'invoice_number', 'passport_valid', 'travel_insurance', 'medical_dietary_notes', 'emergency_contact', 'includes_flight_for_participant', 'custom', 'execution_url'] },
  tasks: { fields: ['subject', 'related_type', 'related_id', 'assignee_id', 'due_at', 'status', 'priority', 'description', 'business_unit', 'execution_url'] },
  contacts: { fields: ['customer_id', 'name', 'phone', 'email', 'role', 'execution_url'] },
}

function ApiDocsTab() {
  const [resource, setResource] = useState('customers')
  const FUNCTIONS = (import.meta.env.VITE_SUPABASE_URL || '').replace('.supabase.co', '.functions.supabase.co')
  const url = `${FUNCTIONS}/api-v1`
  const meta = API_SCHEMA[resource]

  const curlList = `curl "${url}/${resource}?limit=20" \\\n  -H "Authorization: Bearer <API-KEY>"`
  const curlGet = `curl "${url}/${resource}/<id>" \\\n  -H "Authorization: Bearer <API-KEY>"`
  const curlCreate = `curl -X POST "${url}/${resource}" \\\n  -H "Authorization: Bearer <API-KEY>" -H "content-type: application/json" \\\n  -d '{"${meta.fields[0]}": "..."}'`
  const curlPatch = `curl -X PATCH "${url}/${resource}/<id>" \\\n  -H "Authorization: Bearer <API-KEY>" -H "content-type: application/json" \\\n  -d '{"${meta.fields[0]}": "..."}'`
  const curlDelete = `curl -X DELETE "${url}/${resource}/<id>" \\\n  -H "Authorization: Bearer <API-KEY>"`

  return (
    <div className="card" style={{ maxWidth: 1000 }}>
      <div className="card-title"><Icon name="book" /> דוקומנטציית API · /api-v1</div>
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 'var(--rs)', padding: 12, marginBottom: 14 }}>
        <div className="small" style={{ lineHeight: 2 }}>
          <b>Base URL:</b> <code dir="ltr">{url}/{'{object}'}</code><br />
          <b>אימות:</b> כותרת <code dir="ltr">Authorization: Bearer &lt;API-KEY&gt;</code> (הפיקו מפתח בלשונית "מפתחות API").<br />
          <b>מתודות:</b> GET (רשימה, עם <code>?limit=</code>/<code>?offset=</code>/<code>?sort=</code> ופילטרים לפי כל שדה) · GET/<code dir="ltr">{'{id}'}</code> · POST · PATCH/<code dir="ltr">{'{id}'}</code> · DELETE/<code dir="ltr">{'{id}'}</code> (מחיקה רכה בלבד).<br />
          <b>מבנה תשובה:</b> <code dir="ltr">{'{ "data": … }'}</code>, רשימה גם עם <code dir="ltr">count</code> · שגיאה: <code dir="ltr">{'{ "error" }'}</code>.
        </div>
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
        {Object.keys(API_SCHEMA).map(r => (
          <button key={r} className={`chip ${resource === r ? 'active' : ''}`} onClick={() => setResource(r)}>{r}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[['רשימה', curlList], ['רשומה בודדת', curlGet], ['יצירה', curlCreate], ['עדכון', curlPatch], ['מחיקה (רכה)', curlDelete]].map(([label, ex]) => (
          <div key={label}>
            <div className="small muted" style={{ marginBottom: 4, fontWeight: 700 }}>{label}:</div>
            <pre dir="ltr" style={{ background: 'var(--surface-2)', padding: 10, borderRadius: 8, fontSize: '0.72rem', overflowX: 'auto', margin: 0 }}>{ex}</pre>
          </div>
        ))}
      </div>

      <div className="card-title" style={{ marginTop: 20 }}><Icon name="tag" /> שדות ניתנים לכתיבה - {resource}</div>
      <div className="table-wrap">
        <table className="grid" style={{ fontSize: '0.82rem' }}>
          <thead><tr><th>שדה</th></tr></thead>
          <tbody>{meta.fields.map(f => <tr key={f}><td><code dir="ltr">{f}</code></td></tr>)}</tbody>
        </table>
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>שדות שנוצרים אוטומטית (קריאה בלבד): <code dir="ltr">id, created_at, updated_at, deleted_at, created_by, updated_by</code></div>
    </div>
  )
}

// ============================================================
// שדות מותאמים ורשימות — admin definition UI for custom_fields (per-object
// custom field definitions) + picklists (editable option lists). Rendering
// these on record detail pages from each row's `custom` jsonb column is a
// second step, not built here — see the final report.
// ============================================================
const CF_OBJECTS = [['customer', 'לקוח'], ['sale', 'מכירה'], ['journey', 'מסע'], ['registration', 'הרשמה'], ['task', 'משימה'], ['meeting', 'פגישה'], ['phone_call', 'שיחת טלפון'], ['contact', 'איש קשר']]
const CF_TYPES = [['text', 'טקסט'], ['number', 'מספר'], ['date', 'תאריך'], ['select', 'בחירה'], ['checkbox', 'כן/לא']]

function SchemaTab() {
  const [picklists, setPicklists] = useState([])
  const [fields, setFields] = useState([])
  const [obj, setObj] = useState('customer')
  const [nf, setNf] = useState({ key: '', label: '', type: 'text', options: '' })
  const [npl, setNpl] = useState({ key: '', label: '' })
  const canCreate = usePermissionStore(s => s.can('settings', 'create'))
  const canDelete = usePermissionStore(s => s.can('settings', 'delete'))

  const load = async () => {
    const [{ data: pl }, { data: cf }] = await Promise.all([
      supabase.from('picklists').select('*').order('key'),
      supabase.from('custom_fields').select('*').order('position'),
    ])
    setPicklists(pl || []); setFields(cf || [])
  }
  useEffect(() => { load() }, [])

  const savePicklist = async (id, text) => {
    const { error } = await supabase.from('picklists').update({ options: text.split(',').map(s => s.trim()).filter(Boolean), updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast('השמירה נכשלה', 'err'); return }
    toast('נשמר'); load()
  }
  const addPicklist = async () => {
    if (!npl.key.trim()) return
    const { error } = await supabase.from('picklists').insert({ key: npl.key.trim(), label: npl.label.trim() || npl.key.trim(), options: [] })
    if (error) { toast('היצירה נכשלה: ' + error.message, 'err'); return }
    setNpl({ key: '', label: '' }); load()
  }
  const delPicklist = async (id) => { if (await deleteConfirmDialog('למחוק רשימת בחירה?')) { await supabase.from('picklists').delete().eq('id', id); load() } }

  const addField = async () => {
    if (!nf.key.trim() || !nf.label.trim()) return
    const { error } = await supabase.from('custom_fields').insert({
      object_type: obj, key: nf.key.trim(), label: nf.label.trim(), type: nf.type,
      options: nf.options ? nf.options.split(',').map(s => s.trim()).filter(Boolean) : [],
      position: fields.filter(f => f.object_type === obj).length,
    })
    if (error) { toast('היצירה נכשלה: ' + error.message, 'err'); return }
    setNf({ key: '', label: '', type: 'text', options: '' }); load()
  }
  const delField = async (id) => { if (await deleteConfirmDialog('למחוק שדה?')) { await supabase.from('custom_fields').delete().eq('id', id); load() } }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
      <div className="card">
        <div className="card-title"><Icon name="tag" /> שדות מותאמים</div>
        {canCreate && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)', borderRadius: 'var(--rs)', padding: 12, marginBottom: 12 }}>
            <div className="field" style={{ margin: 0 }}><label>אובייקט</label><select value={obj} onChange={e => setObj(e.target.value)}>{CF_OBJECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <input className="input" placeholder="מפתח (אנגלית)" dir="ltr" value={nf.key} onChange={e => setNf(f => ({ ...f, key: e.target.value }))} />
              <input className="input" placeholder="תווית" value={nf.label} onChange={e => setNf(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <select className="input" value={nf.type} onChange={e => setNf(f => ({ ...f, type: e.target.value }))}>{CF_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              {nf.type === 'select' && <input className="input" placeholder="אפשרויות, מופרד בפסיק" value={nf.options} onChange={e => setNf(f => ({ ...f, options: e.target.value }))} />}
            </div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={addField}><Icon name="plus" size={14} /> הוסף שדה</button>
          </div>
        )}
        {CF_OBJECTS.map(([v, l]) => {
          const fs = fields.filter(f => f.object_type === v)
          if (!fs.length) return null
          return <div key={v} style={{ marginBottom: 8 }}><div className="small muted" style={{ fontWeight: 700 }}>{l}</div>
            {fs.map(f => <div key={f.id} className="row small" style={{ padding: '5px 8px', background: 'var(--surface-2)', borderRadius: 8, marginTop: 4 }}><b>{f.label}</b><span className="muted" dir="ltr">{f.key} · {f.type}</span><div className="spacer" />{canDelete && <button className="btn subtle sm" style={{ color: 'var(--err)', padding: '2px 6px' }} onClick={() => delField(f.id)}><Icon name="x" size={11} /></button>}</div>)}
          </div>
        })}
        {!fields.length && <div className="empty small">אין עדיין שדות מותאמים</div>}
      </div>

      <div className="card">
        <div className="card-title"><Icon name="filter" /> רשימות בחירה (דרופדאונים)</div>
        {canCreate && (
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <input className="input" placeholder="מפתח" dir="ltr" value={npl.key} onChange={e => setNpl(p => ({ ...p, key: e.target.value }))} />
            <input className="input" placeholder="תווית" value={npl.label} onChange={e => setNpl(p => ({ ...p, label: e.target.value }))} />
            <button className="btn sm" onClick={addPicklist}><Icon name="plus" size={14} /></button>
          </div>
        )}
        {picklists.map(pl => (
          <div key={pl.id} className="field">
            <label>{pl.label || pl.key}{canDelete && <button className="btn subtle sm" style={{ color: 'var(--err)', padding: '1px 6px', marginInlineStart: 8 }} onClick={() => delPicklist(pl.id)}><Icon name="x" size={11} /></button>}</label>
            <textarea defaultValue={(pl.options || []).join(', ')} onBlur={e => savePicklist(pl.id, e.target.value)} style={{ minHeight: 50 }} />
          </div>
        ))}
        {!picklists.length && <div className="empty small">אין עדיין רשימות בחירה</div>}
        <div className="muted small">מופרד בפסיק. נשמר אוטומטית ביציאה מהשדה.</div>
      </div>
    </div>
  )
}

// ============================================================
// מיזוג כפילויות — groups customers by phone (TRAX) / work_email (Xcon),
// NEVER across business units. Merge reassigns sales/registrations/
// contacts/notes/tasks/meetings/phone_calls that reference the loser to the
// winner, then soft-deletes the loser (matches every other delete path in
// this app - see data/001_init_schema.sql / RecordLayout.jsx).
// ============================================================
const digits = (s) => (s || '').replace(/\D/g, '')

function DuplicatesTab() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  const scan = async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('id, first_name, last_name, mobile_phone, work_email, business_unit, created_at').is('deleted_at', null)
    const byKey = {}
    for (const c of data || []) {
      // Identity key never crosses business_unit — TRAX matches on phone,
      // Xcon on work email, exactly like the rest of the app's dedup rule.
      const key = c.business_unit === 'Xcon'
        ? (c.work_email && `${c.business_unit}|e:${c.work_email.trim().toLowerCase()}`)
        : (digits(c.mobile_phone) && `${c.business_unit}|p:${digits(c.mobile_phone)}`)
      if (key) (byKey[key] ||= []).push(c)
    }
    const gs = Object.values(byKey).filter(arr => arr.length > 1)
      .map(arr => arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)))
    setGroups(gs); setLoading(false)
  }
  useEffect(() => { scan() }, [])

  const merge = async (group) => {
    if (!await confirmDialog(`למזג ${group.length} לקוחות? הראשון (הוותיק ביותר) יישאר, כל שאר הרשומות המקושרות יעברו אליו והשאר יימחקו (מחיקה רכה).`, { danger: true, confirmText: 'מיזוג' })) return
    setBusy(group[0].id)
    const primary = group[0].id
    const dupes = group.slice(1).map(x => x.id)
    for (const tbl of ['sales', 'registrations', 'contacts']) {
      await supabase.from(tbl).update({ customer_id: primary }).in('customer_id', dupes)
    }
    for (const tbl of ['notes', 'tasks', 'meetings', 'phone_calls']) {
      await supabase.from(tbl).update({ related_id: primary }).eq('related_type', 'customer').in('related_id', dupes)
    }
    const { error } = await supabase.from('customers').update({ deleted_at: new Date().toISOString() }).in('id', dupes)
    setBusy(null)
    if (error) { toast('המיזוג נכשל: ' + error.message, 'err'); return }
    toast('המיזוג הושלם'); scan()
  }

  if (loading) return <div className="empty"><span className="spinner" /></div>

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ border: 'none', margin: 0 }}><Icon name="users" /> כפילויות ({groups.length})</div>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={scan}>סריקה מחדש</button>
      </div>
      <div className="muted small" style={{ marginBottom: 12 }}>
        זיהוי כפילות: אותו טלפון בלקוחות TRAX, אותו מייל עבודה בלקוחות Xcon. אף פעם לא בין שתי היחידות.
      </div>
      {groups.length === 0 ? <div className="card"><div className="empty">לא נמצאו כפילויות. המאגר נקי.</div></div>
        : groups.map((g, i) => (
          <div key={i} className="card" style={{ marginBottom: 12 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <b>{g.length} רשומות זהות · {g[0].business_unit}</b><div className="spacer" />
              <button className="btn sm" disabled={busy === g[0].id} onClick={() => merge(g)}>{busy === g[0].id ? <span className="spinner light" style={{ width: 14, height: 14 }} /> : 'מזג'}</button>
            </div>
            {g.map((c, j) => (
              <div key={c.id} className="row small" style={{ padding: '6px 8px', borderRadius: 8, background: j === 0 ? 'var(--xlp)' : 'var(--surface-2)', marginBottom: 4 }}>
                {j === 0 && <span className="badge mp" style={{ fontSize: '0.62rem' }}>ראשי</span>}
                <b>{c.first_name} {c.last_name}</b>
                <span className="muted"><PhoneDisplay value={c.mobile_phone} /></span>
                <span className="muted" dir="ltr">{c.work_email}</span>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}

// ============================================================
// משתמשים — list app_users with their role + active toggle, plus an
// "invite user" modal calling the deployed `invite-user` Edge Function
// (supabase/functions/invite-user) with the CALLER's own session JWT
// (supabase.functions.invoke sends it automatically) — the function itself
// checks the caller has permissions('users','create') before doing anything.
// ============================================================
// Small inline "i" with hover tooltip — used on column headers whose label
// alone doesn't tell the whole story (e.g. which field actually drives RBAC).
// The bubble renders in a PORTAL with fixed coords: an absolutely-positioned
// tooltip inside a th gets clipped/covered by neighbouring table layers
// (reported: "the tooltip is hidden underneath another element").
function InfoHint({ text }) {
  const [pos, setPos] = useState(null)
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    // ~90px above the icon is the bubble's rough height; flip below if not enough headroom.
    const below = r.top < 100
    setPos({
      below,
      top: below ? r.bottom + 8 : r.top - 8,
      left: r.left + r.width / 2,
    })
  }
  return (
    <>
      <span className="info-hint" tabIndex={0} aria-label={text}
        onMouseEnter={show} onFocus={show}
        onMouseLeave={() => setPos(null)} onBlur={() => setPos(null)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><circle cx="12" cy="8" r="0.5" fill="currentColor" /></svg>
      </span>
      {pos && createPortal(
        <span className={`info-hint__bubble${pos.below ? ' below' : ''}`} dir="rtl"
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: pos.below ? 'translate(50%, 0)' : 'translate(50%, -100%)' }}>
          {text}
        </span>,
        document.body
      )}
    </>
  )
}

function UsersTab() {
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [editing, setEditing] = useState(null)
  const [emails, setEmails] = useState({})
  const canEdit = usePermissionStore(s => s.can('users', 'edit'))

  const load = async () => {
    const [{ data: u }, { data: r }] = await Promise.all([
      supabase.from('app_users').select('id, full_name, is_active, avatar_url, phone, notes, department, permission_profile, roles(id,key,label)').order('full_name'),
      supabase.from('roles').select('id, key, label').order('label'),
    ])
    setUsers(u || []); setRoles(r || [])
    // Emails live in auth.users, not app_users — fetched via the
    // update-user Edge Function's list_emails action (service role only).
    const { data, error } = await supabase.functions.invoke('update-user', { body: { action: 'list_emails' } })
    if (!error && data?.emails) setEmails(data.emails)
  }
  useEffect(() => { load() }, [])

  const toggleActive = async (u) => {
    const is_active = !u.is_active
    setUsers(us => us.map(x => x.id === u.id ? { ...x, is_active } : x))
    const { error } = await supabase.from('app_users').update({ is_active }).eq('id', u.id)
    if (error) { toast('העדכון נכשל', 'err'); setUsers(us => us.map(x => x.id === u.id ? { ...x, is_active: !is_active } : x)); return }
    toast('נשמר')
  }

  const changeRole = async (u, roleId) => {
    setUsers(us => us.map(x => x.id === u.id ? { ...x, roles: roles.find(r => r.id === roleId) } : x))
    const { error } = await supabase.from('app_users').update({ role_id: roleId }).eq('id', u.id)
    if (error) { toast('העדכון נכשל', 'err'); load(); return }
    toast('נשמר')
  }

  const changeField = async (u, field, value) => {
    setUsers(us => us.map(x => x.id === u.id ? { ...x, [field]: value } : x))
    const { error } = await supabase.from('app_users').update({ [field]: value }).eq('id', u.id)
    if (error) { toast('העדכון נכשל', 'err'); load(); return }
    toast('נשמר')
  }

  if (!users) return <div className="empty"><span className="spinner" /></div>

  return (
    <div>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn sm" onClick={() => setShowInvite(true)}><Icon name="user-plus" size={15} /> משתמש חדש</button>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>משתמש</th><th>אימייל</th><th>תפקיד</th><th>מחלקה</th><th>הרשאה<InfoHint text="השדה הזה בלבד הוא זה שמשפיע על ההרשאות בפועל (המטריצה בטאב ״תפקידים והרשאות״). ״תפקיד״ הוא תווית לתצוגה בלבד." /></th><th>פעיל</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><UserAvatar user={u} showName size="sm" /></td>
                <td className="small muted" dir="ltr">{emails[u.id] || '-'}</td>
                <td>
                  <select className="input" style={{ minWidth: 130 }} value={u.permission_profile || ''} onChange={e => changeField(u, 'permission_profile', e.target.value || null)}>
                    <option value="">-</option>
                    {PERMISSION_PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </td>
                <td>
                  <select className="input" style={{ minWidth: 130 }} value={u.department || ''} onChange={e => changeField(u, 'department', e.target.value || null)}>
                    <option value="">-</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td>
                  <select className="input" style={{ maxWidth: 160 }} value={u.roles?.id || ''} onChange={e => changeRole(u, e.target.value)}>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </td>
                <td><Switch checked={u.is_active} onCheckedChange={() => toggleActive(u)} /></td>
                {canEdit && <td><button className="btn subtle sm" onClick={() => setEditing(u)}><Icon name="edit" size={13} /> עריכה</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        "תפקיד" הוא תווית פשוטה (מנהל מערכת / מנהל צוות / נציג) שנקבעת ביצירת המשתמש. "הרשאה"
        (מסומן ב-i) הוא השדה היחיד שנאכף בפועל בהרשאות (טאב "תפקידים והרשאות" למטה). שינוי התפקיד כאן
        לא משנה את ההרשאה אוטומטית, לכך יש לבחור הרשאה בנפרד.
      </p>
      {showInvite && <InviteUserModal roles={roles} onClose={() => setShowInvite(false)} onInvited={() => { setShowInvite(false); load() }} />}
      {editing && (
        <UserEditModal
          user={editing}
          email={emails[editing.id] || ''}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ============================================================
// User edit view — avatar, phone, email, and a free-text notes field
// (app_users.notes, data/010_app_users_notes.sql). Avatar reuses
// AvatarUpload (writes directly to app_users.avatar_url, same as
// elsewhere in the app); phone/email/notes/full_name are saved together
// through the update-user Edge Function (email lives in auth.users, so it
// can only be changed with the service role — not directly from the
// client, and not for another user without a permission check).
// ============================================================
function UserEditModal({ user, email: initialEmail, onClose, onSaved }) {
  const [fullName, setFullName] = useState(user.full_name || '')
  const [phone, setPhone] = useState(user.phone || '')
  const [email, setEmail] = useState(initialEmail || '')
  const [notes, setNotes] = useState(user.notes || '')
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url || null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!fullName.trim()) { toast('שם מלא הוא שדה חובה', 'err'); return }
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('update-user', {
      body: { action: 'update', user_id: user.id, full_name: fullName.trim(), phone, notes, email: email.trim() || undefined },
    })
    setBusy(false)
    if (error || data?.error) { toast('השמירה נכשלה: ' + (data?.error || error?.message || 'שגיאה לא ידועה'), 'err'); return }
    toast('נשמר')
    onSaved?.()
  }

  return (
    <Modal title={`עריכת משתמש - ${user.full_name}`} icon="users" onClose={onClose} maxWidth={480}>
      <div style={{ marginBottom: 16 }}>
        <AvatarUpload user={{ ...user, avatar_url: avatarUrl }} onChange={setAvatarUrl} />
      </div>
      <div className="field-grid">
        <div className="field"><label>שם מלא<span className="req"> *</span></label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div className="field"><label>אימייל</label>
          <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="field"><label>טלפון</label>
          <PhoneInput value={phone} onChange={setPhone} />
        </div>
      </div>
      <div className="field" style={{ marginTop: 4 }}>
        <label>הערות</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ minHeight: 80 }} placeholder="הערות פנימיות על המשתמש..." />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={busy} onClick={save}>
          {busy ? <span className="spinner light" style={{ width: 15, height: 15 }} /> : 'שמירה'}
        </button>
        <button className="btn subtle" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  )
}

function InviteUserModal({ roles, onClose, onInvited }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [profile, setProfile] = useState(PERMISSION_PROFILES[2]) // נציג
  const [department, setDepartment] = useState(DEPARTMENTS[1]) // מכירות
  const [busy, setBusy] = useState(false)
  const [createdPassword, setCreatedPassword] = useState(null)

  // Avatar: pick -> crop -> hold the cropped blob until the user actually
  // exists (the invite-user Edge Function creates the auth user + app_users
  // row), then upload to the shared `attachments` bucket and set avatar_url —
  // same storage layout as AvatarUpload.jsx (avatars/{user.id}/{ts}.jpg).
  const [avatarSrc, setAvatarSrc] = useState(null)   // object URL being cropped
  const [avatarBlob, setAvatarBlob] = useState(null) // cropped result, ready to upload
  const [avatarPreview, setAvatarPreview] = useState(null)
  const fileRef = useRef(null)

  const roleKey = ROLE_KEY_FOR_PROFILE[profile]
  const missing = !email.trim() || !fullName.trim() || !roleKey || !department

  const pickAvatar = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('יש לבחור קובץ תמונה', 'err'); return }
    if (file.size > 4 * 1024 * 1024) { toast('התמונה גדולה מדי (מקסימום 4MB)', 'err'); return }
    setAvatarSrc(URL.createObjectURL(file))
  }
  const closeCrop = () => { if (avatarSrc) URL.revokeObjectURL(avatarSrc); setAvatarSrc(null) }
  const onCropped = (blob) => {
    setAvatarBlob(blob)
    setAvatarPreview(URL.createObjectURL(blob))
    closeCrop()
  }

  const invite = async () => {
    if (missing) return
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: email.trim(), full_name: fullName.trim(), role_key: roleKey, department, permission_profile: profile, password: password.trim() || undefined },
    })
    if (error || data?.error) {
      setBusy(false)
      toast('היצירה נכשלה: ' + (data?.error || error?.message || 'שגיאה לא ידועה'), 'err')
      return
    }
    const userId = data.user_id
    if (avatarBlob && userId) {
      const path = `avatars/${userId}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, avatarBlob, { contentType: 'image/jpeg' })
      if (!upErr) {
        const url = supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
        await supabase.from('app_users').update({ avatar_url: url }).eq('id', userId)
      } else {
        toast('המשתמש נוצר, אך העלאת התמונה נכשלה: ' + upErr.message, 'err')
      }
    }
    setBusy(false)
    // No invite email is sent — the admin hands over the password directly.
    setCreatedPassword(data.password)
    toast('המשתמש נוצר בהצלחה')
    onInvited?.()
  }

  return (
    <Modal title="משתמש חדש" icon="user-plus" onClose={onClose} maxWidth={460}>
      <div className="row" style={{ gap: 14, alignItems: 'center', marginBottom: 14 }}>
        <div className="avatar-fallback" style={{
          width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
          background: 'hsl(270 62% 88%)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, color: 'hsl(270 70% 28%)', fontSize: '1.1rem',
        }}>
          {avatarPreview ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (fullName.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '?')}
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickAvatar} />
          <button type="button" className="btn subtle sm" onClick={() => fileRef.current?.click()}>
            {avatarPreview ? 'החלפת תמונה' : 'העלאת תמונת פרופיל'}
          </button>
          <div className="muted small" style={{ marginTop: 4 }}>אופציונלי, ניתן להוסיף מאוחר יותר</div>
        </div>
      </div>

      <div className="field-grid">
        <div className="field"><label>שם מלא<span className="req"> *</span></label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div className="field"><label>אימייל<span className="req"> *</span></label>
          <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="field"><label>סיסמה</label>
          <input type="text" dir="ltr" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="ריק = המערכת תייצר סיסמה חזקה" />
        </div>
        <div className="field"><label>תפקיד<span className="req"> *</span></label>
          <select value={profile} onChange={e => setProfile(e.target.value)}>
            {PERMISSION_PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field"><label>מחלקה<span className="req"> *</span></label>
          <select value={department} onChange={e => setDepartment(e.target.value)}>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 2 }}>
        "תפקיד" קובע את סט ההרשאות ההתחלתי (תפקיד ה-RBAC: {roleKey}). ניתן לכוונן אותו לאחר מכן
        בטאב "תפקידים והרשאות" למטה.
      </p>

      <div className="row" style={{ marginTop: 10 }}>
        {createdPassword ? (
          <div style={{ flex: 1 }}>
            <p className="small" style={{ margin: '0 0 4px' }}>המשתמש נוצר. סיסמתו (העבר אליו ידנית):</p>
            <code className="small" style={{ background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 4, userSelect: 'all' }}>{createdPassword}</code>
          </div>
        ) : (
          <>
            <button className="btn" disabled={busy || missing} onClick={invite}>
              {busy ? <span className="spinner light" style={{ width: 15, height: 15 }} /> : 'יצירת משתמש'}
            </button>
            <button className="btn subtle" onClick={onClose}>ביטול</button>
          </>
        )}
      </div>

      {avatarSrc && <ImageCropDialog open src={avatarSrc} busy={false} onClose={closeCrop} onCropped={onCropped} />}
    </Modal>
  )
}

// ============================================================
// תפקידים והרשאות — genuinely editable matrix (was read-only), now
// redesigned to show ONE role at a time: a dropdown at the top selects
// the role, and only that role's resource-permission rows are shown/
// editable below it. Data model (roles/permissions tables) is unchanged —
// this is a UI reorganization only, the previous "all roles stacked at
// once" layout was confusing with more than a couple of roles.
// TRAX's model is role-only (app_users.role_id is a single FK — no per-user
// scope/scope_key split like bina-crm has), and the permissions table only
// has can_view/can_create/can_edit/can_delete/scope (no can_export/
// can_manage/record_scope columns — those would need a new migration and
// aren't added since nothing in TRAX's spec calls for them yet).
// Create/delete a role, and click any cell to toggle it — optimistic
// update + toast, matching every other inline-edit control in the app.
// ============================================================
const RESOURCE_LABELS = Object.fromEntries(RESOURCES.map(r => [r.key, r.label]))
const ACTION_LABELS = [['can_view', 'צפייה'], ['can_create', 'יצירה'], ['can_edit', 'עריכה'], ['can_delete', 'מחיקה']]

function RolesTab() {
  const [roles, setRoles] = useState(null)
  const [permsByRole, setPermsByRole] = useState({})
  const [saving, setSaving] = useState(null)
  const [selectedRoleId, setSelectedRoleId] = useState(null)
  const reload = usePermissionStore(s => s.load)
  const myUserId = usePermissionStore(s => s.userId)

  const load = async () => {
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from('roles').select('id, key, label, description').order('label'),
      supabase.from('permissions').select('*'),
    ])
    setRoles(r || [])
    const byRole = {}
    for (const row of p || []) { (byRole[row.role_id] = byRole[row.role_id] || []).push(row) }
    setPermsByRole(byRole)
    setSelectedRoleId(prev => prev && (r || []).some(x => x.id === prev) ? prev : (r?.[0]?.id ?? null))
  }
  useEffect(() => { load() }, [])

  const addRole = async () => {
    const label = await promptDialog('שם התפקיד החדש:', { placeholder: 'לדוגמה: מנהל מכירות' })
    if (!label) return
    const key = 'role_' + Date.now().toString(36)
    const { data, error } = await supabase.from('roles').insert({ key, label }).select().single()
    if (error) { toast('יצירת התפקיד נכשלה: ' + error.message, 'err'); return }
    toast(`התפקיד "${label}" נוצר. סמנו לו הרשאות.`)
    await load()
    if (data?.id) setSelectedRoleId(data.id)
  }

  const deleteRole = async (role) => {
    const { count } = await supabase.from('app_users').select('id', { count: 'exact', head: true }).eq('role_id', role.id)
    if (count) { toast(`לא ניתן למחוק: ${count} משתמשים משויכים לתפקיד "${role.label}"`, 'err'); return }
    if (!await deleteConfirmDialog(`למחוק את התפקיד "${role.label}" ואת ההרשאות שלו?`)) return
    await supabase.from('permissions').delete().eq('role_id', role.id)
    const { error } = await supabase.from('roles').delete().eq('id', role.id)
    if (error) { toast('המחיקה נכשלה: ' + error.message, 'err'); return }
    toast('התפקיד נמחק'); setSelectedRoleId(null); load()
  }

  const upsertPerm = async (role, resource, patch) => {
    const cellKey = role.id + resource
    setSaving(cellKey)
    const existing = (permsByRole[role.id] || []).find(p => p.resource === resource)
    const base = existing || { role_id: role.id, resource, can_view: false, can_create: false, can_edit: false, can_delete: false, scope: 'mine' }
    const payload = { ...base, ...patch }
    delete payload.id
    const { data, error } = await supabase.from('permissions').upsert(payload, { onConflict: 'role_id,resource' }).select().single()
    setSaving(null)
    if (error) { toast('השמירה נכשלה: ' + error.message, 'err'); return }
    setPermsByRole(m => ({ ...m, [role.id]: [...(m[role.id] || []).filter(p => p.resource !== resource), data] }))
    // If this changed the current user's own role, refresh their live permission
    // set — silently, so it doesn't unmount/remount this very screen (see
    // permissionStore.js's `load` doc comment for what that used to break).
    if (myUserId) reload(myUserId, true)
  }

  if (!roles) return <div className="empty"><span className="spinner" /></div>

  const role = roles.find(r => r.id === selectedRoleId) || null
  const perms = role ? (permsByRole[role.id] || []) : []
  const rowFor = (resource) => perms.find(p => p.resource === resource)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label>תפקיד</label>
          <select value={selectedRoleId || ''} onChange={e => setSelectedRoleId(e.target.value)}>
            {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={addRole}><Icon name="plus" size={14} /> תפקיד חדש</button>
      </div>

      {!roles.length && <div className="empty small">אין עדיין תפקידים</div>}

      {role && (
        <div>
          <div className="row" style={{ alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontWeight: 700 }}>{role.label}</span>
            {role.description && <span className="muted small">{role.description}</span>}
            <div className="spacer" />
            <button className="btn subtle sm" style={{ color: 'var(--err)' }} onClick={() => deleteRole(role)}><Icon name="trash" size={13} /> מחיקת תפקיד</button>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>משאב</th>
                  {ACTION_LABELS.map(([, l]) => <th key={l} style={{ textAlign: 'center' }}>{l}</th>)}
                  <th>היקף</th>
                </tr>
              </thead>
              <tbody>
                {RESOURCES.map(res => {
                  const row = rowFor(res.key)
                  const cellSaving = saving === role.id + res.key
                  return (
                    <tr key={res.key}>
                      <td style={{ fontWeight: 600 }}>{RESOURCE_LABELS[res.key] || res.key}</td>
                      {ACTION_LABELS.map(([key]) => (
                        <td key={key} style={{ textAlign: 'center' }}>
                          {cellSaving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (
                            <input type="checkbox" checked={!!row?.[key]} onChange={e => upsertPerm(role, res.key, { [key]: e.target.checked })} />
                          )}
                        </td>
                      ))}
                      <td>
                        <select className="input" style={{ minWidth: 90 }} value={row?.scope || 'mine'} onChange={e => upsertPerm(role, res.key, { scope: e.target.value })}>
                          <option value="mine">רק שלי</option>
                          <option value="all">הכול</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="muted small">
        בחרו תפקיד מהרשימה למעלה כדי לצפות ולערוך את ההרשאות שלו. לחיצה על כל תא צפייה/יצירה/עריכה/מחיקה משנה
        אותו מיידית. "היקף" קובע אם בעלי התפקיד רואים את כל הרשומות או רק רשומות ששייכות להם. שינוי בתפקיד של
        המשתמש המחובר מתעדכן מיד גם בממשק שלו.
      </p>
    </div>
  )
}
