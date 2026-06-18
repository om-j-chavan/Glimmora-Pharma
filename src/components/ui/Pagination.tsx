"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

/**
 * Minimal reusable pagination control — count summary + Prev / page / Next.
 * Client-side (the caller slices its own data); value in/out is a 1-based page
 * number. Styling uses the shared CSS-variable tokens so it matches Button /
 * Dropdown. Returns null when there's nothing to page.
 */
export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  /** Singular noun for the count label, e.g. "document" → "documents". */
  itemLabel?: string;
  className?: string;
}

export function Pagination({ page, pageSize, total, onChange, itemLabel = "item", className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  if (total === 0) return null;

  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const plural = total === 1 ? itemLabel : `${itemLabel}s`;

  const btn =
    "inline-flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium rounded-md border transition-colors " +
    "border-(--bg-border) bg-(--bg-surface) text-(--text-primary) hover:bg-(--bg-hover) " +
    "disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

  return (
    <nav
      aria-label="Pagination"
      className={clsx("flex items-center justify-between gap-3 flex-wrap", className)}
    >
      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        Showing <span className="font-medium" style={{ color: "var(--text-primary)" }}>{from}–{to}</span> of{" "}
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>{total}</span> {plural}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => onChange(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
          Prev
        </button>
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }} aria-live="polite">
          Page <span className="font-medium" style={{ color: "var(--text-primary)" }}>{current}</span> of {totalPages}
        </span>
        <button
          type="button"
          className={btn}
          onClick={() => onChange(current + 1)}
          disabled={current >= totalPages}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
