"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { displayUserName, displaySiteName } from "@/lib/identity-display";
import { useRole } from "@/hooks/useRole";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import { useAppSelector } from "@/hooks/useAppSelector";
import { adaptPrismaSystem, adaptPrismaRTM, adaptPrismaRoadmap, type SystemFromPrisma } from "@/types/csv-csa";
import { updateSystem as updateSystemServer, saveNextReview as saveNextReviewServer } from "@/actions/systems";
import { Popup } from "@/components/ui/Popup";
import { PageLayout } from "@/components/layout/PageLayout";
import { OverviewPanel } from "@/modules/csv-csa/detail/OverviewPanel";
import { ValidationPanel } from "@/modules/csv-csa/detail/ValidationPanel";
import { SystemHeaderCard } from "@/modules/csv-csa/detail/SystemHeaderCard";
import { InspectionReadinessCard } from "@/modules/csv-csa/detail/InspectionReadinessCard";
import { SystemRTMTab } from "@/modules/csv-csa/detail/SystemRTMTab";
import { ComplianceFindingsTab, type AvailableFinding } from "@/modules/csv-csa/detail/ComplianceFindingsTab";
import { SignOffTab } from "@/modules/csv-csa/detail/SignOffTab";
import { EditSystemModal, type SystemForm as EditSystemForm } from "@/modules/csv-csa/modals/EditSystemModal";
import { RecentActivityPanel, type RecentActivityRow } from "@/modules/csv-csa/detail/RecentActivityPanel";
import { WORKFLOW_TABS, type WorkflowTab } from "@/modules/csv-csa/detail/workflow";

export interface SystemDetailPageProps {
  system: SystemFromPrisma;
  availableFindings: AvailableFinding[];
  recentActivity: RecentActivityRow[];
  /** Server-computed landing tab (used when no ?tab query param is present). */
  defaultTab: WorkflowTab;
}

const TAB_IDS = WORKFLOW_TABS.map((t) => t.id);

