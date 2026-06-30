"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Send, ShieldCheck, AlertTriangle, Lock, Clock, Link2, Users, Check, History, TrendingUp,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { StatusPill, CAPA_STATUS_TOKEN } from "./lib/statusTokens";
import { STATUS_LABEL, isOverdue as isOverdueHelper } from "@/types/capa";
import { displayUserName, displaySiteName } from "@/lib/identity-display";
import type { CAPA } from "@/store/capa.slice";
import type { CAPAReadiness } from "@/lib/capa-readiness";
import {
  submitForReview as submitForReviewServer,
  rejectCAPA as rejectCAPAServer,
  signAndCloseCAPA as signAndCloseCAPAServer,
  updateCAPA as updateCAPAServer,
  startCAPAProgress as startCAPAProgressServer,
} from "@/actions/capas";
import { OverviewBody } from "./modals/sections/OverviewBody";
import { RcaBody } from "./modals/sections/RcaBody";
// Phase B — sections relocated out of the old ActionsPanel into their zones:
// Discussion/Approvals/Verification → Overview; ActionItems+Alignment → Actions;
// Effectiveness → Criteria. The components themselves are rendered untouched.
import { ActionItemsSection } from "./tabs/sections/ActionItemsSection";
import { AlignmentReviewSection } from "./tabs/sections/AlignmentReviewSection";
import { DiscussionSection } from "./tabs/sections/DiscussionSection";
import { ApprovalsSection } from "./tabs/sections/ApprovalsSection";
import { VerificationSection } from "./tabs/sections/VerificationSection";
import { EffectivenessSection } from "./tabs/sections/EffectivenessSection";
import { EvidenceCollectionPanel } from "./tabs/EvidenceCollectionPanel";
import { EffectivenessCriteriaPanel } from "./tabs/EffectivenessCriteriaPanel";
import { SubmissionChecklist } from "./modals/components/SubmissionChecklist";
import { FlowExplainer } from "./components/FlowExplainer";
import { CapaAuditTrailBar } from "./components/CapaAuditTrailBar";
import { SignCloseModal } from "./modals/SignCloseModal";
import { EditCAPAModal, type EditForm } from "./modals/EditCAPAModal";
import { getNextStep, type DetailSubTab } from "./modals/helpers/getNextStep";
import type { CapaAuditEntry, CAPAOriginDoc } from "@/lib/queries/capas";

const SOURCE_LABEL: Record<string, string> = {
  "483": "FDA 483 Observation", "Gap Assessment": "Gap Assessment Finding", Deviation: "Deviation Report",
  "Internal Audit": "Internal Audit", Complaint: "Complaint", OOS: "OOS", "Change Control": "Change Control",
};

export interface CAPADetailPageProps {
  capa: CAPA;
  /** Server-computed readiness (full inputs) — drives the in_progress banner. */
  readiness: CAPAReadiness;
  evidence: { resolved: number; total: number };
  criteriaCount: number;
  /** Phase B — Zone 6 audit trail for this CAPA (newest first). */
  auditTrail: CapaAuditEntry[];
  /** Req 4 — read-only deviation+task doc references when raised from a deviation. */
  originDocs?: CAPAOriginDoc[];
}

