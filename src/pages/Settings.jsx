import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../components/Toaster'
import { Switch } from '../components/ui/switch'
import EditField from '../components/EditField'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import UserAvatar from '../components/UserAvatar'
import RequirePermission from '../components/RequirePermission'
import TrashManager from '../components/TrashManager'
import { usePermissionStore } from '../stores/permissionStore'

const SECTIONS = ['פרטי מערכת', 'אוטומציות', 'מפתחות API', 'משתמשים', 'תפקידים והרשאות', 'סל מיחזור']

export default function Settings() {
  const [sec, setSec] = useState('פרטי מערכת')
  const canManageUsers = usePermissionStore(s => s.can('users', 'view'))

  const visibleSections = SECTIONS.filter(s => canManageUsers || (s !== 'משתמשים' && s !== 'תפקידים והרשאות'))

  return (
    <div className="card">
      <div className="sections-tabs">{visibleSections.map(s => <div key={s} className={`sec-tab ${sec === s ? 'active' : ''}`} onClick={() => setSec(s)}>{s}</div>)}</div>
      {sec === 'פרטי מערכת' && <SystemSettings />}
      {sec === 'אוטומציות' && <AutomationRules />}
      {sec === 'מפתחות API' && <ApiKeys />}
      {sec === 'משתמשים' && <RequirePermission resource="users"><UsersTab /></RequirePermission>}
      {sec === 'תפקידים והרשאות' && <RequirePermission resource="users"><RolesTab /></RequirePermission>}
      {sec === 'סל מיחזור' && <TrashManager />}
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

// ============================================================
// משתמשים — list app_users with their role + active toggle, plus an
// "invite user" modal calling the deployed `invite-user` Edge Function
// (supabase/functions/invite-user) with the CALLER's own session JWT
// (supabase.functions.invoke sends it automatically) — the function itself
// checks the caller has permissions('users','create') before doing anything.
// ============================================================
function UsersTab() {
  const [users, setUsers] = useState(null)
  const [roles, setRoles] = useState([])
  const [showInvite, setShowInvite] = useState(false)

  const load = async () => {
    const [{ data: u }, { data: r }] = await Promise.all([
      supabase.from('app_users').select('id, full_name, is_active, avatar_url, roles(id,key,label)').order('full_name'),
      supabase.from('roles').select('id, key, label').order('label'),
    ])
    setUsers(u || []); setRoles(r || [])
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

  if (!users) return <div className="empty"><span className="spinner" /></div>

  return (
    <div>
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn sm" onClick={() => setShowInvite(true)}><Icon name="user-plus" size={15} /> הזמנת משתמש</button>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th>משתמש</th><th>תפקיד</th><th>פעיל</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><UserAvatar user={u} showName size="sm" /></td>
                <td>
                  <select className="input" style={{ maxWidth: 200 }} value={u.roles?.id || ''} onChange={e => changeRole(u, e.target.value)}>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </td>
                <td><Switch checked={u.is_active} onCheckedChange={() => toggleActive(u)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showInvite && <InviteUserModal roles={roles} onClose={() => setShowInvite(false)} onInvited={() => { setShowInvite(false); load() }} />}
    </div>
  )
}

function InviteUserModal({ roles, onClose, onInvited }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [roleKey, setRoleKey] = useState(roles.find(r => r.key === 'sales_rep')?.key || roles[0]?.key || '')
  const [busy, setBusy] = useState(false)

  const missing = !email.trim() || !fullName.trim() || !roleKey

  const invite = async () => {
    if (missing) return
    setBusy(true)
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email: email.trim(), full_name: fullName.trim(), role_key: roleKey },
    })
    setBusy(false)
    // supabase-js surfaces a non-2xx Edge Function response as `error`, with
    // the function's own {error} body sometimes reachable via error.context.
    if (error || data?.error) {
      toast('ההזמנה נכשלה: ' + (data?.error || error?.message || 'שגיאה לא ידועה'), 'err')
      return
    }
    toast('הזמנה נשלחה בהצלחה — המשתמש יקבל מייל להגדרת סיסמה')
    onInvited?.()
  }

  return (
    <Modal title="הזמנת משתמש חדש" icon="user-plus" onClose={onClose} maxWidth={440}>
      <div className="field-grid">
        <div className="field"><label>שם מלא<span className="req"> *</span></label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div className="field"><label>אימייל<span className="req"> *</span></label>
          <input type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="field"><label>תפקיד<span className="req"> *</span></label>
          <select value={roleKey} onChange={e => setRoleKey(e.target.value)}>
            {roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" disabled={busy || missing} onClick={invite}>
          {busy ? <span className="spinner light" style={{ width: 15, height: 15 }} /> : 'שליחת הזמנה'}
        </button>
        <button className="btn subtle" onClick={onClose}>ביטול</button>
      </div>
    </Modal>
  )
}

// ============================================================
// תפקידים והרשאות — read-only matrix, roles × resources × view/create/
// edit/delete + scope. Source: `permissions` (data/003_rbac.sql), readable
// by any authenticated user (permissions_select RLS policy).
// ============================================================
const RESOURCE_LABELS = {
  customers: 'לקוחות', sales: 'מכירות', journeys: 'מסעות', registrations: 'הרשמות',
  tasks: 'משימות', contacts: 'אנשי קשר', meetings: 'פגישות', phone_calls: 'שיחות טלפון',
  settings: 'הגדרות', users: 'משתמשים', dashboard: 'לוח בקרה',
}
const ACTION_LABELS = [['can_view', 'צפייה'], ['can_create', 'יצירה'], ['can_edit', 'עריכה'], ['can_delete', 'מחיקה']]

function RolesTab() {
  const [roles, setRoles] = useState(null)
  const [permsByRole, setPermsByRole] = useState({})

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: p }] = await Promise.all([
        supabase.from('roles').select('id, key, label, description').order('label'),
        supabase.from('permissions').select('*'),
      ])
      setRoles(r || [])
      const byRole = {}
      for (const row of p || []) { (byRole[row.role_id] = byRole[row.role_id] || []).push(row) }
      setPermsByRole(byRole)
    })()
  }, [])

  if (!roles) return <div className="empty"><span className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {roles.map(role => {
        const perms = (permsByRole[role.id] || []).sort((a, b) => (RESOURCE_LABELS[a.resource] || a.resource).localeCompare(RESOURCE_LABELS[b.resource] || b.resource, 'he'))
        return (
          <div key={role.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 700 }}>{role.label}</span>
              {role.description && <span className="muted small">{role.description}</span>}
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>משאב</th>
                    {ACTION_LABELS.map(([, l]) => <th key={l}>{l}</th>)}
                    <th>היקף</th>
                  </tr>
                </thead>
                <tbody>
                  {perms.length === 0
                    ? <tr><td colSpan={6} className="empty small">אין הרשאות מוגדרות</td></tr>
                    : perms.map(p => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{RESOURCE_LABELS[p.resource] || p.resource}</td>
                        {ACTION_LABELS.map(([key]) => (
                          <td key={key}>
                            <span className={`badge ${p[key] ? 'ok' : 'gray'}`}>{p[key] ? '✓' : '✗'}</span>
                          </td>
                        ))}
                        <td className="small">{p.scope === 'all' ? 'הכול' : 'רק שלי'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
