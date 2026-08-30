import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { updateField, loadOptions } from '../lib/api'
import { toast } from '../components/Toaster'
import {
  SALE_STAGES, SALE_CHANNELS, LEAD_SOURCES, LOSS_REASONS, INTEREST_AREAS,
  enumOpts,
} from '../lib/constants'
import RecordLayout from '../components/RecordLayout'
import EditField from '../components/EditField'

const STAGES = SALE_STAGES.map(s => ({ key: s, label: s }))
const STAGE_BADGE = {
  'ליד חדש': 'mp', 'נוצר קשר על ידי AI': 'mp', 'שיחת מכירה עם נציג אנושי': 'warn',
  'הצעה נשלחה': 'warn', 'ממתין להחלטה': 'warn', 'נסגר בהצלחה': 'ok', 'נסגר באי הצלחה': 'gray',
}

export default function SaleDetail() {
  const { id } = useParams()
  const [s, setS] = useState(null)
  const [opts, setOpts] = useState({ users: [] })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [{ data }, o] = await Promise.all([
      supabase.from('sales').select('*, customer:customers(id,first_name,last_name,business_unit)').eq('id', id).single(),
      loadOptions(),
    ])
    setS(data); setOpts(o); setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const save = async (field, value) => { setS(x => ({ ...x, [field]: value })); await updateField('sales', s, field, value) }

  // "Closing as unsuccessful without a reason is not allowed" (domain-model.md)
  // — enforced here in the UI, on top of the DB CHECK constraint.
  const setStage = async (stage) => {
    if (stage === 'נסגר באי הצלחה' && !s.loss_reason) {
      toast('יש לבחור סיבת אי סגירה לפני סגירת העסקה כלא מוצלחת', 'err')
      return
    }
    await save('stage', stage)
  }

  if (loading) return <div className="empty"><span className="spinner" /></div>
  if (!s) return <div className="card"><div className="empty">מכירה לא נמצאה.</div></div>

  const isXcon = s.business_unit === 'Xcon'
  const userOpts = opts.users.map(u => ({ value: u.id, label: u.full_name }))

  return (
    <RecordLayout
      title={s.deal_name || 'עסקה חדשה'}
      subtitle={s.customer ? `${s.customer.first_name} ${s.customer.last_name} · ${s.business_unit}` : s.business_unit}
      backTo="/sales"
      status={{ label: s.stage, badge: STAGE_BADGE[s.stage] || 'gray' }}
      objectType="sale" recordId={id}
      recordType="sale" record={s} onRelatedCreated={() => load()}
      stage={{ stages: STAGES, current: s.stage, onSet: setStage }}
    >
      <div className="card">
        <div className="field-grid">
          <EditField label="לקוח" value={s.customer ? `${s.customer.first_name} ${s.customer.last_name}` : ''} readOnly />
          <EditField label="יחידה עסקית" value={s.business_unit} readOnly />
          <EditField label="שלב מכירה" value={s.stage} type="select" options={enumOpts(SALE_STAGES)} onSave={setStage} />
          <EditField label="ערוץ פנייה" value={s.channel} type="select" options={enumOpts(SALE_CHANNELS)} onSave={v => save('channel', v)} />
          <EditField label="מקור הגעה" value={s.lead_source} type="select" options={enumOpts(LEAD_SOURCES)} onSave={v => save('lead_source', v)} />
          <EditField label="קמפיין" value={s.campaign} onSave={v => save('campaign', v)} />
          <EditField label="בעלים" value={s.owner_id} display={opts.users.find(u => u.id === s.owner_id)?.full_name} type="select" options={userOpts} onSave={v => save('owner_id', v)} />
          <EditField label="סיבת אי סגירה" value={s.loss_reason} type="select" options={enumOpts(LOSS_REASONS)} onSave={v => save('loss_reason', v)} />
          {isXcon && <EditField label="תחום עניין" value={s.interest_area} type="select" options={enumOpts(INTEREST_AREAS)} onSave={v => save('interest_area', v)} />}
        </div>
      </div>
    </RecordLayout>
  )
}
