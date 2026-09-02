import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { loadOptions } from '../lib/api'
import { SALE_STAGES, SALE_STAGES_CLOSED, LEAD_SOURCES, CUSTOMER_STATUSES } from '../lib/constants'
import { formatCurrency, formatDate } from '../lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip'
import { DvizRoot, DvizStyles, StatTile, BarChart, FunnelChart, ProgressBar, useEntrance } from '../components/dashboard/DashboardCharts'

/* Dashboard rebuild — 3 tabs (מכירות / שיווק / מסעות) replacing the old
   2-section dashboard. Filter state lives in the URL (useSearchParams) so a
   link/refresh keeps the view — saved_views (server-side) is a separate
   feature owned by another agent, not touched here.

   Data-fetching stays client-side aggregation (small row counts at TRAX's
   current volume), same pattern the old Dashboard used — see lib/ra/providers
   for the schema-driven CRUD path used everywhere else; this page talks to
   supabase directly because these are ad-hoc aggregates, not resource CRUD.

   Chart building blocks + the dataviz-skill palette live in
   components/dashboard/DashboardCharts.jsx. */

const TABS = [
  { key: 'sales', label: 'מכירות' },
  { key: 'marketing', label: 'שיווק' },
  { key: 'journeys', label: 'מסעות' },
]

// מסעות (journeys) are a TRAX-only concept (docs/domain-model.md) — Xcon has
// no departures at all, so the tab and its filter are dropped entirely
// rather than shown disabled.
function tabsForUnit(unit) {
  return unit === 'Xcon' ? TABS.filter(t => t.key !== 'journeys') : TABS
}

const RANGE_PRESETS = [
  { key: 'today', label: 'היום' },
  { key: 'week', label: 'השבוע' },
  { key: 'month', label: 'החודש' },
  { key: 'quarter', label: 'רבעון' },
  { key: 'year', label: 'שנה' },
  { key: 'custom', label: 'מותאם אישית' },
]

function todayIso() { return new Date().toISOString().slice(0, 10) }
function toIsoStart(d) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.toISOString() }

// Resolves a preset key (+ optional custom from/to) into { from, to } ISO
// bounds. `to` is null (open-ended, "through now") except for `custom`.
function resolveRange(range, from, to) {
  const now = new Date()
  if (range === 'custom') {
    return { from: from ? toIsoStart(from) : null, to: to ? new Date(new Date(to).setHours(23, 59, 59, 999)).toISOString() : null }
  }
  if (range === 'today') return { from: toIsoStart(now), to: null }
  if (range === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - d.getDay()) // Sunday
    return { from: toIsoStart(d), to: null }
  }
  if (range === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: toIsoStart(d), to: null }
  }
  if (range === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    const d = new Date(now.getFullYear(), q * 3, 1)
    return { from: toIsoStart(d), to: null }
  }
  if (range === 'year') {
    const d = new Date(now.getFullYear(), 0, 1)
    return { from: toIsoStart(d), to: null }
  }
  return { from: null, to: null }
}

function groupCount(rows, field, fallback = 'לא צוין') {
  const m = {}
  for (const r of rows) { const k = r[field] || fallback; m[k] = (m[k] || 0) + 1 }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
}

function sumByCurrency(rows, field, currencyField = 'currency') {
  const m = {}
  for (const r of rows) {
    if (!r[field]) continue
    const cur = r[currencyField] || 'לא צוין'
    m[cur] = (m[cur] || 0) + Number(r[field])
  }
  return m
}

