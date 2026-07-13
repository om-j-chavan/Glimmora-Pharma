"use client";

/**
 * AuditTab — module-scoped audit trail for the active FDA 483 event.
 *
 * Presentational. The parent fetches AuditLog rows server-side (cached
 * query scoped by eventId) and hands them in via `auditRows`, already
 * sorted DESC by createdAt. This tab groups them by day and renders a
 * chronological list.
 *
 * Spec (R2 item #23):
 *   - Header: "Audit trail" left + [Export] right.
 *     Export opens a CSV / Excel / PDF menu (ExportMenu) that serialises
 *     the visible audit rows client-side.
 *   - Day-grouped list, MOST RECENT FIRST.
 *   - Each row: [time HH:mm] [user name] [humanised action + recordTitle
 *     + optional short newValue].
 *   - Empty state when no audit activity yet.
 */

import { useMemo } from "react";
import { History } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { FDA483Event } from "@/types/fda483";
import { ExportMenu } from "@/components/ui/ExportMenu";

/**
 * Audit row shape — mirrors the columns the table renders. Parent
 * picks these fields from the Prisma AuditLog row server-side so we
 * don't ship oldValue / newValue / ipAddress to the client unless the
 * Detail column ends up needing them.
 */
export interface AuditTabRow {
  id: string;
  createdAt: string; // ISO
  userName: string;
  userRole?: string | null;
  action: string;
  recordTitle?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

export interface AuditTabProps {
  /** Active event — only the id is actually needed (the parent already
   *  filtered the rows), but the full event is passed for the table
   *  caption / CSV filename. */
  liveEvent: Pick<FDA483Event, "id" | "referenceNumber">;
  /** Audit rows scoped to this event, sorted DESC by createdAt. */
  auditRows: AuditTabRow[];
  /** Tenant timezone (IANA) for createdAt formatting. */
  timezone: string;
  /** Tenant date format token (dayjs). The body renders
   *  `${dateFormat} HH:mm` for full-precision audit timestamps. */
  dateFormat: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

/**
 * Convert an audit action key like "FDA483_EVENT_CREATED" into a human
 * sentence-cased label like "FDA 483 event created".
 *
 * Rules:
 *  - Split on underscores.
 *  - Preserve common all-uppercase acronyms (FDA, CAPA, RCA, QA, AGI,
 *    QMS, OOS, GMP, EMA, MHRA, WHO).
 *  - Glue a leading "FDA" + bare digits ("FDA", "483") into "FDA 483".
 *  - Lowercase everything else, then capitalise only the first character
 *    of the resulting sentence.
 */
const ACRONYMS = new Set([
  "FDA", "CAPA", "RCA", "QA", "AGI", "QMS", "OOS", "GMP",
  "EMA", "MHRA", "WHO", "CSV", "CSA", "DI", "RTM", "URS",
  "ID", "URL", "API", "SOP",
]);

function humaniseAction(action: string): string {
  if (!action) return "";
  const parts = action.split("_").filter(Boolean);
  const tokens: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    // Glue "FDA" + a bare numeric token ("483") into "FDA 483".
    if (p === "FDA" && i + 1 < parts.length && /^\d+$/.test(parts[i + 1])) {
      tokens.push(`FDA ${parts[i + 1]}`);
      i++;
      continue;
    }
    if (ACRONYMS.has(p)) {
      tokens.push(p);
    } else if (/^\d+$/.test(p)) {
      tokens.push(p);
    } else {
      tokens.push(p.toLowerCase());
    }
  }
  const sentence = tokens.join(" ").trim();
  if (!sentence) return action;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Decide whether a newValue string is short and readable enough to
 * surface as a muted suffix. Skips JSON blobs, multi-line payloads, and
 * anything that would visually drown the row.
 */
function isShortReadableValue(v: string | null | undefined): v is string {
  if (!v) return false;
  const trimmed = v.trim();
  if (!trimmed) return false;
  if (trimmed.length > 60) return false;
  if (trimmed.includes("\n")) return false;
  // Skip serialised JSON / objects — they're never user-friendly.
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return false;
  }
  return true;
}

interface DayGroup {
  /** Ordinal day key (e.g. "2026-05-30") for stable React keys + sort. */
  key: string;
  /** Display label formatted with the tenant date format. */
  label: string;
  rows: AuditTabRow[];
}

/* ── Component ────────────────────────────────────────────────────── */

export function AuditTab({
  liveEvent,
  auditRows,
  timezone,
  dateFormat,
}: AuditTabProps) {

  // Group rows by the day component of their tenant-local timestamp.
  // The parent guarantees DESC order, so iterating preserves
  // most-recent-first both across days and within each day.
  const grouped = useMemo<DayGroup[]>(() => {
    const buckets = new Map<string, DayGroup>();
    for (const row of auditRows) {
      const local = dayjs.utc(row.createdAt).tz(timezone);
      if (!local.isValid()) continue;
      const key = local.format("YYYY-MM-DD");
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          key,
          label: local.format(dateFormat),
          rows: [],
        };
        buckets.set(key, bucket);
      }
      bucket.rows.push(row);
    }
    // Map preserves insertion order; since auditRows is DESC, the first
    // bucket encountered for a given day is also the most recent day.
    return Array.from(buckets.values());
  }, [auditRows, timezone, dateFormat]);

  const EXPORT_HEADERS = ["Date / time", "User", "Role", "Action", "Record", "Detail"];
  function buildExportRows() {
    return auditRows.map((row) => [
      dayjs.utc(row.createdAt).tz(timezone).format(`${dateFormat} HH:mm`),
      row.userName,
      row.userRole ?? "",
      humaniseAction(row.action),
      row.recordTitle ?? "",
      isShortReadableValue(row.newValue) ? row.newValue : "",
    ]);
  }

  return (
    <section
      className="card p-5 space-y-5"
      aria-label="Audit trail for this event"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <History
            className="w-4 h-4"
            style={{ color: "var(--text-secondary)" }}
            aria-hidden="true"
          />
          <h2
            className="text-[14px] font-semibold m-0"
            style={{ color: "var(--text-primary)" }}
          >
            Audit trail
          </h2>
        </div>
        <ExportMenu
          filename={`audit-trail-${liveEvent.referenceNumber}-${dayjs().format("YYYY-MM-DD")}`}
          title={`Audit trail · ${liveEvent.referenceNumber}`}
          subtitle={`${auditRows.length} entries`}
          headers={EXPORT_HEADERS}
          rows={buildExportRows}
          disabled={auditRows.length === 0}
        />
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      {auditRows.length === 0 ? (
        <p
          className="text-[12px] italic py-6 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          No audit activity yet for this event.
        </p>
      ) : (
        <ol className="space-y-5 list-none p-0 m-0">
          {grouped.map((group) => (
            <li key={group.key} className="space-y-2">
              <h3
                className="text-[10px] uppercase tracking-wider font-semibold m-0"
                style={{ color: "var(--text-muted)" }}
              >
                {group.label}
              </h3>
              <ul className="space-y-1 list-none p-0 m-0">
                {group.rows.map((row) => {
                  const local = dayjs.utc(row.createdAt).tz(timezone);
                  const time = local.isValid() ? local.format("HH:mm") : "--:--";
                  const actionLabel = humaniseAction(row.action);
                  const showNewValue = isShortReadableValue(row.newValue);
                  return (
                    <li
                      key={row.id}
                      className="grid grid-cols-[56px_minmax(110px,160px)_1fr] gap-3 items-start py-1.5 px-1 rounded-md hover:bg-(--bg-elevated) transition-colors"
                    >
                      <span
                        className="text-[11px] font-mono tabular-nums"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {time}
                      </span>
                      <span
                        className="text-[12px] font-medium truncate"
                        style={{ color: "var(--text-secondary)" }}
                        title={row.userName}
                      >
                        {row.userName}
                      </span>
                      <span
                        className="text-[12px] leading-snug"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span className="font-medium">{actionLabel}</span>
                        {row.recordTitle ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="mx-1.5"
                              style={{ color: "var(--text-muted)" }}
                            >
                              &bull;
                            </span>
                            <span
                              className="font-mono"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {row.recordTitle}
                            </span>
                          </>
                        ) : null}
                        {showNewValue ? (
                          <span
                            className="ml-2 text-[11px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {row.newValue}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
