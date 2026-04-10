import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  srOnly?: boolean;
  width?: string;
  align?: "left" | "right" | "center";
  render: (row: T, index: number) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (row: T) => string;
  ariaLabel: string;
  caption?: string;
  variant?: "data-table" | "table-fixed";
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  keyFn,
  ariaLabel,
  caption,
  variant = "data-table",
  onRowClick,
  emptyState,
}: DataTableProps<T>) {
  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  const isFixed = variant === "table-fixed";

  return (
    <div className={isFixed ? "" : "overflow-x-auto"}>
      <table
        className={
          isFixed ? "w-full border-collapse table-fixed" : "data-table"
        }
        aria-label={ariaLabel}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        {isFixed && columns.some((c) => c.width) && (
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} className={col.width} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr className={isFixed ? "border-b border-(--bg-border)" : ""}>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={
                  isFixed
                    ? `px-4 py-3 text-${col.align ?? "left"} text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)`
                    : undefined
                }
                style={
                  col.align === "right" ? { textAlign: "right" } : undefined
                }
              >
                {col.srOnly ? (
                  <span className="sr-only">{col.header}</span>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={keyFn(row)}
              className={
                isFixed
                  ? `hover:bg-(--bg-surface) transition-colors ${i < data.length - 1 ? "border-b border-(--bg-border)" : ""}`
                  : onRowClick
                    ? "cursor-pointer"
                    : ""
              }
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={
                    isFixed
                      ? `px-4 py-3${col.align === "right" ? " text-right" : ""}`
                      : undefined
                  }
                  style={
                    !isFixed && col.align === "right"
                      ? { textAlign: "right" }
                      : undefined
                  }
                >
                  {col.render(row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
