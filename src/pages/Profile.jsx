import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { toast } from '../components/Toaster'
import EditField from '../components/EditField'
import Icon from '../components/Icon'

export default function Profile() {
  const user = useAuthStore(s => s.user)
  const rep = useAuthStore(s => s.rep)
  const fetchRep = useAuthStore(s => s.fetchRep)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [busyPw, setBusyPw] = useState(false)

  const saveFullName = async (v) => {
    if (!v || !v.trim()) return
    const { error } = await supabase.from('app_users').update({ full_name: v.trim() }).eq('id', user.id)
    if (error) { toast('העדכון נכשל', 'err'); return }
    await fetchRep(user)
    toast('נשמר')
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
        <div className="field-grid">
          <EditField label="שם מלא" value={rep?.full_name} onSave={saveFullName} />
          <EditField label="אימייל" value={user?.email} ltr readOnly />
          <EditField label="תפקיד" value={rep?.role} readOnly />
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
