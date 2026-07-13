"use client";

import { AlertOctagon, Info } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { isHardGateRisk } from "@/lib/cc-dependencies";
import type { CCDetail } from "../_shared";

/* ── Substage 6.4 — Reciprocal CAPA-dependency banner ──
 *
 * Renders only when this CC currently blocks one or more open CAPAs from
 * implementation (i.e. the CC is in a non-terminal state and at least one
 * linked CAPA is not closed/rejected). The variant escalates if any
 * dependent CAPA is Critical/High — those are hard-gated by
 * canMarkCAPAImplemented(), so an unfinished CC is a literal blocker.
 */
export function CAPADependencyBanner({ cc }: { cc: CCDetail }) {
  // CC is "satisfying" once Implemented or Closed — those are the
  // statuses canMarkCAPAImplemented() considers complete. Rejected /
  // soft-deleted CCs handled separately by the existing in-page banners.
  const ccSatisfies =
    cc.status === "Implemented" || cc.status === "Closed";
  const ccTerminallyFailed = cc.status === "Rejected";
  if (ccSatisfies) return null;

  // Live dependents = linked CAPAs that haven't reached closed/rejected.
  // A CAPA in pending_qa_review or earlier is still going to consult this
  // CC's status during sign-and-close.
  const liveLinks = cc.capaLinks.filter(
    (l) => l.capa.status !== "closed" && l.capa.status !== "rejected",
  );
  if (liveLinks.length === 0) return null;

  const hardGateLinks = liveLinks.filter((l) => isHardGateRisk(l.capa.risk));
  const softGateLinks = liveLinks.filter((l) => !isHardGateRisk(l.capa.risk));

  const isCritical = ccTerminallyFailed || hardGateLinks.length > 0;
  const Icon = ccTerminallyFailed
    ? AlertOctagon
    : hardGateLinks.length > 0
      ? AlertOctagon
      : Info;
  const bg = isCritical
    ? ccTerminallyFailed
      ? "var(--danger-bg)"
      : "var(--warning-bg)"
    : "var(--info-bg)";
  const border = isCritical
    ? ccTerminallyFailed
      ? "var(--danger)"
      : "var(--warning)"
    : "var(--brand-border)";
  const fg = isCritical
    ? ccTerminallyFailed
      ? "var(--danger)"
      : "var(--warning)"
    : "var(--brand)";

  let title: string;
  let body: string;
  if (ccTerminallyFailed) {
    title = `Rejected — blocking ${liveLinks.length} CAPA${liveLinks.length === 1 ? "" : "s"} from closure`;
    body = `Linked CAPAs cannot satisfy their dependency on a Rejected Change Control. Operators must remove the link or initiate a replacement CC before those CAPAs can be sealed.`;
  } else if (hardGateLinks.length > 0) {
    title = `Hard-gate dependency for ${hardGateLinks.length} ${hardGateLinks.length === 1 ? "CAPA" : "CAPAs"}`;
    body = `Critical / High risk CAPAs cannot be sealed while this Change Control is unfinished. Slipping the schedule will hold those CAPAs open.${softGateLinks.length > 0 ? ` ${softGateLinks.length} additional Medium / Low CAPA${softGateLinks.length === 1 ? "" : "s"} can override but will record a justification.` : ""}`;
  } else {
    title = `Soft dependency for ${softGateLinks.length} CAPA${softGateLinks.length === 1 ? "" : "s"}`;
    body = `Linked Medium / Low risk CAPAs may close with an explicit override while this CC is unfinished. Each override is recorded against the CAPA and the audit trail.`;
  }

  return (
    <div
      role={isCritical ? "alert" : "status"}
      className="flex items-start gap-2.5 p-3 rounded-lg border"
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
        </p>
        <p
          className="text-[11px] mt-0.5"
          style={{ color: "var(--text-secondary)" }}
        >
          {body}
        </p>
        <ul
          className="text-[11px] mt-1 space-y-0.5"
          style={{ color: "var(--text-secondary)" }}
        >
          {liveLinks.slice(0, 6).map((link) => (
            <li key={link.id} className="flex items-center gap-1.5 flex-wrap">
              <span
                className="font-mono"
                style={{ color: "var(--text-primary)" }}
              >
                {link.capa.reference ?? link.capa.id.slice(0, 8)}
              </span>
              <Badge variant={getSeverityVariant(link.capa.risk, "generic")}>
                {normalizeSeverityForDisplay(link.capa.risk, "generic") ?? link.capa.risk}
              </Badge>
              <Badge variant="gray">{link.capa.status}</Badge>
            </li>
          ))}
          {liveLinks.length > 6 && (
            <li
              className="italic"
              style={{ color: "var(--text-muted)" }}
            >
              +{liveLinks.length - 6} more
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
