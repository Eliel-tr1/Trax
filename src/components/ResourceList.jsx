import { useNavigate } from 'react-router-dom'
import EmptyState from './EmptyState'
import MobileCards from './list/MobileCards'
import { ListBase, useListContext } from 'ra-core'
import { Download } from 'lucide-react'
import { DataTable } from './admin/data-table'
import { Button } from './ui/button'
import Toolbar from './list/Toolbar'
import Pagination from './list/Pagination'
import SavedViews from './list/SavedViews'
import ColumnLayoutSync from './list/ColumnLayoutSync'
import { exportCsv } from '../lib/export'

/* ============================================================
   Ported verbatim from bina-crm — the generic list framework every list
   screen sits on. Screens pass a column config instead of a table:
     columns:  [{ source, label, render, csv, sortable }]
     presets:  [{ key, label, filter }]      quick tabs
     facets:   [{ field, title, options }]   multi-select popovers
   ============================================================ */

function ExportButton({ columns, name }) {
  const { data } = useListContext()
  const disabled = !data?.length
  return (
    <Button variant="outline" size="sm" className="h-9" disabled={disabled} onClick={() => {
      const cols = columns.filter(c => c.csv !== false)
      exportCsv(name, cols.map(c => c.label),
        data.map(r => cols.map(c => (c.csv ? c.csv(r) : r[c.source] ?? ''))))
    }}>
      <Download className="size-4" /> ייצוא
    </Button>
  )
}

function Body({ columns, rowPath, bulkActions, emptyLabel }) {
  const { isPending, data, filterValues, setFilters } = useListContext()
  const nav = useNavigate()

  if (isPending) return <div className="empty"><span className="spinner" /></div>
  if (!data?.length) {
    return (
      <div className="card">
        <EmptyState
          label={emptyLabel}
          query={filterValues?.q}
          onClear={Object.keys(filterValues || {}).length ? () => setFilters({}, null) : undefined}
        />
      </div>
    )
  }

  return (
    <>
      <MobileCards columns={columns} rowPath={rowPath} />
      <div className="rl-table hidden min-w-0 sm:block">
        <DataTable
          rowClick={rowPath ? (id, _r, record) => { nav(rowPath(record)); return false } : false}
          bulkActionButtons={bulkActions}
          hiddenColumns={columns.filter(c => c.hidden).map(c => c.source || c.label)}
        >
          {columns.map(c => (
            <DataTable.Col key={c.source || c.label} source={c.sortable === false ? undefined : c.source}
              label={c.label} disableSort={c.sortable === false} render={c.render} />
          ))}
        </DataTable>
      </div>
    </>
  )
}

export default function ResourceList({
  resource, storeKey, sort, perPage = 50, filter, filterDefault, columns,
  presets, facets, filters, search, extra, actions, rowPath, bulkActions, exportName,
  emptyLabel,
}) {
  // DataTable defaults its own storeKey to `${resource}.datatable` when
  // ResourceList doesn't pass one down (it doesn't) — ColumnLayoutSync and
  // SavedViews need that exact key to read/write the same column
  // order/width state the table itself drags and resizes live.
  const datatableStoreKey = `${resource}.datatable`

  return (
    // disableSyncWithLocation is load-bearing — see bina-crm's original
    // comment: two list screens at the same position in the tree would
    // otherwise fight over URL sync during navigation transitions.
    <ListBase key={resource} resource={resource} sort={sort} perPage={perPage} filter={filter}
      filterDefaultValues={filterDefault} storeKey={storeKey || resource}
      disableSyncWithLocation>
      <ColumnLayoutSync resource={resource} datatableStoreKey={datatableStoreKey} />
      <Toolbar
        presets={presets} facets={facets} filterGroups={filters} search={search}
        extra={<><SavedViews resource={resource} datatableStoreKey={datatableStoreKey} />{extra}</>}
        actions={<><ExportButton columns={columns} name={exportName || resource} />{actions}</>}
      />
      <Body columns={columns} rowPath={rowPath} bulkActions={bulkActions} emptyLabel={emptyLabel} />
      <Pagination />
    </ListBase>
  )
}
