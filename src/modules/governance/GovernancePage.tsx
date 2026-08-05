"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { BarChart3, ShieldAlert, Download, BarChart2, Gavel, Archive } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { escapeHtml } from "@/lib/escapeHtml";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { useTenantSitePredicate } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { adaptFinding, type FindingWithEdits } from "@/modules/gap-assessment/GapPage.adapter";
import { mapCAPAFromPrisma } from "@/lib/mappers/capaMapper";
import { adaptPrismaSystem } from "@/types/csv-csa";
import {
  computeGovernanceKPIs, computeValidationBreakdown, computeDIByArea,
  computeSiteKPIs, computeSiteReadiness, capaTimelinessTrend, isCapaTrendEmpty,
  siteReadinessTrend,
  type KPIFDA483Event,
} from "@/lib/kpi";
import {
  canCreateRisk, canEditRisk, canManageGovernance,
  canCreateManagementDecision, canEditManagementDecision,
} from "@/lib/permissions/roleSets";
import {
  createRisk as createRiskAction,
  updateRisk as updateRiskAction,
  archiveRisk as archiveRiskAction,
  uploadRiskDocument as uploadRiskDocumentAction,
} from "@/actions/risks";
import {
  createManagementDecision,
  updateManagementDecision,
  archiveManagementDecision,
  uploadDecisionDocument,
} from "@/actions/management-decisions";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { PageLayout } from "@/components/layout/PageLayout";
import { Popup } from "@/components/ui/Popup";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { displayUserName } from "@/lib/identity-display";
import type { RiskListRow } from "@/lib/queries/risks";
import type { DocUploadEntry } from "@/components/shared/CategorizedDocUploader";

import { KPIScorecardTab } from "./tabs/KPIScorecardTab";
import { RiskRegisterTab } from "./tabs/RiskRegisterTab";
import { ManagementDecisionsTab } from "./tabs/ManagementDecisionsTab";
import { RiskModal, type RiskOwnerOption, type RiskSiteOption } from "./modals/RiskModal";
import {
  ManagementDecisionModal,
  type DecisionParticipant,
  type ManagementDecisionFormValues,
} from "./modals/ManagementDecisionModal";
import type { ManagementDecisionRow } from "@/lib/queries/managementDecisions";

/** DIY tab bar (the SettingsPage pattern): a static list + useState + hidden panels. */
type TabId = "risks" | "decisions" | "kpis";
const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "risks", label: "Risk Register", Icon: ShieldAlert },
  { id: "decisions", label: "Management Decisions", Icon: Gavel },
  { id: "kpis", label: "KPIs & Scorecards", Icon: BarChart3 },
];

export interface GovernancePageProps {
  /** Lowest readiness % across active inspections — server-computed. */
  readinessScore?: number;
  /** Server-fetched, ALREADY visibility-scoped risks. Never cached in Redux. */
  risks?: RiskListRow[];
  /** Server-scoped assignable owners (active, non-viewer, same tenant). */
  riskOwners?: RiskOwnerOption[];
  /** Server-fetched, ALREADY visibility-scoped management decisions. */
  decisions?: ManagementDecisionRow[];
  /** Server-scoped chairs / action-item owners. */
  decisionParticipants?: DecisionParticipant[];
  /**
   * TENANT-WIDE server rows (Phase 6) — aggregates only, never rendered as rows,
   * never dispatched into Redux. They back EVERY KPI on the Scorecard tab so a
   * seat user and a QA head read the SAME totals as the Dashboard. Site-filtered
   * client-side by `useTenantSitePredicate`. Adapted to the slice shape so the
   * shared KPI lib runs identical maths to the Dashboard's.
   */
  allFindings?: FindingWithEdits[];
  allCAPAs?: Parameters<typeof mapCAPAFromPrisma>[0][];
  allSystems?: Parameters<typeof adaptPrismaSystem>[0][];
  /** Raw getFDA483Events rows (observations + commitments included). */
  allFDA483?: KPIFDA483Event[];
}

