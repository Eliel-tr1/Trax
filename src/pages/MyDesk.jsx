import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { formatCurrency, formatDate, formatDateTime, formatDuration } from '../lib/format'
import { SALE_STAGES_CLOSED, SALE_STAGES, CUSTOMER_STATUSES, REGISTRATION_STATUSES, TASK_STATUSES, enumOpts } from '../lib/constants'
import EditableCell from '../components/EditableCell'
import EditField from '../components/EditField'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { DvizRoot, DvizStyles, StatTile } from '../components/dashboard/DashboardCharts'

/* מסך ראשי לנציג ("My Desk") — a single-rep working screen, always scoped
   to the currently signed-in user (not filterable to "everyone", unlike
   Dashboard.jsx). Every list here is meant to physically shrink over the
   day: a lead that moves off "ליד חדש", a task marked done, a meeting once
   it's passed, a registration once it's paid — each simply drops out of its
   WHERE clause on the next fetch. There is no separate "resolved" bucket to
   maintain and no client-side filtering-after-the-fact: the query itself is
   the definition of "still needs me".

   Refetching: this is a plain route (see App.jsx), so React Router unmounts
   it on navigation away and remounts on return — the effects below re-run
   from scratch every time the rep lands back on this screen, so nothing here
   is ever served from a stale cache. A manual "רענן" button is included too,
   for the case where the rep resolves something in another tab/window
   without leaving this screen. */

const FOLLOW_UP_STAGES = ['הצעה נשלחה', 'ממתין להחלטה']
const PAID_IN_FULL = 'שולם במלואו'
const CANCELLED_REG = 'בוטל'
const NEW_LEAD = 'ליד חדש'
const WON_STAGE = 'נסגר בהצלחה'

// Inline-edit pickers on this screen reuse the exact option lists the real
// list screens use (constants.js), so what's editable here matches what's
// editable there — no second source of truth.
const stageOpts = enumOpts(SALE_STAGES)
const CUSTOMER_STATUSES_OPTS = enumOpts(CUSTOMER_STATUSES)
const REG_STATUSES = enumOpts(REGISTRATION_STATUSES)
const TASK_STATUS_OPTS = enumOpts(TASK_STATUSES)

function startOfDayIso(d = new Date()) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.toISOString() }
function endOfDayIso(d = new Date()) { const c = new Date(d); c.setHours(23, 59, 59, 999); return c.toISOString() }
function startOfMonthIso() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString() }

function sumByCurrency(rows, field, currencyField = 'currency') {
  const m = {}
  for (const r of rows) {
    if (!r[field]) continue
    const cur = r[currencyField] || 'לא צוין'
    m[cur] = (m[cur] || 0) + Number(r[field])
  }
  return m
}

function CurrencyBreakdown({ byCurrency }) {
  const entries = Object.entries(byCurrency)
  if (!entries.length) return <span className="muted small">-</span>
  return (
    <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
      {entries.map(([cur, total]) => (
        <span key={cur}><b>{formatCurrency(Math.round(total), cur)}</b></span>
      ))}
    </span>
  )
}

