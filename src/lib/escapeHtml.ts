/**
 * Shared HTML-escape helper for client-side HTML/report exports.
 *
 * The Evidence and Governance modules build standalone .html report files by
 * string-concatenating user-controlled data (document titles, pack names,
 * tags, company name, RAID titles, resolutions). Without escaping, a value
 * like `<img src=x onerror=alert(1)>` becomes live markup in the exported
 * file — an HTML/script-injection vector that travels with the artifact to
 * inspectors. Always wrap user-supplied values with this helper.
 *
 * Escapes the five characters that can break out of HTML text content or a
 * quoted attribute value — & < > " ' — so the same helper is safe in either
 * context. `&` is replaced first so the entity ampersands added afterwards
 * aren't re-escaped (no double-escaping). null/undefined → "" ; everything
 * else is stringified.
 *
 * Single source of truth: every HTML-export path (Evidence pack, Governance
 * KPI / RAID reports, the table CSV/Excel/PDF exporter) imports THIS — no
 * per-module copies.
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
