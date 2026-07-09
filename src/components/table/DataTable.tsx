"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";
import { ExportMenu, type ExportFormat } from "@/components/ui/ExportMenu";
import type { Cell } from "@/lib/exportTable";

/**
 * <DataTable> — the standard management table. Config for the common case,
 * escape hatches for the rare one. Three action zones, all declared via config:
 *   Zone 2 — the control row (search + filter Dropdowns | clear + export + col-vis),
 *   Zone 3 — per-row actions (inline Toggle cells + a ⋮ menu column).
 * Show-more paging (no pagination). Explicit client|server data mode — in server
 * mode search / SORT / show-more all re-query the server (sort is whole-set, never
 * a wrong sort of only the loaded rows).
 *
 * NOTE: coexists with the legacy `@/components/shared/DataTable` during
 * migration — import this one from `@/components/table`.
 */

export type SortDir = "asc" | "desc";

export interface DataColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  width?: string;
  headerSrOnly?: boolean;
  /** Escape hatch: custom cell (also how inline Toggle cells are declared —
   *  return a <Toggle> that persists on change). Defaults to String(row[key]). */
  render?: (row: T) => ReactNode;
  /** Client-mode sort accessor (defaults to row[key]). */
  sortValue?: (row: T) => string | number;
  /** Plain-text value for CSV/PDF/Excel export (a rendered column has no text
   *  otherwise). Falls back to sortValue, then row[key]. Set to null to omit
   *  this column from exports (e.g. a purely visual/action cell). */
  exportValue?: ((row: T) => Cell) | null;
  /** Export header override (defaults to `label`). */
  exportHeader?: string;
}

export interface RowMenuItem {
  label: string;
  onClick?: () => void;
  icon?: LucideIcon;
  /** Destructive → grouped LAST below a divider, styled danger. */
  danger?: boolean;
  /** Disabled actions stay VISIBLE (greyed) with `disabledReason` shown — never
   *  silently hidden. */
  disabled?: boolean;
  disabledReason?: string;
}

export interface DataFilter<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  /** Client-mode match (defaults to String(row[key]) === value). Server mode
   *  sends { [key]: value } to the fetcher. */
  match?: (row: T, value: string) => boolean;
}

export interface ServerQuery {
  page: number; // 1-based; append pages
  pageSize: number;
  sort: { key: string; dir: SortDir } | null;
  search: string;
  filters: Record<string, string>;
}

export interface BulkAction<T> {
  label: string;
  onClick: (rows: T[]) => void | Promise<void>;
  variant?: "secondary" | "danger";
  icon?: LucideIcon;
  /** Batch-aware guard hook — return { ok:false, reason } to block + explain. */
  guard?: (rows: T[]) => { ok: boolean; reason?: string };
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  ariaLabel: string;

  /** Explicit data mode — bake in from day one. Default "client". */
  mode?: "client" | "server";
  /** client mode: all rows in memory. */
  data?: T[];
  /** server mode: search / sort / show-more re-query here. */
  fetcher?: (q: ServerQuery) => Promise<{ rows: T[]; total: number }>;
  /** server mode: optional SSR-provided first page. */
  initialData?: { rows: T[]; total: number };

  pageSize?: number; // default 10
  defaultSort?: { key: string; dir: SortDir };
  /** Minimum table-body height (px) so few/one-row tables don't collapse.
   *  Applied in the primitive; default 320. */
  minBodyHeight?: number;

  /** Zone 2 toolbar. */
  search?: { placeholder?: string; keys?: string[] };
  filters?: DataFilter<T>[];
  /** Enable the CSV / PDF / Excel export dropdown. Exports the CURRENTLY
   *  filtered + sorted set: the in-memory set in client mode, and — crucially —
   *  the FULL matching set from the server in server mode (paged through the
   *  fetcher, not just the loaded rows). */
  exportOptions?: {
    filename: string;
    /** PDF document heading (defaults to filename). */
    title?: string;
    /** Formats to offer (defaults to CSV, Excel, PDF). */
    formats?: ExportFormat[];
  };
  /** Show a column-visibility control in the toolbar right group. */
  columnToggle?: boolean;
  /** Extra controls rendered in the toolbar's RIGHT group, next to Export
   *  (e.g. a Refresh button) — kept out of the page header per the standard. */
  toolbarActions?: ReactNode;

  /** Zone 3. */
  onRowClick?: (row: T) => void;
  rowMenu?: (row: T) => RowMenuItem[];

