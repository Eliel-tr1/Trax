import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs'

// Generic "extra sections" tab strip for record-detail screens — the main
// deal/entity fields stay on the page directly (not in here); this only
// houses secondary field groups that would otherwise clutter the main
// field-grid (system metadata, marketing attribution, etc.).
//
// First built for SaleDetail.jsx's "נתוני מערכת" / "נתונים שיווקיים" split;
// intentionally generic (tabs: [{ key, label, content }]) so a later pass
// can reuse it for created_at/by, updated_at/by, last status-change date and
// execution_url on every other entity type without redoing the tab UI.
export default function FieldTabs({ tabs, defaultTab }) {
  if (!tabs?.length) return null
  return (
    <Tabs defaultValue={defaultTab || tabs[0].key} className="field-tabs" style={{ marginTop: 4 }}>
      <TabsList>
        {tabs.map(t => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}
      </TabsList>
      {tabs.map(t => (
        <TabsContent key={t.key} value={t.key}>
          <div className="field-grid">{t.content}</div>
        </TabsContent>
      ))}
    </Tabs>
  )
}
