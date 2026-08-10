/**
 * Shared display formatters.
 *
 * DISPLAY-ONLY formatters. NEVER pass a value through these into a
 * canonicaliser/signing input or an audit-log value — doing so changes
 * signature hashes. Canonicaliser inputs must stay raw Date.toISOString().
 *
 * ── Scope ──────────────────────────────────────────────────────────
 * This folder holds ONLY helpers that were byte-identical in several places.
 * Variants that render differently for the same input stay where they are, on
 * purpose — see the note on each function. Merging a drifted variant in here
 * silently changes what a user sees, which in a GxP record is a defect, not a
 * tidy-up.
 *
 * Date formatting deliberately does NOT live here. src/lib/dates.ts is
 * locale-independent and timezone-naive by design, while tenant-facing surfaces
 * use `dayjs.utc(v).tz(org.timezone).format(org.dateFormat)` directly. Those two
 * disagree near midnight and must not be unified without a per-surface review.
 *
 * Convention note: src/lib/labels/ has no barrel — its consumers import the
 * specific file. Call sites here do the same (`@/lib/format/text`,
 * `@/lib/format/bytes`); this barrel is a convenience, not the required path.
 */

export { truncate, prettyStatus } from "./text";
export { formatBytes } from "./bytes";