export default function MyDesk() {
  const user = useAuthStore(s => s.user)
  const rep = useAuthStore(s => s.rep)
  const unit = useBusinessUnitStore(s => s.unit)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <DvizStyles />
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>מסך ראשי — {rep?.full_name || 'שלום'}</CardTitle>
          <Button size="sm" variant="outline" onClick={refresh}>רענן</Button>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          הנתונים במסך הזה מוצגים עבורך בלבד, עבור יחידה עסקית <b>{unit}</b>. הרשימות מצטמצמות אוטומטית ככל שאתה מתקדם.
        </CardContent>
      </Card>

      {user?.id ? (
        <>
          <MetricsRow userId={user.id} unit={unit} refreshKey={refreshKey} />
          <div className="grid gap-4 lg:grid-cols-2">
            <NewLeadsCard userId={user.id} unit={unit} refreshKey={refreshKey} />
            <FollowUpCard userId={user.id} unit={unit} refreshKey={refreshKey} />
            <PendingPaymentCard userId={user.id} unit={unit} refreshKey={refreshKey} />
            <OpenTasksCard userId={user.id} unit={unit} refreshKey={refreshKey} />
            <MeetingsTodayCard userId={user.id} unit={unit} refreshKey={refreshKey} />
          </div>
        </>
      ) : (
        <div className="empty"><span className="spinner" /></div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- metrics */

function MetricsRow({ userId, unit, refreshKey }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    setData(null)
    ;(async () => {
      const todayFrom = startOfDayIso()
      const todayTo = endOfDayIso()
      const monthFrom = startOfMonthIso()

      const [openLeads, callsToday, callsTodayDuration, dealsClosed, openDeals] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true })
          .eq('owner_id', userId).eq('business_unit', unit).eq('status', NEW_LEAD).is('deleted_at', null),
        supabase.from('phone_calls').select('id', { count: 'exact', head: true })
          .eq('assigned_user_id', userId).eq('business_unit', unit).gte('occurred_at', todayFrom).lte('occurred_at', todayTo),
        supabase.from('phone_calls').select('duration_seconds')
          .eq('assigned_user_id', userId).eq('business_unit', unit).gte('occurred_at', todayFrom).lte('occurred_at', todayTo),
        supabase.from('sales').select('id', { count: 'exact', head: true })
          .eq('owner_id', userId).eq('business_unit', unit).eq('stage', WON_STAGE).is('deleted_at', null).gte('updated_at', monthFrom),
        supabase.from('sales').select('stage, expected_value, currency')
          .eq('owner_id', userId).eq('business_unit', unit).is('deleted_at', null),
      ])
      if (cancelled) return
      // Filtered client-side rather than with a `.not('stage', 'in', ...)`
      // PostgREST filter string — Hebrew stage labels need careful quoting
      // in that raw syntax and this rep's own row count is always small.
      const openDealRows = (openDeals.data || []).filter(s => !SALE_STAGES_CLOSED.includes(s.stage))
      const totalCallSeconds = (callsTodayDuration.data || []).reduce((sum, r) => sum + (r.duration_seconds || 0), 0)
      setData({
        openLeads: openLeads.count || 0,
        callsToday: callsToday.count || 0,
        callDurationToday: totalCallSeconds,
        dealsClosed: dealsClosed.count || 0,
        openDealsValue: sumByCurrency(openDealRows, 'expected_value'),
      })
    })()
    return () => { cancelled = true }
  }, [userId, unit, refreshKey])

  return (
    <DvizRoot>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="לידים פתוחים" value={data ? data.openLeads : <span className="spinner" style={{ width: 16, height: 16 }} />} tooltip="לקוחות בבעלותך בסטטוס ליד חדש" />
        <StatTile label="שיחות שהוצאתי היום" value={data ? data.callsToday : <span className="spinner" style={{ width: 16, height: 16 }} />} tooltip="שיחות טלפון משויכות אליך שבוצעו היום" />
        <StatTile label="סך זמן שיחה היום" value={data ? formatDuration(data.callDurationToday) : <span className="spinner" style={{ width: 16, height: 16 }} />} tooltip="סך משך השיחות המשויכות אליך שבוצעו היום" />
        <StatTile label="עסקאות שנסגרו החודש" value={data ? data.dealsClosed : <span className="spinner" style={{ width: 16, height: 16 }} />} tooltip="עסקאות בבעלותך בשלב נסגר בהצלחה, שעודכנו החודש" />
        <StatTile label="שווי עסקאות פתוחות" value={data ? <CurrencyBreakdown byCurrency={data.openDealsValue} /> : <span className="spinner" style={{ width: 16, height: 16 }} />} tooltip="סכום שווי צפוי של עסקאות פתוחות בבעלותך, לפי מטבע" />
      </div>
    </DvizRoot>
  )
}

/* ------------------------------------------------------------ list shell */

function ListCard({ title, count, children, empty }) {
  return (
    <Card className="gap-3">
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          {count != null && <span className="badge gray">{count}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? <p className="text-muted-foreground py-4 text-center text-sm">{empty}</p> : children}
      </CardContent>
    </Card>
  )
}