  /** Optional bulk selection + contextual bulk bar. */
  bulk?: { actions: BulkAction<T>[]; enabled?: (row: T) => boolean };

  emptyState?: ReactNode;
  className?: string;
}

/* ── the ⋮ row menu, composed from the shared Dropdown atom ───────────────── */
function RowMenu({ items }: { items: RowMenuItem[] }) {
  if (!items.length) return null;
  const toOpt = (m: RowMenuItem): DropdownOption => ({
    value: m.label,
    label: m.label,
    icon: m.icon,
    danger: m.danger,
    disabled: m.disabled,
    // Disabled reason shown as visible subtext (never silently hidden).
    description: m.disabled ? m.disabledReason : undefined,
    onClick: m.disabled ? undefined : m.onClick,
  });
  const normal = items.filter((m) => !m.danger).map(toOpt);
  const danger = items.filter((m) => m.danger).map(toOpt);
  const sections = [
    ...(normal.length ? [{ options: normal }] : []),
    ...(danger.length ? [{ options: danger }] : []), // divider before the danger group
  ];
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dropdown
        actionMode
        hideCaret
        width="w-9"
        menuWidth="w-52"
        triggerLabel={<MoreVertical className="w-4 h-4" aria-hidden="true" />}
        sections={sections}
      />
    </div>
  );
}

