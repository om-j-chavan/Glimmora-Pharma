"use client";

import { useState } from "react";
import {
  Hash,
  Copy,
  ChevronRight,
  ChevronDown,
  Check,
  ArrowRight,
  LogIn,
  ShieldAlert,
  Globe,
} from "lucide-react";
import type { AuditLog } from "@prisma/client";
import { roleLabel } from "@/lib/labels/roles";

export type Severity = "critical" | "status_change" | "create" | "other";

interface Props {
  event: AuditLog;
  severity: Severity;
  /** Pre-formatted action label, e.g. "CAPA Closed". The label-formatting
   *  rules live in the parent so all the acronym fixups (CAPA, FDA, RCA…)
   *  stay in one place rather than getting duplicated per row. */
  actionLabel: string;
  /** Pre-formatted relative-or-absolute timestamp ("3m ago" / "12 May 2026 09:31"). */
  timestampLabel: string;
  /** Full ISO timestamp for the <time dateTime=…> attribute. */
  timestampIso: string;
}

/* Severity → colour treatment. The accent strip on the left edge of the row
   and the matching badge give the "how important is this" signal at a glance,
   replacing the old 2.5px dot that was easy to miss. */
const SEVERITY_ACCENT: Record<Severity, string> = {
  critical:      "border-l-(--status-blocked)",
  status_change: "border-l-(--status-waiting)",
  create:        "border-l-(--status-done)",
  other:         "border-l-(--status-pending)",
};

const SEVERITY_BADGE: Record<Severity, string> = {
  critical:      "text-(--status-blocked) bg-(--status-blocked-bg)",
  status_change: "text-(--status-waiting) bg-(--status-waiting-bg)",
  create:        "text-(--status-done) bg-(--status-done-bg)",
  other:         "text-(--status-pending) bg-(--status-pending-bg)",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical:      "Critical",
  status_change: "Status change",
  create:        "Create",
  other:         "Event",
};

/** Avatar initials — "Jane Doe" → "JD", "superadmin" → "SU". Anchors the
 *  "who" of each event with a stable, scannable visual element. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Login / OTP rows that represent a *failed* or blocked attempt. Used only
 *  for the icon + tint — it does NOT change severity classification or any
 *  filtering, which stay owned by the parent. */
const AUTH_FAILURE_RE = /FAIL|NO_SUCH|INACTIVE|BLOCKED|AMBIGUOUS|INTERNAL/i;

function truncateMiddle(s: string, head: number, tail: number): string {
  if (s.length <= head + tail + 1) return s;
  return s.slice(0, head) + "…" + s.slice(-tail);
}

