/**
 * tableTokens — the single source of truth for the app's shared table look.
 *
 * The Support Center queue (src/modules/support/SupportQueue.tsx) is the
 * reference; every value here is what that queue renders. Both data tables
 * import these so the widget (@/components/table/DataTable) and the primitive
 * (@/components/table/DataTableBase, legacy-aliased at
 * @/components/shared/DataTable) can never visually drift apart again.
 *
 * The global `.data-table` class in src/index.css remains the CSS source of
 * truth for the DEFAULT chrome — sticky header, zebra striping, and the
 * density-driven `--row-py` row height. These tokens MIRROR those values for
 * the parts the components express in JSX instead of via that class:
 * variant-specific cells (the primitive's `table-fixed` / `bare` variants),
 * the card shell, empty states, and selection checkboxes. Keeping them here
 * means those JSX paths match the class rather than hardcoding their own
 * divergent literals.
 *
 * Values are Tailwind class strings (composed with `clsx`) except `tableColors`,
 * which are raw CSS custom properties for inline `style`.
 */

/** Card shell around a standalone table (widget) or an embedded sub-table. */
export const tableCard =
  "bg-(--card-bg) border border-(--bg-border) rounded-2xl overflow-hidden";

/**
 * Header cell chrome — matches `.data-table th` (padding, size, weight,
 * transform, color). Text-align is applied per-column by the caller, not here.
 */
export const headerCell =
  "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-(--text-muted)";

/** Body cell padding — matches `.data-table td`. */
export const bodyCell = "px-4 py-3";

/** Body text size — matches the `text-sm` on the `.data-table` element. */
export const bodyText = "text-sm";

/** Row hover fill — matches `.data-table tbody tr:hover`. */
export const rowHover = "hover:bg-(--bg-hover)";

/** Hover/press transition on interactive rows. */
export const rowTransition = "transition-colors";

/** Row divider — matches `.data-table tbody tr` bottom border. */
export const rowBorder = "border-(--card-border)";

/**
 * Header / footer / toolbar separators — matches `.data-table thead tr` and the
 * widget's "Show more" footer. Distinct from `rowBorder`: section rules use the
 * structural `--bg-border`, row dividers use the softer `--card-border`.
 */
export const sectionBorder = "border-(--bg-border)";

/** Empty / no-rows state text. */
export const emptyState = "py-10 text-center text-[13px]";

/** Selection checkbox styling (header select-all + per-row). */
export const selectionCheckbox =
  "cursor-pointer disabled:cursor-not-allowed align-middle accent-(--brand)";

/** Raw CSS custom properties the tables read from inline `style`. */
export const tableColors = {
  mutedText: "var(--text-muted)",
  brand: "var(--brand)",
  zebra: "var(--bg-elevated)",
  hover: "var(--bg-hover)",
  rowBorder: "var(--card-border)",
} as const;
