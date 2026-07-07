/**
 * Readable display IDs (Stage 2). The UI NEVER exposes CUIDs. Every region and
 * framework is shown by a stable, human-readable id derived from its IMMUTABLE
 * key/value:
 *   - Region    → `REG-<VALUE>`  (e.g. REG-EMA)
 *   - Framework → `FMK-<KEY>`    (e.g. FMK-P11)
 *
 * DISPLAY-ONLY. These formatters read the immutable `value`/`key` and produce a
 * label string — they store nothing and are never parsed back into a key, so
 * the improved casing here does NOT change any stored `Framework.key` /
 * `RegulatoryRegion.value` (nor `Finding.framework`). The key portion is
 * uppercased for readability: a reserved key `p11` renders as `FMK-P11` but
 * still resolves to the same immutable `p11`; a custom key `eu-annex-1` renders
 * as `FMK-EU-ANNEX-1`.
 */

export const REGION_ID_PREFIX = "REG-";
export const FRAMEWORK_ID_PREFIX = "FMK-";

/** Readable region id, e.g. "EMA" → "REG-EMA" (value is already uppercase). */
export function regionDisplayId(value: string): string {
  return `${REGION_ID_PREFIX}${value.toUpperCase()}`;
}

/** Readable framework id, e.g. "p11" → "FMK-P11" (display casing only; the
 *  stored key stays lowercase and immutable). */
export function frameworkDisplayId(key: string): string {
  return `${FRAMEWORK_ID_PREFIX}${key.toUpperCase()}`;
}