export function AuditEventRow({ event, severity, actionLabel, timestampLabel, timestampIso }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasDiff = !!(event.oldValue || event.newValue);
  const isAuth = event.module === "auth";
  const isAuthFailure = isAuth && AUTH_FAILURE_RE.test(event.action);

  const copyRecordId = async () => {
    if (!event.recordId) return;
    try {
      await navigator.clipboard.writeText(event.recordId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — silently skip; the id is also visible inline */
    }
  };

  return (
    <li
      className={`relative border-l-[3px] px-5 py-3.5 hover:bg-(--bg-hover) group transition-colors ${SEVERITY_ACCENT[severity]}`}
    >
      <div className="flex items-start gap-3">
        {/* ── Who: avatar / auth icon. The strongest visual anchor on the row
            so "who did this / who logged in" reads instantly. */}
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            isAuthFailure
              ? "bg-(--status-blocked-bg) text-(--status-blocked)"
              : isAuth
                ? "bg-(--status-active-bg) text-(--status-active)"
                : "bg-(--brand-muted) text-(--brand)"
          }`}
          aria-hidden="true"
        >
          {isAuthFailure ? (
            <ShieldAlert className="h-4 w-4" />
          ) : isAuth ? (
            <LogIn className="h-4 w-4" />
          ) : (
            initials(event.userName)
          )}
        </div>

        {/* ── Main content */}
        <div className="flex-1 min-w-0">
          {/* Headline: the action is now the primary line + a severity badge,
              with the timestamp pinned right. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-[14px] font-semibold text-(--text-primary) leading-tight">
                {actionLabel}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_BADGE[severity]}`}
              >
                {SEVERITY_LABEL[severity]}
              </span>
            </div>
            <time
              dateTime={timestampIso}
              className="text-[11px] font-mono text-(--text-muted) shrink-0 leading-tight pt-0.5"
              title={timestampIso}
            >
              {timestampLabel}
            </time>
          </div>

          {/* Who-line: name · role · module — the "who + where" context. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-(--text-secondary) leading-tight">
            <span className="font-medium text-(--text-primary)">{event.userName}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-(--bg-elevated) text-(--text-secondary)">
              {event.userRole ? roleLabel(event.userRole) : "—"}
            </span>
            <span className="text-(--text-muted)" aria-hidden="true">·</span>
            <span className="font-mono text-[11px] text-(--brand)">{event.module}</span>
          </div>

          {/* Record-line: record title / id / IP (for logins). Kept on its own
              row so the who-line stays clean. */}
          {(event.recordTitle || event.recordId || event.ipAddress) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--text-muted) leading-tight">
              {event.recordTitle && (
                <span className="truncate max-w-[360px] text-(--text-secondary)" title={event.recordTitle}>
                  {event.recordTitle}
                </span>
              )}

              {event.recordId && (
                <span className="inline-flex items-center gap-1 font-mono" title={event.recordId}>
                  <Hash className="h-3 w-3" aria-hidden="true" />
                  <span>{truncateMiddle(event.recordId, 8, 4)}</span>
                  <button
                    type="button"
                    onClick={copyRecordId}
                    aria-label={copied ? "Record ID copied" : "Copy record ID to clipboard"}
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity border-none bg-transparent cursor-pointer p-0.5 -my-0.5 text-(--text-muted) hover:text-(--brand)"
                  >
                    {copied ? <Check className="h-3 w-3" aria-hidden="true" /> : <Copy className="h-3 w-3" aria-hidden="true" />}
                  </button>
                </span>
              )}

              {event.ipAddress && (
                <span className="inline-flex items-center gap-1 font-mono" title={`Source IP ${event.ipAddress}`}>
                  <Globe className="h-3 w-3" aria-hidden="true" />
                  {event.ipAddress}
                </span>
              )}
            </div>
          )}

          {/* Change: inline before→after preview so the "important change" is
              visible without expanding. The toggle reveals the full,
              wrap-safe side-by-side diff. */}
          {hasDiff && (
            <div className="mt-2">
              {!expanded && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono mb-1 min-w-0">
                  <span className="truncate max-w-[200px] line-through text-(--danger)">
                    {event.oldValue ?? "—"}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-(--text-muted)" aria-hidden="true" />
                  <span className="truncate max-w-[200px] text-(--success)">
                    {event.newValue ?? "—"}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls={`audit-diff-${event.id}`}
                className="inline-flex items-center gap-1 text-[11px] text-(--brand) hover:underline border-none bg-transparent cursor-pointer p-0 font-medium"
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3 w-3" aria-hidden="true" />
                )}
                {expanded ? "Hide change" : "View change"}
              </button>
            </div>
          )}

          {/* Expanded value diff — collapsed by default. Renders side-by-side
              before/after so the regulator can scan the delta without
              hunting through two rows. Empty side gets a "—" rather than a
              blank pane. */}
          {expanded && hasDiff && (
            <div
              id={`audit-diff-${event.id}`}
              className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 p-2.5 rounded-md bg-(--bg-elevated) border border-(--card-border) text-[11px]"
            >
              <div>
                <div className="text-[10px] uppercase tracking-wide text-(--text-muted) mb-1 font-semibold">Before</div>
                <pre className="font-mono text-(--danger) whitespace-pre-wrap break-all m-0">
                  {event.oldValue ?? "—"}
                </pre>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-(--text-muted) mb-1 font-semibold">After</div>
                <pre className="font-mono text-(--success) whitespace-pre-wrap break-all m-0">
                  {event.newValue ?? "—"}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
