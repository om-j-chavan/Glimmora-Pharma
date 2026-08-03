"use client";

/**
 * CAPA Single-QA Override — on-record visibility (Phase 2, PART B).
 *
 * Renders the CAPASODOverride rows that were actually USED on a CAPA. This is a
 * READ-ONLY record surface — it changes no gate logic; it only makes every waiver
 * plainly visible to an inspector (never behind a tooltip):
 *   - <SodOverrideBadge> — an inline note on the relevant card (RCA / alignment /
 *     close / effectiveness), filtered to that card's control(s).
 *   - <SodOverrideSummary> — the per-CAPA list of every waiver (control, who, when,
 *     reason code, justification, linked signature) for the Review tab.
 */

import { ShieldAlert } from "lucide-react";
import dayjs from "@/lib/dayjs";

type SodOverrideRow = NonNullable<
  import("@/store/capa.slice").CAPA["sodOverrides"]
>[number];

/** Human-readable label for each waived control. */
const CONTROL_LABEL: Record<string, string> = {
  RCA_APPROVAL: "RCA approval",
  RCA_EDITOR_APPROVER: "RCA approval (editor = approver)",
  RCA_REJECTION_OVERRIDE: "RCA rejection override",
  ALIGNMENT_OVERRIDE: "Alignment override",
  CLOSE_CREATOR: "Closure (closer = creator)",
  CLOSE_RCA_AUTHOR: "Closure (closer = RCA author)",
  EFFECTIVENESS: "Effectiveness review",
};

/** Human-readable label for each reason code. */
const REASON_LABEL: Record<string, string> = {
  SOLE_QA_ON_SITE: "Sole QA on site",
  SECOND_QA_UNAVAILABLE: "Second QA unavailable",
  OTHER: "Other",
};

function controlLabel(c: string): string {
  return CONTROL_LABEL[c] ?? c;
}
function reasonLabel(r: string): string {
  return REASON_LABEL[r] ?? r;
}

interface BadgeProps {
  overrides?: SodOverrideRow[];
  /** Only rows whose control is in this set render here. */
  controls: string[];
  className?: string;
}

/** Inline, plainly-visible note for a specific card's control(s). Renders nothing
 *  when no matching waiver was used (default-OFF tenants never have rows → no UI). */
export function SodOverrideBadge({ overrides = [], controls, className }: BadgeProps) {
  const rows = overrides.filter((o) => controls.includes(o.control));
  if (rows.length === 0) return null;
  return (
    <div className={className}>
      {rows.map((o) => (
        <div
          key={o.id}
          className="flex items-start gap-2 rounded-md px-2.5 py-1.5 text-[11px]"
          style={{ background: "var(--warning-bg, #fffbeb)", border: "1px solid var(--warning, #f59e0b)" }}
        >
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--warning, #b45309)" }} aria-hidden="true" />
          <span style={{ color: "var(--text-primary)" }}>
            <strong>{controlLabel(o.control)} under single-QA override</strong> by {o.actorName}
            {o.actorRole ? ` (${o.actorRole})` : ""} — {reasonLabel(o.reasonCode)}: &ldquo;{o.justification}&rdquo;
          </span>
        </div>
      ))}
    </div>
  );
}

interface SummaryProps {
  overrides?: SodOverrideRow[];
  timezone: string;
  dateFormat: string;
}

/** The per-CAPA inspector list of every single-QA waiver used on this record. */
export function SodOverrideSummary({ overrides = [], timezone, dateFormat }: SummaryProps) {
  if (overrides.length === 0) return null;
  return (
    <ul className="list-none p-0 m-0 space-y-2">
      {overrides.map((o) => (
        <li
          key={o.id}
          className="rounded-md px-2.5 py-2 text-[11px]"
          style={{ background: "var(--warning-bg, #fffbeb)", border: "1px solid var(--warning, #f59e0b)" }}
        >
          <p className="flex items-center gap-1.5 font-semibold" style={{ color: "var(--text-primary)" }}>
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--warning, #b45309)" }} aria-hidden="true" />
            {controlLabel(o.control)}
          </p>
          <p className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {o.actorName}{o.actorRole ? ` (${o.actorRole})` : ""}
            <span aria-hidden="true"> · </span>
            {dayjs.utc(o.createdAt).tz(timezone).format(`${dateFormat} HH:mm`)}
            <span aria-hidden="true"> · </span>
            {reasonLabel(o.reasonCode)}
            {o.signedRecordId ? <><span aria-hidden="true"> · </span>signature {o.signedRecordId.slice(0, 8)}</> : null}
          </p>
          <p className="mt-1 whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>&ldquo;{o.justification}&rdquo;</p>
        </li>
      ))}
    </ul>
  );
}
