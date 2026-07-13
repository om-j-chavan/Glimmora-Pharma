"use client";

/**
 * ProgressBar — a compact, token-based completion indicator.
 *
 * Presentation only: pass a 0–1 `value` (or `met`/`total`) and it renders a
 * rounded track + fill. `tone` picks the fill color from design tokens so it
 * adapts to light/dark. Used by the Worklist readiness summary (met conditions
 * of total) — it does NOT compute readiness; the caller passes the numbers.
 */
export function ProgressBar({
  met,
  total,
  value,
  tone = "brand",
  className = "",
  "aria-label": ariaLabel,
}: {
  met?: number;
  total?: number;
  value?: number;
  tone?: "brand" | "done" | "waiting" | "blocked";
  className?: string;
  "aria-label"?: string;
}) {
  const ratio =
    value !== undefined
      ? value
      : total && total > 0
        ? (met ?? 0) / total
        : 0;
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  // Complete → always "done" green regardless of the requested tone.
  const fill = pct >= 100 ? "var(--status-done)" : tone === "brand" ? "var(--brand)" : `var(--status-${tone})`;
  return (
    <div
      className={`h-1.5 w-full rounded-full overflow-hidden ${className}`}
      style={{ background: "var(--bg-border)" }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, background: fill }}
      />
    </div>
  );
}
