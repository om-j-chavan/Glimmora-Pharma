"use client";

import { AlertCircle, AlertOctagon, Clock, Info } from "lucide-react";
import { isHardGateRisk, type CCDependencyState } from "@/lib/cc-dependencies";
import type { CAPA } from "@/store/capa.slice";

/* ── Substage 6.4 — Linked-CC dependency banner ──
 *
 * Informational, mirrors the four cases evaluated by canMarkCAPAImplemented():
 *
 *   1. Blocked (Rejected CC)        → danger variant, hard-block messaging.
 *   2. Hard-gate (Critical/High)    → warning variant, hard-block messaging.
 *   3. Soft-gate (Medium/Low)       → info variant, override-with-reason path.
 *   4. Otherwise overdue ≥ 1        → mild warning variant, scheduling nudge.
 *
 * Hidden entirely when there's no incomplete / overdue / blocked CC.
 */
export function CCDependencyBanner({
  capa,
  deps,
}: {
  capa: CAPA;
  deps: CCDependencyState;
}) {
  if (
    deps.incompleteCount === 0 &&
    deps.overdueCount === 0 &&
    deps.blockedCount === 0
  ) {
    return null;
  }

  type Variant = "blocked" | "hard" | "soft" | "overdue";
  let variant: Variant;
  if (deps.blockedCount > 0) variant = "blocked";
  else if (deps.incompleteCount > 0 && isHardGateRisk(capa.risk)) variant = "hard";
  else if (deps.incompleteCount > 0) variant = "soft";
  else variant = "overdue";

  const palette: Record<
    Variant,
    {
      Icon: typeof AlertOctagon;
      bg: string;
      border: string;
      fg: string;
      title: string;
      body: string;
    }
  > = {
    blocked: {
      Icon: AlertCircle,
      bg: "var(--danger-bg)",
      border: "var(--danger)",
      fg: "var(--danger)",
      title: `${deps.blockedCount} linked change control${deps.blockedCount === 1 ? "" : "s"} rejected — blocks CAPA closure`,
      body:
        "Rejected CCs cannot satisfy a CAPA dependency. Unlink the rejected CC or initiate a replacement Change Control before this CAPA can be sealed. No override path exists.",
    },
    hard: {
      Icon: AlertOctagon,
      bg: "var(--warning-bg)",
      border: "var(--warning)",
      fg: "var(--warning)",
      title: `${deps.incompleteCount} linked change control${deps.incompleteCount === 1 ? "" : "s"} not yet implemented — blocks CAPA closure`,
      body: `${capa.risk} risk CAPAs require all linked Change Controls to reach Implemented or Closed before sign-off. No override is available at this risk tier.`,
    },
    soft: {
      Icon: Info,
      bg: "var(--info-bg)",
      border: "var(--brand-border)",
      fg: "var(--brand)",
      title: `${deps.incompleteCount} linked change control${deps.incompleteCount === 1 ? "" : "s"} still incomplete`,
      body: `${capa.risk} risk CAPAs may proceed with an explicit override. The Sign & Close action will require an override reason of at least 20 characters, recorded against the CAPA and the audit trail.`,
    },
    overdue: {
      Icon: Clock,
      bg: "var(--warning-bg)",
      border: "var(--warning)",
      fg: "var(--warning)",
      title: `${deps.overdueCount} linked change control${deps.overdueCount === 1 ? "" : "s"} overdue`,
      body:
        "Target implementation date has passed but the CC has not yet reached Implemented or Closed. Coordinate with the CC owner to update the schedule.",
    },
  };

  const { Icon, bg, border, fg, title, body } = palette[variant];
  const overdueChip =
    variant !== "overdue" && deps.overdueCount > 0
      ? ` · ${deps.overdueCount} overdue`
      : "";

  return (
    <div
      role={variant === "blocked" || variant === "hard" ? "alert" : "status"}
      className="flex items-start gap-2.5 p-3 rounded-lg border mb-3"
      style={{ background: bg, borderColor: border }}
    >
      <Icon
        className="w-4 h-4 shrink-0 mt-0.5"
        style={{ color: fg }}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold" style={{ color: fg }}>
          {title}
          {overdueChip && (
            <span
              className="ml-1 font-normal"
              style={{ color: "var(--text-secondary)" }}
            >
              {overdueChip}
            </span>
          )}
        </p>
        <p
          className="text-[11px] mt-0.5"
          style={{ color: "var(--text-secondary)" }}
        >
          {body}
        </p>
      </div>
    </div>
  );
}
