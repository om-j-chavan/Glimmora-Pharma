/**
 * FDA 483 Response Package — document generator.
 *
 * WHY THIS EXISTS SEPARATELY FROM lib/exportTable.ts
 * --------------------------------------------------
 * The package used to be rendered by the shared `downloadPDF()`, which is a
 * GENERIC zebra-striped table renderer. A seven-column table is the wrong shape
 * for a regulatory response package: an observation's text is a paragraph, not a
 * cell, so it wrapped into an unreadable column while the short fields wasted a
 * third of the page. `downloadPDF` is also used by ExportMenu (every table in the
 * app) and the Evidence module, so restyling it there would have changed every
 * other module's export. This module-local builder leaves that shared path
 * untouched.
 *
 * GENERATION APPROACH — print-styled HTML + the browser's print dialog.
 * There is NO PDF library in this project (no jspdf / pdfkit / puppeteer in
 * package.json or node_modules). The established, working mechanism here is to
 * open a self-contained print-styled HTML document and let the user "Save as
 * PDF" from the native print dialog, with a popup-blocked fallback that hands
 * them the same document as an .html file. That is exactly what
 * `downloadPDF` / `downloadLetterPDF` do (exportTable.ts:122, :200) and this
 * follows the same contract — no new dependency.
 *
 * PAGE NUMBERS: Chrome does not implement `@page` margin boxes, so
 * `counter(page)` cannot be rendered by the document itself. Page numbering is
 * supplied by the browser's own print header/footer (on by default in the print
 * dialog). The fixed footer below carries the identifying context instead.
 *
 * DATA: this file only LAYS OUT what the caller passes. It selects nothing,
 * computes nothing, and transforms no value — every field is escaped and
 * printed verbatim.
 */

export type PackageCell = string | number | null | undefined;

export interface ResponsePackageObservation {
  number: PackageCell;
  text: PackageCell;
  severity: PackageCell;
  area: PackageCell;
  regulation: PackageCell;
  rootCause: PackageCell;
  capaReference: PackageCell;
}

export interface ResponsePackageMeta {
  /** Event reference, e.g. "483-MUM-2026-004". */
  reference: string;
  /** Issuing agency, e.g. "FDA". */
  agency?: string;
  /** Event status, printed verbatim — never re-worded or re-mapped. */
  status: string;
  /** Pre-formatted generated-on string. The CALLER owns format + timezone. */
  generatedOn?: string;
  /** Organisation name for the letterhead + footer. */
  org?: string;
}

const DEFAULT_ORG = "Pharma Glimmora";

/** Local copy — `escapeHtml` in exportTable.ts is module-private. */
function esc(v: PackageCell): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Preserve author line breaks inside a prose block without allowing markup. */
function escMultiline(v: PackageCell): string {
  const s = esc(v);
  return s ? s.replace(/\n/g, "<br/>") : "";
}

/** Severity → print-safe accent. Presentation only; the LABEL is printed as-is. */
function severityAccent(severity: PackageCell): string {
  switch (String(severity ?? "").toLowerCase()) {
    case "critical": return "#b91c1c";
    case "high": return "#b45309";
    case "medium": return "#0369a1";
    case "low": return "#047857";
    default: return "#475569";
  }
}

function buildStyles(): string {
  return (
    // A4 with a generous margin so the fixed footer never collides with content.
    `@page{size:A4;margin:16mm 15mm 20mm}` +
    `*{box-sizing:border-box}` +
    `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;` +
    `color:#0f172a;font-size:11px;line-height:1.55;margin:0;padding:0}` +

    /* ── Letterhead ── */
    `.sheet{padding:0 0 22mm}` +
    `.head{border-bottom:3px solid #0a1f38;padding-bottom:12px;margin-bottom:16px}` +
    `.head .org{font-size:15px;font-weight:700;color:#0a1f38;letter-spacing:.02em}` +
    `.head h1{font-size:17px;font-weight:700;margin:8px 0 2px;color:#0f172a}` +
    `.head .kicker{font-size:10px;font-weight:600;text-transform:uppercase;` +
    `letter-spacing:.09em;color:#0ea5e9;margin:0}` +

    /* ── Meta strip ── */
    `.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 14px;` +
    `margin:0 0 20px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px}` +
    `.meta dt{font-size:8.5px;font-weight:700;text-transform:uppercase;` +
    `letter-spacing:.07em;color:#64748b;margin:0 0 2px}` +
    `.meta dd{font-size:11px;font-weight:600;color:#0f172a;margin:0;word-break:break-word}` +

    /* ── Section headings ── */
    `h2{font-size:12px;font-weight:700;color:#0a1f38;margin:0 0 10px;` +
    `padding-bottom:5px;border-bottom:1px solid #cbd5e1;` +
    `text-transform:uppercase;letter-spacing:.05em}` +

    /* ── Observation blocks ── */
    `.obs{border:1px solid #e2e8f0;border-radius:6px;margin:0 0 12px;` +
    `break-inside:avoid;page-break-inside:avoid;overflow:hidden}` +
    `.obs-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;` +
    `padding:7px 11px;background:#f1f5f9;border-bottom:1px solid #e2e8f0}` +
    `.obs-no{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;` +
    `font-size:11px;font-weight:700;color:#0a1f38}` +
    `.sev{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;` +
    `padding:2px 7px;border-radius:9px;border:1px solid currentColor}` +
    `.obs-body{padding:10px 11px}` +
    `.field{margin:0 0 9px}` +
    `.field:last-child{margin-bottom:0}` +
    `.field dt{font-size:8.5px;font-weight:700;text-transform:uppercase;` +
    `letter-spacing:.07em;color:#64748b;margin:0 0 2px}` +
    `.field dd{margin:0;font-size:11px;color:#0f172a;white-space:pre-wrap}` +
    `.field dd.prose{text-align:justify}` +
    `.muted{color:#94a3b8;font-style:italic}` +
    `.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600}` +
    `.pair{display:grid;grid-template-columns:1fr 1fr;gap:9px 14px}` +
    `.empty{padding:26px;text-align:center;color:#94a3b8;font-style:italic;` +
    `border:1px dashed #cbd5e1;border-radius:6px}` +

    /* ── Fixed footer, repeats on every printed page ── */
    `.foot{position:fixed;left:0;right:0;bottom:0;padding-top:5px;` +
    `border-top:1px solid #e2e8f0;font-size:8.5px;color:#94a3b8;` +
    `display:flex;justify-content:space-between;gap:12px;background:#fff}` +

    `@media print{.obs{break-inside:avoid}}`
  );
}

