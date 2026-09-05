# Dashboard Drill-Down — the rule (read before adding ANY metric)

Every clickable dashboard metric (StatTile, BarChart row, FunnelChart row,
rank row) MUST navigate to the owning list screen **pre-filtered to exactly
the rows the metric counted**. A metric that opens the full table is a bug,
not a shortcut.

## How to wire it (Dashboard.jsx)

1. Build the drill params with the tab's `drillParams()`/`drillSales()`
   helper — it carries the shared filters (owner, journey, source, campaign,
   utm, date range) plus the metric's own cut (`extra`):
   ```js
   const drill = (extra) => nav({ pathname: '/sales', search: drillParams(extra).toString() })
   ```
2. Null/empty buckets drill as `__null__` → useDrillInitialFilter maps it to
   `field@is: null`. Arrays ride as `field@in` (comma-joined).
3. The chart bucket key and the drill filter MUST read the same fields the
   tile's count used — or the counts won't match (see the source×campaign
   chart comment in Dashboard.jsx).

## Why filters go through ListBase `filter` — not filterDefaultValues

ra-core's `getQuery` prefers **persisted store params** over
`filterDefaultValues`, and the store (`useStore`, localStorage keyed by
`storeKey`) survives navigation AND remounts. A previously-visited table
would silently drop the drill cut. ResourceList.jsx passes `initialFilter`
as ListBase's hard `filter` prop (merged into every fetch, cannot be
overridden). Don't "simplify" this back to filterDefaultValues.

## Zero-value rows

FunnelChart hides rows with value 0 — drilling one lands on an empty table
and reads as "the drill is broken". BarChart/rank rows: same principle, don't
render clickable rows for empty cuts.

## Verify before shipping (iron rule)

`node scripts/verify-marketing-drill.mjs` clicks every metric in the active
tab headlessly and checks the landed table's total matches the clicked count.
Add a case to `scripts/verify-drill.mjs` for any new drill shape. A metric is
not done until its drill case passes against the DEPLOYED staging build.
