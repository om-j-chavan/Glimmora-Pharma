/**
 * GAMP 5 category vocabulary — the single source of truth for WHICH categories
 * exist, their dropdown labels, and their one-line descriptions.
 *
 * Previously these lived in three unlinked places: the dropdown options and the
 * TS union in src/types/csv-csa.ts, the stage-scoping template keys in
 * src/actions/systems.ts, and a hardcoded description ternary in
 * RiskControlsPanel.tsx. All four now derive from the array below.
 *
 * ⚠️ WHAT THIS FILE DOES NOT OWN — category → validation stages.
 * STAGE_TEMPLATES stays in src/actions/systems.ts on purpose: it is server-side
 * validation-scoping behaviour, not display vocabulary, and it drives which
 * stages a system is created with. Those stage tallies are a HASHED sign-off
 * input (stagesApproved / stagesTotal, src/lib/signing.ts). This file only
 * type-checks that every category HAS a template — it never says what's in one.
 *
 * The set is deliberately {1, 3, 4, 5}. GAMP 5 retired Category 2, so it is not
 * offered. Note that `applicableStagesFor` (systems.ts) still falls back to the
 * Category-5 full V-model for any unrecognised value, so a legacy row carrying
 * something else is over-validated rather than under-validated. Do not "tidy"
 * that fallback away, and do not assume the DB only contains these four values —
 * gamp5Category is an unconstrained String column.
 */

export const GAMP5_CATEGORY_DEFS = [
  {
    value: "1",
    label: "Cat 1 — Infrastructure",
    description: "Infrastructure — minimal testing required",
  },
  {
    value: "3",
    label: "Cat 3 — Non-configured",
    description: "Non-configured — standard testing applies",
  },
  {
    value: "4",
    label: "Cat 4 — Configured software",
    description: "Configured software — configured items tested",
  },
  {
    value: "5",
    label: "Cat 5 — Custom software",
    description: "Custom software — full IQ/OQ/PQ required",
  },
] as const;

/** The canonical category keys, in display order. */
export const GAMP5_CATEGORY_VALUES = GAMP5_CATEGORY_DEFS.map((c) => c.value) as readonly GAMP5Category[];

export type GAMP5Category = (typeof GAMP5_CATEGORY_DEFS)[number]["value"];

/**
 * Dropdown options — the exact `{ value, label }` shape the Add/Edit System
 * modals already consume. Kept as a separate export so those call sites are
 * unchanged.
 */
export const GAMP5_CATEGORIES: readonly { value: GAMP5Category; label: string }[] =
  GAMP5_CATEGORY_DEFS.map((c) => ({ value: c.value, label: c.label }));

/**
 * Category → one-line description, as rendered on the system detail panel.
 *
 * Callers must preserve the historical fallback: an unrecognised (or absent)
 * category renders the Category-1 "Infrastructure" text, which is what the
 * original inline ternary did via its final `else` branch. See
 * GAMP5_DESCRIPTION_FALLBACK.
 */
export const GAMP5_DESCRIPTION: Record<string, string> = Object.fromEntries(
  GAMP5_CATEGORY_DEFS.map((c) => [c.value, c.description]),
);

/** What the original ternary rendered for "1" AND for any unmatched value. */
export const GAMP5_DESCRIPTION_FALLBACK = "Infrastructure — minimal testing required";
