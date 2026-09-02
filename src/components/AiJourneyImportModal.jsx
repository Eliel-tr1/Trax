import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from './Toaster'
import Modal from './Modal'

/* AI journey import (Goldi 01.09 #2): from the Journeys "+ מסע חדש" flow,
   paste a public journey-page URL from the client's site; the journey-import
   Edge Function reads the page, maps the fields with OpenAI, and checks for
   an existing similar journey. The user then sees ALL fields filled live,
   can edit anything, and chooses "הוספת מסע חדש" or "עדכון מסע קיים". */

const FIELDS = [
  { key: 'name', label: 'שם היציאה', required: true },
  { key: 'destination', label: 'יעד', required: true },
  { key: 'departure_date', label: 'תאריך יציאה', type: 'date', required: true },
  { key: 'return_date', label: 'תאריך חזרה', type: 'date' },
  { key: 'seats_total', label: 'מספר מקומות', type: 'number' },
  { key: 'price_per_person', label: 'מחיר לאדם', type: 'number' },
  { key: 'currency', label: 'מטבע' },
  { key: 'short_description', label: 'תיאור קצר' },
]

export default function AiJourneyImportModal({ defaultUnit = 'TRAX', onClose, onSaved }) {
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fields, setFields] = useState(null)
  const [exists, setExists] = useState(false)
  const [existingId, setExistingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const parse = async () => {
    if (!url.trim()) return
    setFetching(true)
    const { data, error } = await supabase.functions.invoke('journey-import', { body: { url: url.trim() } })
    setFetching(false)
    if (error || data?.error) return toast('הקריאה נכשלה: ' + (data?.error || error?.message || ''), 'err')
    setFields(data.fields || {})
    setExists(!!data.exists)
    setExistingId(data.existing_id || null)
  }

  const save = async (mode) => {
    if (!fields?.name || !fields?.destination || !fields?.departure_date) {
      return toast('שם, יעד ותאריך יציאה הם שדות חובה', 'err')
    }
    setSaving(true)
    const row = {
      business_unit: defaultUnit,
      name: fields.name,
      destination: fields.destination,
      departure_date: fields.departure_date,
      return_date: fields.return_date || null,
      seats_total: fields.seats_total ?? 22,
      price_per_person: fields.price_per_person ?? null,
      currency: fields.currency || 'EUR',
      short_description: fields.short_description || null,
      page_url: url.trim(),
      min_seats: 18,
    }
    let error = null, id = existingId
    if (mode === 'update' && existingId) {
      ({ error } = await supabase.from('journeys').update(row).eq('id', existingId))
    } else {
      const res = await supabase.from('journeys').insert({ ...row, status: 'פתוח להרשמה' }).select('id').single()
      error = res.error; id = res.data?.id
    }
    setSaving(false)
    if (error) return toast('השמירה נכשלה: ' + error.message, 'err')
    toast(mode === 'update' ? 'המסע עודכן' : 'המסע נוצר')
    onSaved(id, mode)
  }

  return (
    <Modal title="יצירת מסע ב-AI מדף האתר" icon="sparkles" onClose={onClose} maxWidth={560}>
      <div className="field">
        <label>קישור לדף המסע באתר<span className="req"> *</span></label>
        <div className="row" style={{ gap: 8 }}>
          <input dir="ltr" style={{ flex: 1 }} placeholder="https://trax-club.com/..." value={url}
            onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && parse()} />
          <button className="btn sm" disabled={!url.trim() || fetching} onClick={parse}>
            {fetching ? <Loader2 size={15} className="spinner-rot" /> : <Sparkles size={15} />} קריאה
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 4 }}>
          המערכת קוראת את הדף, ממפה את הפרטים עם AI, ומציגה אותם כאן לעריכה לפני שמירה.
        </p>
      </div>

      {fetching && <div className="empty"><span className="spinner" /></div>}

      {fields && (
        <>
          {exists && (
            <div className="badge warn" style={{ display: 'block', marginBottom: 10, padding: '8px 10px' }}>
              נמצא מסע קיים דומה במערכת. אפשר לעדכן אותו בנתונים מהאתר, או להוסיף כמסע חדש.
            </div>
          )}
          <div className="field-grid" style={{ marginTop: 8 }}>
            {FIELDS.map(f => (
              <div className="field" key={f.key}>
                <label>{f.label}{f.required && <span className="req"> *</span>}</label>
                <input
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  dir={f.key === 'name' || f.key === 'destination' || f.key === 'short_description' ? 'rtl' : 'ltr'}
                  value={fields[f.key] ?? ''}
                  onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="row" style={{ gap: 8, marginTop: 14 }}>
            <button className="btn" disabled={saving} onClick={() => save('create')}>
              {saving ? 'שומר...' : 'הוספת מסע חדש'}
            </button>
            {exists && (
              <button className="btn" style={{ background: 'var(--mp2)' }} disabled={saving} onClick={() => save('update')}>
                {saving ? 'שומר...' : 'עדכון מסע קיים'}
              </button>
            )}
            <button className="btn subtle" onClick={onClose}>ביטול</button>
          </div>
        </>
      )}
    </Modal>
  )
}