/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from "@/components/ui/button";
import { Trash } from "lucide-react";
import type { RaRecord, UseBulkDeleteControllerParams } from "ra-core";
import {
  useBulkDeleteController,
  useGetResourceLabel,
  useListContext,
  useResourceContext,
  useResourceTranslation,
} from "ra-core";
import { confirmDialog } from "@/components/Dialogs";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * A button that deletes multiple selected records at once.
 *
 * Allows to delete selected records in a DataTable. Use within
 * the bulkActionsButtons prop of DataTable or inside BulkActionsToolbar.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/bulkdeletebutton/ BulkDeleteButton documentation}
 *
 * @example
 * import { BulkDeleteButton, BulkExportButton, DataTable, List } from '@/components/admin';
 *
 * export const PostList = () => (
 *   <List>
 *     <DataTable
 *       bulkActionsButtons={
 *         <>
 *           <BulkExportButton />
 *           <BulkDeleteButton />
 *         </>
 *       }
 *     >
 *       ...
 *     </DataTable>
 *   </List>
 * );
 */
export const BulkDeleteButton = <
  RecordType extends RaRecord = any,
  MutationOptionsError = unknown,
>({
  icon = defaultIcon,
  label: labelProp,
  className,
  ...props
}: BulkDeleteButtonProps<RecordType, MutationOptionsError>) => {
  const { handleDelete, isPending } = useBulkDeleteController(props);
  const resource = useResourceContext(props);
  const { selectedIds } = useListContext();
  const getResourceLabel = useGetResourceLabel();
  const label = useResourceTranslation({
    resourceI18nKey: resource
      ? `resources.${resource}.action.delete`
      : undefined,
    baseI18nKey: "ra.action.delete",
    options: {
      name: resource ? getResourceLabel(resource, 1) : undefined,
    },
    userText: labelProp,
  });

  /* Deleting many records at once fired straight from the click with no
     confirmation, so one stray press wiped the whole selection. Always ask,
     and say exactly how many rows are about to go. */
  const confirmThenDelete = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const n = selectedIds?.length ?? 0;
    const ok = await confirmDialog(
      n === 1
        ? "למחוק את הרשומה שנבחרה?"
        : `למחוק ${n} רשומות שנבחרו?`,
      { title: "אישור מחיקה", confirmText: "מחיקה", danger: true },
    );
    if (ok) handleDelete(event);
  };

  return (
    <Button
      variant="destructive"
      type="button"
      onClick={confirmThenDelete}
      disabled={isPending}
      aria-label={typeof label === "string" ? label : undefined}
      className={cn("h-9", className)}
    >
      {icon}
      {label}
    </Button>
  );
};

export type BulkDeleteButtonProps<
  RecordType extends RaRecord = any,
  MutationOptionsError = unknown,
> = {
  label?: string;
  icon?: ReactNode;
} & React.ComponentPropsWithoutRef<"button"> &
  UseBulkDeleteControllerParams<RecordType, MutationOptionsError>;

const defaultIcon = <Trash />;
