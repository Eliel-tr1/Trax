import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { toast } from '../components/Toaster'
import EditField from '../components/EditField'
import Icon from '../components/Icon'
import UserAvatar from '../components/UserAvatar'

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
          <EditField label="אימייל" value={user?.email} ltr readOnly readOnlyReason="משמש להתחברות ואינו ניתן לשינוי עצמי" />
          <EditField label="תפקיד" value={rep?.role} readOnly readOnlyReason="נקבע על ידי מנהל המערכת בהגדרות" />
        </div>
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
