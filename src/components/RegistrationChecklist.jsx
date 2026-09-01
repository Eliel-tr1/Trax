import { useEffect, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from './Toaster'
import Icon from './Icon'

/* Pre-trip checklist — generic over the owning record (Goldi 01.09): used on
   the registration (pre-trip prep for this traveler) and on the journey
   (organizational prep for the departure). Item set comes from the Settings
   checklist templates per scope; items support check-off + file attach. */
export default function Checklist({ ownerTable = 'registrations', ownerId, title, itemsTable }) {
  const table = itemsTable || (ownerTable === 'journeys' ? 'journey_checklist_items' : 'registration_checklist_items')
  const ownerKey = ownerTable === 'journeys' ? 'journey_id' : 'registration_id'
  const [items, setItems] = useState(null)
  const [open, setOpen] = useState(true)
  const [uploading, setUploading] = useState(null) // item id currently uploading

  const load = async () => {
    const { data } = await supabase.from(table)
      .select('*').eq(ownerKey, ownerId).order('position')
    setItems(data || [])
  }
  useEffect(() => { load() }, [ownerId, table])

  if (!items) return null

  const doneCount = items.filter(i => i.done).length

  const toggle = async (item) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, done: !i.done } : i))
    const { error } = await supabase.from('registration_checklist_items')
      .update({ done: !item.done, done_at: !item.done ? new Date().toISOString() : null })
      .eq('id', item.id)
    if (error) { toast('השמירה נכשלה: ' + error.message, 'err'); load() }
  }

  const attach = async (item, file) => {
    if (!file) return
    setUploading(item.id)
    try {
      const path = `checklists/${ownerId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
      await supabase.from('registration_checklist_items').update({ file_url: publicUrl }).eq('id', item.id)
      load()
    } catch (e) {
      toast('העלאת הקובץ נכשלה: ' + (e.message || e), 'err')
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px' }}
        onClick={() => setOpen(o => !o)}>
        <b>צ'קליסט לקראת נסיעה</b>
        <span className="row" style={{ gap: 8 }}>
          <span className={`badge ${doneCount === items.length && items.length ? 'ok' : 'gray'}`}>
            {items.filter(i => i.done).length}/{items.length} הושלמו
          </span>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} />
        </span>
      </div>
      {open && (
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map(item => (
            <div key={item.id} className="row" style={{ gap: 10, padding: '6px 8px', borderRadius: 6, background: item.done ? 'color-mix(in srgb, var(--ok) 8%, transparent)' : 'var(--surface-2)' }}>
              {/* A real checkbox — square with a check when done (Goldi: an X
                  before completion isn't a checkbox). Never renders an ✕. */}
              <input type="checkbox" checked={!!item.done} onChange={() => toggle(item)}
                style={{ width: 18, height: 18, accentColor: 'var(--mp)', cursor: 'pointer' }}
                aria-label={item.label} />
              <span style={{ flex: 1, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--text-3)' : 'var(--text)' }}>
                {item.label}
              </span>
              {item.file_url && (
                <a href={item.file_url} target="_blank" rel="noreferrer" className="small" style={{ color: 'var(--mp)' }}>
                  צפייה בקובץ
                </a>
              )}
              <label style={{ cursor: uploading === item.id ? 'wait' : 'pointer' }} title="צירוף קובץ">
                <Paperclip size={15} className="muted" />
                <input type="file" hidden onChange={e => attach(item, e.target.files?.[0])} />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}