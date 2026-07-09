"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import clsx from "clsx";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import {
  bodyCell,
  bodyText,
  emptyState,
  headerCell,
  rowBorder,
  rowHover,
  rowTransition,
  sectionBorder,
  tableColors,
} from "./tableTokens";

/**
 * DataTableBase — the canonical, config-driven table PRIMITIVE for the whole
 * app. Markup lives here once; callers describe columns + data and let render
 * callbacks own everything *inside* a cell (badges, progress bars, links,
 * overflow menus, date formatting, stopPropagation on inner controls). The
 * table never wraps or interprets cell content — that contract is what keeps
 * migrations behaviour-neutral.
 *
 * Styling comes from the shared `tableTokens` (mirroring the global
 * `.data-table` class in index.css). Sorting is opt-in and off by default, so
 * adopting this component never changes a table's behaviour unless the caller
 * asks for it.
 *
 * Reach for this primitive when page-level filters drive other UI (charts,
 * grouped views) or when you need grouped / sub-table layouts. For a
 * standalone list view whose search / filters / paging live INSIDE the table,
 * use the `DataTable` widget in @/components/table instead. See the README in
 * this folder. Legacy-aliased as `DataTable` at @/components/shared/DataTable.
 */

export interface Column<T> {
  /** Stable identity — React key, and the default sort target. */
  key: string;
  /**
   * Header content — a string, or any node so the header can host interactive
   * controls (a select-all checkbox, a tooltip-bearing label, etc.). Pair with
   * `srOnly` for action/nav columns.
   */
  header: ReactNode;
  /** Visually hide the header label (e.g. an actions or chevron column). */
  srOnly?: boolean;
  align?: "left" | "right" | "center";
  /**
   * Width hint. In the `table-fixed` variant this maps to a `<col>` class;
   * otherwise it's applied as a class on the `<th>`.
   */
  width?: string;
  /** Extra classes merged onto this column's `<th>`. */
  headerClassName?: string;
  /**
   * Classes merged onto every `<td>` in this column. A function receives the
   * row + index for data-driven cell styling.
   */
  cellClassName?: string | ((row: T, index: number) => string | undefined);
  /** Inline style for every `<td>` in this column (e.g. data-driven cell fill). */
  cellStyle?: (row: T, index: number) => CSSProperties | undefined;
  /** Cell content. `index` is the row's position in the rendered data array. */
  render: (row: T, index: number) => ReactNode;
  /** Optional summary cell — providing any column footer renders a `<tfoot>`. */
  footer?: ReactNode;
  /**
   * Drop this column entirely (role/conditional columns). Filtered before
   * colSpan is computed so empty/loading rows still span correctly.
   */
  hidden?: boolean;

  /* ── client-side sorting (opt-in) ───────────────────────────── */
  sortable?: boolean;
  /** Value used to compare rows. Defaults to `row[key]`. */
  sortAccessor?: (row: T) => string | number | Date | null | undefined;
  /** Full custom comparator (overrides `sortAccessor`). */
  comparator?: (a: T, b: T) => number;
}

type Variant = "data-table" | "table-fixed" | "bare";
type Container = "scroll-x" | "container" | "fixed" | "none";

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Stable row key. `keyFn` is kept as a deprecated alias. */
  rowKey?: (row: T) => string;
  /** @deprecated use `rowKey`. */
  keyFn?: (row: T) => string;
  ariaLabel: string;
  caption?: string;

  /**
   * `data-table` — global `.data-table` chrome (default).
   * `table-fixed` — `table-fixed` + `<colgroup>` widths.
   * `bare`        — minimal `w-full` table for embedded sub-tables inside a
   *                 caller-supplied card/border container.
   */
  variant?: Variant;
  /** Drop the entire `<thead>` (headerless embedded tables). */
  headerless?: boolean;

  /** Whole-row click. Only the `<tr>` gets the handler; cells own their own. */
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T, index: number) => string | undefined;
  rowStyle?: (row: T, index: number) => CSSProperties | undefined;
  /** Extra attributes spread onto each `<tr>` (e.g. `aria-selected`, `aria-label`). */
  rowProps?: (row: T, index: number) => Record<string, unknown> | undefined;

  /* ── empty / loading ── */
  /** Node shown when there's no data. Falls back to a muted default message. */
  emptyState?: ReactNode;
  loading?: boolean;
  /** Skeleton rows shown while `loading && data.length === 0`. Default 5. */
  loadingRows?: number;

  /* ── container / layout ── */
  container?: Container;
  minWidth?: number | string;
  maxHeight?: number | string;
  minHeight?: number | string;

  /* ── sorting ── */
  defaultSort?: { key: string; dir: "asc" | "desc" };

  /** Footer slot below the table — drop `<Pagination>` / totals here. */
  footer?: ReactNode;
}

function defaultContainer(variant: Variant): Container {
  if (variant === "table-fixed") return "container";
  if (variant === "bare") return "none";
  return "scroll-x";
}

