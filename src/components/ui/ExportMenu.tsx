"use client";

/**
 * ExportMenu — a single "Export" button that opens a modern dropdown offering
 * CSV, Excel and PDF. One row-builder feeds all three formats:
 *
 *   <ExportMenu
 *     filename={`findings-${stamp}`}
 *     title="Findings register"
 *     headers={HEADERS}
 *     rows={buildRows}              // array or lazy () => Cell[][]
 *     onExported={(fmt, n) => toast.success(`Exported ${n} rows as ${fmt}`)}
 *   />
 *
 * Accessible: button is aria-haspopup="menu"; the list is role="menu" with
 * role="menuitem" children, closes on outside-click / Escape, supports
 * Arrow / Home / End keyboard navigation, and returns focus to the trigger.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Download, ChevronDown, FileText, FileSpreadsheet, FileType } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";
import { downloadCSV, downloadExcel, downloadPDF, type Cell } from "@/lib/exportTable";

export type ExportFormat = "csv" | "excel" | "pdf";

interface FormatMeta {
  label: string;
  desc: string;
  Icon: LucideIcon;
}

const FORMAT_META: Record<ExportFormat, FormatMeta> = {
  csv: { label: "CSV", desc: "Comma-separated · opens in Excel", Icon: FileText },
  excel: { label: "Excel", desc: "Native .xls workbook", Icon: FileSpreadsheet },
  pdf: { label: "PDF", desc: "Print-ready document", Icon: FileType },
};

const DEFAULT_FORMATS: ExportFormat[] = ["csv", "excel", "pdf"];

export interface ExportMenuProps {
  /** Base filename without extension (e.g. `findings-2026-06-08`). */
  filename: string;
  /** Column headers shared by every format. */
  headers: string[];
  /** Row data, or a lazy (optionally async) builder invoked when a format is
   *  chosen. Async lets a server-backed table assemble its FULL matching set
   *  before writing the file. */
  rows: Cell[][] | (() => Cell[][] | Promise<Cell[][]>);
  /** PDF document heading + footer org (also nice for screen context). */
  title?: string;
  subtitle?: string;
  org?: string;
  /** Trigger label. Defaults to "Export". */
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Which side of the trigger the menu aligns to. Defaults to "right". */
  align?: "left" | "right";
  /** Subset / ordering of formats to offer. Defaults to CSV, Excel, PDF. */
  formats?: ExportFormat[];
  /** Fired after a successful export with the chosen format and row count. */
  onExported?: (format: ExportFormat, rowCount: number) => void;
  className?: string;
}

export function ExportMenu({
  filename,
  headers,
  rows,
  title,
  subtitle,
  org,
  label = "Export",
  size = "sm",
  variant = "secondary",
  disabled = false,
  align = "right",
  formats = DEFAULT_FORMATS,
  onExported,
  className,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  // The trigger is the root's direct-child <button>; query it for refocus
  // rather than threading a ref through the (non-forwardRef) Button.
  function focusTrigger() {
    rootRef.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
  }

  // Close on outside click + Escape; focus the first item when opening.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        focusTrigger();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // Focus first menu item on open (next tick so the node exists).
    const id = window.setTimeout(() => itemRefs.current[0]?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(id);
    };
  }, [open]);

  async function resolveRows(): Promise<Cell[][]> {
    return typeof rows === "function" ? rows() : rows;
  }

  async function runExport(format: ExportFormat) {
    if (busy) return;
    setOpen(false);
    focusTrigger();
    setBusy(true);
    try {
      const data = await resolveRows();
      switch (format) {
        case "csv":
          downloadCSV(filename, headers, data);
          break;
        case "excel":
          downloadExcel(filename, headers, data);
          break;
        case "pdf":
          downloadPDF(filename, headers, data, { title: title ?? filename, subtitle, org });
          break;
      }
      onExported?.(format, data.length);
    } finally {
      setBusy(false);
    }
  }

  // Roving focus within the menu via arrow keys.
  function onMenuKeyDown(e: React.KeyboardEvent) {
    const last = formats.length - 1;
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      itemRefs.current[current < last ? current + 1 : 0]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      itemRefs.current[current > 0 ? current - 1 : last]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      itemRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      itemRefs.current[last]?.focus();
    }
  }

  return (
    <div ref={rootRef} className={clsx("relative inline-block", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        icon={Download}
        loading={busy}
        disabled={disabled || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ChevronDown
            className={clsx("w-3.5 h-3.5 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </span>
      </Button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`${label} format`}
          onKeyDown={onMenuKeyDown}
          className={clsx(
            "absolute top-full mt-1 z-30 min-w-[208px] rounded-lg py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
          style={{ background: "var(--bg-surface, var(--bg-elevated))", border: "1px solid var(--bg-border)" }}
        >
          {formats.map((fmt, i) => {
            const meta = FORMAT_META[fmt];
            return (
              <button
                key={fmt}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                onClick={() => runExport(fmt)}
                className={clsx(
                  "w-full flex items-start gap-2.5 px-3 py-2 text-left bg-transparent border-none cursor-pointer",
                  "outline-none hover:bg-(--bg-hover) focus-visible:bg-(--bg-hover)",
                )}
                style={{ color: "var(--text-primary)" }}
              >
                <meta.Icon className="w-4 h-4 mt-0.5 shrink-0 text-(--brand)" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-[12px] font-semibold leading-tight">{meta.label}</span>
                  <span className="text-[10.5px] leading-tight" style={{ color: "var(--text-muted)" }}>
                    {meta.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