export function GovernancePage({
  readinessScore: readinessScoreProp,
  risks: serverRisks = [],
  riskOwners = [],
  decisions: serverDecisions = [],
  decisionParticipants = [],
  allFindings: serverAllFindings,
  allCAPAs: serverAllCAPAs,
  allSystems: serverAllSystems,
  allFDA483: serverAllFDA483,
}: GovernancePageProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // TENANT-WIDE (props, never dispatched) → every KPI. Adapted to the slice
  // shape and narrowed by the same tenant/site rule the Dashboard uses, so the
  // two screens compute over an identical record set. Governance has no client
  // record-CONTENT surface driven by Redux (risks/decisions come from their own
  // server props), so it reads NOTHING from useTenantData anymore.
  const sitePredicate = useTenantSitePredicate();
  const findings = useMemo(
    () => (serverAllFindings ?? []).map(adaptFinding).filter(sitePredicate),
    [serverAllFindings, sitePredicate],
  );
  const capas = useMemo(
    () => (serverAllCAPAs ?? []).map(mapCAPAFromPrisma).filter(sitePredicate),
    [serverAllCAPAs, sitePredicate],
  );
  const systems = useMemo(
    () => (serverAllSystems ?? []).map(adaptPrismaSystem).filter(sitePredicate),
    [serverAllSystems, sitePredicate],
  );
  const fda483 = useMemo(
    () => (serverAllFDA483 ?? []).filter(sitePredicate),
    [serverAllFDA483, sitePredicate],
  );
  const { org, users, allSites } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const companyName = org.companyName;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { role } = useRole();

  // Non-admin users see only their selected site; admins see all
  const visibleSites = selectedSiteId
    ? allSites.filter((s) => s.id === selectedSiteId)
    : allSites;

  function ownerName(id: string) { return displayUserName(id, users); }

  /* ── Risk permissions — client MIRRORS of the server gates in actions/risks.ts.
     The server stays authoritative; these only decide what to render. ── */
  const actorUserId = user?.id ?? null;
  const canCreate = canCreateRisk(role);
  const canManage = canManageGovernance(role);
  const canEditRow = (r: RiskListRow) => canEditRisk(role, actorUserId, r);

  /* ── Management-decision permissions — the SAME create-vs-manage split as Risk:
     create = any non-viewer; edit = manage role OR the meeting's creator;
     archive = manage roles only. Client MIRRORS of the server gates. ── */
  const canCreateDecision = canCreateManagementDecision(role);
  const canEditDecisionRow = (d: ManagementDecisionRow) => canEditManagementDecision(role, actorUserId, d);

  const siteOptions: RiskSiteOption[] = allSites.map((s) => ({ id: s.id, name: s.name }));

  /* ── Computed KPIs — ALL from the shared KPI library (src/lib/kpi), the same
     formulas the Dashboard uses, over the same tenant-wide record set. No KPI
     formula is implemented inline here anymore (Phase 2/3/6). ── */
  const kpis = useMemo(
    () => computeGovernanceKPIs({ findings, capas, systems, fda483Events: fda483 }),
    [findings, capas, systems, fda483],
  );
  const {
    closedCAPAs, capaTimeliness, diExceptions, csvDrift,
    overdueCommitments, repeatObservationRisk, auditTrailCoverage,
  } = kpis;
  // Prefer server-computed score (Prisma actions completion %); fall back to
  // the legacy Redux card-based score for backward-compat during migration.
  const reduxReadinessScore = useAppSelector((s) => s.readiness.score);
  const readinessScore = readinessScoreProp ?? reduxReadinessScore;
  const noData = capas.length === 0 && findings.length === 0;

  /* ── State ── */
  // Deep-link support (Phase 8): a Dashboard KPI links to
  // /governance?tab=kpis#kpi-<metric>. Honour ?tab= on first render and scroll
  // to the #anchor once the KPI panel is visible.
  const tabParam = searchParams.get("tab");
  const initialTab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "risks";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    if (activeTab !== "kpis" || typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    // Wait for the panel (hidden until active) to lay out, then scroll.
    const id = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [activeTab]);

  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<RiskListRow | null>(null);
  const [archivingRisk, setArchivingRisk] = useState<RiskListRow | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [riskSavedPopup, setRiskSavedPopup] = useState(false);
  const [riskArchivedPopup, setRiskArchivedPopup] = useState(false);
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [editingDecision, setEditingDecision] = useState<ManagementDecisionRow | null>(null);
  const [archivingDecision, setArchivingDecision] = useState<ManagementDecisionRow | null>(null);
  const [decisionArchiveBusy, setDecisionArchiveBusy] = useState(false);
  const [decisionSavedPopup, setDecisionSavedPopup] = useState(false);
  const [decisionArchivedPopup, setDecisionArchivedPopup] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [reportGeneratedPopup, setReportGeneratedPopup] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportMenuOpen]);

  /* ── Risk handlers ── */

  // Holds the id minted by createRisk so the modal's post-save doc upload knows
  // its parent. Set in handleRiskSubmit, consumed by handleUploadDocs.
  const newRiskIdRef = useRef<string | null>(null);

  function openAddRisk() { setEditingRisk(null); newRiskIdRef.current = null; setRiskModalOpen(true); }
  function openEditRisk(r: RiskListRow) { setEditingRisk(r); setRiskModalOpen(true); }

  /** Upload staged docs against a known risk id. Errors are aggregated. */
  async function uploadDocsFor(riskId: string, entries: DocUploadEntry[]) {
    for (const entry of entries) {
      const fd = new FormData();
      fd.append("file", entry.file);
      const res = await uploadRiskDocumentAction(riskId, fd, entry.category);
      if (!res.success) return { success: false, error: res.error };
    }
    return { success: true as const };
  }

  async function handleRiskSubmit(values: {
    title: string; description: string; category: string; severity: string;
    likelihood: string; status: string; ownerId: string; siteId: string;
    targetDate: string; mitigationPlan: string;
  }) {
    const payload = {
      title: values.title,
      description: values.description,
      category: values.category as never,
      severity: values.severity as never,
      likelihood: values.likelihood as never,
      ownerId: values.ownerId,
      siteId: values.siteId || null,
      targetDate: values.targetDate ? dayjs(values.targetDate).utc().toISOString() : null,
      mitigationPlan: values.mitigationPlan || null,
    };

    const res = editingRisk
      ? await updateRiskAction(editingRisk.id, { ...payload, status: values.status as never })
      : await createRiskAction({ ...payload, status: values.status as never });

    if (!res.success) return { success: false, error: res.error };

    // CREATE: hand the new id back so the modal's staged docs can be uploaded.
    if (!editingRisk) {
      const created = res.data as { id: string };
      newRiskIdRef.current = created.id;
    }
    setRiskSavedPopup(true);
    router.refresh();
    return { success: true as const };
  }

  async function handleUploadDocs(entries: DocUploadEntry[]) {
    const riskId = editingRisk?.id ?? newRiskIdRef.current;
    if (!riskId) return { success: false, error: "No risk to attach documents to." };
    const res = await uploadDocsFor(riskId, entries);
    if (res.success) router.refresh();
    return res;
  }

  async function handleArchiveConfirm() {
    if (!archivingRisk) return;
    setArchiveBusy(true);
    const res = await archiveRiskAction(archivingRisk.id);
    setArchiveBusy(false);
    if (!res.success) {
      console.warn("[governance] archiveRisk rejected:", res.error);
      return;
    }
    setArchivingRisk(null);
    setRiskArchivedPopup(true);
    router.refresh();
  }

  /* ── Management-decision handlers ── */

  // Holds the id minted by createManagementDecision so the modal's post-save doc
  // upload knows its parent (a document needs an existing meeting to attach to).
  const newDecisionIdRef = useRef<string | null>(null);

  function openAddDecision() { setEditingDecision(null); newDecisionIdRef.current = null; setDecisionModalOpen(true); }
  function openEditDecision(d: ManagementDecisionRow) { setEditingDecision(d); setDecisionModalOpen(true); }

  async function handleDecisionSubmit(values: ManagementDecisionFormValues) {
    const payload = {
      topic: values.topic,
      meetingDate: dayjs(values.meetingDate).utc().toISOString(),
      attendees: values.attendees,
      chairedById: values.chairedById || null,
      items: values.items.map((i) => ({
        id: i.id,
        text: i.text,
        ownerId: i.ownerId || null,
        dueDate: i.dueDate ? dayjs(i.dueDate).utc().toISOString() : null,
      })),
    };

    const res = editingDecision
      ? await updateManagementDecision(editingDecision.id, payload)
      : await createManagementDecision(payload);

    if (!res.success) return { success: false, error: res.error };
    if (!editingDecision) newDecisionIdRef.current = (res.data as { id: string }).id;
    setDecisionSavedPopup(true);
    router.refresh();
    return { success: true as const };
  }

  async function handleDecisionUploadDocs(entries: DocUploadEntry[]) {
    const decisionId = editingDecision?.id ?? newDecisionIdRef.current;
    if (!decisionId) return { success: false, error: "No meeting to attach documents to." };
    for (const entry of entries) {
      const fd = new FormData();
      fd.append("file", entry.file);
      const res = await uploadDecisionDocument(decisionId, fd, entry.category);
      if (!res.success) return { success: false, error: res.error };
    }
    router.refresh();
    return { success: true as const };
  }

  async function handleDecisionArchiveConfirm() {
    if (!archivingDecision) return;
    setDecisionArchiveBusy(true);
    const res = await archiveManagementDecision(archivingDecision.id);
    setDecisionArchiveBusy(false);
    if (!res.success) {
      console.warn("[governance] archiveManagementDecision rejected:", res.error);
      return;
    }
    setArchivingDecision(null);
    setDecisionArchivedPopup(true);
    router.refresh();
  }

  /* ── Chart data — all from the shared KPI library ── */
  const capaTrend = useMemo(() => capaTimelinessTrend(capas), [capas]);
  const capaTrendEmpty = isCapaTrendEmpty(capaTrend);
  const valBreakdown = useMemo(() => computeValidationBreakdown(systems), [systems]);
  const diByArea = useMemo(() => computeDIByArea(capas, findings, systems), [capas, findings, systems]);

  /* ── Site readiness heatmap — one row per VISIBLE site, shared formula. ── */
  const siteReadiness = useMemo(
    () => computeSiteReadiness({ sites: visibleSites, findings, capas, systems, fda483Events: fda483 }),
    [visibleSites, findings, capas, systems, fda483],
  );

  /* ── Multi-site KPIs + readiness trend (Phase 4/5 — replaces MOCK_SITE_KPIS /
     MOCK_SITE_TREND). REAL, computed from tenant-wide records, for ANY number of
     sites. Comparison/ranking/trend need ≥ 2 sites to be meaningful. ── */
  const siteKPIs = useMemo(
    () => (visibleSites.length >= 2
      ? computeSiteKPIs({ sites: visibleSites, findings, capas, systems, fda483Events: fda483 })
      : []),
    [visibleSites, findings, capas, systems, fda483],
  );
  const siteTrend = useMemo(
    () => (visibleSites.length >= 2
      ? siteReadinessTrend(visibleSites, findings, capas, systems)
      : { data: [], series: [] }),
    [visibleSites, findings, capas, systems],
  );

  /* ── Export ── */
  function dl(html: string, fn: string) { const b = new Blob([html], { type: "text/html;charset=utf-8" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u); auditLog({ action: "GOVERNANCE_REPORT_EXPORTED", module: "governance", recordId: fn, newValue: { filename: fn, exportedBy: user?.id } }); }

  function exportMonthly() {
    // User-controlled strings are HTML-escaped before interpolation into the
    // exported .html (prevents HTML/script injection in the artifact).
    const orgName = escapeHtml(companyName || "Pharma Glimmora"); const rd = dayjs().format("MMMM YYYY");
    const prep = escapeHtml(ownerName(user?.id ?? ""));
    const rows = [["CAPA Timeliness", closedCAPAs.length === 0 ? "N/A" : `${capaTimeliness}%`, capaTimeliness >= 90], ["Overdue Commitments", String(overdueCommitments), overdueCommitments === 0], ["Repeat Observation Risk", String(repeatObservationRisk), repeatObservationRisk === 0], ["DI Exceptions", String(diExceptions), diExceptions === 0], ["Audit Trail Coverage", systems.length === 0 ? "N/A" : `${auditTrailCoverage}%`, auditTrailCoverage >= 80], ["Validation Drift", String(csvDrift), csvDrift === 0]].map(([k, v, ok]) => `<tr><td style="padding:10px 12px;border:1px solid #e2e8f0;font-weight:500">${k}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:16px;font-weight:700">${v}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;color:${ok ? "#10b981" : "#f59e0b"}">${ok ? "✓ On target" : "⚠ Action needed"}</td></tr>`).join("");
    dl(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Monthly KPI Report — ${rd}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,Arial,sans-serif;padding:40px;color:#0a1628}.header{border-bottom:2px solid #0ea5e9;padding-bottom:20px;margin-bottom:28px}.logo{font-size:14px;font-weight:700;color:#0ea5e9}h1{font-size:24px;font-weight:700;margin:12px 0 4px}.sub{color:#475569;font-size:13px}.score{display:inline-block;padding:16px 24px;border-radius:12px;background:#f0fdf4;border:1px solid #a7f3d0;margin:20px 0;font-size:40px;font-weight:700;color:${readinessScore >= 80 ? "#10b981" : readinessScore >= 60 ? "#f59e0b" : "#ef4444"}}table{width:100%;border-collapse:collapse;margin:20px 0}thead tr{background:#0a1f38}th{padding:10px 12px;text-align:left;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;border:1px solid #1e3a5a}.footer{margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:10px;color:#94a3b8}</style></head><body><div class="header"><div class="logo">${orgName}</div><h1>Monthly Quality KPI Report</h1><p class="sub">Period: ${rd} · Generated: ${dayjs().format("DD MMM YYYY HH:mm")} UTC</p></div><p style="font-size:11px;color:#94a3b8;text-transform:uppercase">Overall readiness score</p><p class="score">${readinessScore}%</p><table><thead><tr><th>KPI</th><th>Value</th><th>Assessment</th></tr></thead><tbody>${rows}</tbody></table><div class="footer">Generated by ${orgName} · Prepared by: ${prep}</div></body></html>`, `Monthly-KPI-Report-${dayjs().format("YYYY-MM")}.html`);
  }

  const openRisks = serverRisks.filter((r) => r.status === "Open" || r.status === "Mitigating").length;

  /* ══════════════════════════════════════ */

  return (
      <PageLayout
        title="Governance & KPIs"
        titleIcon={BarChart3}
        contentPadding={true}
        description={`Monitor compliance governance, risks, and key performance indicators. · ${visibleSites.length} sites · ${capas.length} CAPAs · ${findings.length} findings · ${serverRisks.length} risks (${openRisks} active) · ${serverDecisions.length} management decisions`}
        headerRight={
          /* "Export Reports" is a menu trigger with a ref-anchored dropdown, not a
             plain PageAction (which only models label/onClick/icon/variant), so it
             lives in headerRight. The Risk Register exports through the DataTable's
             own Export menu (CSV/Excel/PDF), so no bespoke RAID-log export here. */
          <div className="flex items-center gap-2">
            <div className="relative" ref={exportMenuRef}>
            <Button
              variant="secondary"
              icon={Download}
              onClick={() => setExportMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
            >
              Export Reports
            </Button>
            {exportMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 min-w-60 rounded-lg py-1 shadow-lg"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
              >
                {[
                  { label: "Monthly Quality KPI Report", Icon: BarChart2, onClick: exportMonthly },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    role="menuitem"
                    onClick={() => { opt.onClick(); setExportMenuOpen(false); setReportGeneratedPopup(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left border-none bg-transparent cursor-pointer hover:bg-(--bg-hover)"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <opt.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
        }
      >
        <div className="space-y-5">

      {/* Tabs */}
      <div role="tablist" aria-label="Governance sections" className="flex gap-1 border-b border-(--bg-border)">
        {TABS.map((t) => (<button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setActiveTab(t.id)} className={clsx("inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}><t.Icon className="w-3.5 h-3.5" aria-hidden="true" />{t.label}</button>))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" id="panel-risks" aria-labelledby="tab-risks" tabIndex={0} hidden={activeTab !== "risks"}>
        <RiskRegisterTab
          risks={serverRisks}
          timezone={timezone}
          dateFormat={dateFormat}
          canCreate={canCreate}
          canManage={canManage}
          canEditRow={canEditRow}
          onAdd={openAddRisk}
          onEdit={openEditRisk}
          onArchive={(r) => setArchivingRisk(r)}
        />
      </div>

      <div role="tabpanel" id="panel-decisions" aria-labelledby="tab-decisions" tabIndex={0} hidden={activeTab !== "decisions"}>
        <ManagementDecisionsTab
          decisions={serverDecisions}
          timezone={timezone}
          dateFormat={dateFormat}
          canCreate={canCreateDecision}
          canManage={canManage}
          canEditRow={canEditDecisionRow}
          onAdd={openAddDecision}
          onEdit={openEditDecision}
          onArchive={(d) => setArchivingDecision(d)}
        />
      </div>

      <div role="tabpanel" id="panel-kpis" aria-labelledby="tab-kpis" tabIndex={0} hidden={activeTab !== "kpis"}>
        <KPIScorecardTab companyName={companyName} readinessScore={readinessScore} noData={noData} capaTimeliness={capaTimeliness} closedCAPAsCount={closedCAPAs.length} overdueCommitments={overdueCommitments} repeatObservationRisk={repeatObservationRisk} diExceptions={diExceptions} auditTrailCoverage={auditTrailCoverage} csvDrift={csvDrift} systemsCount={systems.length} capaTrend={capaTrend} capaTrendEmpty={capaTrendEmpty} valBreakdown={valBreakdown} diByArea={diByArea} siteReadiness={siteReadiness} sites={visibleSites} isDark={isDark} currentMonth={dayjs().format("MMMM YYYY")} onNavigateSettings={() => router.push("/settings")} siteKPIs={siteKPIs} siteTrend={siteTrend.data} siteTrendSeries={siteTrend.series} />
      </div>

      {/* Add / Edit Risk */}
      <RiskModal
        open={riskModalOpen}
        onClose={() => { setRiskModalOpen(false); setEditingRisk(null); newRiskIdRef.current = null; }}
        risk={editingRisk}
        owners={riskOwners}
        sites={siteOptions}
        onSubmit={handleRiskSubmit}
        onUploadDocs={handleUploadDocs}
      />

      {/* Archive confirmation — manage roles only (the row menu already gates it). */}
      <ConfirmModal
        open={!!archivingRisk}
        onClose={() => setArchivingRisk(null)}
        onConfirm={handleArchiveConfirm}
        title="Archive this risk?"
        message={archivingRisk ? `${archivingRisk.reference ?? ""} — ${archivingRisk.title}. It will be hidden from the register. The record itself is retained for the audit trail.` : ""}
        confirmLabel="Archive"
        variant="danger"
        icon={Archive}
        loading={archiveBusy}
      />

      {/* Record / amend a management decision */}
      <ManagementDecisionModal
        open={decisionModalOpen}
        onClose={() => { setDecisionModalOpen(false); setEditingDecision(null); newDecisionIdRef.current = null; }}
        decision={editingDecision}
        participants={decisionParticipants}
        onSubmit={handleDecisionSubmit}
        onUploadDocs={handleDecisionUploadDocs}
      />

      {/* Archive a meeting — manage roles only (the row menu already gates it). */}
      <ConfirmModal
        open={!!archivingDecision}
        onClose={() => setArchivingDecision(null)}
        onConfirm={handleDecisionArchiveConfirm}
        title="Archive this management decision?"
        message={archivingDecision ? `${archivingDecision.reference ?? ""} — ${archivingDecision.topic}. It will be hidden from the register. The record itself is retained for the audit trail.` : ""}
        confirmLabel="Archive"
        variant="danger"
        icon={Archive}
        loading={decisionArchiveBusy}
      />

      {/* Popups */}
      <Popup isOpen={decisionSavedPopup} variant="success" title="Management decision recorded" description="Saved and recorded in the audit trail." onDismiss={() => setDecisionSavedPopup(false)} />
      <Popup isOpen={decisionArchivedPopup} variant="success" title="Management decision archived" description="Removed from the active register." onDismiss={() => setDecisionArchivedPopup(false)} />
      <Popup isOpen={riskSavedPopup} variant="success" title="Risk saved" description="Recorded in the risk register and the audit trail." onDismiss={() => setRiskSavedPopup(false)} />
      <Popup isOpen={riskArchivedPopup} variant="success" title="Risk archived" description="Removed from the active register." onDismiss={() => setRiskArchivedPopup(false)} />
      <Popup isOpen={reportGeneratedPopup} variant="success" title="Report generated ✅" description="Exported successfully." onDismiss={() => setReportGeneratedPopup(false)} />
        </div>
      </PageLayout>
  );
}