/* A My Desk row is now TWO zones: the whole row navigates to its own record
   (never to the entity's list — that was the old <a href="#/tasks"> bug),
   while individual editable cells stop the propagation and edit in place.
   `to` is the record path; editable children are rendered through
   EditableCell etc., which already stopPropagation on their click. */
function Row({ to, children }) {
  const nav = useNavigate()
  return (
    <div role="link" tabIndex={0} className="bg-muted/40 flex items-center gap-2 rounded-md border-s-4 p-2"
      style={{ borderInlineStartColor: 'var(--mp)', fontSize: '0.86rem', cursor: 'pointer' }}
      onClick={() => to && nav(to)}
      onKeyDown={e => { if (e.key === 'Enter' && to) nav(to) }}>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------- new leads */

function NewLeadsCard({ userId, unit, refreshKey }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    supabase.from('customers')
      .select('id, first_name, last_name, mobile_phone, lead_source, status, first_contact_at')
      .eq('owner_id', userId).eq('business_unit', unit).eq('status', NEW_LEAD).is('deleted_at', null)
      .order('first_contact_at', { ascending: false }).limit(30)
      .then(({ data }) => { if (!cancelled) setRows(data || []) })
    return () => { cancelled = true }
  }, [userId, unit, refreshKey])

  if (!rows) return <ListCard title="לידים חדשים"><div className="empty"><span className="spinner" /></div></ListCard>

  return (
    <ListCard title="לידים חדשים" count={rows.length} empty="אין לידים חדשים כרגע">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {rows.map(c => (
          <Row key={c.id} to={`/customers/${c.id}`}>
            <span style={{ flex: 1, fontWeight: 600 }}>{c.first_name} {c.last_name}</span>
            {c.lead_source && <span className="badge gray">{c.lead_source}</span>}
            <EditableCell row={c} table="customers" field="status" mode="select"
              options={CUSTOMER_STATUSES_OPTS} required onSaved={refresh} display={v => v && <span className="badge">{v}</span>} />
            <span className="muted small">{formatDate(c.first_contact_at)}</span>
          </Row>
        ))}
      </div>
    </ListCard>
  )
}

/* --------------------------------------------------------------- follow-up */

function FollowUpCard({ userId, unit, refreshKey }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    supabase.from('sales')
      .select('id, deal_name, stage, next_call_at, expected_value, currency, updated_at')
      .eq('owner_id', userId).eq('business_unit', unit).in('stage', FOLLOW_UP_STAGES).is('deleted_at', null)
      .order('next_call_at', { ascending: true, nullsFirst: false }).limit(30)
      .then(({ data }) => { if (!cancelled) setRows(data || []) })
    return () => { cancelled = true }
  }, [userId, unit, refreshKey])

  if (!rows) return <ListCard title="לידים בפולואפ"><div className="empty"><span className="spinner" /></div></ListCard>

  return (
    <ListCard title="לידים בפולואפ" count={rows.length} empty="אין עסקאות שממתינות לפולואפ">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {rows.map(s => (
          <Row key={s.id} to={`/sales/${s.id}`}>
            <span style={{ flex: 1, fontWeight: 600 }}>{s.deal_name || 'עסקה ללא שם'}</span>
            <EditableCell row={s} table="sales" field="stage" mode="select"
              options={stageOpts} required onSaved={refresh} display={v => v && <span className="badge warn">{v}</span>} />
            <EditableCell row={s} table="sales" field="next_call_at" type="datetime" onSaved={refresh}
              display={v => v && <span className="muted small">{formatDateTime(v)}</span>} />
          </Row>
        ))}
      </div>
    </ListCard>
  )
}

/* ---------------------------------------------------------- pending payment */

