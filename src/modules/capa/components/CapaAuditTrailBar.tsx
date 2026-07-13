"use client";

import { History } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { CapaAuditEntry } from "@/lib/queries/capas";
import { roleLabel } from "@/lib/labels/roles";

/**
 * Phase B — Zone 6. A collapsed audit-trail bar pinned at the bottom of the
 * CAPA detail page, visible on every tab. Read-only; the authoritative trail
 * lives in the Audit Trail module — this is a per-CAPA convenience view.
 */
function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .replace(/^capa_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CapaAuditTrailBar({
  entries,
  timezone,
  dateFormat,
}: {
  entries: CapaAuditEntry[];
  timezone: string;
  dateFormat: string;
}) {
  return (
    <details id="capa-audit-bar" className="mt-5 rounded-lg border" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
      <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
        <History className="w-3.5 h-3.5" aria-hidden="true" />
        Audit trail ({entries.length})
      </summary>
      <div className="px-3 pb-2 max-h-64 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="text-[11px] italic py-2" style={{ color: "var(--text-muted)" }}>No audit entries yet.</p>
        ) : (
          <ul className="list-none p-0 m-0">
            {entries.map((e) => (
              <li key={e.id} className="flex items-baseline gap-2 py-1 text-[11px]" style={{ borderTop: "1px solid var(--bg-border)" }}>
                <span className="font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{dayjs.utc(e.createdAt).tz(timezone).format(`${dateFormat} HH:mm`)}</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{humanizeAction(e.action)}</span>
                <span style={{ color: "var(--text-secondary)" }}>— {e.userName} ({e.userRole ? roleLabel(e.userRole) : "system"})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
