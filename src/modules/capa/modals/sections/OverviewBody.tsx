"use client";

import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Link2,
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
}

export function OverviewBody({
  capa,
  isDark,
  // CAPA-module batch #4 — `users` consumed again to resolve gap-owner +
  // driver name+role. timezone/dateFormat still unused here.
  users,
  showMigrationNotice,
  onDismissNotice,
  onNavigateGap,
  onEditOpen,
  editAllowed,
  originDocs = [],
}: OverviewBodyProps) {
  const router = useRouter();
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

      <section aria-labelledby="rbc-heading" className="capa-card">
        <h3 id="rbc-heading" className="capa-section-title block mb-3">Risk-based classification</h3>
        {/* Phase F — 3-up grid (stacks to 1 col on mobile); each cell = label
            + colored risk pill from the existing severity taxonomy. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Patient safety risk", variant: baseVariant, text: riskLevel },
            { label: "Product quality impact", variant: baseVariant, text: riskLevel },
            { label: "Regulatory exposure", variant: (capa.diGate ? "red" : baseVariant) as "red" | "amber" | "green", text: capa.diGate ? "High" : riskLevel },
          ].map((row) => (
            <div key={row.label} className="rounded-lg border p-2.5" style={{ borderColor: "var(--card-border, var(--bg-border))", background: "var(--bg-elevated)" }}>
              <p className="text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>{row.label}</p>
              <Badge variant={row.variant}>{row.text}</Badge>
            </div>
          ))}
        </div>
      </section>

      {/* Batch 3a #1 — Source / linked record / Created / risk as ONE tidy row.
          The "View" link only renders when the source has a linkable record;
          external/manual sources show no link (valid). */}
      <div className="capa-card flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
        <span style={{ color: "var(--text-muted)" }}>Source</span>
        <Badge variant="gray">{sourceLabel(capa.source)}</Badge>
        {capa.findingId && (
          <>
            <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>·</span>
            <span className="font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>{capa.finding?.reference ?? capa.findingId}</span>
            <button type="button" onClick={() => onNavigateGap(capa.findingId!)} className="inline-flex items-center gap-0.5 hover:underline bg-transparent border-none cursor-pointer p-0" style={{ color: "var(--brand)" }}>
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />View →
            </button>
          </>
        )}
        {!capa.findingId && capa.deviation && (
          <>
            <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>·</span>
            <span className="font-mono text-[11px]" style={{ color: "var(--text-secondary)" }}>{capa.deviation.reference ?? "Deviation"}</span>
            <Badge variant={getSeverityVariant(capa.deviation.severity, "fda")}>{normalizeSeverityForDisplay(capa.deviation.severity, "fda") ?? capa.deviation.severity}</Badge>
            <button type="button" onClick={() => router.push("/deviation")} className="inline-flex items-center gap-0.5 hover:underline bg-transparent border-none cursor-pointer p-0" style={{ color: "var(--brand)" }}>
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />View →
            </button>
          </>
        )}
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
