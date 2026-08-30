import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useBusinessUnitStore } from '../stores/businessUnitStore'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'

/* Placeholder for Wave 1 — real metrics (leads by source/campaign,
   lead->sale conversion, open deals by stage, reasons for not closing) are
   Wave 2's dashboards, per docs/domain-model.md / docs/roadmap.md. This
   just orients whoever logs in: who they are, which unit they're viewing,
   and a couple of counts so an empty system doesn't look broken. */
export default function Dashboard() {
  const rep = useAuthStore(s => s.rep)
  const unit = useBusinessUnitStore(s => s.unit)
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    (async () => {
      const [{ count: customers }, { count: openSales }, { count: myTasks }] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('business_unit', unit).is('deleted_at', null),
        supabase.from('sales').select('id', { count: 'exact', head: true }).eq('business_unit', unit).is('deleted_at', null)
          .not('stage', 'in', '("נסגר בהצלחה","נסגר באי הצלחה")'),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'פתוחה').is('deleted_at', null),
      ])
      setCounts({ customers: customers ?? 0, openSales: openSales ?? 0, myTasks: myTasks ?? 0 })
    })()
  }, [unit])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardHeader>
          <CardTitle>ברוך הבא, {rep?.full_name || 'שלום'}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          מציג נתונים עבור יחידה עסקית: <b>{unit}</b>. לוחות הבקרה המלאים (מכירות ומסעות ותפוסה) מגיעים בשלב 2 — ראו docs/roadmap.md.
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">לקוחות</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{counts ? counts.customers : '…'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">עסקאות פתוחות</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{counts ? counts.openSales : '…'}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">משימות פתוחות (הכול)</CardTitle></CardHeader>
          <CardContent className="text-3xl font-bold">{counts ? counts.myTasks : '…'}</CardContent>
        </Card>
      </div>
    </div>
  )
}
