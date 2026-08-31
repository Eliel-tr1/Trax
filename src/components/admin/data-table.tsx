import type { ReactNode } from "react";
import { Children, createElement, isValidElement, useCallback, useRef } from "react";
import type {
  DataTableBaseProps,
  ExtractRecordPaths,
  HintedString,
  Identifier,
  RaRecord,
  SortPayload,
} from "ra-core";
import {
  DataTableBase,
  DataTableRenderContext,
  FieldTitle,
  RecordContextProvider,
  useDataTableCallbacksContext,
  useDataTableConfigContext,
  useDataTableDataContext,
  useDataTableRenderContext,
  useDataTableSelectedIdsContext,
  useDataTableSortContext,
  useDataTableStoreContext,
  useGetPathForRecordCallback,
  useRecordContext,
  useResourceContext,
  useStore,
  useTranslate,
  useTranslateLabel,
} from "ra-core";
import { useNavigate } from "react-router";
import { ArrowDownAZ, ArrowUpZA } from "lucide-react";
import get from "lodash/get";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ColumnsSelector,
  ColumnsSelectorItem,
} from "@/components/admin/columns-button";
import { NumberField } from "@/components/admin/number-field";
import {
  BulkActionsToolbar,
  BulkActionsToolbarChildren,
} from "@/components/admin/bulk-actions-toolbar";

const defaultBulkActionButtons = <BulkActionsToolbarChildren />;

/**
 * A powerful data table with sorting, selection, and column customization.
 *
 * Displays records in a table with built-in support for column sorting, bulk selection, row clicks,
 * and column visibility controls. Use DataTable.Col to define columns.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/datatable/ DataTable documentation}
 *
 * @example
 * import { List, DataTable, ReferenceField, EditButton } from '@/components/admin';
 *
 * export const PostList = () => (
 *   <List>
 *     <DataTable>
 *       <DataTable.Col source="id" />
 *       <DataTable.Col label="User">
 *         <ReferenceField source="user_id" reference="users" />
 *       </DataTable.Col>
 *       <DataTable.Col source="title" />
 *       <DataTable.Col>
 *         <EditButton />
 *       </DataTable.Col>
 *     </DataTable>
 *   </List>
 * );
 */
export function DataTable<RecordType extends RaRecord = RaRecord>(
  props: DataTableProps<RecordType>,
) {
  const {
    children,
    className,
    rowClassName,
    bulkActionButtons = defaultBulkActionButtons,
    bulkActionsToolbar,
    ...rest
  } = props;
  const hasBulkActions = !!bulkActionsToolbar || bulkActionButtons !== false;
  const resourceFromContext = useResourceContext(props);
  const storeKey = props.storeKey || `${resourceFromContext}.datatable`;
  const [columnRanks] = useStore<number[]>(`${storeKey}_columnRanks`);
  const columns = columnRanks
    ? reorderChildren(children, columnRanks)
    : children;

  return (
    <DataTableBase<RecordType>
      hasBulkActions={hasBulkActions}
      loading={null}
      empty={<DataTableEmpty />}
      {...rest}
    >
      <div className={cn("rounded-md border", className)}>
        <Table>
          <DataTableRenderContext.Provider value="header">
            <DataTableHead>{columns}</DataTableHead>
          </DataTableRenderContext.Provider>
          <DataTableBody<RecordType> rowClassName={rowClassName}>
            {columns}
          </DataTableBody>
        </Table>
      </div>
      {bulkActionsToolbar ??
        (bulkActionButtons !== false && (
          <BulkActionsToolbar>
            {isValidElement(bulkActionButtons)
              ? bulkActionButtons
              : defaultBulkActionButtons}
          </BulkActionsToolbar>
        ))}
      <DataTableRenderContext.Provider value="columnsSelector">
        <ColumnsSelector>{children}</ColumnsSelector>
      </DataTableRenderContext.Provider>
    </DataTableBase>
  );
}

DataTable.Col = DataTableColumn;
DataTable.NumberCol = DataTableNumberColumn;