function alignClass(align?: Column<unknown>["align"]) {
  return align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function DataTableBase<T>({
  columns,
  data,
  rowKey,
  keyFn,
  ariaLabel,
  caption,
  variant = "data-table",
  headerless,
  onRowClick,
  rowClassName,
  rowStyle,
  rowProps,
  emptyState: emptyStateNode,
  loading,
  loadingRows = 5,
  container,
  minWidth,
  maxHeight,
  minHeight,
  defaultSort,
  footer,
}: DataTableProps<T>) {
  const keyOf = rowKey ?? keyFn ?? ((_: T) => String(_));
  const visibleColumns = useMemo(() => columns.filter((c) => !c.hidden), [columns]);
  const colSpan = visibleColumns.length;

  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;
    const cmp =
      col.comparator ??
      ((a: T, b: T) => {
        const get = col.sortAccessor ?? ((r: T) => (r as Record<string, unknown>)[col.key]);
        return compareValues(get(a), get(b));
      });
    const out = [...data].sort(cmp);
    if (sort.dir === "desc") out.reverse();
    return out;
  }, [data, sort, columns]);

  const isFixed = variant === "table-fixed";
  const wrap = container ?? defaultContainer(variant);

  // The `data-table` variant delegates chrome to the global `.data-table` class;
  // the other variants compose the shared tokens so they match it.
  const tableClass =
    variant === "data-table"
      ? "data-table"
      : isFixed
        ? clsx("w-full border-collapse table-fixed", bodyText)
        : clsx("w-full border-collapse", bodyText);

  const tableStyle: CSSProperties | undefined = minWidth != null ? { minWidth } : undefined;

  function toggleSort(col: Column<T>) {
    if (!col.sortable) return;
    setSort((prev) => {
      if (prev?.key !== col.key) return { key: col.key, dir: "asc" };
      return { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  const hasFooter = columns.some((c) => c.footer != null);
  const showEmpty = !loading && sortedData.length === 0;
  const showSkeleton = loading && data.length === 0;

  const table = (
    <table className={tableClass} aria-label={ariaLabel} style={tableStyle}>
      {caption && <caption className="sr-only">{caption}</caption>}
      {isFixed && visibleColumns.some((c) => c.width) && (
        <colgroup>
          {visibleColumns.map((col) => (
            <col key={col.key} className={col.width} />
          ))}
        </colgroup>
      )}
      {!headerless && (
        <thead>
          <tr className={isFixed ? clsx("border-b", sectionBorder) : undefined}>
            {visibleColumns.map((col) => {
              const sorted = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={sorted ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={clsx(
                    isFixed && headerCell,
                    isFixed && alignClass(col.align),
                    !isFixed && col.width,
                    col.headerClassName,
                  )}
                  style={col.align && col.align !== "left" ? { textAlign: col.align } : undefined}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col)}
                      className={clsx(
                        "inline-flex items-center gap-1 bg-transparent border-0 p-0 m-0 cursor-pointer font-[inherit] text-[inherit] uppercase tracking-[inherit]",
                        col.align === "right" && "flex-row-reverse",
                      )}
                      style={{ color: "inherit" }}
                    >
                      {col.srOnly ? <span className="sr-only">{col.header}</span> : col.header}
                      {sorted ? (
                        sort!.dir === "asc" ? (
                          <ArrowUp className="w-3 h-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="w-3 h-3" aria-hidden="true" />
                        )
                      ) : (
                        <ChevronsUpDown className="w-3 h-3 opacity-40" aria-hidden="true" />
                      )}
                    </button>
                  ) : col.srOnly ? (
                    <span className="sr-only">{col.header}</span>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
      )}
      <tbody>
        {showSkeleton ? (
          <TableSkeleton rows={loadingRows} cols={colSpan} />
        ) : showEmpty ? (
          <tr>
            <td colSpan={colSpan} className={isFixed || variant === "bare" ? "px-4 py-8" : undefined}>
              {emptyStateNode ?? (
                <p className={emptyState} style={{ color: tableColors.mutedText }}>
                  No records to display.
                </p>
              )}
            </td>
          </tr>
        ) : (
          sortedData.map((row, i) => (
            <tr
              key={keyOf(row)}
              className={clsx(
                isFixed && clsx(rowHover, rowTransition),
                isFixed && i < sortedData.length - 1 && clsx("border-b", rowBorder),
                onRowClick && "cursor-pointer",
                rowClassName?.(row, i),
              )}
              style={rowStyle?.(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              {...rowProps?.(row, i)}
            >
              {visibleColumns.map((col) => {
                const cellCls = typeof col.cellClassName === "function" ? col.cellClassName(row, i) : col.cellClassName;
                const alignStyle = col.align && col.align !== "left" ? { textAlign: col.align } : undefined;
                const dynStyle = col.cellStyle?.(row, i);
                const style = alignStyle || dynStyle ? { ...alignStyle, ...dynStyle } : undefined;
                return (
                  <td
                    key={col.key}
                    className={clsx(isFixed && bodyCell, cellCls)}
                    style={style}
                  >
                    {col.render(row, i)}
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </tbody>
      {hasFooter && !showEmpty && !showSkeleton && (
        <tfoot>
          <tr className={clsx("border-t", sectionBorder)}>
            {visibleColumns.map((col) => (
              <td
                key={col.key}
                className={clsx(isFixed && bodyCell, col.cellClassName)}
                style={col.align && col.align !== "left" ? { textAlign: col.align } : undefined}
              >
                {col.footer}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );

  const wrapped =
    wrap === "none" ? (
      table
    ) : wrap === "fixed" ? (
      <div className="@container overflow-auto" style={{ maxHeight, minHeight }}>
        {table}
      </div>
    ) : wrap === "container" ? (
      <div className="@container">{table}</div>
    ) : (
      <div className="@container overflow-x-auto">{table}</div>
    );

  return (
    <>
      {wrapped}
      {footer != null && <div className="mt-3">{footer}</div>}
    </>
  );
}
