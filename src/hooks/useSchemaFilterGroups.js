import { useEffect, useMemo, useState } from 'react'
import { loadOptions } from '../lib/api'
import { buildSchemaFilters } from '../lib/schemaFilters'

/* Powers the "סננים" advanced filters panel on every list screen: derives
   the full per-field filter set straight from lib/schema.js's SCHEMA
   registry, so a list screen doesn't have to hand-declare every field it
   wants filterable — only the ones it wants to hide (`exclude`, e.g.
   'business_unit' which the page already pins via a fixed ListBase filter).
   Relation option lists (customers/journeys/sales) come from the same
   module-cached loadOptions() every create form already uses. */
export default function useSchemaFilterGroups(type, exclude = []) {
  const [opts, setOpts] = useState(null)
  useEffect(() => { loadOptions().then(setOpts) }, [])
  const excludeKey = exclude.join(',')
  return useMemo(() => buildSchemaFilters(type, {
    relationOptions: { customers: opts?.customers, journeys: opts?.journeys, sales: opts?.sales },
    exclude,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [type, opts, excludeKey])
}