function buildMetaStrip(meta: ResponsePackageMeta, obsCount: number): string {
  const items: [string, string][] = [
    ["Reference", esc(meta.reference)],
    ...(meta.agency ? ([["Agency", esc(meta.agency)]] as [string, string][]) : []),
    ["Status", esc(meta.status)],
    ["Observations", String(obsCount)],
    ...(meta.generatedOn ? ([["Generated", esc(meta.generatedOn)]] as [string, string][]) : []),
  ];
  return (
    `<dl class="meta">` +
    items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("") +
    `</dl>`
  );
}

function buildObservation(o: ResponsePackageObservation): string {
  const accent = severityAccent(o.severity);
  const sev = esc(o.severity);
  const orDash = (v: PackageCell, cls = "") => {
    const s = esc(v);
    return s && s !== "—" ? `<span class="${cls}">${s}</span>` : `<span class="muted">Not recorded</span>`;
  };
  return (
    `<section class="obs">` +
      `<div class="obs-head">` +
        `<span class="obs-no">Observation #${esc(o.number)}</span>` +
        (sev ? `<span class="sev" style="color:${accent}">${sev}</span>` : "") +
      `</div>` +
      `<div class="obs-body">` +
        `<div class="field"><dt>Observation</dt>` +
        `<dd class="prose">${escMultiline(o.text) || `<span class="muted">Not recorded</span>`}</dd></div>` +
        `<div class="pair">` +
          `<div class="field"><dt>Area</dt><dd>${orDash(o.area)}</dd></div>` +
          `<div class="field"><dt>Regulation</dt><dd>${orDash(o.regulation)}</dd></div>` +
        `</div>` +
        `<div class="field"><dt>Root cause</dt>` +
        `<dd class="prose">${escMultiline(o.rootCause) || `<span class="muted">Not recorded</span>`}</dd></div>` +
        `<div class="field"><dt>Linked CAPA</dt><dd>${orDash(o.capaReference, "mono")}</dd></div>` +
      `</div>` +
    `</section>`
  );
}

export function buildResponsePackageHtml(
  title: string,
  observations: ResponsePackageObservation[],
  meta: ResponsePackageMeta,
): string {
  const org = esc(meta.org ?? DEFAULT_ORG);
  const body = observations.length
    ? observations.map(buildObservation).join("")
    : `<p class="empty">No observations recorded for this event.</p>`;

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title><style>${buildStyles()}</style></head><body>` +
    `<div class="sheet">` +
      `<header class="head">` +
        `<div class="org">${org}</div>` +
        `<p class="kicker">Regulatory Response Package</p>` +
        `<h1>${esc(title)}</h1>` +
      `</header>` +
      buildMetaStrip(meta, observations.length) +
      `<h2>Observations &amp; Root Cause Analysis</h2>` +
      body +
    `</div>` +
    `<footer class="foot">` +
      `<span>${org} &middot; ${esc(meta.reference)}</span>` +
      `<span>Confidential &mdash; for regulatory response use</span>` +
    `</footer>` +
    `<script>window.onload=function(){window.focus();window.print();};` +
    `window.onafterprint=function(){window.close();};</script>` +
    `</body></html>`
  );
}

/**
 * Open the print-ready package so the browser's print dialog can save it as a
 * PDF. Popup blocked → download the same document as .html. Identical contract
 * to `downloadPDF` / `downloadLetterPDF` (exportTable.ts:131-141).
 */
export function downloadResponsePackagePDF(
  filename: string,
  title: string,
  observations: ResponsePackageObservation[],
  meta: ResponsePackageMeta,
): void {
  const html = buildResponsePackageHtml(title, observations, meta);

  const win = window.open("", "_blank", "width=1024,height=768");
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
