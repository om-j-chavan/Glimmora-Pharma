"use client";

/**
 * CAPADetailPageV2 — a NEW detail shell that REUSES every gate, handler, server
 * action, and section from CAPADetailPage.tsx. This file changes ONLY layout /
 * composition / grouping. It re-implements NO gate, signing, evidence, approval,
 * or readiness logic — each of those is imported verbatim from the same source
 * the original uses.
 *
 * Redesign (vs CAPADetailPage.tsx):
 *  - ONE status-morphing decision zone replaces the banner + 6-stop rail +
 *    checklist. The authoring readiness readout renders ONLY in pre-submit
 *    states (open/in_progress) — never in pending_qa_review or closed
 *    (kills the "rail past that phase" noise + the readiness triplication).
 *  - FOUR task-named tabs: Summary · Investigation (RCA + Action Plan) ·
 *    Evidence · Review (Approvals + Concerns). Approvals/Discussion move OUT of
 *    Overview into a findable "Review" tab; the page LANDS on Review when the
 *    CAPA is pending_qa_review, else Summary.
 *  - The pinned CapaAuditTrailBar stays on every tab (Part 11).
 *  - People-pills / person-filter are DELIBERATELY OMITTED (flagged for review).
 *
 * The original CAPADetailPage.tsx is untouched and still owns the live route.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RaisedFromRiskBanner } from "@/components/shared/RaisedFromRiskBanner";
import {
  ArrowLeft, Pencil, Send, ShieldCheck, AlertTriangle, Lock, Clock, Link2, Check, History, TrendingUp, FileText,
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
import { roleLabel } from "@/lib/labels/roles";
import { REJECT_REASON_MIN } from "@/constants/capaValidation";
import { StatusPill, CAPA_STATUS_TOKEN } from "./lib/statusTokens";
import { STATUS_LABEL, isOverdue as isOverdueHelper } from "@/types/capa";
import { displayUserName, displaySiteName } from "@/lib/identity-display";
import type { CAPA } from "@/store/capa.slice";
import { DONE_ACTION_STATUSES, type CAPAReadiness } from "@/lib/capa-readiness";
import {
  submitForReview as submitForReviewServer,
  rejectCAPA as rejectCAPAServer,
  signAndCloseCAPA as signAndCloseCAPAServer,
  updateCAPA as updateCAPAServer,
  startCAPAProgress as startCAPAProgressServer,
} from "@/actions/capas";
import { loadCommentsForCAPA } from "@/actions/capa-comments";
import { removeEvidenceFile } from "@/actions/evidence";
import { OverviewBody } from "./modals/sections/OverviewBody";
import { RcaBody } from "./modals/sections/RcaBody";
import { AlignmentReviewSection } from "./tabs/sections/AlignmentReviewSection";
import { RcaReviewSection } from "./modals/sections/RcaReviewSection";
import { DiGateCard } from "./tabs/sections/DiGateCard";
import { DiscussionSection } from "./tabs/sections/DiscussionSection";
import { EffectivenessSection } from "./tabs/sections/EffectivenessSection";
import { EvidenceCollectionPanel } from "./tabs/EvidenceCollectionPanel";
import { AssignmentsTab } from "./tabs/AssignmentsTab";
import { EffectivenessCriteriaPanel } from "./tabs/EffectivenessCriteriaPanel";
import { SubmissionChecklist } from "./modals/components/SubmissionChecklist";
import { ReadinessCopilotPanel } from "./modals/components/ReadinessCopilotPanel";
import { FlowExplainer } from "./components/FlowExplainer";
import { SodOverrideBadge, SodOverrideSummary } from "./components/SodOverrideNotes";
import { SignCloseModal } from "./modals/SignCloseModal";
import { EditCAPAModal, type EditForm } from "./modals/EditCAPAModal";
import { getNextStep, type DetailSubTab } from "./modals/helpers/getNextStep";
import type { CapaAuditEntry, CAPAOriginDoc, CAPAAddedFile, CAPAEvidenceFileRef, CAPACarriedNote } from "@/lib/queries/capas";
import type { FindingAuditEntry } from "@/lib/queries/findings";

const SOURCE_LABEL: Record<string, string> = {
  "483": "FDA 483 Observation", "Gap Assessment": "Gap Assessment Finding", Deviation: "Deviation Report",
  "Internal Audit": "Internal Audit", Complaint: "Complaint", OOS: "OOS", "Change Control": "Change Control",
};

/** V2's four task-named tabs. */
type V2Tab = "summary" | "assignments" | "evidence" | "review";
/** Bridge: the shared sections/helpers (SubmissionChecklist, ReadinessCopilotPanel,
 *  getNextStep) still speak in DetailSubTab; map their target onto the V2 tab that
 *  now hosts that surface so a "fix this / go to X" click lands correctly. */
const SUB_TO_V2: Record<DetailSubTab, V2Tab> = {
  overview: "summary",
  rca: "review",         // Phase 4 — RCA moved into the Review tab
  actions: "assignments", // Phase 4 — Action Plan → Assignments (Phase 5 stub)
  evidence: "evidence",
  criteria: "review", // effectiveness criteria live on the Review tab in V2
};

