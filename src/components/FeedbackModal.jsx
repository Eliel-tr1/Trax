import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { toast } from './Toaster'
import Modal from './Modal'

/* Bug / idea quick-report — the tiny icon Goldi asked for (01.09): users
   click it the moment something breaks or an idea pops, everything lands
   here for later review in Settings. Keeps the WhatsApp noise out. */
export default function FeedbackModal({ kind = 'באג', onClose }) {
  const user = useAuthStore(s => s.user)
  const unit = useBusinessUnitStore(s => s.unit)
  const [content, setContent] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const pickFile = (f) => {
    setFile(f || null)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const submit = async () => {
    if (!content.trim()) return
    setBusy(true)
    try {
      let screenshot_url = null
      if (file) {
        const path = `feedback/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
        const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
        if (!upErr) {
          screenshot_url = supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
        }
      }
      const { error } = await supabase.from('feedback_reports').insert({
        kind, content: content.trim(), screenshot_url,
        created_by: user?.id || null, business_unit: unit,
      })
      if (error) throw error
      toast('נשלח. תודה!')
      onClose()
    } catch (e) {
      toast('השליחה נכשלה: ' + (e.message || e), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={kind === 'באג' ? 'דיווח תקלה' : 'רעיון'} icon={kind === 'באג' ? 'x' : 'sparkles'} onClose={onClose} maxWidth={460}>
      <div style={{ padding: '4px 0' }}>
        <textarea
          className="input" style={{ minHeight: 110, width: '100%' }}
          placeholder={kind === 'באג' ? 'מה קרה? מה ציפית שיקרה?' : 'ספר לנו על הרעיון...'}
          value={content} onChange={e => setContent(e.target.value)} autoFocus />
        {preview && (
          <div style={{ position: 'relative', marginTop: 8 }}>
            <img src={preview} alt="תצוגה מקדימה" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, border: '1px solid var(--border-soft)' }} />
            <button type="button" className="btn subtle sm" style={{ position: 'absolute', top: 4, insetInlineEnd: 4 }}
              onClick={() => pickFile(null)}>הסר</button>
          </div>
        )}
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <button type="button" className="btn subtle sm" onClick={() => fileRef.current?.click()}>
            צירוף צילום מסך
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pickFile(e.target.files?.[0])} />
          <button className="btn" disabled={!content.trim() || busy} onClick={submit}>
            {busy ? 'שולח...' : 'שליחה'}
          </button>
        </div>
      </div>
    </Modal>
  )
}