export function SystemDetailPage({ system: prismaSystem, availableFindings, recentActivity, defaultTab }: SystemDetailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, isViewOnly } = useRole();
  const { org, sites, users } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  // Effective enabled frameworks for this tenant (server-resolved, non-persisted).
  const frameworkList = useAppSelector((s) => s.frameworks.list);
  const hasFramework = (key: string) => frameworkList.some((f) => f.key === key);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";

  const system = useMemo(() => adaptPrismaSystem(prismaSystem), [prismaSystem]);
  const rtmEntries = useMemo(() => adaptPrismaRTM([prismaSystem]), [prismaSystem]);
  const roadmap = useMemo(() => adaptPrismaRoadmap([prismaSystem]), [prismaSystem]);

  const tabParam = searchParams?.get("tab") ?? null;
  const tab: WorkflowTab = (TAB_IDS.includes((tabParam ?? "") as WorkflowTab) ? tabParam : defaultTab) as WorkflowTab;
  function goTab(t: WorkflowTab) {
    const p = new URLSearchParams(searchParams?.toString() ?? "");
    p.set("tab", t);
    router.push(`?${p.toString()}`, { scroll: false });
  }

  const [editOpen, setEditOpen] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resolveUser = (id: string) => displayUserName(id, users);
  const siteName = (id: string) => displaySiteName(id, sites, "—");

  async function onEditSave(data: EditSystemForm) {
    // RUNG 2.6 — the edit modal now carries only the 8 essential identity /
    // classification fields; the rest are edited on their own detail tabs.
    const result = await updateSystemServer(system.id, {
      name: data.name, type: data.type, vendor: data.vendor, version: data.version,
      gxpRelevance: data.gxpRelevance, gamp5Category: data.gamp5Category,
      siteId: data.siteId, owner: data.owner,
    });
    if (!result.success) { setErrorMsg(result.error || "Failed to update system."); return; }
    setEditOpen(false); setOkMsg("System updated."); router.refresh();
  }

  // Per-tab status dot (null = no dot).
  function tabDot(id: WorkflowTab): string | null {
    const stages = system.validationStages ?? [];
    const resolved = stages.length > 0 && stages.every((s) => s.status === "approved" || s.status === "skipped");
    switch (id) {
      case "assess": return system.intendedUse?.trim() ? "#10b981" : null;
      case "plan": return rtmEntries.length > 0 ? "#10b981" : null;
      case "execute":
        if (resolved) return "#10b981";
        if (stages.some((s) => s.status === "rejected")) return "#ef4444";
        if (stages.some((s) => s.status === "in_review")) return "#f59e0b";
        return null;
      case "signoff":
        if (system.signedOffAt) return "#10b981";
        return resolved ? "#f59e0b" : null;
      case "inspect": return system.signedOffAt ? "#10b981" : null;
    }
  }

  const stages = system.validationStages ?? [];
  const rejectedStage = stages.find((s) => s.status === "rejected");
  const inReviewStage = stages.find((s) => s.status === "in_review");

  return (
    <PageLayout
      breadcrumb={{ parent: "CSV/CSA", parentHref: "/csv-csa", current: system.reference ?? system.name }}
      description="Validation lifecycle, RTM, sign-off, and inspection readiness for this GxP computerized system."
    >
      <div className="space-y-4">
      <SystemHeaderCard
        system={system} isDark={isDark} canEdit={!isViewOnly} onEdit={() => setEditOpen(true)}
        resolveUser={resolveUser} siteName={siteName} timezone={org.timezone} dateFormat={org.dateFormat}
        onNavigateTab={goTab}
      />

      {/* Workflow-phase tab nav */}
      <div role="tablist" aria-label="Validation workflow phases" className="flex gap-1 border-b border-(--bg-border)">
        {WORKFLOW_TABS.map((t) => {
          const dot = tabDot(t.id);
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => goTab(t.id)}
              className={clsx("inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", tab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}>
              {dot && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot }} aria-hidden="true" />}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── ASSESS ── */}
      {tab === "assess" && (
        <div className="space-y-4">
          <OverviewPanel system={system} role={role} onNavigateTab={(t) => goTab(t === "validation" ? "execute" : "assess")} />
          {/* Step 2 — moved here from the Inspect tab. It is PURE DISPLAY (no
              actions) and answers "where are we", which belongs beside the
              system information rather than three tabs away. Props, data and
              the tab mapping are unchanged. */}
          <InspectionReadinessCard
            system={system} rtmEntries={rtmEntries} timezone={org.timezone} dateFormat={org.dateFormat}
            onNavigateTab={(t) => goTab(t === "lifecycle" ? "execute" : t === "rtm" ? "plan" : "inspect")}
          />
          <ComplianceFindingsTab
            system={system} role={role}
            showPart11={hasFramework("p11")} showAnnex11={hasFramework("annex11")} showGAMP5={hasFramework("gamp5")}
            availableFindings={availableFindings} onError={setErrorMsg} onOk={setOkMsg} sections={["risk"]}
          />
        </div>
      )}

      {/* ── PLAN ── */}
      {tab === "plan" && (
        <SystemRTMTab systemId={system.id} entries={rtmEntries} canEdit={!isViewOnly} onError={setErrorMsg} />
      )}

      {/* ── EXECUTE ── */}
      {tab === "execute" && (
        <div className="space-y-4">
          {(rejectedStage || inReviewStage) && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg text-[12px]" style={{ background: "#f59e0b1a", border: "1px solid #f59e0b55" }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} aria-hidden="true" />
              <span style={{ color: "var(--text-primary)" }}>
                {rejectedStage ? `Action required: ${rejectedStage.key} was rejected — re-execute and resubmit.` : `${inReviewStage?.key} is awaiting QA approval.`}
              </span>
            </div>
          )}
          <ValidationPanel
            system={system} roadmapActivities={roadmap.filter((a) => a.systemId === system.id)}
            users={users} timezone={org.timezone} dateFormat={org.dateFormat} role={role}
            onSavePlannedActions={async (text) => { const r = await updateSystemServer(system.id, { plannedActions: text }); if (!r.success) setErrorMsg(r.error || "Failed"); else router.refresh(); }}
            onSaveNextReview={async (iso) => { const r = await saveNextReviewServer(system.id, iso || null); if (!r.success) setErrorMsg(r.error || "Failed"); else router.refresh(); }}
          />
        </div>
      )}

      {/* ── SIGN OFF ── */}
      {tab === "signoff" && (
        <SignOffTab system={system} role={role} timezone={org.timezone} dateFormat={org.dateFormat} onError={setErrorMsg} onOk={setOkMsg} onNavigateTab={goTab} />
      )}

      {/* ── INSPECT ── */}
      {tab === "inspect" && (
        <div className="space-y-4">
          <ComplianceFindingsTab
            system={system} role={role}
            showPart11={hasFramework("p11")} showAnnex11={hasFramework("annex11")} showGAMP5={hasFramework("gamp5")}
            availableFindings={availableFindings} onError={setErrorMsg} onOk={setOkMsg} sections={["di", "remediation", "findings", "capas"]}
          />
          {/* Step 1 — extracted to RecentActivityPanel. Same rows, same
              formatting, same audit-trail deep link. */}
          <RecentActivityPanel
            rows={recentActivity}
            timezone={org.timezone}
            dateFormat={org.dateFormat}
            onOpenAuditTrail={() => router.push(`/audit-trail?module=CSV/CSA&systemId=${system.id}`)}
          />
        </div>
      )}

      </div>

      <EditSystemModal open={editOpen} sites={sites} users={complianceUsers} system={system} onSave={onEditSave} onClose={() => setEditOpen(false)} />

      <Popup isOpen={!!okMsg} variant="success" title="Saved" description={okMsg ?? ""} onDismiss={() => setOkMsg(null)} />
      <Popup isOpen={!!errorMsg} variant="error" title="Action failed" description={errorMsg ?? ""} onDismiss={() => setErrorMsg(null)} />
    </PageLayout>
  );
}
