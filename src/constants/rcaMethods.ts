/**
 * Single source of truth for RCA-method values (Phase 1.5 enum unification).
 *
 * Canonical = the spaced human form. Before this, Deviation drifted to
 * "5Why"/"FaultTree"/"BarrierAnalysis" (no spaces) while CAPA/FDA-483/AI used
 * the spaced form — silent key-mismatch on any cross-module interchange.
 *
 * The VALUES are now identical everywhere. Per-module subsets below preserve
 * each module's existing option set (decision: keep subsets, unify values):
 *   • CAPA  — structured 5-Why/Fishbone/Fault-Tree + freetext "Other"; no Barrier Analysis.
 *   • Investigation (Deviation, FDA-483, AI) — structured methods incl. Barrier Analysis; no "Other".
 */
export const RCA_METHODS = ["5 Why", "Fishbone", "Fault Tree", "Barrier Analysis", "Other"] as const;
export type RCAMethod = (typeof RCA_METHODS)[number];

/** CAPA-supported subset (canonical values). */
export const CAPA_RCA_METHODS = ["5 Why", "Fishbone", "Fault Tree", "Other"] as const;
export type CapaRCAMethod = (typeof CAPA_RCA_METHODS)[number];

/** Investigation-module subset (Deviation, FDA-483, AI). */
export const INVESTIGATION_RCA_METHODS = ["5 Why", "Fishbone", "Fault Tree", "Barrier Analysis"] as const;
export type InvestigationRCAMethod = (typeof INVESTIGATION_RCA_METHODS)[number];

/** Dropdown options — value === label since the canonical value IS the human form. */
export const rcaMethodOptions = (methods: readonly string[]) =>
  methods.map((m) => ({ value: m, label: m }));
