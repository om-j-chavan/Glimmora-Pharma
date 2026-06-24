/**
 * Shared HTML-escape helper for client-side HTML/report exports.
 *
 * Escapes the five characters that can break out of HTML text content or a
 * quoted attribute value — & < > " ' — so user-/record-controlled strings can
 * never inject markup or script when an exported .html file is opened. `&` is
 * replaced first so the entity ampersands added afterwards aren't re-escaped
 * (no double-escaping). null/undefined → "" ; numbers are stringified.
 *
 * Single source of truth: every HTML-export path (Evidence pack, Governance
 * KPI / RAID reports, the table CSV/Excel/PDF exporter) imports THIS — no
 * per-module copies.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
