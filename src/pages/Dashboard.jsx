import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { loadOptions } from '../lib/api'
import { SALE_STAGES_CLOSED, CURRENCY_SYMBOLS } from '../lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

/* Both dashboards from docs/domain-model.md's "לוחות בקרה" section — see
   there for the exact 10 metrics and the "never sum across currencies"
   rule. Client-side aggregation is fine at TRAX's current data volume (a
   few dozen rows per table); no server-side widget engine. */

const SECTIONS = ['לוח מכירות', 'לוח מסעות ותפוסה']

function startOfMonthIso() { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString() }
function daysAgoIso(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString() }
function daysFromNowIso(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
function todayIso() { return new Date().toISOString().slice(0, 10) }

const RANGE_PRESETS = [
  { key: '7', label: '7 ימים' },
  { key: '30', label: '30 ימים' },
  { key: '90', label: '90 ימים' },
  { key: 'all', label: 'הכול' },
]
// Cutoff ISO string for a range key, or null for 'all' (no date filter).
function rangeCutoff(range) { return range === 'all' ? null : daysAgoIso(Number(range)) }

function groupCount(rows, field, fallback = 'לא צוין') {
  const m = {}
  for (const r of rows) { const k = r[field] || fallback; m[k] = (m[k] || 0) + 1 }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
}

function StatTile({ label, value }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent className="text-3xl font-bold">{value}</CardContent>
    </Card>
  )
}

