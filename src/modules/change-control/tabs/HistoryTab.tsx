"use client";

import { Clock } from "lucide-react";
import type { AuditLog as PrismaAuditLog } from "@prisma/client";
import dayjs from "@/lib/dayjs";

/**
 * Change Control detail — Status history tab. Renders the audit log
 * filtered to this CC's status transitions. Lazy-loaded by the modal
 * shell when the user first opens this tab.
 */
export function HistoryTab({
  history,
  loaded,
}: {
  history: PrismaAuditLog[];
  loaded: boolean;
}) {
  if (!loaded) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-[12px] py-6 text-center"
        style={{ color: "var(--text-muted)" }}
      >
        Loading history…
      </p>
    );
  }
  if (history.length === 0) {
    return (
      <p
        className="text-[12px] py-6 text-center italic"
        style={{ color: "var(--text-muted)" }}
      >
        No history recorded yet.
      </p>
    );
  }
  return (
    <ol role="list" className="space-y-2">
      {history.map((row) => {
        let parsed: Record<string, unknown> | null = null;
        if (row.newValue) {
          try {
            parsed = JSON.parse(row.newValue) as Record<string, unknown>;
          } catch {
            // leave parsed as null — render the raw newValue
          }
        }
        return (
          <li
            key={row.id}
            className="rounded-md p-2.5"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
            }}
          >
            <div className="flex items-center gap-2 mb-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <Clock className="w-3 h-3" aria-hidden="true" />
              <span>{dayjs(row.createdAt).format("DD MMM YYYY HH:mm")}</span>
              <span aria-hidden="true">·</span>
              <span>{row.userName}</span>
              {row.userRole && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{row.userRole.replace(/_/g, " ")}</span>
                </>
              )}
            </div>
            <p
              className="text-[12px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {row.action.replace(/_/g, " ")}
            </p>
            {parsed && (
              <p
                className="text-[11px] mt-0.5 whitespace-pre-wrap"
                style={{ color: "var(--text-secondary)" }}
              >
                {Object.entries(parsed)
                  .filter(([, v]) => v !== null && v !== undefined && v !== "")
                  .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
                  .join(" · ")}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
