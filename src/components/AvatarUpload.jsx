import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { clearOptionsCache } from '../lib/api'
import { Button } from './ui/button'
import UserAvatar from './UserAvatar'
import { toast } from './Toaster'
import { confirmDialog } from './Dialogs'
import ImageCropDialog from './ImageCropDialog'

const MAX_BYTES = 4 * 1024 * 1024

/* Ported from bina-crm's AvatarUpload.jsx, adapted to TRAX's schema
   (app_users.avatar_url, not users.avatar_url) and storage layout — TRAX
   has no dedicated `avatars` bucket (only the public `attachments` bucket,
   see data/ storage policies: any authenticated user may write anywhere
   under it), so the path is namespaced the same way bina-crm does it:
   avatars/{user.id}/{timestamp}.jpg.

   Profile picture for a user: upload, replace, or fall back to coloured
   initials. Picking a file opens the crop dialog first (ImageCropDialog) so
   the user chooses the square before it's ever uploaded. */
export default function AvatarUpload({ user, size = 'lg', onChange }) {
  const fileRef = useRef()
  const [busy, setBusy] = useState(false)
  const [src, setSrc] = useState(null) // object URL of the image being cropped

  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])

  const pick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('יש לבחור קובץ תמונה', 'err'); return }
    if (file.size > MAX_BYTES) { toast('התמונה גדולה מדי (מקסימום 4MB)', 'err'); return }
    setSrc(URL.createObjectURL(file))
    if (fileRef.current) fileRef.current.value = ''
  }

  const closeCrop = () => {
    if (src) URL.revokeObjectURL(src)
    setSrc(null)
  }

  const saveCropped = async (blob) => {
    setBusy(true)
    try {
      // Always .jpg: the cropper re-encodes to a fixed-size JPEG regardless of
      // what was uploaded, so the extension must match the actual content.
      const path = `avatars/${user.id}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from('attachments')
        .upload(path, blob, { contentType: 'image/jpeg' })
      if (upErr) throw new Error(upErr.message)
      const url = supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
      const { error } = await supabase.from('app_users').update({ avatar_url: url }).eq('id', user.id)
      if (error) throw new Error(error.message)
      clearOptionsCache()
      onChange?.(url)
      toast('תמונת הפרופיל עודכנה')
      closeCrop()
    } catch (err) {
      toast(`העלאת התמונה נכשלה: ${err.message || ''}`, 'err')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!await confirmDialog('להסיר את תמונת הפרופיל? יוצגו ראשי התיבות במקומה.', { danger: true, confirmText: 'הסרה' })) return
    setBusy(true)
    const { error } = await supabase.from('app_users').update({ avatar_url: null }).eq('id', user.id)
    setBusy(false)
    if (error) return toast('ההסרה נכשלה', 'err')
    clearOptionsCache()
    onChange?.(null)
    toast('התמונה הוסרה')
  }

  return (
    <div className="row" style={{ gap: 14, alignItems: 'center' }}>
      <UserAvatar user={user} size={size} />
      <div>
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Camera className="size-4" /> {user?.avatar_url ? 'החלפת תמונה' : 'העלאת תמונת פרופיל'}
          </Button>
          {user?.avatar_url && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={remove}>
              <Trash2 className="size-4" /> הסרה
            </Button>
          )}
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>JPG/PNG/GIF/WEBP, עד 4MB</div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pick} />
      </div>
      {src && (
        <ImageCropDialog open src={src} busy={busy} onClose={closeCrop} onCropped={saveCropped} />
      )}
    </div>
  )
}