function PendingPaymentCard({ userId, unit, refreshKey }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    ;(async () => {
      // registrations has no owner_id of its own — "mine" is derived through
      // the sale it belongs to (sales.owner_id), so this is a two-step
      // fetch rather than a single filtered query.
      const { data: mySales } = await supabase.from('sales').select('id')
        .eq('owner_id', userId).eq('business_unit', unit).is('deleted_at', null)
      const saleIds = (mySales || []).map(s => s.id)
      if (!saleIds.length) { if (!cancelled) setRows([]); return }
      const { data } = await supabase.from('registrations')
        .select('id, registration_name, status, amount_paid, currency, last_payment_date')
        .in('sale_id', saleIds).neq('status', PAID_IN_FULL).neq('status', CANCELLED_REG).is('deleted_at', null)
        .order('last_payment_date', { ascending: true, nullsFirst: true }).limit(30)
      if (!cancelled) setRows(data || [])
    })()
    return () => { cancelled = true }
  }, [userId, unit, refreshKey])

  if (!rows) return <ListCard title="הרשמות שממתינות לתשלום"><div className="empty"><span className="spinner" /></div></ListCard>

  return (
    <ListCard title="הרשמות שממתינות לתשלום" count={rows.length} empty="אין הרשמות שממתינות לתשלום">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {rows.map(r => (
          <Row key={r.id} to={`/registrations/${r.id}`}>
            <span style={{ flex: 1, fontWeight: 600 }}>{r.registration_name || 'הרשמה'}</span>
            <EditableCell row={r} table="registrations" field="status" mode="select"
              options={REG_STATUSES} required onSaved={refresh} display={v => v && <span className="badge warn">{v}</span>} />
            <span className="muted small">{formatCurrency(r.amount_paid, r.currency)}</span>
          </Row>
        ))}
      </div>
    </ListCard>
  )
}

/* --------------------------------------------------------------- open tasks */

function OpenTasksCard({ userId, unit, refreshKey }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    supabase.from('tasks')
      .select('id, subject, due_at, priority, related_type')
      .eq('assignee_id', userId).eq('business_unit', unit).eq('status', 'פתוחה').is('deleted_at', null)
      .order('due_at', { ascending: true, nullsFirst: false }).limit(30)
      .then(({ data }) => { if (!cancelled) setRows(data || []) })
    return () => { cancelled = true }
  }, [userId, unit, refreshKey])

  if (!rows) return <ListCard title="משימות פתוחות"><div className="empty"><span className="spinner" /></div></ListCard>

  return (
    <ListCard title="משימות פתוחות" count={rows.length} empty="אין משימות פתוחות">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {rows.map(t => (
          <Row key={t.id} to={`/tasks/${t.id}`}>
            <span style={{ flex: 1, fontWeight: 600 }}>{t.subject}</span>
            <EditableCell row={t} table="tasks" field="status" mode="select"
              options={TASK_STATUS_OPTS} required onSaved={refresh} display={v => v && <span className="badge gray">{v}</span>} />
            {t.priority && <span className="badge gray">{t.priority}</span>}
            <EditableCell row={t} table="tasks" field="due_at" type="datetime" onSaved={refresh}
              display={v => v && <span className="muted small">{formatDateTime(v)}</span>} />
          </Row>
        ))}
      </div>
    </ListCard>
  )
}

/* ------------------------------------------------------------ meetings today */

function MeetingsTodayCard({ userId, unit, refreshKey }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let cancelled = false
    setRows(null)
    supabase.from('meetings')
      .select('id, subject, start_at, type, duration_minutes')
      .contains('participants', [userId]).eq('business_unit', unit)
      .gte('start_at', startOfDayIso()).lte('start_at', endOfDayIso()).is('deleted_at', null)
      .order('start_at', { ascending: true }).limit(30)
      .then(({ data }) => { if (!cancelled) setRows(data || []) })
    return () => { cancelled = true }
  }, [userId, unit, refreshKey])

  if (!rows) return <ListCard title="פגישות היום"><div className="empty"><span className="spinner" /></div></ListCard>

  return (
    <ListCard title="פגישות היום" count={rows.length} empty="אין פגישות היום">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
        {rows.map(m => (
          <Row key={m.id} to={`/meetings/${m.id}`}>
            <span style={{ flex: 1, fontWeight: 600 }}>{m.subject}</span>
            {m.type && <span className="badge gray">{m.type}</span>}
            <span className="muted small">{formatDateTime(m.start_at)}</span>
          </Row>
        ))}
      </div>
    </ListCard>
  )
}
