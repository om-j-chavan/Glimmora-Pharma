/**
 * Escapes a value for safe interpolation into exported HTML.
 *
 * The Evidence and Governance modules build standalone .html report files by
 * string-concatenating user-controlled data (document titles, pack names,
 * tags, company name, RAID titles, resolutions). Without escaping, a value
 * like `<img src=x onerror=alert(1)>` becomes live markup in the exported
 * file — an HTML/script-injection vector that travels with the artifact to
 * inspectors. Always wrap user-supplied values with this helper.
 *
 * Escapes the five characters that are significant in both element-content
 * and attribute-value contexts, so the same helper is safe in either place.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
