import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { usePermissionStore } from '../stores/permissionStore'
import { toast } from '../components/Toaster'
import EditField from '../components/EditField'
import Icon from '../components/Icon'
import UserAvatar from '../components/UserAvatar'
import { NAV_GROUPS } from '../components/layout/nav-data'
import { startOnboarding } from '../components/Onboarding'

// ASCII-safe storage key: the `avatars` bucket's RLS policy requires the
// object name's part before the extension to equal auth.uid() exactly
// (split_part(name,'.',1) = auth.uid()), so the uuid itself is the whole
// key — no user-supplied filename ever reaches Storage.
const extFor = (file) => {
  const m = /\.([a-zA-Z0-9]+)$/.exec(file.name)
  const ext = (m?.[1] || 'jpg').toLowerCase()
  return /^(jpg|jpeg|png|gif|webp)$/.test(ext) ? ext : 'jpg'
}

export default function Profile() {
  const user = useAuthStore(s => s.user)
  const rep = useAuthStore(s => s.rep)
  const fetchRep = useAuthStore(s => s.fetchRep)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busyPw, setBusyPw] = useState(false)
  const [busyAvatar, setBusyAvatar] = useState(false)
  const fileRef = useRef(null)

  const saveFullName = async (v) => {
    if (!v || !v.trim()) return
    const { error } = await supabase.from('app_users').update({ full_name: v.trim() }).eq('id', user.id)
    if (error) { toast('העדכון נכשל', 'err'); return }
    await fetchRep(user)
    toast('נשמר')
  }

  const savePhone = async (v) => {
    const { error } = await supabase.from('app_users').update({ phone: v?.trim() || null }).eq('id', user.id)
    if (error) { toast('העדכון נכשל', 'err'); return }
    await fetchRep(user)
    toast('נשמר')
  }

  const uploadAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    if (!file.type.startsWith('image/')) { toast('יש לבחור קובץ תמונה', 'err'); return }
    if (file.size > 3 * 1024 * 1024) { toast('התמונה גדולה מדי (מקסימום 3MB)', 'err'); return }
    setBusyAvatar(true)
    const key = `${user.id}.${extFor(file)}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(key, file, { upsert: true, cacheControl: '3600' })
    if (upErr) { setBusyAvatar(false); toast('העלאת התמונה נכשלה: ' + upErr.message, 'err'); return }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(key)
    // Cache-bust so <img> actually reloads after an upsert to the same key.
    const url = `${pub.publicUrl}?t=${Date.now()}`
    const { error } = await supabase.from('app_users').update({ avatar_url: url }).eq('id', user.id)
    setBusyAvatar(false)
    if (error) { toast('שמירת התמונה נכשלה', 'err'); return }
    await fetchRep(user)
    toast('התמונה עודכנה')
  }

  const changePassword = async () => {
    if (pw1.length < 6) { toast('הסיסמה חייבת להכיל לפחות 6 תווים', 'err'); return }
    if (pw1 !== pw2) { toast('הסיסמאות אינן תואמות', 'err'); return }
    setBusyPw(true)
    const { error } = await supabase.auth.updateUser({ password: pw1 })
    setBusyPw(false)
    if (error) { toast('עדכון הסיסמה נכשל: ' + error.message, 'err'); return }
    setPw1(''); setPw2('')
    toast('הסיסמה עודכנה בהצלחה')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div className="card">
        <div className="card-title"><Icon name="users" /> הפרופיל שלי</div>
        <div className="row" style={{ gap: 14, alignItems: 'center', marginBottom: 16 }}>
          <UserAvatar user={rep} size="lg" />
          <div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadAvatar} />
            <button className="btn subtle sm" disabled={busyAvatar} onClick={() => fileRef.current?.click()}>
              {busyAvatar ? <span className="spinner light" style={{ width: 13, height: 13 }} /> : 'העלאת תמונת פרופיל'}
            </button>
            <div className="muted small" style={{ marginTop: 4 }}>JPG/PNG/GIF/WEBP, עד 3MB</div>
          </div>
        </div>
        <div className="field-grid">
          <EditField label="שם מלא" value={rep?.full_name} onSave={saveFullName} />
          <EditField label="טלפון" value={rep?.phone} ltr onSave={savePhone} />
          <EditField label="אימייל" value={user?.email} ltr readOnly readOnlyReason="משמש להתחברות ואינו ניתן לשינוי עצמי" />
          <EditField label="תפקיד" value={rep?.role} readOnly readOnlyReason="נקבע על ידי מנהל המערכת בהגדרות" />
        </div>
      </div>

      <NavCustomizationCard />

      <div className="card">
        <div className="card-title"><Icon name="help" /> סיור הדרכה</div>
        <p className="muted small" style={{ marginBottom: 10 }}>הסיור רץ אוטומטית בכניסה הראשונה. ניתן להריץ אותו שוב בכל שלב.</p>
        <button className="btn subtle sm" onClick={() => startOnboarding()}><Icon name="help" size={14} /> הפעלת הסיור מחדש</button>
      </div>

      <div className="card">
        <div className="card-title"><Icon name="shield" /> החלפת סיסמה</div>
        <div className="field-grid">
          <div className="ef">
            <span className="ef-label">סיסמה חדשה</span>
            <input className="input" type="password" dir="ltr" value={pw1} onChange={e => setPw1(e.target.value)} placeholder="לפחות 6 תווים" />
          </div>
          <div className="ef">
            <span className="ef-label">אימות סיסמה</span>
            <input className="input" type="password" dir="ltr" value={pw2} onChange={e => setPw2(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" disabled={busyPw || !pw1 || !pw2} onClick={changePassword}>
            {busyPw ? <span className="spinner light" style={{ width: 15, height: 15 }} /> : 'עדכון סיסמה'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Sidebar customization — ported from bina-crm's MySettings.jsx: drag to
// reorder, checkbox to show/hide, applied live (no save button — the
// sidebar is right there, so a change you can't see immediately reads as
// a change that didn't happen). Persisted to app_users.prefs.navOrder /
// .navHidden (data/006 migration), consumed by AppSidebar via
// nav-data.js's orderedGroups().
function NavCustomizationCard() {
  const rep = useAuthStore(s => s.rep)
  const user = useAuthStore(s => s.user)
  const fetchRep = useAuthStore(s => s.fetchRep)
  const can = usePermissionStore(s => s.can)
  // usePermissionStore's `can` function reference never changes (it's a
  // plain closure defined once in the store), so selecting only `can` would
  // never re-render this component once the permission matrix finishes its
  // async load — the effect below would then be seeded from an empty
  // `visible` list (nothing loaded yet) and stay empty forever. Subscribing
  // to `loading` too forces a re-render (and effect re-run) the moment the
  // matrix actually arrives.
  const permLoading = usePermissionStore(s => s.loading)
  const [order, setOrder] = useState([])
  const [hidden, setHidden] = useState(new Set())
  const dragFrom = useRef(null)

  const visible = NAV_GROUPS.flatMap(g => g.items.map(it => ({ ...it, group: g.title })))
    .filter(it => !it.resource || can(it.resource, 'view'))

  useEffect(() => {
    if (permLoading) return
    const savedOrder = rep?.prefs?.navOrder || []
    const savedHidden = rep?.prefs?.navHidden || []
    const keys = visible.map(v => v.path)
    setOrder([...savedOrder.filter(k => keys.includes(k)), ...keys.filter(k => !savedOrder.includes(k))])
    setHidden(new Set(savedHidden))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep?.id, JSON.stringify(rep?.prefs), permLoading])

  const applyNav = async (nextOrder, nextHidden) => {
    setOrder(nextOrder); setHidden(nextHidden)
    const { error } = await supabase.from('app_users').update({
      prefs: { ...(rep?.prefs || {}), navOrder: nextOrder, navHidden: [...nextHidden] },
    }).eq('id', rep.id)
    if (error) { toast('שמירת התפריט נכשלה', 'err'); return }
    await fetchRep(user)
  }

  const move = (from, to) => {
    const a = [...order]; const [x] = a.splice(from, 1); a.splice(to, 0, x)
    applyNav(a, hidden)
  }
  const toggleHidden = (key, show) => {
    const n = new Set(hidden)
    show ? n.delete(key) : n.add(key)
    applyNav(order, n)
  }
  const resetNav = () => applyNav(visible.map(v => v.path), new Set())

  return (
    <div className="card">
      <div className="card-title"><Icon name="menu" /> תפריט הצד</div>
      <p className="muted small" style={{ marginBottom: 10 }}>
        גררו כדי לשנות סדר, והורידו סימון כדי להסתיר. כל שינוי נשמר ומשתקף בתפריט מיד.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {order.map((key, i) => {
          const item = visible.find(v => v.path === key)
          if (!item) return null
          return (
            <div key={key} draggable
              onDragStart={e => { dragFrom.current = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key) }}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragFrom.current != null && dragFrom.current !== i) move(dragFrom.current, i); dragFrom.current = null }}
              className="row" style={{ padding: '7px 8px', borderRadius: 8, cursor: 'grab' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <Icon name="drag" size={14} style={{ color: 'var(--text-3)' }} />
              <input type="checkbox" checked={!hidden.has(key)} onChange={e => toggleHidden(key, e.target.checked)} />
              <span style={{ flex: 1, fontSize: '0.88rem' }}>{item.label}</span>
              {item.group && <span className="muted small">{item.group}</span>}
            </div>
          )
        })}
      </div>
      <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={resetNav}>איפוס לברירת המחדל</button>
    </div>
  )
}
