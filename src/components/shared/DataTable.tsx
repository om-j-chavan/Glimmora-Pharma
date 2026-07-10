/**
 * Legacy re-export. The table primitive moved to
 * `@/components/table/DataTableBase` (renamed `DataTableBase`) so it lives
 * alongside the `DataTable` widget, the shared `tableTokens`, and the README.
 *
 * This file keeps the historical path and the `DataTable` export name alive so
 * existing imports keep compiling unchanged — notably the `@/components/shared`
 * barrel, which every consumer (Gap, CAPA tracker, Evidence, Audit Trail, …)
 * imports `DataTable` / `Column` / `DataTableProps` from. No behaviour or API
 * change; `DataTable` here IS `DataTableBase`.
 */
export {
  DataTableBase,
  DataTableBase as DataTable,
  type Column,
  type DataTableProps,
} from "@/components/table/DataTableBase";
