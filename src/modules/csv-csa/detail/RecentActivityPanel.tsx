"use client";

/**
 * Recent activity for one GxP system.
 *
 * Extracted verbatim from the inline JSX that lived in SystemDetailPage
 * (step 1 of the detail-page consolidation). Same rows, same formatting, same
 * audit-trail deep link — it simply has a name and a file now.
 *
 * PURE DISPLAY. It reads the `recentActivity` rows the page already receives
 * from the server and renders them; it calls no action and computes nothing
 * that feeds a KPI or a signature.
 */

import { Clock } from "lucide-react";
import dayjs from "@/lib/dayjs";

export interface RecentActivityRow {
  id: string;
  action: string;
  userName: string;
  createdAt: string;
  newValue?: string;
}

export interface RecentActivityPanelProps {
  rows: RecentActivityRow[];
  timezone: string;
  dateFormat: string;
  /** Deep link to the module-scoped audit trail for this system. */
  onOpenAuditTrail: () => void;
}

export function RecentActivityPanel({
  rows,
  timezone,
  dateFormat,
  onOpenAuditTrail,
}: RecentActivityPanelProps) {
  const auditLink = (
    <button
      type="button"
      onClick={onOpenAuditTrail}
      className="text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0"
    >
      &rarr; Full audit trail for this system
    </button>
  );

  /*
   * EMPTY STATE (step 3) — a fresh system has no activity, and a full card
   * whose only content is the words "No recent activity." is scaffolding, not
   * information. Collapsed to one muted line.
   *
   * The audit-trail link is deliberately KEPT: it rendered unconditionally
   * before, and it is still meaningful on a system with no CSV-module activity
   * yet (the trail may hold entries from elsewhere). Hiding the card outright
   * would have removed a working affordance, which is not an empty-state fix.
   */
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 px-1 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] italic" style={{ color: "var(--text-muted)" }}>
          <Clock className="w-3.5 h-3.5" style={{ color: "#64748b" }} aria-hidden="true" />
          No recent activity yet.
        </span>
        {auditLink}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" style={{ color: "#64748b" }} aria-hidden="true" />
          <span className="card-title">Recent activity</span>
        </div>
      </div>
      <div className="card-body">
        <ul className="space-y-1.5">
          {rows.map((a) => (
            <li key={a.id} className="text-[11px] flex items-center justify-between gap-2">
              <span style={{ color: "var(--text-secondary)" }}>
                {a.action.replace(/_/g, " ").toLowerCase()}
                {a.newValue ? ` · ${a.newValue.slice(0, 40)}` : ""}
              </span>
              <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                {a.userName} · {dayjs.utc(a.createdAt).tz(timezone).format(dateFormat)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2">{auditLink}</div>
      </div>
    </div>
  );
}
