"use client";

import {
  AlertCircle,
  CheckCircle2,
  FileText,
  History,
  Pencil,
  X,
} from "lucide-react";
import clsx from "clsx";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { displayUserName } from "@/lib/identity-display";
import { roleLabel } from "@/lib/labels/roles";
import type { CAPA } from "@/store/capa.slice";
import type { UserConfig } from "@/store/settings.slice";
import type { CAPAOriginDoc } from "@/lib/queries/capas";
import type { FindingAuditEntry } from "@/lib/queries/findings";
import { DocList } from "@/components/shared/DocList";

const SOURCE_LABEL: Record<string, string> = {
  "483": "FDA 483 Observation",
  "Gap Assessment": "Gap Assessment Finding",
  Deviation: "Deviation Report",
  "Internal Audit": "Internal Audit",
  Complaint: "Complaint",
  OOS: "OOS",
  "Change Control": "Change Control",
};
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;

// Stage 3 — humanize a finding AuditLog action for the read-only "Gap history"
// list (mirrors CapaAuditTrailBar.humanizeAction, stripping the finding_ prefix).
function humanizeFindingAction(action: string): string {
  return action
    .toLowerCase()
    .replace(/^finding_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
// Phase B — the Overview "Before submitting" checklist box was removed; the
// banner's expandable checklist is now the only checklist on the page.
// CHANGE CONTROL HIDDEN — user-facing surface disconnected. Module
// code/schema retained. To re-enable: uncomment the import below and
// the <LinkedChangeControlsSection /> render further down.
// LinkedChangeControlsSection internally renders <CCDependencyBanner>,
// so commenting this single line transitively disconnects both surfaces.
// import { LinkedChangeControlsSection } from "./LinkedChangeControlsSection";

interface OverviewBodyProps {
  capa: CAPA;
  isDark: boolean;
  users: UserConfig[];
  timezone: string;
  dateFormat: string;
  showMigrationNotice: boolean;
  onDismissNotice: () => void;
  onNavigateGap: (findingId: string) => void;
  onEditOpen: () => void;
  editAllowed: boolean;
  /** Req 4 — read-only deviation+task doc references (when raised from a deviation). */
  originDocs?: CAPAOriginDoc[];
  /** Item 1 — read-only gap-finding doc references (when raised from a finding). */
  findingDocs?: CAPAOriginDoc[];
  /** Stage 3 — the linked gap's COMPLETE audit trail (read-only), surfaced in the
   *  "Raised from finding" block so its in-progress history survives the handoff.
   *  From AuditLog; rendered read-only — writes no audit rows. */
  findingAudit?: FindingAuditEntry[];
}

export function OverviewBody({
  capa,
  isDark,
  // CAPA-module batch #4 — `users` consumed again to resolve gap-owner +
  // driver name+role. timezone/dateFormat now feed the Stage-3 Gap history rows.
  users,
  timezone,
  dateFormat,
  showMigrationNotice,
  onDismissNotice,
  onEditOpen,
  editAllowed,
  originDocs = [],
  findingDocs = [],
  findingAudit = [],
}: OverviewBodyProps) {
  const baseVariant = getSeverityVariant(capa.risk, "generic");

  // Display the stored risk verbatim. Previously Medium collapsed to the
  // text "Low" while baseVariant stayed amber via RISK_VARIANT.Medium —
  // the badge label and colour disagreed for any Medium CAPA. The DI-gate
  // override on the Regulatory-exposure row still pins that row to "High".
  const riskLevel = capa.risk;

  return (
    <div role="tabpanel" id="subpanel-overview" aria-labelledby="subtab-overview" tabIndex={0} className="capa-stack">
      {showMigrationNotice && (
        <aside
          className="flex items-start gap-2.5 p-3 rounded-lg border"
          style={{ background: "var(--info-bg)", borderColor: "var(--brand-border)" }}
        >
          <FileText className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium" style={{ color: "var(--brand)" }}>Looking for evidence files?</p>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              All file uploads now live in the Evidence tab, organized by category. The old &quot;Attached documents&quot; area has moved.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismissNotice}
            aria-label="Dismiss notice"
            className="w-6 h-6 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150 shrink-0"
          >
            <X className="w-3 h-3 text-(--text-muted)" aria-hidden="true" />
          </button>
        </aside>
      )}

      {/* Description card with a visible "Edit details" affordance.
          The header pencil icon is preserved (Fix 6) but is too small
          to find on first contact; this surfaces the same edit modal
          via a button in the body where users actually look. */}
      <div className="capa-card">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="capa-section-title">Description</h3>
          {editAllowed && (
            <button
              type="button"
              onClick={onEditOpen}
              aria-label="Edit CAPA details"
              className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md border bg-transparent cursor-pointer transition-colors duration-150 hover:bg-(--bg-hover)"
              style={{
                color: "var(--brand)",
                borderColor: "var(--brand-border)",
              }}
            >
              <Pencil className="w-3 h-3" aria-hidden="true" />
              Edit details
            </button>
          )}
        </div>
        {(capa.description ?? "").trim().length > 0 ? (
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{capa.description}</p>
        ) : (
          <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>
            No description yet — click Edit details above to add one.
          </p>
        )}
      </div>

      {/* Phase 4 — risk classification as ONE inline row (was three full-width
          cards saying "High" three times). Regulatory exposure reflects the DI
          gate flag, same as before. */}
      <div className="capa-card flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
        <span className="capa-section-title">Risk classification</span>
        <span style={{ color: "var(--text-secondary)" }}>Patient safety <strong style={{ color: "var(--text-primary)" }}>({riskLevel})</strong></span>
        <span style={{ color: "var(--text-secondary)" }}>Product quality <strong style={{ color: "var(--text-primary)" }}>({riskLevel})</strong></span>
        <span style={{ color: "var(--text-secondary)" }}>Regulatory exposure <strong style={{ color: capa.diGate ? "var(--danger)" : "var(--text-primary)" }}>({capa.diGate ? "High" : riskLevel})</strong></span>
      </div>

      {/* Phase 4 — the standalone "Source · <finding> · View" fact was removed:
          the Reference-documents card (detail page) and the "Raised from finding
          / deviation" cards below already carry the source + link. Two cards, one
          fact. Created + risk stay (not duplicated). */}
      <div className="capa-card flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
        <span style={{ color: "var(--text-muted)" }}>Source</span>
        <Badge variant="gray">{sourceLabel(capa.source)}</Badge>
        {capa.createdAt && (
          <>
            <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>·</span>
            <span style={{ color: "var(--text-muted)" }}>Created {dayjs.utc(capa.createdAt).fromNow()}</span>
          </>
        )}
        <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>·</span>
        <Badge variant={baseVariant}>{normalizeSeverityForDisplay(capa.risk, "generic") ?? capa.risk}</Badge>
      </div>

      {/* Req 4 — "Raised from deviation X" linked-document references. The
          deviation's docs + the (cancelled) worker task's docs, read-only
          (download via /api/documents/[id]); NOT copied into evidence categories
          and not attachable here — they live on their originating records. */}
      {capa.deviation && originDocs.length > 0 && (
        <div className="capa-card">
          <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Raised from deviation {capa.deviation.reference ?? "—"} — {originDocs.length} linked document{originDocs.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>Read-only references to the originating records (not copied into evidence).</p>
          <DocList
            docs={originDocs.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              downloadHref: `/api/documents/${d.id}`,
              uploadedBy: d.uploadedBy,
              badge: { label: d.source === "task" ? "Task" : "Deviation", tone: d.source === "task" ? "amber" : "gray" },
            }))}
          />
        </div>
      )}

      {/* Item 1 — "Raised from finding X" linked-document references. The gap
          finding's uploaded docs, read-only (download via /api/documents/[id]);
          NOT copied into evidence categories and not attachable here — they live
          on the originating finding. Mirrors the deviation block above. */}
      {capa.finding && (findingDocs.length > 0 || findingAudit.length > 0) && (
        <div className="capa-card">
          <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Raised from finding {capa.finding.reference ?? "—"}
            {findingDocs.length > 0 && <> — {findingDocs.length} linked document{findingDocs.length === 1 ? "" : "s"}</>}
          </p>
          {findingDocs.length > 0 && (
            <>
              <p className="text-[11px] mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>Read-only references to the originating finding (not copied into evidence).</p>
              <DocList
                docs={findingDocs.map((d) => ({
                  id: d.id,
                  fileName: d.fileName,
                  downloadHref: `/api/documents/${d.id}`,
                  uploadedBy: d.uploadedBy,
                  badge: { label: "Gap", tone: "gray" },
                }))}
              />
            </>
          )}
          {/* Stage 3 — the gap's COMPLETE history (read-only mirror of
              CapaAuditTrailBar), so the in-progress work done on the gap before
              the handoff stays visible from the CAPA. Sourced from AuditLog;
              renders nothing new — writes zero audit rows. */}
          {findingAudit.length > 0 && (
            <details className="mt-2 rounded-lg border" style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}>
              <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                <History className="w-3.5 h-3.5" aria-hidden="true" />
                Gap history ({findingAudit.length})
              </summary>
              <div className="px-3 pb-2 max-h-64 overflow-y-auto">
                <ul className="list-none p-0 m-0">
                  {findingAudit.map((e) => (
                    <li key={e.id} className="flex items-baseline gap-2 py-1 text-[11px]" style={{ borderTop: "1px solid var(--bg-border)" }}>
                      <span className="font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{dayjs.utc(e.createdAt).tz(timezone).format(`${dateFormat} HH:mm`)}</span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{humanizeFindingAction(e.action)}</span>
                      <span style={{ color: "var(--text-secondary)" }}>— {e.userName} ({e.userRole ? roleLabel(e.userRole) : "system"})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
        </div>
      )}

      {/* CAPA-module batch #4 — provenance vs ownership, shown distinctly:
          the SOURCE record's owner (read-only, from the linked gap) and the
          CAPA's current DRIVER. Name + role on each; gap owner omitted when the
          source has none (e.g. external FDA-483). */}
      {(capa.finding?.owner || capa.owner) && (() => {
        const nameRole = (uid: string) => {
          const u = users.find((x) => x.id === uid);
          return `${displayUserName(uid, users)}${u ? ` (${roleLabel(u.role)})` : ""}`;
        };
        return (
          <div className="capa-card flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
            {capa.finding?.owner && (
              <span>
                <span style={{ color: "var(--text-muted)" }}>Gap owner: </span>
                <span style={{ color: "var(--text-primary)" }}>{nameRole(capa.finding.owner)}</span>
              </span>
            )}
            {capa.owner && (
              <span>
                <span style={{ color: "var(--text-muted)" }}>Assigned to (owner): </span>
                <span style={{ color: "var(--text-primary)" }}>{nameRole(capa.owner)}</span>
              </span>
            )}
          </div>
        );
      })()}

      {capa.diGate && (() => {
        const diOpen = capa.diGateStatus !== "cleared";
        return (
          <div className={clsx("flex items-start gap-2 p-3 rounded-lg text-[12px] border", diOpen ? (isDark ? "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.2)]" : "bg-[#fef2f2] border-[#fca5a5]") : (isDark ? "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.2)]" : "bg-[#f0fdf4] border-[#a7f3d0]"))}>
            {diOpen ? <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4 text-[#10b981] shrink-0 mt-0.5" aria-hidden="true" />}
            <div className="flex-1 min-w-0">
              <span className="font-semibold block" style={{ color: diOpen ? "#ef4444" : "#10b981" }}>
                {diOpen ? "DI gate required" : "DI gate cleared"}
              </span>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {diOpen ? "Data integrity review must be completed before QA can close — use Edit to clear" : "CAPA can proceed to QA review"}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Phase F — Owner/Due/Created grid removed: Owner + Due duplicated the
          header; Created moved into the Meta card above. */}

      {/* CHANGE CONTROL HIDDEN — Linked Change Controls section
       *  suppressed. CCDependencyBanner (rendered inside the section) is
       *  transitively suppressed too. To re-enable: uncomment the import
       *  above + the render below.
       *  <LinkedChangeControlsSection capa={capa} />
       */}
      {/* Phase D 8b — the redundant mid-page audit placeholder was removed;
          the single Zone-6 audit bar (CapaAuditTrailBar) lives at the page
          bottom and now loads the per-CAPA log. */}
    </div>
  );
}