const DataTableHead = ({ children }: { children: ReactNode }) => {
  const data = useDataTableDataContext();
  const { hasBulkActions = false } = useDataTableConfigContext();
  const { onSelect } = useDataTableCallbacksContext();
  const selectedIds = useDataTableSelectedIdsContext();
  const handleToggleSelectAll = (checked: boolean) => {
    if (!onSelect || !data || !selectedIds) return;
    onSelect(
      checked
        ? selectedIds.concat(
            data
              .filter((record) => !selectedIds.includes(record.id))
              .map((record) => record.id),
          )
        : // We should only unselect the ids present in the current page
          selectedIds.filter((id) => !data.some((record) => record.id === id)),
    );
  };
  const selectableIds = Array.isArray(data)
    ? data.map((record) => record.id)
    : [];
  return (
    <TableHeader>
      <TableRow>
        {hasBulkActions ? (
          <TableHead className="w-8">
            <Checkbox
              aria-label="בחירת כל השורות"
              onCheckedChange={handleToggleSelectAll}
              checked={
                selectedIds &&
                selectedIds.length > 0 &&
                selectableIds.length > 0 &&
                selectableIds.every((id) => selectedIds.includes(id))
              }
              className="mb-2"
            />
          </TableHead>
        ) : null}
        {children}
      </TableRow>
    </TableHeader>
  );
};

const DataTableBody = <RecordType extends RaRecord = RaRecord>({
  children,
  rowClassName,
}: {
  children: ReactNode;
  rowClassName?: (record: RecordType) => string | undefined;
}) => {
  const data = useDataTableDataContext();
  return (
    <TableBody>
      {data?.map((record, rowIndex) => (
        <RecordContextProvider
          value={record}
          key={record.id ?? `row${rowIndex}`}
        >
          <DataTableRow className={rowClassName?.(record)}>
            {children}
          </DataTableRow>
        </RecordContextProvider>
      ))}
    </TableBody>
  );
};

