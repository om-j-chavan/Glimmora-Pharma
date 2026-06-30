/**
 * Client-side table export helpers. `downloadCSV` writes a UTF-8 CSV (Excel
 * opens it natively); `downloadExcel` writes an .xls workbook as an HTML table
 * with the Excel MIME type; `downloadPDF` opens a print-ready window so the
 * browser's "Save as PDF" produces a polished document — all dependency-free.
 * Every function takes the same (headers, rows) shape so a caller can offer
 * any format from one row-builder. The shared menu UI lives in
 * `@/components/ui/ExportMenu`.
 */

import { escapeHtml } from "@/lib/escapeHtml";

export type Cell = string | number | null | undefined;

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toText(value: Cell): string {
  return value === null || value === undefined ? "" : String(value);
}

function escapeCsv(value: Cell): string {
  return `"${toText(value).replace(/"/g, '""')}"`;
}

export function downloadCSV(filename: string, headers: string[], rows: Cell[][]): void {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ];
  // Leading BOM so Excel reads UTF-8 (accents, °, ›) correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export function downloadExcel(filename: string, headers: string[], rows: Cell[][]): void {
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
    .join("");
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<head><meta charset="utf-8"></head><body><table border="1">${head}${body}</table></body></html>`;
  const blob = new Blob(["﻿" + html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".xls") ? filename : `${filename}.xls`);
}

export interface PdfOptions {
  /** Heading printed at the top of the document. Defaults to the filename. */
  title?: string;
  /** Secondary line under the title (e.g. row count, generated date). */
  subtitle?: string;
  /** Footer label, typically the organisation name. */
  org?: string;
}

/**
 * Build the self-contained, print-styled HTML document for a table. Kept
 * separate so the popup-blocked fallback can reuse the exact same markup.
 */
function buildPdfHtml(
  title: string,
  subtitle: string | undefined,
  org: string | undefined,
  headers: string[],
  rows: Cell[][],
): string {
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows.length
    ? rows
        .map(
          (r, i) =>
            `<tr class="${i % 2 ? "alt" : ""}">${r
              .map((c) => `<td>${escapeHtml(c)}</td>`)
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td class="empty" colspan="${headers.length}">No data to export</td></tr>`;

  // Inline @media print rules + an auto-print script so the new window prints
  // itself once rendered, then closes after the dialog is dismissed. Modern,
  // responsive layout with zebra striping and a branded header/footer.
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(title)}</title><style>` +
    `*{box-sizing:border-box}` +
    `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#0a1628;margin:0;padding:32px}` +
    `header{border-bottom:2px solid #0ea5e9;padding-bottom:14px;margin-bottom:20px}` +
    `h1{font-size:20px;font-weight:700;margin:0 0 4px}` +
    `.sub{color:#475569;font-size:12px;margin:0}` +
    `table{width:100%;border-collapse:collapse;font-size:11px}` +
    `thead tr{background:#0a1f38}` +
    `th{padding:8px 10px;text-align:left;color:#cbd5e1;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;border:1px solid #1e3a5a}` +
    `td{padding:7px 10px;border:1px solid #e2e8f0;vertical-align:top}` +
    `tr.alt td{background:#f8fafc}` +
    `td.empty{text-align:center;color:#94a3b8;padding:24px}` +
    `footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8}` +
    `@media print{body{padding:0}thead{display:table-header-group}tr{break-inside:avoid}}` +
    `</style></head><body>` +
    `<header><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}</header>` +
    `<table><thead>${head}</thead><tbody>${body}</tbody></table>` +
    `<footer>${escapeHtml(org ?? "Pharma Glimmora")} · ${rows.length} row${rows.length === 1 ? "" : "s"}</footer>` +
    `<script>window.onload=function(){window.focus();window.print();};window.onafterprint=function(){window.close();};</script>` +
    `</body></html>`
  );
}

/**
 * Open a print-ready window for the table so the browser's native print
 * dialog can save it as a PDF. If the popup is blocked, fall back to
 * downloading the same document as an .html file the user can open and print.
 */
export function downloadPDF(
  filename: string,
  headers: string[],
  rows: Cell[][],
  options: PdfOptions = {},
): void {
  const title = options.title ?? filename;
  const html = buildPdfHtml(title, options.subtitle, options.org, headers, rows);

  const win = window.open("", "_blank", "width=1024,height=768");
  if (win && win.document) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }

  // Popup blocked — hand the user the printable document as a file instead.
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  triggerDownload(blob, filename.endsWith(".html") ? filename : `${filename}.html`);
}