const RAIL_LABEL: Record<string, string> = {
  rca: "RCA", alignment: "Alignment", diGate: "DI gate", actions: "Actions", evidence: "Evidence", criteria: "Criteria",
};

/* ── Phase 4 — Summary History: the story of what happened, reasons inline. ──
 * Per-action audit JSON shapes differ (parsed defensively). *_BLOCKED_* rows are
 * refused attempts (not what happened); *_SIGNED / comment rows duplicate their
 * workflow row — all excluded. Reasons come from the audit newValue (per-event,
 * truncated to 200 at write); closing notes come from CAPA.closingNotes (full,
 * one closure event so no misattribution). */
function parseAuditJson(s: string | null): Record<string, unknown> {
  if (!s) return {};
  try { const j = JSON.parse(s); return j && typeof j === "object" ? (j as Record<string, unknown>) : {}; } catch { return {}; }
}
function humanizeCapaAction(a: string): string {
  const t = a.replace(/^CAPA_/, "").replace(/_/g, " ").toLowerCase().trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
interface HistoryItem { id: string; label: string; detail?: string; who: string; role: string | null; when: string; }
function toHistoryItem(e: CapaAuditEntry, capa: CAPA): HistoryItem | null {
  if (e.action.includes("BLOCKED")) return null;
  if (/_SIGNED$/.test(e.action) || e.action.startsWith("CAPA_COMMENT_")) return null;
  const nv = parseAuditJson(e.newValue);
  const ov = parseAuditJson(e.oldValue);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const owner = (o: unknown) => {
    const n = o && typeof o === "object" ? (o as Record<string, unknown>).ownerName : undefined;
    return typeof n === "string" && n ? n : "?";
  };
  const base = { id: e.id, who: e.userName, role: e.userRole, when: e.createdAt };
  switch (e.action) {
    case "CAPA_WORK_ACCEPTED": return { ...base, label: `${str(nv.ownerName) ?? "A worker"}'s work accepted${nv.itemCount ? ` (${nv.itemCount})` : ""}`, detail: str(nv.reviewNotes) };
    case "CAPA_WORK_SENT_BACK": return { ...base, label: `${str(nv.ownerName) ?? "A worker"}'s work sent back`, detail: str(nv.reason) };
    case "CAPA_TASK_SKIPPED": return { ...base, label: "Task skipped", detail: str(nv.reason) };
    case "CAPA_TASK_REASSIGNED": return { ...base, label: `Task reassigned: ${owner(ov.from)} → ${owner(nv.to)}`, detail: str(nv.reason) };
    case "CAPA_CLOSED": return { ...base, label: "Signed & closed", detail: capa.closingNotes || undefined };
    default: return { ...base, label: humanizeCapaAction(e.action) };
  }
}

// Same prop contract as CAPADetailPageProps so the route can pass identical props
// when/if it is swapped later (separate task).
export interface CAPADetailPageV2Props {
  capa: CAPA;
  readiness: CAPAReadiness;
  evidence: { resolved: number; total: number };
  auditTrail: CapaAuditEntry[];
  originDocs?: CAPAOriginDoc[];
  findingDocs?: CAPAOriginDoc[];
  findingAudit?: FindingAuditEntry[];
  qaAddedFiles?: CAPAAddedFile[];
  evidenceFiles?: CAPAEvidenceFileRef[];
  /** Gap work notes carried at raise, keyed to their author's card in Assignments. */
  carriedNotes?: CAPACarriedNote[];
}

export function CAPADetailPageV2({ capa, readiness, evidence, auditTrail, originDocs = [], findingDocs = [], findingAudit = [], qaAddedFiles = [], evidenceFiles = [], carriedNotes = [] }: CAPADetailPageV2Props) {
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

  // Item 19 — a carry QA ASKED FOR that the server couldn't make (createCAPA
  // writes CAPA_ASSIGNMENT_CARRY_SKIPPED with the reason, keyed to this CAPA).
  // The audit row is the record; nobody opens an audit trail to discover that
  // something DIDN'T happen, so it's surfaced in the Assignments tab — the one
  // place, and moment, where not knowing changes what QA does next (they'd
  // assign someone fresh, unaware the gap's assignee was meant to continue).
  // The reason is taken from the row: the skip has four distinct causes and only
  // one of them is about roles.
  const carrySkipped = useMemo(() => {
    const row = auditTrail.find((e) => e.action === "CAPA_ASSIGNMENT_CARRY_SKIPPED");
    if (!row?.newValue) return null;
    try {
      const v = JSON.parse(row.newValue) as { intendedAssigneeName?: string | null; reason?: string };
      return v.reason ? { assigneeName: v.intendedAssigneeName ?? null, reason: v.reason } : null;
    } catch {
      return null;
    }
  }, [auditTrail]);

  // Land on Review for the QA-decision state; Summary otherwise (spec).
  const [activeTab, setActiveTab] = useState<V2Tab>(capa.status === "pending_qa_review" ? "review" : "summary");
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
  const [discussionVersion, setDiscussionVersion] = useState(0);
  const [evidenceCounts, setEvidenceCounts] = useState(evidence);
  const [flowOpen, setFlowOpen] = useState(false);

  // Switch tab, then scroll a section into view once it has painted. Same 60ms
  // defer as the original's goToSection.
  function goToTabSection(tab: V2Tab, anchorId: string) {
    setActiveTab(tab);
    setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  // Phase 6 — the audit trail is a MODAL now (was a collapsed bar on every tab).
  // Full/unfiltered — the History card (Summary) stays the curated story; these
  // are two deliberately different surfaces (don't merge).
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  function openAudit() { setAuditModalOpen(true); }

  const actionItems = useMemo(() => capa.actionItems ?? [], [capa.actionItems]);
  // Pre-submit readout — derived from the SAME set getCAPAReadiness gates on
  // (capa-readiness.ts), never a re-listing of it. The inline
  // `complete || skipped` this replaced silently dropped "accepted", so a
  // QA-rejected CAPA bounced back to in_progress (rejectCAPA keeps accepted
  // items) rendered "Actions 1/2" while readiness.allMet was true and Submit
  // was live — the readout contradicting the gate it reports on.
  const doneActions = actionItems.filter((a) => DONE_ACTION_STATUSES.has(a.status)).length;
  // Phase 4 — QA-review readout: "accepted" (or skipped) is what closure requires
  // (Phase 2 acceptWork). Matches the server's all-accepted gate in closure.ts.
  // NOT DONE_ACTION_STATUSES: closure is strictly narrower than submit — a plain
  // `complete` item is ready to SUBMIT but still needs QA acceptance to CLOSE.
  const acceptedActions = actionItems.filter((a) => a.status === "accepted" || a.status === "skipped").length;
  const reworkCount = actionItems.filter((a) => a.status === "rework" || a.reworkReason).length;
  const reference = capa.reference ?? `CAPA-LEGACY-${capa.id.slice(0, 8)}`;

  // Gates — copied verbatim from CAPADetailPage.tsx (:143-145).
  const isAuthor = capaCan.canEdit; // COMPLIANCE_AUTHOR_ROLES mirror
  const isDriver = !isViewOnly && !!capa.owner && capa.owner === currentUser?.id;
  const editAllowed = !isViewOnly && capa.status !== "closed" && capaCan.canEdit;

  // Sign & Close gate — identical effect to the original (:152-175). The ONLY
  // change: keep the full ApprovalProgress (not just .satisfied) so the decision
  // zone can state, in words, WHAT still blocks closure. evaluateApprovalProgress
  // is reused verbatim; nothing here re-implements the gate.
  // Phase 4 — closure unblocks on ZERO unresolved concerns (the approver-count
  // gate was retired with approveCAPA; the server enforces the same in
  // closure.ts). null = not in a review state. Reused loadCommentsForCAPA — no
  // gate is re-implemented, just the same concern count the server reads.
  const [unresolvedConcerns, setUnresolvedConcerns] = useState<number | null>(null);
  const approvalsSatisfied = unresolvedConcerns === 0;
  // The SERVER's closure gates, mirrored (closure.ts :231-269 all-accepted,
  // :277-285 concerns), derived from the SAME acceptedActions the readout below
  // prints — so the readout can never say "ready" while the server says no. An
  // empty action list closes fine (closure.ts :228): 0 === 0. acceptedActions
  // counts "skipped" too, matching the server's accepted|skipped filter.
  const allActionsAccepted = acceptedActions === actionItems.length;
  // ONE derivation drives the gate AND the words. A reason that exists means
  // blocked; null means closable. Sign & Close is DISABLED (not hidden) with the
  // reason attached: a vanishing button is a mystery, a disabled one teaches.
  const closureBlockReason =
    unresolvedConcerns === null
      ? "Checking closure readiness…"
      : !allActionsAccepted
        ? `Accept or skip every person's work first — ${actionItems.length - acceptedActions} still unaccepted.`
        : unresolvedConcerns > 0
          ? `Resolve all concerns first (${unresolvedConcerns} open).`
          : null;
  const closureReady = closureBlockReason === null;
  useEffect(() => {
    if (capa.status !== "pending_qa_review" && capa.status !== "pending_verification") {
      setUnresolvedConcerns(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const cRes = await loadCommentsForCAPA(capa.id);
      if (cancelled) return;
      const comments = cRes.success ? (cRes.data as { isConcern: boolean; resolvedAt: Date | null; deletedAt: Date | null }[]) : [];
      setUnresolvedConcerns(comments.filter((c) => c.isConcern && !c.resolvedAt && !c.deletedAt).length);
    })();
    return () => { cancelled = true; };
  }, [capa.id, capa.status, discussionVersion]);

  const nextStep = getNextStep({
    capa, readiness, timezone, dateFormat,
    onChangeTab: (sub) => setActiveTab(SUB_TO_V2[sub]),
    onSubmitForReview: () => void handleSubmit(),
  });

  // ── Handlers — server calls, error handling, and router.refresh() are copied
  //    verbatim from CAPADetailPage.tsx (:202-252). The only lines dropped are the
  //    original clearFilter() calls, because V2 omits the person-filter. No server
  //    behaviour changes. ──
  async function handleSubmit() {
    setBusy(true); setErrorMsg("");
    const res = await submitForReviewServer(capa.id);
    setBusy(false);
    if (!res.success) { setErrorMsg(res.error || "Submit failed"); return; }
    setOkMsg("Submitted for QA review."); router.refresh();
  }

  async function handleReject() {
    if (rejectReason.trim().length < REJECT_REASON_MIN) { setErrorMsg(`Add a rejection reason (at least ${REJECT_REASON_MIN} characters).`); return; }
    setBusy(true); setErrorMsg("");
    const res = await rejectCAPAServer(capa.id, { reason: rejectReason.trim(), reworkItems: reworkIds });
    setBusy(false);
    if (!res.success) { setErrorMsg(res.error || "Reject failed"); return; }
    setRejectOpen(false); setRejectReason(""); setReworkIds([]);
    setOkMsg("Returned for rework."); router.refresh();
  }

  async function handleSignClose(data: { meaning: string; password: string; effectivenessConfirmed: boolean; closingNotes: string; sodOverrideReasonCode?: string; sodOverrideJustification?: string }) {
    setSignBusy(true); setSignError(null);
    const res = await signAndCloseCAPAServer(capa.id, { password: data.password, signatureMeaning: data.meaning, effectivenessConfirmed: data.effectivenessConfirmed, closingNotes: data.closingNotes, sodOverrideReasonCode: data.sodOverrideReasonCode, sodOverrideJustification: data.sodOverrideJustification });
    setSignBusy(false);
    if (!res.success) { setSignError(res.error || "Sign & close failed."); return; }
    setSignOpen(false); setOkMsg("CAPA signed and closed."); router.refresh();
  }

  function handleEditSave(data: EditForm) {
    const autoAdvance = capa.status === "open" && !!data.rca?.trim();
    setBusy(true); setErrorMsg("");
    void (async () => {
      const res = await updateCAPAServer(capa.id, {
        title: data.title,
        description: data.description, owner: data.owner, dueDate: data.dueDate,
        risk: data.risk as never, rcaMethod: (data.rcaMethod as string) || undefined, rca: data.rca ?? "",
        rcaDetail: data.rcaDetail,
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

  // Phase 4 — remove a qa_added reference/evidence file (soft-delete + audit live
  // in removeEvidenceFile). Only qa_added files reach this; null-provenance files
  // render read-only (no delete), preserving the Phase-3 backfill's deliberate null.
  async function handleDeleteAddedFile(fileId: string) {
    if (typeof window !== "undefined" && !window.confirm("Remove this document from the CAPA? It stays retained for audit (soft delete).")) return;
    const res = await removeEvidenceFile(fileId, { reason: "Document removed from the CAPA detail." });
    if (!res.success) { setErrorMsg(res.error || "Could not remove document."); return; }
    setOkMsg("Document removed."); router.refresh();
  }

  // Compact per-condition count for the pre-submit readout (same projection the
  // original rail used at :369-373 — reads counts, never recomputes readiness).
  function railCount(key: string): string | null {
    if (key === "actions") return `${doneActions}/${actionItems.length}`;
    if (key === "evidence") return `${evidence.resolved}/${evidence.total}`;
    return null;
  }

  // ── ONE decision zone that morphs by status ──
  function renderDecisionZone() {
    // Pre-submit — the ONLY place the authoring readiness readout renders.
    if (capa.status === "in_progress" || capa.status === "open") {
      const canSubmit = isDriver || isAuthor;
      const doneCount = readiness.conditions.filter((c) => c.met).length;
      return (
        <div>
          {capa.rejectionReason && (
            <div className="alert mb-2 flex items-start gap-2" style={{ background: "var(--danger-bg, #fef2f2)", border: "1px solid var(--danger)" }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <span className="text-[11px]" style={{ color: "var(--danger)" }}><strong>QA returned this CAPA:</strong> {capa.rejectionReason}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-primary)" }}>
                <span>Ready to submit: {doneCount} of {readiness.conditions.length} done</span>
                {!readiness.allMet && nextStep.targetTab && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button type="button" onClick={() => setActiveTab(SUB_TO_V2[nextStep.targetTab!])} className="underline bg-transparent border-none cursor-pointer p-0 font-semibold" style={{ color: "var(--brand)" }}>
                      next: {nextStep.title}
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setFlowOpen(true)} aria-label="How a CAPA flows" title="How a CAPA flows" className="w-4 h-4 inline-flex items-center justify-center rounded-full border text-[10px] bg-transparent cursor-pointer" style={{ color: "var(--text-muted)", borderColor: "var(--bg-border)" }}>?</button>
              </p>
              {/* Compact ONE-LINE readiness readout (replaces the 6-stop rail). A
                  projection of the same readiness.conditions — met/count only. */}
              <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                {readiness.conditions.map((c, i) => {
                  const cnt = railCount(c.key);
                  return (
                    <span key={c.key} className="inline-flex items-center gap-1">
                      {i > 0 && <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>·</span>}
                      {c.met
                        ? <Check className="w-3 h-3" style={{ color: "var(--status-done)" }} aria-hidden="true" />
                        : <span className="w-3 h-3 inline-flex items-center justify-center rounded-full border text-[8px]" style={{ borderColor: "var(--card-border, var(--bg-border))", color: "var(--text-muted)" }}>{i + 1}</span>}
                      <span style={{ color: c.met ? "var(--text-primary)" : "var(--text-muted)" }}>{RAIL_LABEL[c.key] ?? c.label}{cnt ? ` ${cnt}` : ""}</span>
                    </span>
                  );
                })}
              </div>
              <button type="button" onClick={() => setChecklistOpen((v) => !v)} className="text-[11px] underline bg-transparent border-none cursor-pointer p-0 mt-1" style={{ color: "var(--brand)" }}>
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
          {checklistOpen && (
            <div className="mt-2 space-y-2">
              <SubmissionChecklist conditions={readiness.conditions} onChangeTab={(sub) => setActiveTab(SUB_TO_V2[sub])} />
              <ReadinessCopilotPanel capa={capa} readiness={readiness} onChangeTab={(sub) => setActiveTab(SUB_TO_V2[sub])} />
            </div>
          )}
        </div>
      );
    }

    // QA decision — NO authoring readiness readout here (fixes problem #2).
    if (capa.status === "pending_qa_review") {
      return (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "var(--status-waiting)" }}>
            <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Decision — awaiting QA review
          </p>
          {/* Gate readout, in words. Concerns are the only Review-tab closure
              blocker now (Phase 4); the server enforces the same in closure.ts. */}
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Assignments: {acceptedActions}/{actionItems.length} accepted
            <span aria-hidden="true"> · </span>
            Concerns: {unresolvedConcerns ?? 0} open
            <span aria-hidden="true"> · </span>
            Evidence: {evidenceCounts.resolved}/{evidenceCounts.total}
          </p>
          {actionItems.length > 0 && acceptedActions < actionItems.length && (
            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: "var(--status-waiting)" }}>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              {actionItems.length - acceptedActions} {actionItems.length - acceptedActions === 1 ? "person's work still needs" : "people's work still needs"} your review before closing.
            </p>
          )}
          {!approvalsSatisfied && (
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
              Sign &amp; Close unlocks once all concerns are resolved ({unresolvedConcerns ?? 0} open).
            </p>
          )}
          <div className="flex gap-2 mt-2 flex-wrap">
            {isQAHead && (
              <Button variant="danger" size="sm" icon={AlertTriangle} onClick={() => setRejectOpen(true)}>Reject &rarr; rework</Button>
            )}
            {canSign && canCloseCapa && (
              <Button variant="primary" size="sm" icon={ShieldCheck} disabled={!closureReady} title={closureBlockReason ?? undefined}
                onClick={() => { setSignError(null); setSignOpen(true); }}>Sign &amp; Close</Button>
            )}
          </div>
        </div>
      );
    }

    if (capa.status === "pending_verification") {
      // Legacy-only state — closure allowed once approvals satisfied, exactly like
      // pending_qa_review (mirrors the original :328-344).
      return (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "var(--status-done)" }}>
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" /> Decision — approved, ready for sign &amp; close
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Assignments: {acceptedActions}/{actionItems.length} accepted
            <span aria-hidden="true"> · </span>
            Concerns: {unresolvedConcerns ?? 0} open
          </p>
          {/* This legacy branch prints no assignments readout of its own, so the
              gate's reason MUST render here — otherwise the disabled button below
              is unexplained. */}
          {closureBlockReason && (
            <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{closureBlockReason}</p>
          )}
          <div className="flex gap-2 mt-2">
            {canSign && canCloseCapa && (
              <Button variant="primary" size="sm" icon={ShieldCheck} disabled={!closureReady} title={closureBlockReason ?? undefined}
                onClick={() => { setSignError(null); setSignOpen(true); }}>Sign &amp; Close</Button>
            )}
          </div>
        </div>
      );
    }

    // closed — locked; effectiveness follow-up.
    return (
      <div>
        <p className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <Lock className="w-4 h-4" aria-hidden="true" />
          Closed{capa.closedBy ? ` by ${displayUserName(capa.closedBy, users)}` : ""}{capa.closedAt ? ` on ${dayjs.utc(capa.closedAt).tz(timezone).format(dateFormat)}` : ""}.
        </p>
        {/* On-record: any single-QA waiver applied at closure (Phase 2, PART B). */}
        <SodOverrideBadge overrides={capa.sodOverrides} controls={["CLOSE_CREATOR", "CLOSE_RCA_AUTHOR"]} className="mt-1.5 space-y-1" />
        {capa.effectivenessCheck && capa.effectivenessDate && (
          <div className="flex items-center justify-between gap-3 flex-wrap mt-1.5">
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              90-day effectiveness check due {dayjs.utc(capa.effectivenessDate).tz(timezone).format(dateFormat)}
              {capa.effectivenessVerdict ? ` — verdict: ${capa.effectivenessVerdict}` : ""}
            </p>
            <Button variant="secondary" size="sm" icon={TrendingUp} onClick={() => goToTabSection("review", "capa-effectiveness")}>Record effectiveness</Button>
          </div>
        )}
      </div>
    );
  }

  const tabs: { id: V2Tab; label: string; attention?: boolean }[] = [
    { id: "summary", label: "Summary" },
    { id: "assignments", label: "Assignments" },
    { id: "evidence", label: "Evidence" },
    { id: "review", label: "Review", attention: capa.status === "pending_qa_review" },
  ];

  return (
    <main className="capa-shell w-full min-h-full">
      <div className="w-full max-w-[1400px] pb-8">
        <button type="button" onClick={() => router.push("/capa")} className="text-[12px] inline-flex items-center gap-1 bg-transparent border-none cursor-pointer mb-3" style={{ color: "var(--text-secondary)" }}>
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to CAPA Tracker
        </button>

        <div className="mb-3">
          <RaisedFromRiskBanner target="CAPA" recordId={capa.id} />
        </div>

        {/* ── Header card: identity chips + title + meta, then the ONE decision zone. ── */}
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
            <button type="button" onClick={openAudit} className="ml-auto text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent cursor-pointer transition-colors hover:bg-(--bg-hover)" style={{ color: "var(--text-secondary)", borderColor: "var(--card-border)" }}>
              <History className="w-3 h-3" aria-hidden="true" /> Audit
            </button>
            {editAllowed && (
              <button type="button" onClick={() => setEditOpen(true)} className="text-[12px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border bg-transparent cursor-pointer transition-colors hover:bg-(--bg-hover)" style={{ color: "var(--text-secondary)", borderColor: "var(--card-border)" }}>
                <Pencil className="w-3 h-3" aria-hidden="true" /> Edit
              </button>
            )}
          </div>
          <h1 className="text-[20px] font-semibold mt-2.5 leading-snug" style={{ color: "var(--text-primary)" }}>
            {capa.title?.trim() || capa.description?.split("\n")[0]?.trim().slice(0, 120) || reference}
          </h1>
          {/* Phase 4 — TWO named roles, no hedge. The gap keeps its owner; QA owns
              the CAPA. The data was always distinct; name it correctly. */}
          <p className="text-[12px] mt-1.5" style={{ color: "var(--text-muted)" }}>
            Site: {displaySiteName(capa.siteId, sites)}
            {capa.finding?.owner && <> <span aria-hidden="true">·</span> Gap owner: {displayUserName(capa.finding.owner, users)}</>}
            {" "}<span aria-hidden="true">·</span> CAPA owner: {capa.owner ? `${displayUserName(capa.owner, users)} (QA)` : "Unassigned"}
          </p>

          <div className="my-3" style={{ borderTop: "1px solid var(--card-border, var(--bg-border))" }} />
          {renderDecisionZone()}
        </div>

        {/* ── TABS ── */}
        <div role="tablist" aria-label="CAPA detail sections" className="flex gap-1 mb-4 border-b" style={{ borderColor: "var(--bg-border)" }}>
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={activeTab === t.id} onClick={() => setActiveTab(t.id)}
              className={activeTab === t.id
                ? "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer font-medium"
                : "inline-flex items-center gap-1.5 px-3 py-2 text-[12px] border-b-2 -mb-px bg-transparent border-x-0 border-t-0 cursor-pointer font-normal"}
              style={activeTab === t.id ? { borderBottomColor: "var(--brand)", color: "var(--text-primary)" } : { borderBottomColor: "transparent", color: "var(--text-secondary)" }}>
              {t.label}
              {t.attention && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--status-waiting)" }} aria-label="Action needed" />}
            </button>
          ))}
        </div>

        {/* ── SUMMARY — read-only record context (OverviewBody only). ── */}
        {activeTab === "summary" && (
          <div className="capa-stack">
            {/* Phase 4 — the gap docs now live in the "Documents by origin" card
                below (de-duped): pass [] so OverviewBody's finding card shows the
                gap HISTORY only, not the doc list twice. */}
            <OverviewBody capa={capa} isDark={isDark} users={users} timezone={timezone} dateFormat={dateFormat}
              showMigrationNotice={false} onDismissNotice={() => undefined}
              onNavigateGap={(fid) => router.push(`/gap-assessment?openFindingId=${encodeURIComponent(fid)}`)}
              onEditOpen={() => setEditOpen(true)} editAllowed={editAllowed} originDocs={originDocs} findingDocs={[]} findingAudit={findingAudit} />

            {/* Phase 4 — Documents on this CAPA, by origin (read + delete only).
                Copy is honest: "added" files ARE evidence filed in a category. */}
            {(findingDocs.length > 0 || qaAddedFiles.length > 0) && (
              <div className="capa-card">
                <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Documents on this CAPA, by origin</p>
                <p className="text-[11px] mt-0.5 mb-2.5" style={{ color: "var(--text-muted)" }}>Carried-over files are read-only.</p>
                {findingDocs.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                      From the gap{capa.finding?.reference ? ` · ${capa.finding.reference}` : ""}
                    </p>
                    <ul className="list-none p-0 m-0 space-y-1">
                      {findingDocs.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-[12px]">
                          <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                          <span className="truncate" style={{ color: "var(--text-primary)" }}>{d.fileName}</span>
                          <a href={`/api/documents/${d.id}`} className="text-[11px] shrink-0 ml-auto" style={{ color: "var(--brand)" }}>View →</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {qaAddedFiles.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Added on this CAPA</p>
                    <p className="text-[10px] mb-1.5" style={{ color: "var(--text-muted)" }}>These are evidence, filed under a GxP category — shown here grouped by origin.</p>
                    <ul className="list-none p-0 m-0 space-y-1">
                      {qaAddedFiles.map((f) => (
                        <li key={f.id} className="flex items-center gap-2 text-[12px]">
                          <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                          <span className="truncate" style={{ color: "var(--text-primary)" }}>{f.fileName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{f.category}</span>
                          {f.uploadSource === "qa_added" && isQAHead ? (
                            <button type="button" onClick={() => void handleDeleteAddedFile(f.id)} className="text-[11px] shrink-0 ml-auto bg-transparent border-none cursor-pointer" style={{ color: "var(--danger)" }}>Delete</button>
                          ) : (
                            <span className="text-[10px] shrink-0 ml-auto italic" style={{ color: "var(--text-muted)" }} title={f.uploadSource === null ? "Unknown provenance — read-only" : undefined}>read-only</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {/* Phase 4 — History: every disposition with its reason, oldest first. */}
            {(() => {
              const items = auditTrail
                .map((e) => toHistoryItem(e, capa))
                .filter((x): x is HistoryItem => x !== null)
                .reverse();
              if (items.length === 0) return null;
              return (
                <div className="capa-card">
                  <p className="text-[13px] font-semibold flex items-center gap-1.5 mb-2.5" style={{ color: "var(--text-primary)" }}>
                    <History className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" /> History
                  </p>
                  <ul className="list-none p-0 m-0 space-y-2">
                    {items.map((it) => (
                      <li key={it.id} className="flex items-start gap-2 text-[12px]">
                        <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand)" }} aria-hidden="true" />
                        <div className="min-w-0">
                          <p style={{ color: "var(--text-primary)" }}>
                            {it.label}
                            <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                              {it.who}{it.role ? ` (${roleLabel(it.role)})` : ""} · {dayjs.utc(it.when).tz(timezone).format(`${dateFormat} HH:mm`)}
                            </span>
                          </p>
                          {it.detail && (
                            <p className="text-[11px] mt-0.5 whitespace-pre-wrap pl-2 border-l-2" style={{ color: "var(--text-secondary)", borderColor: "var(--card-border, var(--bg-border))" }}>
                              &ldquo;{it.detail}&rdquo;
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── ASSIGNMENTS (Phase 4 stub) — RCA + Alignment moved to Review; the
            per-person work-review surface (accept/send-back/skip/reassign, all
            already server-side in Phase 2) lands here in Phase 5. ── */}
        {activeTab === "assignments" && (
          <AssignmentsTab capa={capa} evidenceFiles={evidenceFiles} users={complianceUsers} carrySkipped={carrySkipped} carriedNotes={carriedNotes} onChanged={() => router.refresh()} />
        )}

        {/* ── EVIDENCE ── */}
        {activeTab === "evidence" && (
          <div className="capa-stack">
            <div className="capa-card"><EvidenceCollectionPanel capaId={capa.id} readOnly={isViewOnly || capa.status === "closed"} capaStatus={capa.status} canRejectEvidence={isQAHead} onCountsChange={(c) => setEvidenceCounts({ resolved: c.resolved, total: c.total })} /></div>
            {/* Phase 5 — "Not linked to a person" bucket. Same evidenceFiles prop the
                Assignments footnote reads (one source → the two counts can't drift).
                These are QA-uploaded (addEvidenceFileToCategory has no action item);
                no owner to infer. */}
            {(() => {
              const unlinked = evidenceFiles.filter((f) => !f.actionItemId);
              if (unlinked.length === 0) return null;
              return (
                <div className="capa-card">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Not linked to a person <span className="font-normal" style={{ color: "var(--text-muted)" }}>({unlinked.length})</span></p>
                  <p className="text-[11px] mt-0.5 mb-2" style={{ color: "var(--text-muted)" }}>Uploaded on the CAPA without an action item — not attributable to a worker.</p>
                  <ul className="list-none p-0 m-0 space-y-1">
                    {unlinked.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-[12px]">
                        <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                        <span className="truncate" style={{ color: "var(--text-primary)" }}>{f.fileName}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-auto" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{f.category}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── REVIEW — all QA actions together: Approvals (primary act) +
            Concerns/Discussion + Effectiveness (criteria + 90-day review). ── */}
        {/* ── REVIEW — lifecycle order 1→6, each answering the previous. Composes
            the existing sections verbatim; no gate logic here. RCA + Alignment
            are set pre-submit and read after (the sections own that read-only
            behaviour). ── */}
        {activeTab === "review" && (
          <div className="capa-stack">
            <section className="capa-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>1 · Root cause analysis</p>
              <RcaBody capa={capa} />
              <SodOverrideBadge overrides={capa.sodOverrides} controls={["RCA_APPROVAL", "RCA_EDITOR_APPROVER", "RCA_REJECTION_OVERRIDE"]} className="mt-3 space-y-1" />
              <div className="mt-3"><RcaReviewSection capa={capa} onReviewChange={() => router.refresh()} /></div>
            </section>
            <section className="capa-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>2 · Action-to-cause alignment</p>
              <SodOverrideBadge overrides={capa.sodOverrides} controls={["ALIGNMENT_OVERRIDE"]} className="mb-3 space-y-1" />
              <AlignmentReviewSection capa={capa} onAlignmentChange={() => router.refresh()} />
            </section>
            {capa.diGate && (
              <section className="capa-card">
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>3 · Data integrity review</p>
                <DiGateCard capa={capa} onChange={() => router.refresh()} />
              </section>
            )}
            <section id="capa-effectiveness" className="capa-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>4 · Success criteria</p>
              <EffectivenessCriteriaPanel capaId={capa.id} capaStatus={capa.status} readOnly={isViewOnly || capa.status === "closed"} />
            </section>
            <section className="capa-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>5 · Effectiveness</p>
              <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>Measured against the criteria above — scheduled 90 days after closure.</p>
              <SodOverrideBadge overrides={capa.sodOverrides} controls={["EFFECTIVENESS"]} className="mb-3 space-y-1" />
              <EffectivenessSection capa={capa} />
            </section>
            <section id="capa-discussion" className="capa-card">
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>6 · Concerns</p>
              <DiscussionSection capa={capa} onCommentsChange={() => setDiscussionVersion((v) => v + 1)} />
            </section>
            {/* Phase 2, PART B — every single-QA waiver used on this CAPA, on-record
                for inspection. Renders only when a waiver was actually used; a
                default-OFF tenant has no rows, so this section stays absent. */}
            {(capa.sodOverrides?.length ?? 0) > 0 && (
              <section className="capa-card">
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>7 · Single-QA overrides</p>
                <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
                  Controls waived under the single-QA override on this CAPA. Each is a recorded, audited departure from independent QA review.
                </p>
                <SodOverrideSummary overrides={capa.sodOverrides} timezone={timezone} dateFormat={dateFormat} />
              </section>
            )}
          </div>
        )}

        {/* Phase 6 — audit trail moved to a MODAL (opened from the Audit button
            in the header); no longer pinned on every tab. */}
        {auditModalOpen && (
          <Modal open onClose={() => setAuditModalOpen(false)} title="Audit trail" className="max-w-2xl">
            <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>Complete, unfiltered Part 11 trail — newest first. Read-only.</p>
            <div className="max-h-[60vh] overflow-y-auto">
              <ul className="list-none p-0 m-0">
                {auditTrail.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-2 py-1.5 text-[11px]" style={{ borderTop: "1px solid var(--bg-border)" }}>
                    <span className="font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{dayjs.utc(e.createdAt).tz(timezone).format(`${dateFormat} HH:mm`)}</span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{humanizeCapaAction(e.action)}</span>
                    <span className="ml-auto shrink-0" style={{ color: "var(--text-secondary)" }}>{e.userName}{e.userRole ? ` (${roleLabel(e.userRole)})` : ""}</span>
                  </li>
                ))}
                {auditTrail.length === 0 && <li className="py-2 text-[11px] italic" style={{ color: "var(--text-muted)" }}>No audit entries.</li>}
              </ul>
            </div>
          </Modal>
        )}

        <FlowExplainer open={flowOpen} onClose={() => setFlowOpen(false)} />

        {/* ── Targeted reject dialog (verbatim from the original :580-602). ── */}
        {rejectOpen && (
          <Modal open onClose={() => setRejectOpen(false)} title="Return CAPA for rework">
            <div className="rounded-md p-2 mb-2 flex items-start gap-2" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <p className="text-[11px]" style={{ color: "var(--danger)" }}>
                This reopens the <strong>WHOLE CAPA</strong>. Everyone&apos;s work unlocks, including work you already accepted. To bounce one person only, use <strong>&ldquo;Send this work back&rdquo;</strong> on their card in Assignments.
              </p>
            </div>
            <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
              The CAPA returns to <strong>in progress</strong>. Select the action items to send back for rework (optional).
            </p>
            <textarea className="input text-[12px] w-full min-h-20 mb-2" placeholder={`Rejection reason (≥ ${REJECT_REASON_MIN} chars) — what must be fixed?`}
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
              <Button variant="danger" size="sm" disabled={busy || rejectReason.trim().length < REJECT_REASON_MIN} loading={busy} onClick={() => void handleReject()}>Return for rework</Button>
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