function BarList({ items, unit = '' }) {
  if (!items.length) return <div className="empty small">אין נתונים</div>
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="small" style={{ width: 150, flexShrink: 0, textAlign: 'end' }}>{it.label}</span>
          <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, height: 18, position: 'relative', overflow: 'hidden' }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: 'var(--mp)', borderRadius: 6, minWidth: it.value ? 4 : 0 }} />
          </div>
          <span className="small" style={{ width: 60, flexShrink: 0, fontWeight: 600 }}>{it.value}{unit}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const rep = useAuthStore(s => s.rep)
  const unit = useBusinessUnitStore(s => s.unit)
  const [sec, setSec] = useState('לוח מכירות')
  const [range, setRange] = useState('30')
  const [ownerId, setOwnerId] = useState('')
  const [reps, setReps] = useState([])

  useEffect(() => { loadOptions().then(o => setReps(o.users || [])) }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardHeader><CardTitle>ברוך הבא, {rep?.full_name || 'שלום'}</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground text-sm">מציג נתונים עבור יחידה עסקית: <b>{unit}</b>.</CardContent>
      </Card>

      <div className="card">
        <div className="row flex-wrap" style={{ gap: 8, marginBottom: 14, alignItems: 'center' }}>
          <span className="muted small">טווח תאריכים:</span>
          {RANGE_PRESETS.map(p => (
            <Button key={p.key} size="sm" variant={range === p.key ? 'default' : 'outline'} className="h-8" onClick={() => setRange(p.key)}>
              {p.label}
            </Button>
          ))}
          <span className="muted small" style={{ marginInlineStart: 12 }}>נציג:</span>
          <Select value={ownerId || '__all__'} onValueChange={v => setOwnerId(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 w-44"><SelectValue placeholder="כל הנציגים" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">כל הנציגים</SelectItem>
              {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="sections-tabs">{SECTIONS.map(s => <div key={s} className={`sec-tab ${sec === s ? 'active' : ''}`} onClick={() => setSec(s)}>{s}</div>)}</div>
        {sec === 'לוח מכירות' && <SalesDashboard unit={unit} range={range} ownerId={ownerId} />}
        {sec === 'לוח מסעות ותפוסה' && <JourneysDashboard unit={unit} range={range} />}
      </div>
    </div>
  )
}

function SalesDashboard({ unit, range, ownerId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    setData(null);
    (async () => {
      const cutoff = rangeCutoff(range)
      let custQuery = supabase.from('customers').select('id, lead_source, campaign, created_at, owner_id').eq('business_unit', unit).is('deleted_at', null)
      if (cutoff) custQuery = custQuery.gte('created_at', cutoff)
      if (ownerId) custQuery = custQuery.eq('owner_id', ownerId)
      let salesQuery = supabase.from('sales').select('id, stage, loss_reason, owner_id, created_at').eq('business_unit', unit).is('deleted_at', null)
      if (cutoff) salesQuery = salesQuery.gte('created_at', cutoff)
      if (ownerId) salesQuery = salesQuery.eq('owner_id', ownerId)
      const [{ data: customers }, { data: sales }] = await Promise.all([custQuery, salesQuery])
      const cs = customers || []
      const ss = sales || []
      const newMonth = cs.filter(c => c.created_at >= startOfMonthIso()).length
      const newWeek = cs.filter(c => c.created_at >= daysAgoIso(7)).length
      const closedWon = ss.filter(s => s.stage === 'נסגר בהצלחה').length
      const conversion = cs.length ? Math.round((closedWon / cs.length) * 1000) / 10 : 0
      const openStages = ss.filter(s => !SALE_STAGES_CLOSED.includes(s.stage))
      const lost = ss.filter(s => s.stage === 'נסגר באי הצלחה')
      setData({
        newMonth, newWeek,
        bySource: groupCount(cs, 'lead_source'),
        byCampaign: groupCount(cs.filter(c => c.campaign), 'campaign').slice(0, 8),
        conversion,
        byStage: groupCount(openStages, 'stage'),
        lossReasons: groupCount(lost, 'loss_reason'),
      })
    })()
  }, [unit, range, ownerId])

  if (!data) return <div className="empty"><span className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="לידים חדשים (החודש)" value={data.newMonth} />
        <StatTile label="לידים חדשים (השבוע)" value={data.newWeek} />
        <StatTile label="יחס המרה מליד למכירה" value={`${data.conversion}%`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-sm">לידים לפי מקור</CardTitle></CardHeader>
          <CardContent><BarList items={data.bySource} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">לידים לפי קמפיין</CardTitle></CardHeader>
          <CardContent><BarList items={data.byCampaign} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">עסקאות פתוחות לפי שלב</CardTitle></CardHeader>
          <CardContent><BarList items={data.byStage} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">סיבות אי סגירה</CardTitle></CardHeader>
          <CardContent><BarList items={data.lossReasons} /></CardContent></Card>
      </div>
    </div>
  )
}

// Journeys/registrations have no owner_id column, so the "נציג" filter
// doesn't apply here — only the date range does, scoped to when a
// registration was made (registered_at), not the journey's own dates
// (occupancy per departure is meant to stay visible regardless of range).
function JourneysDashboard({ unit, range }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    setData(null);
    (async () => {
      const { data: journeys } = await supabase.from('journeys')
        .select('id, name, seats_sold, seats_total, departure_date, min_seats, status, price_per_person, currency')
        .eq('business_unit', unit).is('deleted_at', null).order('departure_date')
      const js = journeys || []
      const journeyIds = js.map(j => j.id)

      const atRisk = js.filter(j =>
        j.departure_date && j.departure_date <= daysFromNowIso(60) && j.departure_date >= todayIso() &&
        j.seats_sold < j.min_seats && !['בוטל', 'יצא לדרך'].includes(j.status))

      const revenueByCurrency = {}
      for (const j of js) {
        if (!j.price_per_person || !j.currency) continue
        revenueByCurrency[j.currency] = (revenueByCurrency[j.currency] || 0) + j.seats_sold * j.price_per_person
      }

      let unpaid = []
      if (journeyIds.length) {
        const cutoff = rangeCutoff(range)
        let regQuery = supabase.from('registrations')
          .select('id, amount_paid, currency, registered_at')
          .in('journey_id', journeyIds).in('status', ['משוריין', 'שולמה מקדמה']).is('deleted_at', null)
        if (cutoff) regQuery = regQuery.gte('registered_at', cutoff)
        const { data: regs } = await regQuery
        unpaid = regs || []
      }
      const unpaidByCurrency = {}
      for (const r of unpaid) {
        const cur = r.currency || 'לא צוין'
        unpaidByCurrency[cur] = (unpaidByCurrency[cur] || 0) + (r.amount_paid || 0)
      }

      setData({ journeys: js, atRisk, revenueByCurrency, unpaid, unpaidByCurrency })
    })()
  }, [unit, range])

  if (!data) return <div className="empty"><span className="spinner" /></div>

  const occupancy = data.journeys.map(j => ({ label: j.name, value: j.seats_sold, total: j.seats_total }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardHeader><CardTitle className="text-sm">תפוסה לכל יציאה</CardTitle></CardHeader>
        <CardContent>
          {occupancy.length === 0 ? <div className="empty small">אין יציאות</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {occupancy.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="small" style={{ width: 180, flexShrink: 0, textAlign: 'end' }}>{it.label}</span>
                  <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, height: 18, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ width: `${it.total ? (it.value / it.total) * 100 : 0}%`, height: '100%', background: 'var(--mp)', borderRadius: 6 }} />
                  </div>
                  <span className="small" style={{ width: 60, flexShrink: 0, fontWeight: 600 }}>{it.value}/{it.total}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">יציאות בסיכון (עד 60 יום, מתחת למינימום)</CardTitle></CardHeader>
          <CardContent>
            {data.atRisk.length === 0 ? <div className="empty small">אין יציאות בסיכון</div> : (
              <table className="grid"><thead><tr><th>יציאה</th><th>תאריך</th><th>נמכרו/מינימום</th></tr></thead>
                <tbody>{data.atRisk.map(j => (
                  <tr key={j.id}><td>{j.name}</td><td className="small">{new Date(j.departure_date).toLocaleDateString('he-IL')}</td>
                    <td><span className="badge warn">{j.seats_sold}/{j.min_seats}</span></td></tr>
                ))}</tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">הכנסה צפויה לפי מטבע</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(data.revenueByCurrency).length === 0 ? <div className="empty small">אין נתונים</div> : (
              <div className="grid gap-3 sm:grid-cols-3">
                {Object.entries(data.revenueByCurrency).map(([cur, total]) => (
                  <div key={cur} style={{ textAlign: 'center' }}>
                    <div className="text-2xl font-bold">{CURRENCY_SYMBOLS[cur] || ''}{total.toLocaleString('he-IL')}</div>
                    <div className="muted small">{cur}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="muted small" style={{ marginTop: 8 }}>לעולם לא מסוכם בין מטבעות שונים.</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">הרשמות שטרם שולמו במלואן</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile label="מספר הרשמות" value={data.unpaid.length} />
            <div>
              <div className="text-sm text-muted-foreground" style={{ marginBottom: 6 }}>סכום ששולם עד כה, לפי מטבע</div>
              {Object.keys(data.unpaidByCurrency).length === 0 ? <div className="empty small">אין נתונים</div> : (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {Object.entries(data.unpaidByCurrency).map(([cur, total]) => (
                    <div key={cur}><b>{CURRENCY_SYMBOLS[cur] || ''}{total.toLocaleString('he-IL')}</b> <span className="muted small">{cur}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