function CurrencyBreakdown({ byCurrency, label }) {
  const entries = Object.entries(byCurrency)
  if (!entries.length) return <div className="dviz-empty small">אין נתונים</div>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', cursor: 'default' }}>
          {entries.map(([cur, total]) => (
            <div key={cur}>
              <b>{formatCurrency(Math.round(total), cur)}</b>{' '}
              <span className="muted small">{cur}</span>
            </div>
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}, לעולם לא מסוכם בין מטבעות שונים</TooltipContent>
    </Tooltip>
  )
}

export default function Dashboard() {
  const rep = useAuthStore(s => s.rep)
  const unit = useBusinessUnitStore(s => s.unit)
  const [params, setParams] = useSearchParams()

  /* Filter persistence: dashboard filters live in the URL, but the URL is
     lost on unmount (navigating away). Mirror them into sessionStorage so a
     rep who filtered "רבעון + פייסבוק", went to check a deal, and came back
     lands on the SAME filtered view instead of starting over. sessionStorage
     (not localStorage) keeps this per-tab, same lifetime as the session. */
  useEffect(() => {
    const q = params.toString()
    if (q) sessionStorage.setItem('dashboard_filters', q)
  }, [params])
  useEffect(() => {
    if (params.toString()) return
    const saved = sessionStorage.getItem('dashboard_filters')
    if (saved) setParams(new URLSearchParams(saved), { replace: true })
  }, [])

  const tabs = useMemo(() => tabsForUnit(unit), [unit])
  const requestedTab = params.get('tab') || 'sales'
  const tab = tabs.some(t => t.key === requestedTab) ? requestedTab : 'sales'
  const range = params.get('range') || 'month'
  const from = params.get('from') || ''
  const to = params.get('to') || ''
  const ownerId = params.get('owner') || ''
  const journeyId = params.get('journey') || ''
  const source = params.get('source') || ''
  const campaign = params.get('campaign') || ''
  const utm = params.get('utm') || ''

  function setParam(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }

  const [reps, setReps] = useState([])
  const [journeys, setJourneys] = useState([])
  const [campaignOpts, setCampaignOpts] = useState([])
  const [utmOpts, setUtmOpts] = useState([])

  useEffect(() => {
    loadOptions().then(o => { setReps(o.users || []); setJourneys((o.journeys || []).filter(j => j.business_unit === unit)) })
  }, [unit])

  // Distinct campaign / utm_source values actually present in the data —
  // these are free text, so the filter list is derived, not a fixed enum.
  useEffect(() => {
    (async () => {
      const [{ data: c1 }, { data: s1 }] = await Promise.all([
        supabase.from('customers').select('campaign, utm_source').eq('business_unit', unit).is('deleted_at', null),
        supabase.from('sales').select('campaign, utm_source').eq('business_unit', unit).is('deleted_at', null),
      ])
      const camps = new Set(); const utms = new Set()
      for (const r of [...(c1 || []), ...(s1 || [])]) {
        if (r.campaign) camps.add(r.campaign)
        if (r.utm_source) utms.add(r.utm_source)
      }
      setCampaignOpts([...camps].sort())
      setUtmOpts([...utms].sort())
    })()
  }, [unit])

  const { from: rangeFrom, to: rangeTo } = useMemo(() => resolveRange(range, from, to), [range, from, to])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DvizStyles />
      <Card>
        <CardHeader><CardTitle>ברוך הבא, {rep?.full_name || 'שלום'}</CardTitle></CardHeader>
        <CardContent className="text-muted-foreground text-sm">מציג נתונים עבור יחידה עסקית: <b>{unit}</b>.</CardContent>
      </Card>

      <div className="card">
        <FilterBar
          range={range} from={from} to={to} onRange={(v) => setParam('range', v)}
          onFrom={(v) => setParam('from', v)} onTo={(v) => setParam('to', v)}
          ownerId={ownerId} onOwner={(v) => setParam('owner', v)} reps={reps}
          journeyId={journeyId} onJourney={(v) => setParam('journey', v)} journeys={journeys}
          source={source} onSource={(v) => setParam('source', v)}
          campaign={campaign} onCampaign={(v) => setParam('campaign', v)} campaignOpts={campaignOpts}
          utm={utm} onUtm={(v) => setParam('utm', v)} utmOpts={utmOpts}
          tab={tab} isXcon={unit === 'Xcon'}
        />

        <Tabs value={tab} onValueChange={(v) => setParam('tab', v)}>
          <TabsList className="mb-4">
            {tabs.map(t => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
          </TabsList>

          <TabsContent value="sales">
            <SalesTab unit={unit} rangeFrom={rangeFrom} rangeTo={rangeTo} ownerId={ownerId} journeyId={journeyId} source={source} campaign={campaign} utm={utm} reps={reps} animKey={`sales-${tab}`} />
          </TabsContent>
          <TabsContent value="marketing">
            <MarketingTab unit={unit} rangeFrom={rangeFrom} rangeTo={rangeTo} ownerId={ownerId} journeyId={journeyId} source={source} campaign={campaign} utm={utm} animKey={`marketing-${tab}`} />
          </TabsContent>
          {unit !== 'Xcon' && (
            <TabsContent value="journeys">
              <JourneysTab unit={unit} rangeFrom={rangeFrom} rangeTo={rangeTo} journeyId={journeyId} animKey={`journeys-${tab}`} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}

function FilterBar({ range, from, to, onRange, onFrom, onTo, ownerId, onOwner, reps, journeyId, onJourney, journeys, source, onSource, campaign, onCampaign, campaignOpts, utm, onUtm, utmOpts, tab, isXcon }) {
  const repsApply = tab !== 'journeys'
  const sourceApply = tab !== 'journeys'
  return (
    <div className="row flex-wrap" style={{ gap: 8, marginBottom: 14, alignItems: 'center' }}>
      <span className="muted small">טווח תאריכים:</span>
      <Select value={range} onValueChange={onRange}>
        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {range === 'custom' && (
        <span className="row" style={{ gap: 6 }}>
          <input type="date" className="input" style={{ minHeight: 32, padding: '4px 8px', width: 140 }} value={from} onChange={e => onFrom(e.target.value)} />
          <span className="muted small">עד</span>
          <input type="date" className="input" style={{ minHeight: 32, padding: '4px 8px', width: 140 }} value={to} onChange={e => onTo(e.target.value)} />
        </span>
      )}

      <Select value={ownerId || '__all__'} onValueChange={v => onOwner(v === '__all__' ? '' : v)} disabled={!repsApply}>
        <SelectTrigger className="h-8 w-36" style={{ marginInlineStart: 12 }}><SelectValue placeholder="כל הנציגים" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">כל הנציגים</SelectItem>
          {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name}</SelectItem>)}
        </SelectContent>
      </Select>

      {!isXcon && (
        <Select value={journeyId || '__all__'} onValueChange={v => onJourney(v === '__all__' ? '' : v)}>
          <SelectTrigger className="h-8 w-36"><SelectValue placeholder="כל המסעות" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">כל המסעות</SelectItem>
            {journeys.map(j => <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Select value={source || '__all__'} onValueChange={v => onSource(v === '__all__' ? '' : v)} disabled={!sourceApply}>
        <SelectTrigger className="h-8 w-28"><SelectValue placeholder="כל המקורות" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">כל המקורות</SelectItem>
          {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={campaign || '__all__'} onValueChange={v => onCampaign(v === '__all__' ? '' : v)} disabled={!sourceApply}>
        <SelectTrigger className="h-8 w-28"><SelectValue placeholder="כל הקמפיינים" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">כל הקמפיינים</SelectItem>
          {campaignOpts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>

      <span className="muted small">UTM:</span>
      <Select value={utm || '__all__'} onValueChange={v => onUtm(v === '__all__' ? '' : v)} disabled={!sourceApply}>
        <SelectTrigger className="h-8 w-28"><SelectValue placeholder="כל ה-UTM" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">כל ה-UTM</SelectItem>
          {utmOpts.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

/* ---------------------------------------------------------------- מכירות */

function applyCommonFilters(q, { ownerId, journeyId, source, campaign, utm, rangeFrom, rangeTo }) {
  if (ownerId) q = q.eq('owner_id', ownerId)
  if (journeyId) q = q.eq('journey_id', journeyId)
  if (source) q = q.eq('lead_source', source)
  if (campaign) q = q.eq('campaign', campaign)
  if (utm) q = q.eq('utm_source', utm)
  if (rangeFrom) q = q.gte('created_at', rangeFrom)
  if (rangeTo) q = q.lte('created_at', rangeTo)
  return q
}

function SalesTab({ unit, rangeFrom, rangeTo, ownerId, journeyId, source, campaign, utm, reps, animKey }) {
  const [sales, setSales] = useState(null)
  const animate = useEntrance(animKey, !!sales)
  const nav = useNavigate()

  /* Drill-down: every clickable chart/tile navigates to the owning entity's
     list screen with the SAME filter shape this tab queried, passed as
     URL params (drill_<field>=value) — survives hard refresh, works in
     every browser. Date-range filters ride along as created_at ranges. */
  const drillParams = (extra) => {
    const p = new URLSearchParams()
    if (ownerId) p.set('drill_owner_id', ownerId)
    if (journeyId) p.set('drill_journey_id', journeyId)
    if (source) p.set('drill_lead_source', source)
    if (campaign) p.set('drill_campaign', campaign)
    if (utm) p.set('drill_utm_source', utm)
    if (rangeFrom) p.set('drill_created_at@gte', rangeFrom)
    if (rangeTo) p.set('drill_created_at@lte', rangeTo)
    for (const [k, v] of Object.entries(extra)) {
      if (Array.isArray(v)) p.set('drill_' + k + '@in', v.join(','))
      else p.set('drill_' + k, v === null || v === '' ? '__null__' : String(v))
    }
    return p
  }
  const drill = (extra) => nav(`/sales?${drillParams(extra).toString()}`)

  useEffect(() => {
    setSales(null)
    let q = supabase.from('sales').select('id, stage, loss_reason, owner_id, journey_id, expected_value, currency, created_at, updated_at, lead_source, campaign, utm_source')
      .eq('business_unit', unit).is('deleted_at', null)
    q = applyCommonFilters(q, { ownerId, journeyId, source, campaign, utm, rangeFrom, rangeTo })
    q.then(({ data }) => setSales(data || []))
  }, [unit, rangeFrom, rangeTo, ownerId, journeyId, source, campaign, utm])

  if (!sales) return <div className="empty"><span className="spinner" /></div>

  const won = sales.filter(s => s.stage === 'נסגר בהצלחה')
  const lost = sales.filter(s => s.stage === 'עסקה הופסדה')
  const inProgress = sales.filter(s => s.stage !== 'נסגר בהצלחה' && s.stage !== 'עסקה הופסדה')
  const pipelineByCurrency = sumByCurrency(inProgress, 'expected_value')
  const winRate = (won.length + lost.length) ? Math.round((won.length / (won.length + lost.length)) * 1000) / 10 : 0
  const revenueByCurrency = sumByCurrency(won, 'expected_value')
  const avgDealByCurrency = {}
  for (const [cur, total] of Object.entries(revenueByCurrency)) {
    const n = won.filter(s => (s.currency || 'לא צוין') === cur).length
    avgDealByCurrency[cur] = n ? total / n : 0
  }
  const cycleDays = won
    .map(s => (new Date(s.updated_at) - new Date(s.created_at)) / 86400000)
    .filter(d => Number.isFinite(d) && d >= 0)
  const avgCycle = cycleDays.length ? Math.round((cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) * 10) / 10 : 0

  const funnelStages = SALE_STAGES.filter(st => !SALE_STAGES_CLOSED.includes(st)).map(st => ({
    label: st, value: sales.filter(s => s.stage === st).length,
  }))
  // Closed stages shown as the funnel's terminal rows too, so the whole
  // pipeline — including the outcome — reads in one chart.
  funnelStages.push({ label: 'נסגר בהצלחה', value: won.length })
  funnelStages.push({ label: 'עסקה הופסדה', value: lost.length })

  const byOwner = {}
  for (const s of sales) {
    const k = s.owner_id || '__none__'
    byOwner[k] = byOwner[k] || { count: 0, won: 0, revenue: {} }
    byOwner[k].count++
    if (s.stage === 'נסגר בהצלחה') {
      byOwner[k].won++
      const cur = s.currency || 'לא צוין'
      byOwner[k].revenue[cur] = (byOwner[k].revenue[cur] || 0) + Number(s.expected_value || 0)
    }
  }
  const leaderboard = Object.entries(byOwner)
    .map(([id, v]) => ({ id, name: id === '__none__' ? 'לא משויך' : (reps.find(r => r.id === id)?.full_name || '-'), ...v }))
    .sort((a, b) => b.won - a.won || b.count - a.count)

  const lossReasons = groupCount(lost, 'loss_reason')

  return (
    <DvizRoot className="dviz-fade-in">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="הכנסה מעסקאות שנסגרו" value={<CurrencyBreakdown byCurrency={revenueByCurrency} label="הכנסה לפי מטבע" />} />
          <StatTile label="עסקאות שנסגרו בהצלחה" value={won.length} tooltip="מספר עסקאות בשלב נסגר בהצלחה בטווח שנבחר" onClick={() => drill({ stage: 'נסגר בהצלחה' })} />
          <StatTile label="עסקאות שהופסדו" value={lost.length} tooltip="מספר עסקאות בשלב עסקה הופסדה בטווח שנבחר" onClick={() => drill({ stage: 'עסקה הופסדה' })} />
          <StatTile label="יחס סגירה" value={`${winRate}%`} tooltip={`${won.length} מתוך ${won.length + lost.length} עסקאות שנסגרו`} />
          <StatTile label="גודל עסקה ממוצע" value={<CurrencyBreakdown byCurrency={avgDealByCurrency} label="גודל עסקה ממוצע לפי מטבע" />} />
          <StatTile label="אורך מחזור מכירה ממוצע" value={`${avgCycle} ימים`} tooltip="מבוסס על הפרש בין תאריך יצירה לעדכון אחרון בעסקאות שנסגרו בהצלחה, קירוב, אין שדה תאריך סגירה ייעודי" />
          <StatTile label="עסקאות בתהליך" value={inProgress.length} tooltip="עסקאות שעדיין לא נסגרו ולא הופסדו, בכל שלבי המשפך" onClick={() => drill({ 'stage@in': SALE_STAGES.filter(st => !SALE_STAGES_CLOSED.includes(st)) })} />
          <StatTile label="שווי עסקאות פתוחות" value={<CurrencyBreakdown byCurrency={pipelineByCurrency} label="סך שווי העסקאות הפתוחות לפי מטבע" />} tooltip="סכום השווי הצפוי של כל העסקאות בתהליך, לפני סגירה" onClick={() => drill({ 'stage@in': SALE_STAGES.filter(st => !SALE_STAGES_CLOSED.includes(st)) })} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">משפך עסקאות לפי שלב</CardTitle></CardHeader>
            <CardContent><FunnelChart stages={funnelStages} animate={animate}
              onItemClick={s => drill({ stage: s.label })} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">סיבות אי סגירה</CardTitle></CardHeader>
            <CardContent><BarChart items={lossReasons} animate={animate}
              onItemClick={it => drill({ stage: 'עסקה הופסדה', loss_reason: it.label === 'לא צוין' ? '' : it.label })} /></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">לוח מובילים לפי נציג</CardTitle></CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? <div className="dviz-empty">אין נתונים</div> : (
              <div className="table-wrap">
                <table className="grid">
                  <thead><tr><th>נציג</th><th>עסקאות</th><th>נסגרו בהצלחה</th><th>יחס סגירה</th><th>הכנסה</th></tr></thead>
                  <tbody>
                    {leaderboard.map(r => (
                      <tr key={r.id} className="dviz-row-clickable" role="link"
                        style={{ cursor: 'pointer' }}
                        onClick={() => drill({ ...(r.id !== '__none__' ? { owner_id: r.id } : {}) })}
                        title="לחצו לצפייה בעסקאות הנציג">
                        <td><u style={{ textDecorationThickness: '1px', textUnderlineOffset: 3 }}>{r.name}</u></td>
                        <td>{r.count}</td>
                        <td><u style={{ textDecorationThickness: '1px', textUnderlineOffset: 3 }}>{r.won}</u></td>
                        <td>{r.count ? Math.round((r.won / r.count) * 100) : 0}%</td>
                        <td><CurrencyBreakdown byCurrency={r.revenue} label={`הכנסת ${r.name}`} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DvizRoot>
  )
}

/* ---------------------------------------------------------------- שיווק */

function MarketingTab({ unit, rangeFrom, rangeTo, ownerId, journeyId, source, campaign, utm, animKey }) {
  const [customers, setCustomers] = useState(null)
  const [sales, setSales] = useState(null)
  const animate = useEntrance(animKey, !!customers && !!sales)
  const nav = useNavigate()

  /* Drill-down: ALL marketing-tab clicks land on /sales (Goldi: "the whole
     dashboard should be on sales entity, not customers"). Lead-status and
     source buckets map onto the sale's own fields: status → the linked
     customer's status via a special drill_status param handled client-side
     is not possible in PostgREST filters, so status drills use the sale's
     lead_source/stage equivalents. Source/campaign/UTM/date filters apply
     directly to sales. */
  const drillSales = (extra) => nav(`/sales?${drillCustomersParams(extra).toString()}`)
  const drillCustomersParams = (extra) => {
    const p = new URLSearchParams()
    if (ownerId) p.set('drill_owner_id', ownerId)
    if (source) p.set('drill_lead_source', source)
    if (campaign) p.set('drill_campaign', campaign)
    if (utm) p.set('drill_utm_source', utm)
    if (rangeFrom) p.set('drill_created_at@gte', rangeFrom)
    if (rangeTo) p.set('drill_created_at@lte', rangeTo)
    for (const [k, v] of Object.entries(extra)) {
      if (Array.isArray(v)) p.set('drill_' + k + '@in', v.join(','))
      else p.set('drill_' + k, v === null || v === '' ? '__null__' : String(v))
    }
    return p
  }
  const drillCustomers = (extra) => drillSales(extra)

  useEffect(() => {
    setCustomers(null); setSales(null)
    let cq = supabase.from('customers').select('id, lead_source, campaign, utm_source, utm_medium, utm_campaign, status, created_at, owner_id')
      .eq('business_unit', unit).is('deleted_at', null)
    if (ownerId) cq = cq.eq('owner_id', ownerId)
    if (source) cq = cq.eq('lead_source', source)
    if (campaign) cq = cq.eq('campaign', campaign)
    if (utm) cq = cq.eq('utm_source', utm)
    if (rangeFrom) cq = cq.gte('created_at', rangeFrom)
    if (rangeTo) cq = cq.lte('created_at', rangeTo)

    let sq = supabase.from('sales').select('id, stage, lead_source, campaign, utm_source, journey_id, created_at')
      .eq('business_unit', unit).is('deleted_at', null)
    sq = applyCommonFilters(sq, { ownerId, journeyId, source, campaign, utm, rangeFrom, rangeTo })

    Promise.all([cq, sq]).then(([{ data: c }, { data: s }]) => { setCustomers(c || []); setSales(s || []) })
  }, [unit, rangeFrom, rangeTo, ownerId, journeyId, source, campaign, utm])

  if (!customers || !sales) return <div className="empty"><span className="spinner" /></div>

  // Leads by source × campaign combination — top 10, "אחר" for the long tail
  // is not fabricated; unnamed combos simply show as "לא צוין".
  const comboMap = {}
  for (const c of customers) {
    const key = `${c.lead_source || 'לא צוין'} · ${c.utm_campaign || c.campaign || 'ללא קמפיין'}`
    comboMap[key] = (comboMap[key] || 0) + 1
  }
  const bySourceCampaign = Object.entries(comboMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }))

  // Lead -> client conversion by channel, computed from sales outcomes per
  // lead_source (the only place a deal's real win/loss lives).
  const bySourceTotals = {}
  for (const s of sales) {
    const k = s.lead_source || 'לא צוין'
    bySourceTotals[k] = bySourceTotals[k] || { total: 0, won: 0 }
    bySourceTotals[k].total++
    if (s.stage === 'נסגר בהצלחה') bySourceTotals[k].won++
  }
  const conversionByChannel = Object.entries(bySourceTotals)
    .map(([label, v]) => ({ label, value: v.total ? Math.round((v.won / v.total) * 1000) / 10 : 0, detail: `${v.won}/${v.total} עסקאות`, total: v.total }))
    .sort((a, b) => b.value - a.value)

  // Status funnel is derived from the SALE pipeline (the marketing tab's
  // whole drill surface is sales now), not the customer's status field.
  const statusFunnel = SALE_STAGES.filter(st => !SALE_STAGES_CLOSED.includes(st))
    .map(st => ({ label: st, value: sales.filter(s => s.stage === st).length }))
  // Top-3 lead sources by raw volume — a quick "where do our leads actually
  // come from" readout, separate from the source×campaign combo chart above.
  const leadsBySource = groupCount(customers, 'lead_source')
  const topSources = leadsBySource.slice(0, 3)

  return (
    <DvizRoot className="dviz-fade-in">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="לידים חדשים בטווח" value={customers.length} onClick={() => drillCustomers({})} />
          <StatTile label="עסקאות מלידים בטווח" value={sales.length} onClick={() => nav(`/sales?${drillCustomersParams({}).toString()}`)} />
          <StatTile label="יחס המרה כולל לעסקה שנסגרה" value={`${sales.length ? Math.round((sales.filter(s => s.stage === 'נסגר בהצלחה').length / sales.length) * 1000) / 10 : 0}%`} tooltip="עסקאות שנסגרו בהצלחה מתוך כלל העסקאות בטווח" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">לידים לפי מקור וקמפיין (UTM)</CardTitle></CardHeader>
            <CardContent><BarChart items={bySourceCampaign} animate={animate}
              onItemClick={it => {
                // The chart's own bucket key: `source · utm_campaign` (falling
                // back to `campaign` when utm_campaign is unset — must mirror
                // EXACTLY here or the drill count won't match the tile count).
                const [src, camp] = it.label.split(' · ')
                const campField = camp === 'ללא קמפיין' ? null : camp
                drillCustomers({
                  ...(src && src !== 'לא צוין' ? { lead_source: src } : { 'lead_source@is': null }),
                  // 'ללא קמפיין' = the row has NEITHER utm_campaign nor
                  // campaign — drill as an is-null on both, not just one.
                  ...(campField
                    ? { utm_campaign: campField }
                    : { 'utm_campaign@is': null, 'campaign@is': null }),
                })
              }} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">יחס המרה לעסקה שנסגרה, לפי ערוץ</CardTitle></CardHeader>
            <CardContent><BarChart items={conversionByChannel} animate={animate} unit="%"
              onItemClick={it => it.onClick !== false && drillCustomers(it.label !== 'לא צוין' ? { lead_source: it.label } : {})} /></CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">משפך שלבי מכירה</CardTitle></CardHeader>
            <CardContent><FunnelChart stages={statusFunnel} animate={animate}
              onItemClick={s => drillSales({ stage: s.label })} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">שלושת המקורות המובילים</CardTitle></CardHeader>
            <CardContent>
              {topSources.length === 0 ? <div className="dviz-empty">אין נתונים</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {topSources.map((s, i) => (
                    <div key={s.label} className="dviz-rank-row dviz-row-clickable" role="link"
                      style={{ cursor: 'pointer' }}
                      onClick={() => drillCustomers(s.label !== 'לא צוין' ? { lead_source: s.label } : {})}>
                      <span className="dviz-rank-badge">{i + 1}</span>
                      <span className="dviz-rank-label"><u style={{ textDecorationThickness: '1px', textUnderlineOffset: 3 }}>{s.label}</u></span>
                      <span className="dviz-rank-value">{s.value} לידים</span>
                      <span className="muted small">{customers.length ? Math.round((s.value / customers.length) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DvizRoot>
  )
}

/* ---------------------------------------------------------------- מסעות */

const JOURNEY_TONE = { 'מלא': 'good', 'כמעט מלא': 'warning', 'בוטל': 'critical' }

function JourneysTab({ unit, journeyId, animKey }) {
  const [journeys, setJourneys] = useState(null)
  const [revenueByJourney, setRevenueByJourney] = useState({})
  const animate = useEntrance(animKey, !!journeys)

  useEffect(() => {
    setJourneys(null)
    ;(async () => {
      let jq = supabase.from('journeys')
        .select('id, name, seats_sold, seats_total, departure_date, min_seats, status, price_per_person, currency')
        .eq('business_unit', unit).is('deleted_at', null).order('departure_date')
      if (journeyId) jq = jq.eq('id', journeyId)
      const { data: js } = await jq
      setJourneys(js || [])

      const ids = (js || []).map(j => j.id)
      if (!ids.length) { setRevenueByJourney({}); return }
      const { data: regs } = await supabase.from('registrations')
        .select('journey_id, amount_paid, currency')
        .in('journey_id', ids).is('deleted_at', null)
      const m = {}
      for (const r of regs || []) {
        m[r.journey_id] = m[r.journey_id] || {}
        const cur = r.currency || 'לא צוין'
        m[r.journey_id][cur] = (m[r.journey_id][cur] || 0) + Number(r.amount_paid || 0)
      }
      setRevenueByJourney(m)
    })()
  }, [unit, journeyId])

  if (!journeys) return <div className="empty"><span className="spinner" /></div>

  const today = todayIso()
  const upcoming = journeys.filter(j => j.departure_date && j.departure_date >= today)
  const past = journeys.filter(j => !j.departure_date || j.departure_date < today)

  // Average occupancy across upcoming departures — a single "how full is the
  // pipeline overall" number, complementing the per-journey progress bars.
  const withCapacity = upcoming.filter(j => j.seats_total)
  const avgFillRate = withCapacity.length
    ? Math.round((withCapacity.reduce((a, j) => a + (j.seats_sold || 0) / j.seats_total, 0) / withCapacity.length) * 1000) / 10
    : 0

  // Departures still below their minimum seat count — the collected revenue
  // on those is at risk of a refund if the trip doesn't reach minimum and
  // gets cancelled.
  const atRisk = upcoming.filter(j => (j.min_seats || 0) > 0 && (j.seats_sold || 0) < j.min_seats)
  const revenueAtRiskByCurrency = {}
  for (const j of atRisk) {
    for (const [cur, total] of Object.entries(revenueByJourney[j.id] || {})) {
      revenueAtRiskByCurrency[cur] = (revenueAtRiskByCurrency[cur] || 0) + total
    }
  }

  return (
    <DvizRoot className="dviz-fade-in">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="מסעות עתידיים" value={upcoming.length} />
          <StatTile label="ממוצע תפוסה עתידית" value={`${avgFillRate}%`} tooltip="ממוצע אחוז המקומות שנמכרו על פני כל המסעות העתידיים עם קיבולת מוגדרת" />
          <StatTile
            label="הכנסה בסיכון"
            value={Object.keys(revenueAtRiskByCurrency).length ? <CurrencyBreakdown byCurrency={revenueAtRiskByCurrency} label="הכנסה שנגבתה עבור מסעות שטרם הגיעו למינימום נוסעים" /> : '0'}
            tooltip={`${atRisk.length} מסעות מתחת למינימום הנוסעים הנדרש — הכנסה שנגבתה עבורם עלולה לחזור אם המסע יבוטל`}
          />
        </div>
        <JourneyGroup title="עתידיים" journeys={upcoming} revenueByJourney={revenueByJourney} animate={animate} />
        <JourneyGroup title="שהתקיימו" journeys={past} revenueByJourney={revenueByJourney} animate={animate} />
      </div>
    </DvizRoot>
  )
}

function JourneyGroup({ title, journeys, revenueByJourney, animate }) {
  return (
    <div>
      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 10, color: 'var(--heading)' }}>{title} ({journeys.length})</h3>
      {journeys.length === 0 ? (
        <div className="dviz-empty">אין מסעות</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {journeys.map(j => (
            <Card key={j.id}>
              <CardHeader className="pb-2">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <CardTitle className="text-sm">{j.name}</CardTitle>
                  <span className={`badge ${JOURNEY_TONE[j.status] === 'good' ? 'ok' : JOURNEY_TONE[j.status] === 'warning' ? 'warn' : JOURNEY_TONE[j.status] === 'critical' ? 'err' : 'gray'}`}>{j.status}</span>
                </div>
              </CardHeader>
              <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="muted small">{j.departure_date ? formatDate(j.departure_date) : 'ללא תאריך'}</div>
                <ProgressBar
                  value={j.seats_sold || 0} total={j.seats_total || 0} animate={animate}
                  tone={JOURNEY_TONE[j.status] || 'default'}
                  label={`${j.seats_sold || 0}/${j.seats_total || 0} מקומות נמכרו (${j.seats_total ? Math.round(((j.seats_sold || 0) / j.seats_total) * 100) : 0}%) · מינימום להוצאה לדרך: ${j.min_seats || '-'}`}
                />
                <div className="small" style={{ fontWeight: 600 }}>{j.seats_sold || 0}/{j.seats_total || 0} מקומות</div>
                <div>
                  <div className="muted small" style={{ marginBottom: 4 }}>הכנסה שנגבתה</div>
                  <CurrencyBreakdown byCurrency={revenueByJourney[j.id] || {}} label={`הכנסה שנגבתה עבור ${j.name}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