const DataTableRow = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const { rowClick, handleToggleItem } = useDataTableCallbacksContext();
  const selectedIds = useDataTableSelectedIdsContext();
  const { hasBulkActions = false } = useDataTableConfigContext();

  const record = useRecordContext();
  if (!record) {
    throw new Error("DataTableRow can only be used within a RecordContext");
  }

  const resource = useResourceContext();
  if (!resource) {
    throw new Error("DataTableRow can only be used within a ResourceContext");
  }

  const navigate = useNavigate();
  const getPathForRecord = useGetPathForRecordCallback();

  const handleToggle = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!handleToggleItem) return;
      handleToggleItem(record.id, event);
    },
    [handleToggleItem, record.id],
  );

  const handleClick = useCallback(async () => {
    const temporaryLink =
      typeof rowClick === "function"
        ? rowClick(record.id, resource, record)
        : rowClick;

    const link = isPromise(temporaryLink) ? await temporaryLink : temporaryLink;

    const path = await getPathForRecord({
      record,
      resource,
      link,
    });
    if (path === false || path == null) {
      return;
    }
    navigate(path, {
      state: { _scrollToTop: true },
    });
  }, [record, resource, rowClick, navigate, getPathForRecord]);

  return (
    <TableRow
      key={record.id}
      onClick={handleClick}
      className={cn(rowClick !== false && "cursor-pointer", className)}
    >
      {hasBulkActions ? (
        <TableCell className="w-8" onClick={handleToggle}>
          {/* Without a name every row checkbox was announced as an unlabelled
              button - fifty of them, indistinguishable. */}
          <Checkbox
            aria-label="בחירת השורה"
            checked={selectedIds?.includes(record.id)}
            onClick={handleToggle}
          />
        </TableCell>
      ) : null}
      {children}
    </TableRow>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isPromise = (value: any): value is Promise<any> =>
  value && typeof value.then === "function";

const DataTableEmpty = () => {
  return (
    <Alert>
      <AlertDescription>No results found.</AlertDescription>
    </Alert>
  );
};

export interface DataTableProps<RecordType extends RaRecord = RaRecord>
  extends Partial<DataTableBaseProps<RecordType>> {
  children: ReactNode;
  className?: string;
  rowClassName?: (record: RecordType) => string | undefined;
  bulkActionButtons?: ReactNode;
  bulkActionsToolbar?: ReactNode;
}

export function DataTableColumn<
  RecordType extends RaRecord<Identifier> = RaRecord<Identifier>,
>(props: DataTableColumnProps<RecordType>) {
  const renderContext = useDataTableRenderContext();
  switch (renderContext) {
    case "columnsSelector":
      return <ColumnsSelectorItem<RecordType> {...props} />;
    case "header":
      return <DataTableHeadCell {...props} />;
    case "data":
      return <DataTableCell {...props} />;
  }
}

/**
 * Reorder children based on columnRanks
 *
 * Note that columnRanks may be shorter than the number of children
 */
const reorderChildren = (children: ReactNode, columnRanks: number[]) =>
  Children.toArray(children).reduce((acc: ReactNode[], child, index) => {
    const rank = columnRanks.indexOf(index);
    if (rank === -1) {
      // if the column is not in columnRanks, keep it at the same index
      acc[index] = child;
    } else {
      // if the column is in columnRanks, move it to the rank index
      acc[rank] = child;
    }
    return acc;
  }, []);

function DataTableHeadCell<
  RecordType extends RaRecord<Identifier> = RaRecord<Identifier>,
>(props: DataTableColumnProps<RecordType>) {
  const {
    disableSort,
    source,
    label,
    sortByOrder,
    className,
    headerClassName,
  } = props;

  const sort = useDataTableSortContext();
  const { handleSort } = useDataTableCallbacksContext();
  const resource = useResourceContext();
  const translate = useTranslate();
  const translateLabel = useTranslateLabel();
  const { storeKey, defaultHiddenColumns } = useDataTableStoreContext();
  const [hiddenColumns] = useStore<string[]>(storeKey, defaultHiddenColumns);
  const isColumnHidden = hiddenColumns.includes(source!);
  const [columnWidths, setColumnWidths] = useStore<Record<string, number>>(
    `${storeKey}_columnWidths`,
    {},
  );
  const thRef = useRef<HTMLTableCellElement>(null);
  const width = source ? columnWidths?.[source] : undefined;

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      if (!source) return;
      e.preventDefault();
      e.stopPropagation();
      const th = thRef.current;
      if (!th) return;
      const rect = th.getBoundingClientRect();
      const isRtl =
        getComputedStyle(document.documentElement).direction === "rtl";
      const anchor = isRtl ? rect.right : rect.left;
      const MIN_WIDTH = 60;
      const onMove = (moveEvent: PointerEvent) => {
        const raw = isRtl
          ? anchor - moveEvent.clientX
          : moveEvent.clientX - anchor;
        const next = Math.max(MIN_WIDTH, Math.round(raw));
        setColumnWidths((prev) => ({ ...(prev || {}), [source]: next }));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [source, setColumnWidths],
  );

  if (isColumnHidden) return null;

  const nextSortOrder =
    sort && sort.field === source
      ? oppositeOrder[sort.order]
      : (sortByOrder ?? "ASC");
  const fieldLabel = translateLabel({
    label: typeof label === "string" ? label : undefined,
    resource,
    source,
  });
  const sortLabel = translate("ra.sort.sort_by", {
    field: fieldLabel,
    field_lower_first:
      typeof fieldLabel === "string"
        ? fieldLabel.charAt(0).toLowerCase() + fieldLabel.slice(1)
        : undefined,
    order: translate(`ra.sort.${nextSortOrder}`),
    _: translate("ra.action.sort"),
  });

  return (
    <TableHead
      ref={thRef}
      className={cn(className, headerClassName, "relative")}
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
    >
      {source && (
        <span
          onPointerDown={handleResizeStart}
          className="group absolute top-0 bottom-0 z-10 w-2 cursor-col-resize select-none"
          style={{ insetInlineEnd: -4 }}
          title="גררו לשינוי רוחב העמודה"
        >
          <span className="mx-auto block h-full w-px bg-transparent group-hover:bg-[var(--border)]" />
        </span>
      )}
      {handleSort && sort && !disableSort && source ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="-ms-3 -me-3 h-8 data-[state=open]:bg-accent cursor-pointer"
                data-field={source}
                onClick={handleSort}
              >
                {headerClassName?.includes("text-end") ? null : (
                  <FieldTitle
                    label={label}
                    source={source}
                    resource={resource}
                  />
                )}
                {sort.field === source ? (
                  sort.order === "ASC" ? (
                    <ArrowDownAZ className="ms-2 h-6 w-6" />
                  ) : (
                    <ArrowUpZA className="ms-2 h-6 w-6" />
                  )
                ) : null}
                {headerClassName?.includes("text-end") ? (
                  <FieldTitle
                    label={label}
                    source={source}
                    resource={resource}
                  />
                ) : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{sortLabel}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <FieldTitle label={label} source={source} resource={resource} />
      )}
    </TableHead>
  );
}

const oppositeOrder: Record<SortPayload["order"], SortPayload["order"]> = {
  ASC: "DESC",
  DESC: "ASC",
};

function DataTableCell<
  RecordType extends RaRecord<Identifier> = RaRecord<Identifier>,
>(props: DataTableColumnProps<RecordType>) {
  const {
    children,
    render,
    field,
    source,
    className,
    cellClassName,
    conditionalClassName,
  } = props;

  const { storeKey, defaultHiddenColumns } = useDataTableStoreContext();
  const [hiddenColumns] = useStore<string[]>(storeKey, defaultHiddenColumns);
  const [columnWidths] = useStore<Record<string, number>>(
    `${storeKey}_columnWidths`,
    {},
  );
  const record = useRecordContext<RecordType>();
  const isColumnHidden = hiddenColumns.includes(source!);
  if (isColumnHidden) return null;
  if (!render && !field && !children && !source) {
    throw new Error(
      "DataTableColumn: Missing at least one of the following props: render, field, children, or source",
    );
  }
  const width = source ? columnWidths?.[source] : undefined;

  return (
    <TableCell
      className={cn(
        "py-1 overflow-hidden text-ellipsis",
        className,
        cellClassName,
        record && conditionalClassName?.(record),
      )}
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
    >
      {children ??
        (render
          ? record && render(record)
          : field
            ? createElement(field, { source })
            : get(record, source!))}
    </TableCell>
  );
}

export interface DataTableColumnProps<
  RecordType extends RaRecord<Identifier> = RaRecord<Identifier>,
> {
  className?: string;
  cellClassName?: string;
  headerClassName?: string;
  conditionalClassName?: (record: RecordType) => string | false | undefined;
  children?: ReactNode;
  render?: (record: RecordType) => React.ReactNode;
  field?: React.ElementType;
  source?: NoInfer<HintedString<ExtractRecordPaths<RecordType>>>;
  label?: React.ReactNode;
  disableSort?: boolean;
  sortByOrder?: SortPayload["order"];
}

export function DataTableNumberColumn<
  RecordType extends RaRecord<Identifier> = RaRecord<Identifier>,
>(props: DataTableNumberColumnProps<RecordType>) {
  const {
    source,
    options,
    locales,
    className,
    headerClassName,
    cellClassName,
    ...rest
  } = props;
  return (
    <DataTableColumn
      source={source}
      {...rest}
      className={className}
      headerClassName={cn("text-end", headerClassName)}
      cellClassName={cn("text-end", cellClassName)}
    >
      <NumberField source={source} options={options} locales={locales} />
    </DataTableColumn>
  );
}

export interface DataTableNumberColumnProps<
  RecordType extends RaRecord<Identifier> = RaRecord<Identifier>,
> extends DataTableColumnProps<RecordType> {
  source: NoInfer<HintedString<ExtractRecordPaths<RecordType>>>;
  locales?: string | string[];
  options?: Intl.NumberFormatOptions;
}
