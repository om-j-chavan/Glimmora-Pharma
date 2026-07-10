# Tables

Two components, one look. They render identically — same row height, header
style, borders, hover, and empty state — because both consume
[`tableTokens.ts`](./tableTokens.ts), which mirrors the global `.data-table`
class in `src/index.css`. The Support Center queue is the reference; every
token is what that queue renders.

**The choice between them is about who owns the filter chrome, not about
appearance.**

## `DataTable` (widget) — `@/components/table`

Use it when the page is a **standalone list view**: search, filter dropdowns,
export, column visibility, and show-more paging all live **inside** the table.
Client or server data mode, bulk selection, and a per-row `⋮` menu are built in.

```tsx
import { DataTable, type DataColumn } from "@/components/table/DataTable";
```

Example: the Support Center queue (`src/modules/support/SupportQueue.tsx`).

## `DataTableBase` (primitive) — `@/components/table/DataTableBase`

Use it when **filters live at the page level and drive other UI** (charts,
grouped views, tabs), or when you need **grouped / sub-table layouts**. It
renders columns + data and nothing else — you own the toolbar, filtering, and
paging around it. Variants: `data-table` (default), `table-fixed`
(`<colgroup>` widths), and `bare` (embedded sub-tables inside your own card).

```tsx
// Canonical import:
import { DataTableBase, type Column } from "@/components/table/DataTableBase";

// Legacy path (still supported — re-exports the same component as `DataTable`):
import { DataTable, type Column } from "@/components/shared";
```

> The legacy `@/components/shared/DataTable` path and the `@/components/shared`
> barrel still export this primitive as `DataTable`. Existing imports keep
> working unchanged; new code should prefer `DataTableBase`.

Examples: Gap Register / Gap Evidence, the CAPA tracker, Evidence, Audit Trail.

## Editing the look

Change a visual value in **one** place — [`tableTokens.ts`](./tableTokens.ts) —
and both components move together. The `.data-table` class in `src/index.css`
owns the default chrome (sticky header, zebra striping, density `--row-py`); the
tokens mirror those values for the parts the components express in JSX (the
card shell, variant-specific cells, empty states, selection checkboxes). Keep
the two in sync when you touch either.
