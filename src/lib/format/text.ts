/**
 * Text display formatters.
 *
 * DISPLAY-ONLY formatters. NEVER pass a value through these into a
 * canonicaliser/signing input or an audit-log value — doing so changes
 * signature hashes. Canonicaliser inputs must stay raw Date.toISOString().
 *
 * Matches the plain-TS convention of src/lib/labels/* (no deps).
 */

/**
 * Hard-truncate to `n` characters, appending an ellipsis when cut.
 *
 * Cuts at exactly `n` characters — it does NOT back up to a word boundary and
 * does NOT trim trailing whitespace before the ellipsis. Two other truncation
 * variants exist and are deliberately NOT merged here, because they render
 * different strings for the same input:
 *   - src/modules/dashboard/config/derive.ts — backs up to the last space
 *     (default max 64), so it breaks on word boundaries.
 *   - src/modules/fda-483/tabs/ObservationsListTab.tsx — cuts at `n - 1` and
 *     trimEnd()s, so it is one character shorter and drops a trailing space.
 * Keep those local. Do not "unify" them into this function without deciding,
 * per call site, that the changed output is acceptable.
 */
export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * `snake_case` status → `Title Case` words: "under_review" → "Under Review".
 *
 * Splits on `_` ONLY and upper-cases each word's first character, leaving the
 * rest of the word untouched — so an already-capitalised value passes through
 * unchanged rather than being lower-cased. Deliberately NOT the same as
 * titleCase() in src/lib/strings.ts, which lower-cases the remainder and also
 * treats spaces/commas/hyphens/slashes as word boundaries. The two are not
 * interchangeable; this one exists for DB status columns.
 */
export function prettyStatus(s: string): string {
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