function SortHeader({ label, state, onClick }: { label: ReactNode; state: SortDir | null; onClick: () => void }) {
  const Icon = state === "asc" ? ArrowUp : state === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 bg-transparent border-none cursor-pointer p-0 font-semibold"
      style={{ color: state ? "var(--brand)" : "inherit" }}
    >
      {label}
      <Icon className="w-3 h-3" aria-hidden="true" style={{ opacity: state ? 1 : 0.4 }} />
    </button>
  );
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    rowKey,
    ariaLabel,
    mode = "client",
    data = [],
    fetcher,
    initialData,
    pageSize = 10,
    defaultSort,
    minBodyHeight = 320,
    search,
    filters = [],
    exportOptions,
    columnToggle,
    toolbarActions,
    onRowClick,
    rowMenu,
    bulk,
    emptyState,
    className,
  } = props;

  const searchId = useId();
  const [rawSearch, setRawSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(defaultSort ?? null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Debounce the search box (matters most in server mode — one query per pause).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(rawSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const activeFilterCount = Object.values(filterValues).filter(Boolean).length;
  const anyFilter = debouncedSearch !== "" || activeFilterCount > 0;
  const clearAll = () => {
    setRawSearch("");
    setDebouncedSearch("");
    setFilterValues({});
  };

  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));

  /* ── CLIENT mode ──────────────────────────────────────────────────────── */
  const [clientCount, setClientCount] = useState(pageSize);
  // Reset the show-more window whenever the query changes.
  useEffect(() => { if (mode === "client") setClientCount(pageSize); }, [mode, debouncedSearch, filterValues, sort, pageSize]);

  const clientFiltered = useMemo(() => {
    if (mode !== "client") return [];
    let rows = data;
    const q = debouncedSearch.toLowerCase();
    if (q && search?.keys?.length) {
      rows = rows.filter((r) =>
        search.keys!.some((k) => String((r as Record<string, unknown>)[k] ?? "").toLowerCase().includes(q)),
      );
    }
    for (const f of filters) {
      const v = filterValues[f.key];
      if (!v) continue;
      rows = rows.filter((r) => (f.match ? f.match(r, v) : String((r as Record<string, unknown>)[f.key] ?? "") === v));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const acc = col?.sortValue ?? ((r: T) => (r as Record<string, unknown>)[sort.key] as string | number);
      rows = [...rows].sort((a, b) => {
        const av = acc(a); const bv = acc(b);
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [mode, data, debouncedSearch, search, filters, filterValues, sort, columns]);

  /* ── SERVER mode ──────────────────────────────────────────────────────── */
  const [serverRows, setServerRows] = useState<T[]>(initialData?.rows ?? []);
  const [serverTotal, setServerTotal] = useState<number>(initialData?.total ?? 0);
  const [serverPage, setServerPage] = useState(1);
  const [loading, setLoading] = useState(false);
  // A signature of everything that must RE-QUERY (not just re-slice) the server.
  const queryKey = JSON.stringify({ s: debouncedSearch, f: filterValues, so: sort });
  const firstRun = useRef(true);

  const runFetch = useCallback(
    async (page: number, append: boolean) => {
      if (!fetcher) return;
      setLoading(true);
      try {
        const res = await fetcher({ page, pageSize, sort, search: debouncedSearch, filters: filterValues });
        setServerTotal(res.total);
        setServerRows((prev) => (append ? [...prev, ...res.rows] : res.rows));
        setServerPage(page);
      } finally {
        setLoading(false);
      }
    },
    [fetcher, pageSize, sort, debouncedSearch, filterValues],
  );

  // Re-query from page 1 whenever search / SORT / filters change. Skip the very
  // first run if SSR already provided initialData.
  useEffect(() => {
    if (mode !== "server") return;
    if (firstRun.current) {
      firstRun.current = false;
      if (initialData) return; // SSR seeded page 1
    }
    void runFetch(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, queryKey]);

  /* ── unified view ─────────────────────────────────────────────────────── */
  const rows = mode === "client" ? clientFiltered.slice(0, clientCount) : serverRows;
  const total = mode === "client" ? clientFiltered.length : serverTotal;
  const shownCount = rows.length;
  const hasMore = shownCount < total;
  const loadMore = () => {
    if (mode === "client") setClientCount((c) => c + pageSize);
    else void runFetch(serverPage + 1, true);
  };
  /* ── Export (item 5): CSV / PDF / Excel of the CURRENTLY filtered + sorted
     set. Client mode uses the in-memory filtered set; server mode pages through
     the fetcher to assemble the WHOLE matching set (not just loaded rows). ── */
  const exportColumns = visibleColumns.filter((c) => c.exportValue !== null);
  const cellText = (c: DataColumn<T>, r: T): Cell => {
    if (c.exportValue) return c.exportValue(r);
    if (c.sortValue) return c.sortValue(r);
    const v = (r as Record<string, unknown>)[c.key];
    return v == null ? "" : (v as Cell);
  };
  const EXPORT_PAGE_CAP = 2000; // page guard against a runaway server export
  const gatherExportRows = async (): Promise<T[]> => {
    if (mode === "client") return clientFiltered;
    if (!fetcher) return serverRows;
    const first = await fetcher({ page: 1, pageSize, sort, search: debouncedSearch, filters: filterValues });
    const all = [...first.rows];
    const pages = Math.min(Math.ceil(first.total / pageSize), EXPORT_PAGE_CAP);
    const rest: Promise<{ rows: T[]; total: number }>[] = [];
    for (let p = 2; p <= pages; p++) {
      rest.push(fetcher({ page: p, pageSize, sort, search: debouncedSearch, filters: filterValues }));
    }
    for (const res of await Promise.all(rest)) all.push(...res.rows);
    return all;
  };
  const buildExportData = async (): Promise<Cell[][]> => {
    const data = await gatherExportRows();
    return data.map((r) => exportColumns.map((c) => cellText(c, r)));
  };

  // Two-state toggle (item 6): first click on a column sorts asc, every click
  // thereafter flips asc ⇄ desc. "Unsorted" survives only as the initial state
  // before any header is clicked — a header click never returns to it.
  const cycleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  };
  const sortState = (key: string): SortDir | null => (sort?.key === key ? sort.dir : null);

  /* ── bulk ─────────────────────────────────────────────────────────────── */
  const selectableRows = bulk ? rows.filter((r) => (bulk.enabled ? bulk.enabled(r) : true)) : [];
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(rowKey(r)));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectableRows.map(rowKey)));
  const toggleOne = (r: T) =>
    setSelected((prev) => {
      const n = new Set(prev);
      const k = rowKey(r);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  const selectedRows = rows.filter((r) => selected.has(rowKey(r)));

  const alignCls = (a?: DataColumn<T>["align"]) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className={className}>
      {/* ── Zone 2: control row (or the bulk bar when rows are selected) ── */}
      {bulk && selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          actions={bulk.actions}
          selectedRows={selectedRows}
          onClear={() => setSelected(new Set())}
        />
      ) : (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* LEFT group: search (grows) + filters */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px] flex-wrap">
            {search && (
              <div className="flex-1 min-w-[200px] max-w-sm">
                <Input
                  id={searchId}
                  type="search"
                  icon={Search}
                  aria-label={search.placeholder ?? "Search"}
                  placeholder={search.placeholder ?? "Search…"}
                  value={rawSearch}
                  onChange={(e) => setRawSearch(e.target.value)}
                />
              </div>
            )}
            {filters.map((f) => (
              <Dropdown
                key={f.key}
                value={filterValues[f.key] ?? ""}
                onChange={(v) => setFilterValues((prev) => ({ ...prev, [f.key]: v }))}
                width="w-44"
                placeholder={`All ${f.label.toLowerCase()}`}
                options={[{ value: "", label: `All ${f.label.toLowerCase()}` }, ...f.options]}
              />
            ))}
          </div>
          {/* RIGHT group: clear + export + column visibility */}
          <div className="flex items-center gap-2">
            {anyFilter && (
              <Button variant="ghost" size="sm" icon={X} onClick={clearAll}>Clear</Button>
            )}
            {exportOptions && exportColumns.length > 0 && (
              <ExportMenu
                filename={exportOptions.filename}
                title={exportOptions.title ?? exportOptions.filename}
                headers={exportColumns.map((c) => c.exportHeader ?? c.label)}
                rows={buildExportData}
                formats={exportOptions.formats}
                size="sm"
                variant="secondary"
                disabled={total === 0}
              />
            )}
            {toolbarActions}
            {columnToggle && (
              <Dropdown
                multi
                triggerLabel={<span className="inline-flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5" /> Columns</span>}
                width="w-36"
                menuWidth="w-52"
                values={columns.filter((c) => !hiddenCols.has(c.key)).map((c) => c.key)}
                onChangeMulti={(vals) => setHiddenCols(new Set(columns.filter((c) => !vals.includes(c.key)).map((c) => c.key)))}
                options={columns.map((c) => ({ value: c.key, label: c.label }))}
              />
            )}
          </div>
        </div>
      )}

      {/* ── the table ── */}
      <div className="bg-(--card-bg) border border-(--bg-border) rounded-xl overflow-hidden">
        {/* Minimum body height (item 7) keeps the layout stable with one/few
            rows — the table never collapses to a sliver. Applied in the
            primitive so every table inherits it; override via `minBodyHeight`. */}
        <div className="overflow-x-auto" style={{ minHeight: minBodyHeight }}>
          <table className="data-table w-full" aria-label={ariaLabel}>
            <thead>
              <tr>
                {bulk && (
                  <th className="w-10">
                    <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} className="cursor-pointer disabled:cursor-not-allowed align-middle accent-(--brand)" />
                  </th>
                )}
                {visibleColumns.map((c) => (
                  <th key={c.key} className={clsx(alignCls(c.align), c.width)} scope="col">
                    {c.headerSrOnly ? (
                      <span className="sr-only">{c.label}</span>
                    ) : c.sortable ? (
                      <SortHeader label={c.label} state={sortState(c.key)} onClick={() => cycleSort(c.key)} />
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
                {rowMenu && <th className="w-12"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + (bulk ? 1 : 0) + (rowMenu ? 1 : 0)}>
                    <div className="py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                      {loading ? "Loading…" : emptyState ?? (anyFilter ? "No rows match the current filter." : "No rows yet.")}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={rowKey(r)}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={onRowClick ? "cursor-pointer" : undefined}
                  >
                    {bulk && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={selected.has(rowKey(r))}
                          disabled={bulk.enabled ? !bulk.enabled(r) : false}
                          onChange={() => toggleOne(r)}
                          className="cursor-pointer disabled:cursor-not-allowed align-middle accent-(--brand)"
                        />
                      </td>
                    )}
                    {visibleColumns.map((c) => (
                      <td key={c.key} className={alignCls(c.align)}>
                        {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? "")}
                      </td>
                    ))}
                    {rowMenu && (
                      <td className="text-right">
                        <RowMenu items={rowMenu(r)} />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Show more (never pagination) ── */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-(--bg-border)">
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Showing {shownCount} of {total}
            </span>
            {hasMore && (
              <Button variant="ghost" size="sm" onClick={loadMore} loading={loading}>
                Show more ({total - shownCount} remaining)
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BulkBar<T>({
  count,
  actions,
  selectedRows,
  onClear,
}: {
  count: number;
  actions: BulkAction<T>[];
  selectedRows: T[];
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg flex-wrap" style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}>
      <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{count} selected</span>
      {actions.map((a, i) => {
        const guard = a.guard?.(selectedRows);
        const blocked = guard ? !guard.ok : false;
        return (
          <Button
            key={`${a.label}-${i}`}
            variant={a.variant === "danger" ? "danger" : "secondary"}
            size="sm"
            icon={a.icon}
            disabled={blocked}
            title={blocked ? guard?.reason : undefined}
            onClick={() => { if (!blocked) void a.onClick(selectedRows); }}
          >
            {a.label}
          </Button>
        );
      })}
      <Button variant="ghost" size="sm" onClick={onClear}>Clear selection</Button>
    </div>
  );
}