export function CAPADetailPage({ capa, readiness, evidence, criteriaCount, auditTrail, originDocs = [] }: CAPADetailPageProps) {
  const router = useRouter();
  const { canSign, canCloseCapa, isViewOnly } = useRole();
  const capaCan = usePermissions("capa", { capaRisk: capa.risk });
  const { isQAHead } = usePermissions();
  const complianceUsers = useComplianceUsers();
  const { users, org, sites } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const isDark = useAppSelector((s) => s.theme.mode === "dark");
  const currentUser = useAppSelector((s) => s.auth.user);

  const [activeTab, setActiveTab] = useState<DetailSubTab>("overview");
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reworkIds, setReworkIds] = useState<string[]>([]);
  const [signOpen, setSignOpen] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  // Phase B — bumps when the Discussion thread mutates so ApprovalsSection's
  // close-gate re-evaluates against fresh comment state (was owned by ActionsPanel).
  const [discussionVersion, setDiscussionVersion] = useState(0);
  const [flowOpen, setFlowOpen] = useState(false);

  // Phase B — banner Approve/Verify CTAs anchor-scroll to their relocated
  // sections (now in the Overview tab) and still fire the wired e-sign flow.
  function goToSection(anchorId: string) {
    clearFilter();
    setActiveTab("overview");
    // Defer until the Overview tab has painted, then scroll the section in.
    setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  // Batch 3a #5 — header "Audit" button: expand + scroll to the Zone-6 bar
  // (which stays at the bottom on every tab; nothing is hidden or moved).
  function openAudit() {
    const el = document.getElementById("capa-audit-bar") as HTMLDetailsElement | null;
    if (el) { el.open = true; el.scrollIntoView({ behavior: "smooth", block: "start" }); }
  }

  const actionItems = capa.actionItems ?? [];
  const liveActions = actionItems.filter((a) => a.status !== "skipped");
  const doneActions = actionItems.filter((a) => a.status === "complete" || a.status === "skipped").length;
  const reworkCount = actionItems.filter((a) => a.status === "rework" || a.reworkReason).length;
  const reference = capa.reference ?? `CAPA-LEGACY-${capa.id.slice(0, 8)}`;

  const isAuthor = capaCan.canEdit; // COMPLIANCE_AUTHOR_ROLES mirror
  const isDriver = !isViewOnly && !!capa.owner && capa.owner === currentUser?.id;
  const editAllowed = !isViewOnly && capa.status !== "closed" && capaCan.canEdit;

  // People pills — distinct contributors (driver + action owners).
  const contributors = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; rework: boolean; driver: boolean }>();
    if (capa.owner) map.set(capa.owner, { id: capa.owner, name: displayUserName(capa.owner, users), count: 0, rework: false, driver: true });
    for (const a of actionItems) {
      if (!a.ownerId) continue;
      const e = map.get(a.ownerId) ?? { id: a.ownerId, name: displayUserName(a.ownerId, users), count: 0, rework: false, driver: false };
      e.count += 1;
      if (a.status === "rework" || a.reworkReason) e.rework = true;
      map.set(a.ownerId, e);
    }
    return [...map.values()];
  }, [capa.owner, actionItems, users]);

  const filterActive = selectedPerson !== null;
  const filteredPersonName = filterActive ? (contributors.find((c) => c.id === selectedPerson)?.name ?? "user") : "";
  const personActionCount = filterActive ? actionItems.filter((a) => a.ownerId === selectedPerson).length : 0;

  const nextStep = getNextStep({
    capa, readiness, timezone, dateFormat,
    onChangeTab: setActiveTab, onSubmitForReview: () => void handleSubmit(),
  });

  function clearFilter() { setSelectedPerson(null); }

  async function handleSubmit() {
    clearFilter();
    setBusy(true); setErrorMsg("");
    const res = await submitForReviewServer(capa.id);
    setBusy(false);
    if (!res.success) { setErrorMsg(res.error || "Submit failed"); return; }
    setOkMsg("Submitted for QA review."); router.refresh();
  }

  async function handleReject() {
    if (rejectReason.trim().length < 5) { setErrorMsg("Add a rejection reason (at least 5 characters)."); return; }
    clearFilter();
    setBusy(true); setErrorMsg("");
    const res = await rejectCAPAServer(capa.id, { reason: rejectReason.trim(), reworkItems: reworkIds });
    setBusy(false);
    if (!res.success) { setErrorMsg(res.error || "Reject failed"); return; }
    setRejectOpen(false); setRejectReason(""); setReworkIds([]);
    setOkMsg("Returned for rework."); router.refresh();
  }

  async function handleSignClose(data: { meaning: string; password: string; effectivenessConfirmed: boolean }) {
    clearFilter();
    setSignBusy(true); setSignError(null);
    const res = await signAndCloseCAPAServer(capa.id, { password: data.password, signatureMeaning: data.meaning, effectivenessConfirmed: data.effectivenessConfirmed });
    setSignBusy(false);
    if (!res.success) { setSignError(res.error || "Sign & close failed."); return; }
    setSignOpen(false); setOkMsg("CAPA signed and closed."); router.refresh();
  }

  function handleEditSave(data: EditForm) {
    // Phase E-REVERT — Edit authors RCA again; entering RCA on an open CAPA
    // auto-advances it to in_progress (original behavior).
    const autoAdvance = capa.status === "open" && !!data.rca?.trim();
    setBusy(true); setErrorMsg("");
    void (async () => {
      const res = await updateCAPAServer(capa.id, {
        title: data.title,
        description: data.description, owner: data.owner, dueDate: data.dueDate,
        risk: data.risk as never, rcaMethod: (data.rcaMethod as string) || undefined, rca: data.rca ?? "",
        rcaDetail: data.rcaDetail,
        // Batch 2b — DI gate detail (server stamps the review date).
        diGate: data.diGate,
        diGateStatus: data.diGateStatus,
        diGateReviewedBy: data.diGateReviewedBy,
        diGateNotes: data.diGateNotes,
      });
      if (!res.success) { setBusy(false); setErrorMsg(res.error || "Save failed"); return; }
      if (autoAdvance) await startCAPAProgressServer(capa.id);
      setBusy(false); setEditOpen(false); setOkMsg("CAPA updated."); router.refresh();
    })();
  }

  // ── Status-morphing readiness/action row — Phase J: returns INNER content
  //    only (no card chrome). It is rendered inside the one header card, below
  //    the divider, above the readiness rail. All handlers are unchanged so
  //    submit / approve / reject / sign still fire exactly as before. ──
  function renderBanner() {
    if (capa.status === "in_progress" || capa.status === "open") {
      const canSubmit = isDriver || isAuthor;
      return (
        <div>
          {capa.rejectionReason && (
            <div className="alert mb-2 flex items-start gap-2" style={{ background: "var(--danger-bg, #fef2f2)", border: "1px solid var(--danger)" }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <span className="text-[11px]" style={{ color: "var(--danger)" }}><strong>QA returned this CAPA:</strong> {capa.rejectionReason}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[13px] font-semibold flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-primary)" }}>
                <span>Ready to submit: {readiness.conditions.filter((c) => c.met).length} of {readiness.conditions.length} done</span>
                {!readiness.allMet && nextStep.targetTab && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button type="button" onClick={() => setActiveTab(nextStep.targetTab!)} className="underline bg-transparent border-none cursor-pointer p-0 font-semibold" style={{ color: "var(--brand)" }}>
                      next: {nextStep.title}
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setFlowOpen(true)} aria-label="How a CAPA flows" title="How a CAPA flows" className="w-4 h-4 inline-flex items-center justify-center rounded-full border text-[10px] bg-transparent cursor-pointer" style={{ color: "var(--text-muted)", borderColor: "var(--bg-border)" }}>?</button>
              </p>
              <button type="button" onClick={() => setChecklistOpen((v) => !v)} className="text-[11px] underline bg-transparent border-none cursor-pointer p-0" style={{ color: "var(--brand)" }}>
                {checklistOpen ? "Hide checklist" : "Show checklist"}
              </button>
            </div>
            {canSubmit && (
              <div className="flex flex-col items-end gap-1">
                <Button variant="primary" size="sm" icon={Send} disabled={!readiness.allMet || busy} loading={busy}
                  onClick={() => void handleSubmit()} title={readiness.allMet ? "Submit for QA review" : "Complete the checklist items first."}>
                  Submit for review
                </Button>
                {!readiness.allMet && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Complete the checklist items first.</span>}
              </div>
            )}
          </div>
          {checklistOpen && <div className="mt-2"><SubmissionChecklist conditions={readiness.conditions} onChangeTab={setActiveTab} /></div>}
        </div>
      );
    }
    if (capa.status === "pending_qa_review") {
      return (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: "var(--status-waiting)" }}>
            <Clock className="w-4 h-4" aria-hidden="true" /> Awaiting QA review.
          </p>
          <div className="flex gap-2">
            {capaCan.canApprove && (
              <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => goToSection("capa-approvals")}>Record approval</Button>
            )}
            {isQAHead && (
              <Button variant="danger" size="sm" icon={AlertTriangle} onClick={() => { clearFilter(); setRejectOpen(true); }}>Reject</Button>
            )}
            {canSign && canCloseCapa && (
              <Button variant="primary" size="sm" icon={ShieldCheck} onClick={() => { clearFilter(); setSignError(null); setSignOpen(true); }}>Sign &amp; Close</Button>
            )}
          </div>
        </div>
      );
    }
    if (capa.status === "pending_verification") {
      const verifiedTint = capa.verifiedAt;
      return (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: verifiedTint ? "var(--status-done)" : "var(--status-active)" }}>
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            {capa.verifiedAt ? "Verified — ready for sign & close." : "Awaiting independent QA verification."}
          </p>
          <div className="flex gap-2">
            {capaCan.canApprove && !capa.verifiedAt && (
              <Button variant="secondary" size="sm" icon={ShieldCheck} onClick={() => goToSection("capa-verification")}>Verify</Button>
            )}
            {canSign && canCloseCapa && (
              <Button variant="primary" size="sm" icon={ShieldCheck} onClick={() => { clearFilter(); setSignError(null); setSignOpen(true); }}>Sign &amp; Close</Button>
            )}
          </div>
        </div>
      );
    }
    // closed — grey, locked
    return (
      <div>
        <p className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <Lock className="w-4 h-4" aria-hidden="true" /> Closed{capa.closedAt ? ` on ${dayjs.utc(capa.closedAt).tz(timezone).format(dateFormat)}` : ""}.
        </p>
        {capa.effectivenessCheck && capa.effectivenessDate && (
          <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            90-day effectiveness check due {dayjs.utc(capa.effectivenessDate).tz(timezone).format(dateFormat)}
            {capa.effectivenessVerdict ? ` — verdict: ${capa.effectivenessVerdict}` : " — review on the Criteria tab."}
          </p>
        )}
      </div>
    );
  }

  // ── Phase J: the readiness RAIL — a horizontal projection of the SAME
  //    readiness object (readiness.conditions), in gate order. Each stop's
  //    done/active/pending is read from .met (never recomputed). It therefore
  //    always agrees with the "N of M done" text above it. ──
  const RAIL_LABEL: Record<string, string> = {
    rca: "RCA", alignment: "Alignment", diGate: "DI gate", actions: "Actions", evidence: "Evidence", criteria: "Criteria",
  };
  function railCount(key: string): string | null {
    if (key === "actions") return `${doneActions}/${actionItems.length}`;
    if (key === "evidence") return `${evidence.resolved}/${evidence.total}`;
    return null;
  }
  function renderRail() {
    const firstUnmet = readiness.conditions.findIndex((c) => !c.met);
    return (
      <div className="mt-3 pt-3 overflow-x-auto" style={{ borderTop: "1px solid var(--card-border, var(--bg-border))" }}>
        <ol className="flex items-center gap-0 list-none p-0 m-0 min-w-max">
          {readiness.conditions.map((c, i) => {
            const state = c.met ? "done" : i === firstUnmet ? "active" : "pending";
            const color = state === "done" ? "var(--status-done)" : state === "active" ? "var(--status-active)" : "var(--text-muted)";
            const cnt = railCount(c.key);
            return (
              <li key={c.key} className="flex items-center">
                <div className="flex items-center gap-1.5 px-1">
                  <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={state === "done" ? { background: "var(--status-done)", color: "#fff" }
                      : state === "active" ? { border: `2px solid ${color}`, color }
                      : { border: "1px solid var(--card-border, var(--bg-border))", color }}>
                    {c.met ? <Check className="w-3 h-3" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: state === "pending" ? "var(--text-muted)" : "var(--text-primary)" }}>
                    {RAIL_LABEL[c.key] ?? c.label}{cnt ? ` ${cnt}` : ""}
                  </span>
                </div>
                {i < readiness.conditions.length - 1 && (
                  <span className="h-0.5 shrink-0 mx-1" style={{ width: 18, background: c.met ? "var(--status-done)" : "var(--card-border, var(--bg-border))" }} aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  const rcaState = capa.rcaApproved === true ? "✓" : "⚠";
  const tabs: { id: DetailSubTab; label: string; badge: string | null }[] = [
    { id: "overview", label: "Overview", badge: null },
    { id: "rca", label: "RCA", badge: rcaState },
    { id: "actions", label: "Actions", badge: filterActive ? `${personActionCount} of ${liveActions.length}` : (liveActions.length ? `${doneActions}/${actionItems.length}` : null) },
    { id: "evidence", label: "Evidence", badge: `${evidence.resolved}/${evidence.total}` },
    { id: "criteria", label: "Criteria", badge: criteriaCount ? String(criteriaCount) : null },
  ];

  const noneOfTheirs = (
    <p className="text-[12px] italic p-4" style={{ color: "var(--text-muted)" }}>(none of theirs) — clear the person filter to see this tab.</p>
  );

  return (
    <main className="capa-shell w-full min-h-full">
      {/* Phase F — contained, centered ~900px sheet with comfortable margins. */}
      {/* Phase J — full-width, left-aligned content (no narrow centered column,
          no centered margins). Side padding comes from the app work-area main. */}
      <div className="w-full max-w-[1400px] pb-8">
      <button type="button" onClick={() => router.push("/capa")} className="text-[12px] inline-flex items-center gap-1 bg-transparent border-none cursor-pointer mb-3" style={{ color: "var(--text-secondary)" }}>
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to CAPA Tracker
      </button>

      {/* ── ONE HEADER CARD (Phase J): identity + readiness line + rail merged
          into a single card. Replaces the old separate header band, banner, and
          Phase-I stepper — one progress representation on the page. ── */}
      <div className="capa-card mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-md border" style={{ color: "var(--text-secondary)", borderColor: "var(--card-border)", background: "var(--bg-elevated)" }}>{reference}</span>
          <Badge variant={getSeverityVariant(capa.risk, "generic")}>{normalizeSeverityForDisplay(capa.risk, "generic") ?? capa.risk}</Badge>
          <StatusPill token={CAPA_STATUS_TOKEN[capa.status]}>{STATUS_LABEL[capa.status]}</StatusPill>
          {isOverdueHelper(capa) && <StatusPill token="blocked">Overdue</StatusPill>}
          {reworkCount > 0 && <StatusPill token="blocked">Rework {reworkCount}</StatusPill>}
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Due {dayjs.utc(capa.dueDate).tz(timezone).format(dateFormat)}</span>
          {capa.findingId && (
            <button type="button" onClick={() => router.push(`/gap-assessment?openFindingId=${encodeURIComponent(capa.findingId!)}`)} className="text-[12px] inline-flex items-center gap-1 bg-transparent border-none cursor-pointer" style={{ color: "#0ea5e9" }}>
              <Link2 className="w-3 h-3" aria-hidden="true" /> {SOURCE_LABEL[capa.source] ?? capa.source}
            </button>
          )}
          {/* Batch 3a #5 — quick jump to the always-present Zone-6 audit bar. */}
          <button type="button" onClick={openAudit} className="ml-auto text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent cursor-pointer transition-colors hover:bg-(--bg-hover)" style={{ color: "var(--text-secondary)", borderColor: "var(--card-border)" }}>
            <History className="w-3 h-3" aria-hidden="true" /> Audit
          </button>
          {editAllowed && (
            <button type="button" onClick={() => setEditOpen(true)} className="text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent cursor-pointer transition-colors hover:bg-(--bg-hover)" style={{ color: "var(--text-secondary)", borderColor: "var(--card-border)" }}>
              <Pencil className="w-3 h-3" aria-hidden="true" /> Edit
            </button>
          )}
        </div>
        {/* Title (focal) — fall back to the first line of the description, then
            the reference, so the header is never blank. */}
        <h1 className="text-[20px] font-semibold mt-2.5 leading-snug" style={{ color: "var(--text-primary)" }}>
          {capa.title?.trim() || capa.description?.split("\n")[0]?.trim().slice(0, 120) || reference}
        </h1>
        <p className="text-[12px] mt-1.5" style={{ color: "var(--text-muted)" }}>
          Site: {displaySiteName(capa.siteId, sites)} <span aria-hidden="true">·</span> Author: {capa.createdBy ?? "—"} <span aria-hidden="true">·</span> Assigned to: {capa.owner ? displayUserName(capa.owner, users) : "Unassigned"}
        </p>

        {/* Divider, then the status-morphing readiness/action row + the rail. */}
        <div className="my-3" style={{ borderTop: "1px solid var(--card-border, var(--bg-border))" }} />
        {renderBanner()}
        {renderRail()}
      </div>

      {/* ── PEOPLE PILLS (Phase F — leading "Everyone" reset pill) ── */}
      {contributors.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Users className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          {/* Everyone = the filter-reset; highlighted when no person filter is active. */}
          <button type="button" onClick={clearFilter} aria-pressed={!filterActive}
            className="text-[11px] px-2 py-0.5 rounded-full border cursor-pointer"
            style={!filterActive
              ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
              : { background: "transparent", color: "var(--text-secondary)", borderColor: "var(--bg-border)" }}>
            Everyone
          </button>
          {contributors.map((c) => (
            <button key={c.id} type="button" aria-pressed={selectedPerson === c.id}
              onClick={() => setSelectedPerson((prev) => (prev === c.id ? null : c.id))}
              className="text-[11px] px-2 py-0.5 rounded-full border cursor-pointer"
              style={selectedPerson === c.id
                ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" }
                : { background: "transparent", color: "var(--text-secondary)", borderColor: "var(--bg-border)" }}>
              {c.name} {c.count}{c.driver ? " ·drv" : ""}{c.rework ? " [R]" : ""}
            </button>
          ))}
        </div>
      )}

      {/* ── Loud person-filter banner ── */}
      {filterActive && (
        <div className="alert mb-3 flex items-center justify-between gap-2" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
          <span className="text-[12px]" style={{ color: "var(--warning)" }}>
            Showing <strong>{filteredPersonName}</strong> only — Actions shows their items; RCA / Evidence / Criteria hidden.
          </span>
          <Button variant="secondary" size="xs" onClick={clearFilter}>Everyone</Button>
        </div>
      )}

      {/* ── TABS ── */}
      <div role="tablist" aria-label="CAPA detail sections" className="flex gap-1 mb-4 border-b" style={{ borderColor: "var(--bg-border)" }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} onClick={() => setActiveTab(t.id)}
            className={activeTab === t.id
              ? "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer font-medium"
              : "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer font-normal"}
            style={activeTab === t.id ? { borderBottomColor: "var(--brand)", color: "var(--text-primary)" } : { borderBottomColor: "transparent", color: "var(--text-secondary)" }}>
            {t.label}
            {t.badge && <span className="inline-flex items-center justify-center text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* Phase J — single-column, full-width tab content (Phase-I side card removed;
          CAPA metadata lives in the header card + Overview's meta block). */}
      {/* ZONE 5 — Overview: description/classification/source (OverviewBody),
          then the relocated Discussion / Approvals / Verification sections
          (anchored so the banner CTAs can scroll to them). */}
      {activeTab === "overview" && (
        <div className="capa-stack">
          <OverviewBody capa={capa} isDark={isDark} users={users} timezone={timezone} dateFormat={dateFormat}
            showMigrationNotice={false} onDismissNotice={() => undefined}
            onNavigateGap={(fid) => router.push(`/gap-assessment?openFindingId=${encodeURIComponent(fid)}`)}
            onEditOpen={() => setEditOpen(true)} editAllowed={editAllowed} originDocs={originDocs} />
          {/* Phase D — wrap the relocated (protected) sections in a card; internals untouched. */}
          <section id="capa-discussion" className="capa-card"><DiscussionSection capa={capa} onCommentsChange={() => setDiscussionVersion((v) => v + 1)} /></section>
          {/* Batch 3a #2 — Approvals + Independent Verification combined into ONE
              card, two sub-sections. Anchor ids kept on the inner divs so the
              banner CTAs still scroll here; section components unchanged. */}
          <section className="capa-card">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div id="capa-approvals" className="min-w-0"><ApprovalsSection capa={capa} discussionVersion={discussionVersion} /></div>
              <div id="capa-verification" className="min-w-0 lg:pl-4 lg:border-l" style={{ borderColor: "var(--card-border, var(--bg-border))" }}><VerificationSection capa={capa} /></div>
            </div>
          </section>
        </div>
      )}
      {activeTab === "rca" && (filterActive ? noneOfTheirs : <div className="capa-card"><RcaBody capa={capa} /></div>)}
      {/* Actions — action-items table + Alignment Review only. */}
      {activeTab === "actions" && (
        <div className="capa-stack">
          <div className="capa-card"><ActionItemsSection capa={capa} ownerFilter={selectedPerson} /></div>
          {!filterActive && <div className="capa-card"><AlignmentReviewSection capa={capa} onAlignmentChange={() => router.refresh()} /></div>}
        </div>
      )}
      {activeTab === "evidence" && (filterActive ? noneOfTheirs : (
        <div className="capa-card"><EvidenceCollectionPanel capaId={capa.id} readOnly={isViewOnly || capa.status === "closed"} capaStatus={capa.status} canRejectEvidence={isQAHead} /></div>
      ))}
      {/* Criteria — criteria list + the 90-day Effectiveness Review beneath. */}
      {activeTab === "criteria" && (filterActive ? noneOfTheirs : (
        <div className="capa-stack">
          <div className="capa-card"><EffectivenessCriteriaPanel capaId={capa.id} capaStatus={capa.status} readOnly={isViewOnly || capa.status === "closed"} /></div>
          {/* Batch 3a #3 — Effectiveness review is premature before closure, so
              collapse it by default (quiet summary; expands on demand). It's
              auto-open once the CAPA is closed (when it's actually actionable). */}
          <details className="capa-card" open={capa.status === "closed"}>
            <summary className="cursor-pointer list-none text-[12px] font-medium flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
              Effectiveness review — scheduled 90 days after closure
            </summary>
            <div className="mt-3"><EffectivenessSection capa={capa} /></div>
          </details>
        </div>
      ))}

      {/* ZONE 6 — collapsed audit-trail bar, visible on every tab. */}
      <CapaAuditTrailBar entries={auditTrail} timezone={timezone} dateFormat={dateFormat} />

      {/* G3 — flow explainer (also opened from the tracker's status guide). */}
      <FlowExplainer open={flowOpen} onClose={() => setFlowOpen(false)} />

      {/* ── Targeted reject dialog ── */}
      {rejectOpen && (
        <Modal open onClose={() => setRejectOpen(false)} title="Return CAPA for rework">
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
            The CAPA returns to <strong>in progress</strong>. Select the action items to send back for rework (optional).
          </p>
          <textarea className="input text-[12px] w-full min-h-20 mb-2" placeholder="Rejection reason (≥ 5 chars) — what must be fixed?"
            value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={2000} />
          <div className="space-y-1 mb-2 max-h-48 overflow-y-auto">
            {actionItems.map((a) => (
              <label key={a.id} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={reworkIds.includes(a.id)}
                  onChange={(e) => setReworkIds((prev) => e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id))} />
                <span>#{a.sequence} {a.description} <span style={{ color: "var(--text-muted)" }}>· {displayUserName(a.ownerId ?? a.owner, users)}</span></span>
              </label>
            ))}
            {actionItems.length === 0 && <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No action items to flag.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="danger" size="sm" disabled={busy || rejectReason.trim().length < 5} loading={busy} onClick={() => void handleReject()}>Return for rework</Button>
          </div>
        </Modal>
      )}

      <SignCloseModal isOpen={signOpen} onClose={() => { setSignOpen(false); setSignError(null); }} onSign={handleSignClose} capa={capa} error={signError} busy={signBusy} />
      <EditCAPAModal isOpen={editOpen} onClose={() => setEditOpen(false)} onSave={handleEditSave} capa={capa} users={complianceUsers} />

      <Popup isOpen={!!okMsg} variant="success" title="Done" description={okMsg} onDismiss={() => setOkMsg("")} />
      <Popup isOpen={!!errorMsg} variant="error" title="Action failed" description={errorMsg} onDismiss={() => setErrorMsg("")} />
      </div>
    </main>
  );
}
