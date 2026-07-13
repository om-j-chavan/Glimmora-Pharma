"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import {
  AlertTriangle, AlertOctagon, Plus, Search, ChevronRight, Clock, CheckCircle2,
  ClipboardList, X, Info, Wrench, Send, Eye, EyeOff,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { DocList } from "@/components/shared/DocList";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useActiveSite } from "@/hooks/useActiveSite";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  setDeviations,
  type DeviationSeverity,
  type Deviation as DeviationItem,
} from "@/store/deviation.slice";
import {
  createDeviation as createDeviationAction,
  startInvestigation as startInvestigationAction,
  closeDeviation as closeDeviationAction,
  rejectDeviation as rejectDeviationAction,
  attachDeviationDocument,
} from "@/actions/deviations";
import { createCAPA as createCAPAAction } from "@/actions/capas";
import { assignDeviationTask, reworkDeviationTask, postDeviationTaskMessage } from "@/actions/deviation-tasks";
import { TaskThread, GroupedTaskDocs } from "@/modules/worklist/DeviationTaskPanel";
import { deleteDocument } from "@/actions/documents";
import { RaisedFromRiskBanner } from "@/components/shared/RaisedFromRiskBanner";
import { displayUserName, displaySiteName } from "@/lib/identity-display";
import { roleLabel } from "@/lib/labels/roles";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { useToast } from "@/components/ui/Toast";
import { DocumentUpload, type LinkedDocument } from "@/components/shared/DocumentUpload";
import { StatCard, StatusGuide, DataTable, type Column } from "@/components/shared";
import { PageLayout, type PageAction } from "@/components/layout/PageLayout";
import { DEVIATION_STATUSES } from "@/constants/statusTaxonomy";
import {
  STATUS_VARIANT, STATUS_LABEL, CATEGORIES, AREAS, DEV_TASK_STATUS_LABEL,
} from "./DeviationPage.constants";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/severity";
import { addSchema, type AddForm } from "./DeviationPage.schemas";
import { adaptDeviation, type PrismaDeviationWithCapa } from "./DeviationPage.adapter";
import { InvestigationSection, CapaDecisionSection } from "./DeviationInvestigation";
import {
  DeviationIntelligencePanel,
  DeviationIntelligenceRunButton,
  useDeviationIntelligence,
} from "./DeviationIntelligencePanel";
import { SmartRecordSearch } from "@/components/search/SmartRecordSearch";
import { DocumentSummaryPanel } from "@/components/search/DocumentSummaryPanel";
import { buildDeviationSource } from "@/lib/searchSources";
import type { DeviationClusterInput } from "@/lib/ai";
import type { Deviation as PrismaDeviation } from "@prisma/client";

/* ══════════════════════════════════════ */

/** Convert a base64 data URL (what DocumentUpload hands back in onUpload) into a
 *  File, so a doc staged in the create modal can be sent through the shared
 *  attachDeviationDocument → createDocument(FormData) pipeline after the
 *  deviation is created. */
function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], fileName, { type: mime });
}

export interface DeviationPageProps {
  /** Server-fetched deviations (Prisma rows + linked-CAPA reference) —
   *  seeded into Redux on mount. */
  deviations?: PrismaDeviationWithCapa[];
}

export function DeviationPage({ deviations: serverDeviations }: DeviationPageProps = {}) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  // Seed Redux from server-fetched deviations on mount / when props change.
  useEffect(() => {
    if (serverDeviations) {
      dispatch(setDeviations(serverDeviations.map(adaptDeviation)));
    }
  }, [serverDeviations, dispatch]);

  const deviations = useAppSelector((s) => s.deviation.items);
  const user = useAppSelector((s) => s.auth.user);
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const { role: currentRole } = useRole(); // ensure permissions matrix is loaded
  const { isViewer, isQAHead } = usePermissions();
  const toast = useToast();
  // Capability mirror for "Report Deviation" (create). The QA-authority actions
  // in the detail modal — Start Investigation, Raise CAPA, attach evidence — are
  // gated by isQAHead (Part A access-control fix): the old capaCan/canAttachDocs
  // mirrors leaked those actions to non-QA author roles (e.g. regulatory_affairs).
  // The low-priority TASK assignee's actions are NOT here — they live in the
  // worklist (DeviationTaskPanel), gated server-side by isAssignedToTask.
  const devCan = usePermissions("deviation");
  const [docBusy, setDocBusy] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  // Attach evidence via the shared document pipeline (persists server-side, so
  // it survives router.refresh()/reload). Tenant + role are enforced in the
  // server action; this just submits the file and refreshes. Errors surface via
  // the module's existing error popup.
  async function handleAttachDoc(deviationId: string, file: File) {
    setDocBusy(true);
    const fd = new FormData();
    fd.set("fileName", file.name);
    fd.set("file", file);
    const res = await attachDeviationDocument(deviationId, fd);
    setDocBusy(false);
    if (!res.success) { setErrorMsg(res.error || "Failed to attach document."); setErrorPopup(true); return; }
    router.refresh();
  }

  // Soft-delete via the shared deleteDocument action (tenant-scoped server-side;
  // can't remove a document off another tenant's deviation).
  async function handleDeleteDoc(docId: string) {
    setDocBusy(true); setDeletingDocId(docId);
    const res = await deleteDocument(docId);
    setDocBusy(false); setDeletingDocId(null);
    if (!res.success) { setErrorMsg(res.error || "Failed to delete document."); setErrorPopup(true); return; }
    router.refresh();
  }
  // QA-decider gate for the Tier 2 CAPA decision — mirrors the server check
  // in saveCAPADecision (qa_head OR super_admin).
  const isQADecider = currentRole === "qa_head" || currentRole === "super_admin";
  const { tenantId, org, users, allSites } = useTenantConfig();
  // Default the create form's site to the active site (falls back to the first
  // site). The SELECTED site drives the deviation reference prefix (bug fix).
  const activeSite = useActiveSite();
  // Deviation-task assignee pool — active operational STAFF only (excludes
  // super_admin / customer_admin / viewer). The "people who do the work".
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;

  const tenantDevs = deviations.filter((d) => d.tenantId === tenantId);

  // Projection fed to the Deviation Intelligence agent (clusters by area).
  // Recomputed each render with tenantDevs; the panel guards re-analysis on a
  // stable content signature so this doesn't loop.
  const deviationIntelInput: DeviationClusterInput[] = useMemo(
    () =>
      tenantDevs.map((d) => ({
        id: d.id,
        reference: d.reference ?? d.id.slice(0, 8),
        title: d.title,
        category: d.category,
        area: d.area,
        severity: d.severity,
        status: d.status,
      })),
    [tenantDevs],
  );

  // On-demand Deviation Intelligence — the run trigger lives in the page header
  // (see PageLayout headerRight); the results card mounts only after a run.
  const deviationIntel = useDeviationIntelligence(deviationIntelInput);

  const openCount = tenantDevs.filter((d) => d.status === "open").length;
  const investigatingCount = tenantDevs.filter((d) => d.status === "under_investigation").length;
  const overdueCount = tenantDevs.filter((d) => d.status !== "closed" && d.status !== "rejected" && dayjs.utc(d.dueDate).isBefore(dayjs())).length;

  function ownerName(id: string) { return displayUserName(id, users); }
  function siteName(id: string) { return displaySiteName(id, allSites); }


  // State
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* Open one deviation from `?open=<id>` — used by the risk-conversion "view →"
     link. Deviations have no per-id route; the detail is this modal. Opens once,
     after the tenant list has loaded. */
  const searchParams = useSearchParams();
  const openIdParam = searchParams.get("open");
  const openedRef = useRef(false);
  const selected = useMemo(
    () => (selectedId ? tenantDevs.find((d) => d.id === selectedId) ?? null : null),
    [tenantDevs, selectedId],
  );

  useEffect(() => {
    if (!openIdParam || openedRef.current) return;
    if (tenantDevs.some((d) => d.id === openIdParam)) {
      openedRef.current = true;
      setSelectedId(openIdParam);
    }
  }, [openIdParam, tenantDevs]);
  // SME Section 1, Stage 1 — CAPA Decision Gate (client mirror).
  // Server enforces the same rule in closeDeviation (incl. the orphan-link
  // case where linkedCAPAId is set but the CAPA was hard-deleted). The
  // client only knows about the obvious "no link" case; if the orphan path
  // is hit it surfaces via the server error string in handleClose.
  const capaRequired = !!selected && normalizeSeverityForDisplay(selected.severity, "fda") === "Critical" && !selected.linkedCAPAId;
  const [addOpen, setAddOpen] = useState(false);
  // Documents staged in the create modal (optional). Attached to the new
  // deviation after it's created (onReport), via attachDeviationDocument.
  const [pendingDocs, setPendingDocs] = useState<LinkedDocument[]>([]);
  const [closeModal, setCloseModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [closePassword, setClosePassword] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  // Part 11 — reject is now an e-signature (password + message). Eye toggles for
  // both signature password fields.
  const [rejectPassword, setRejectPassword] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [showClosePw, setShowClosePw] = useState(false);
  const [showRejectPw, setShowRejectPw] = useState(false);
  // Stage 4 (deviation redesign) — low-priority "Assign task" modal state.
  // Raise-CAPA confirm/preview modal (req 1).
  const [raiseConfirmOpen, setRaiseConfirmOpen] = useState(false);
  const [raiseBusy, setRaiseBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignAssigneeId, setAssignAssigneeId] = useState("");
  const [assignMessage, setAssignMessage] = useState("");
  const [assignDueDate, setAssignDueDate] = useState("");
  // Due dates can't be in the past — today is the floor for every due-date picker.
  const minDueDate = dayjs().format("YYYY-MM-DD");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  // Stage 4 — QA "send for rework" modal state (the close outcome reuses the
  // signed-close modal below).
  const [reworkTaskOpen, setReworkTaskOpen] = useState(false);
  const [reworkTaskReason, setReworkTaskReason] = useState("");
  const [reworkTaskError, setReworkTaskError] = useState<string | null>(null);
  const [reworkTaskBusy, setReworkTaskBusy] = useState(false);
  // Stage 5 — QA's compose box for the flat task conversation.
  const [taskMsgBody, setTaskMsgBody] = useState("");
  const [taskMsgPosting, setTaskMsgPosting] = useState(false);
  const [successPopup, setSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  // Failure surface — paired with successPopup above. Server actions
  // that reject (FORBIDDEN, validation, role gates) route through this so
  // users see the real reason rather than a silent console.error.
  // handleClose has its own inline closeError state (rendered inside the
  // close modal); this popup covers everything else.
  const [errorPopup, setErrorPopup] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const filtered = useMemo(() => {
    let r = tenantDevs;
    if (searchQuery) { const q = searchQuery.toLowerCase(); r = r.filter((d) => d.id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)); }
    if (statusFilter) r = r.filter((d) => d.status === statusFilter);
    if (sevFilter) r = r.filter((d) => normalizeSeverityForDisplay(d.severity, "fda") === sevFilter);
    if (catFilter) r = r.filter((d) => d.category === catFilter);
    return r;
  }, [tenantDevs, searchQuery, statusFilter, sevFilter, catFilter]);

  const { control, handleSubmit, reset, setError, setValue, formState: { errors, isValid, isSubmitting } } = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    // Validate on blur (and re-validate on change once touched) so required-
    // field misses surface inline before submit, and isValid can gate the
    // submit button.
    mode: "onTouched",
    // Initialize EVERY string field so its <Input>/<textarea> is controlled from
    // the first render (RHF's field.value is undefined for any omitted field,
    // which makes the input uncontrolled until first edit → React's
    // "changing an uncontrolled input to be controlled" warning). The enum
    // dropdowns keep their seeded defaults; category stays unset (its placeholder
    // shows for "" all the same, and "" isn't a valid enum value).
    defaultValues: { title: "", description: "", type: "unplanned", severity: "Major", siteId: activeSite?.id ?? allSites[0]?.id ?? "", area: "", immediateAction: "", priority: "Medium", patientSafetyImpact: "medium", productQualityImpact: "medium", regulatoryImpact: "medium", dueDate: "", batchesAffected: "" },
  });

  function severityToRisk(s: DeviationSeverity): "Critical" | "High" | "Medium" | "Low" {
    // FDA-taxonomy severity → Generic CAPA risk. Accepts both legacy
    // lowercase ("critical") and new TitleCase ("Critical") rows by
    // normalising first.
    const canon = normalizeSeverityForDisplay(s, "fda");
    if (canon === "Critical") return "Critical";
    if (canon === "Major") return "High";
    return "Low";
  }

  // Stage 2 (deviation redesign) — pre-fill triage priority from FDA severity.
  // Critical → High, Major → Medium, Minor → Low. The reporter can override.
  function severityToPriority(s: DeviationSeverity): "Low" | "Medium" | "High" {
    const canon = normalizeSeverityForDisplay(s, "fda");
    if (canon === "Critical") return "High";
    if (canon === "Major") return "Medium";
    return "Low";
  }

  async function onReport(data: AddForm) {
    try {
      const result = await createDeviationAction({
        title: data.title,
        description: data.description,
        type: data.type,
        category: data.category,
        severity: data.severity,
        area: data.area,
        immediateAction: data.immediateAction,
        patientSafetyImpact: data.patientSafetyImpact,
        productQualityImpact: data.productQualityImpact,
        regulatoryImpact: data.regulatoryImpact,
        priority: data.priority,
        dueDate: dayjs(data.dueDate).utc().toISOString(),
        // BUG FIX — was `allSites[0]?.id` (always the FIRST site), so a Chennai
        // deviation got DEV-BLR-…. Send the SELECTED site so the reference prefix
        // is derived from it (Chennai → DEV-CHN-…).
        siteId: data.siteId || undefined,
        batchesAffected: data.batchesAffected || undefined,
      });
      if (!result.success) {
        // Schema-mismatch guard — if the server returns field-level Zod
        // errors, surface them inline (covers the case where client
        // validation passes but server validation rejects).
        if (result.fieldErrors) {
          for (const [field, msgs] of Object.entries(result.fieldErrors)) {
            if (msgs?.[0]) setError(field as keyof AddForm, { type: "server", message: msgs[0] });
          }
        }
        setErrorMsg(result.error || "Failed to report deviation. Please try again.");
        setErrorPopup(true);
        return;
      }
      const created = result.data as PrismaDeviation;
      // Tier 2, Item 3 — reporting a deviation creates ONLY the Deviation
      // record (no CAPA is auto-raised; the CAPA disposition happens after
      // investigation). Then attach any documents staged in the create modal,
      // reusing the shared Deviation-doc pipeline (attachDeviationDocument →
      // createDocument; linkedModule "Deviation Management").
      let docFailed = false;
      for (const d of pendingDocs) {
        if (!d.dataUrl) continue;
        const fd = new FormData();
        fd.set("fileName", d.fileName);
        fd.set("file", dataUrlToFile(d.dataUrl, d.fileName));
        const attached = await attachDeviationDocument(created.id, fd);
        if (!attached.success) docFailed = true;
      }
      setAddOpen(false);
      reset();
      setPendingDocs([]);
      if (docFailed) {
        setErrorMsg(`${created.reference ?? created.id.slice(0, 8)} reported, but a document failed to attach. Add it from the detail view.`);
        setErrorPopup(true);
      } else {
        setSuccessMsg(`${created.reference ?? created.id.slice(0, 8)} reported`);
        setSuccessPopup(true);
      }
      router.refresh();
    } catch (err) {
      // Unexpected throw (network/runtime) — previously unhandled, which was
      // part of the silent-failure surface. Surface it visibly.
      console.error("createDeviation failed:", err);
      setErrorMsg("An unexpected error occurred. Please try again.");
      setErrorPopup(true);
    }
  }


  // Every "Raise CAPA" affordance opens the confirm-preview modal first; the
  // actual raise runs only on confirm (handleConfirmRaiseCAPA).
  function handleRaiseCAPAFromDetail() {
    if (!selected || !user) return;
    setRaiseConfirmOpen(true);
  }

  async function handleConfirmRaiseCAPA() {
    if (!selected || !user) return;
    setRaiseBusy(true);
    // Carryover (owner=QA, RCA text, contextual description, worker→action item)
    // is handled SERVER-SIDE in createCAPA for the deviation path. The handler
    // passes a basic description (the server enriches it) and no owner.
    const result = await createCAPAAction({
      title: selected.title.slice(0, 120),
      description: `Raised from deviation ${selected.reference ?? selected.id}`,
      source: "Deviation",
      risk: severityToRisk(selected.severity),
      dueDate: selected.dueDate,
      siteId: selected.siteId || undefined,
      linkedDeviationId: selected.id,
    });
    setRaiseBusy(false);
    if (!result.success) {
      // "Raise CAPA" is QA-only (isQAHead gates every trigger); this guards the
      // stale-UI / race case. Friendly, consistent copy for the policy rejection.
      if (result.error === "Only QA Head can create a CAPA.") {
        console.warn("[deviation] raise CAPA denied:", result.error);
        toast.error("Only your QA Head can create a CAPA from this deviation.");
      } else {
        toast.error(result.error || "Failed to raise CAPA. Please try again.");
      }
      return;
    }
    setRaiseConfirmOpen(false);
    // Enriched success toast from the returned carryover (req 2 + 5).
    const capaData = result.data as {
      id: string; reference?: string | null;
      deviationCarryover?: {
        actionItem?: { assignee: string } | null;
        deviationDocCount?: number; taskDocCount?: number; convertedEvidenceCount?: number;
      };
    };
    const c = capaData.deviationCarryover;
    const ref = capaData.reference ?? capaData.id.slice(0, 8);
    // Piece 2 — categorized task docs became real evidence; the remainder stay
    // as linked references. Don't count the converted ones as "linked".
    const convertedEv = c?.convertedEvidenceCount ?? 0;
    const linkedDocs = Math.max(0, (c?.deviationDocCount ?? 0) + (c?.taskDocCount ?? 0) - convertedEv);
    const parts = [`CAPA ${ref} raised`];
    if (c?.actionItem?.assignee) parts.push(`${c.actionItem.assignee}'s task carried over as an action item`);
    if (convertedEv > 0) parts.push(`${convertedEv} document${convertedEv === 1 ? "" : "s"} filed as evidence`);
    if (linkedDocs > 0) parts.push(`${linkedDocs} document${linkedDocs === 1 ? "" : "s"} linked`);
    toast.success(parts.join(" · "));
    router.refresh();
  }

  // Stage 4 (deviation redesign) — QA assigns a low-priority deviation as a
  // lightweight task. Server (assignDeviationTask) enforces qa_head + low
  // priority + active-user assignee.
  async function handleAssignTask() {
    if (!selected) return;
    setAssignBusy(true);
    setAssignError(null);
    const result = await assignDeviationTask(selected.id, {
      assigneeId: assignAssigneeId,
      message: assignMessage,
      dueDate: assignDueDate || undefined,
    });
    setAssignBusy(false);
    if (!result.success) { setAssignError(result.error || "Failed to assign task."); return; }
    setAssignOpen(false);
    setAssignAssigneeId(""); setAssignMessage(""); setAssignDueDate("");
    setSuccessMsg(`Task assigned for ${selected.reference ?? selected.id.slice(0, 8)}`);
    setSuccessPopup(true);
    router.refresh();
  }

  // Stage 4 — QA returns a submitted task to the assignee. Server
  // (reworkDeviationTask) enforces qa_head + SoD (reviewer ≠ assignee).
  async function handleReworkTask() {
    if (!selected?.activeTask) return;
    setReworkTaskBusy(true);
    setReworkTaskError(null);
    const result = await reworkDeviationTask(selected.activeTask.id, { reworkReason: reworkTaskReason });
    setReworkTaskBusy(false);
    if (!result.success) { setReworkTaskError(result.error || "Failed to send for rework."); return; }
    setReworkTaskOpen(false);
    setReworkTaskReason("");
    setSuccessMsg(`Task returned for rework — ${selected.reference ?? selected.id.slice(0, 8)}`);
    setSuccessPopup(true);
    router.refresh();
  }

  // Stage 5 — QA posts to the flat task conversation (the worker posts from the
  // worklist panel). Server gates to DEVIATION_QA_ROLES || isAssignedToTask.
  async function handlePostTaskMessage() {
    if (!selected?.activeTask || taskMsgBody.trim().length === 0) return;
    setTaskMsgPosting(true);
    const result = await postDeviationTaskMessage(selected.activeTask.id, { body: taskMsgBody.trim() });
    setTaskMsgPosting(false);
    if (!result.success) { setErrorMsg(result.error || "Failed to post message."); setErrorPopup(true); return; }
    setTaskMsgBody("");
    router.refresh();
  }

  async function handleClose() {
    if (!selected || !user) return;
    setCloseBusy(true);
    setCloseError(null);
    const result = await closeDeviationAction(selected.id, {
      password: closePassword,
      notes: closeNotes, // Part 11 — closure message required (server-enforced)
    });
    setCloseBusy(false);
    if (!result.success) {
      console.error("[deviation] closeDeviation failed:", result.error);
      setCloseError(result.error);
      return;
    }
    setCloseModal(false);
    setCloseNotes("");
    setClosePassword("");
    setCloseError(null);
    setSelectedId(null);
    setSuccessMsg(`${selected.reference ?? selected.id.slice(0, 8)} closed`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleReject() {
    if (!selected || !user || rejectReason.trim().length < 5 || !rejectPassword) return;
    setRejectBusy(true);
    setRejectError(null);
    const result = await rejectDeviationAction(selected.id, { reason: rejectReason, password: rejectPassword });
    setRejectBusy(false);
    if (!result.success) {
      setRejectError(result.error || "Failed to reject deviation. Please try again.");
      return;
    }
    setRejectModal(false);
    setRejectReason("");
    setRejectPassword("");
    setRejectError(null);
    setSelectedId(null);
    setSuccessMsg(`${selected.reference ?? selected.id.slice(0, 8)} rejected — returned to investigation`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleStartInvestigation() {
    if (!selected) return;
    const result = await startInvestigationAction(selected.id);
    if (!result.success) {
      setErrorMsg(result.error || "Failed to start investigation. Please try again.");
      setErrorPopup(true);
      return;
    }
    router.refresh();
  }

  // Header actions \u2014 the single primary create action. StatusGuide and the
  // intelligence run button aren't PageActions (they're custom widgets), so
  // they go in headerRight, left of the primary.
  const pageActions: PageAction[] = devCan.canCreate
    ? [{ label: "Report Deviation", variant: "primary", icon: Plus, onClick: () => setAddOpen(true) }]
    : [];

  return (
      <PageLayout
        title="Deviation Management"
        titleIcon={AlertTriangle}
        description={`Report, investigate, and disposition deviations from approved procedures. \u00b7 ${tenantDevs.length === 0 ? "No deviations reported yet" : `${tenantDevs.length} deviations \u00b7 ${openCount} open \u00b7 ${investigatingCount} under investigation`}`}
        actions={pageActions}
        headerRight={
          <div className="flex items-center gap-3">
            <StatusGuide module="Deviation Management" statuses={DEVIATION_STATUSES} />
            <DeviationIntelligenceRunButton state={deviationIntel} />
            {!devCan.canCreate && <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Contact QA Head to report deviations</p>}
          </div>
        }
      >
        {/* Content below the header is unchanged; the space-y-5 that used to sit
            on <main> now wraps the children so their spacing is preserved. */}
        <div className="space-y-5">

      {/* Info banner */}
      <div className="flex items-start gap-2 p-3 rounded-xl border" style={{ background: "var(--brand-muted)", borderColor: "var(--brand-border)" }}>
        <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Deviations are unexpected events that may or may not require a CAPA. Every deviation needs investigation. CAPAs are raised when root cause requires systematic correction.
        </p>
      </div>

      {/* Feature 2 — Plain-English Record Search */}
      <SmartRecordSearch
        title="Deviation Search"
        sources={[buildDeviationSource(tenantDevs, allSites, setSelectedId)]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={ClipboardList} color="#0ea5e9" label="Total" value={String(tenantDevs.length)} sub="All deviations" />
        <StatCard icon={AlertTriangle} color="#f59e0b" label="Open" value={String(openCount)} sub="Needs investigation" />
        <StatCard icon={Search} color="#6366f1" label="Under investigation" value={String(investigatingCount)} sub="In progress" />
        <StatCard icon={Clock} color={overdueCount > 0 ? "#ef4444" : "#10b981"} label="Overdue" value={String(overdueCount)} sub={overdueCount > 0 ? "Needs attention" : "On track"} />
      </div>

      {/* Deviation Intelligence — AGI pattern clustering (read-only analysis).
          On demand: triggered by the header run button, this card mounts only
          while analysis is running or once it has results. */}
      <DeviationIntelligencePanel
        state={deviationIntel}
        onOpenDeviation={setSelectedId}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input type="text" className="input pl-9 w-full text-[12px]" placeholder="Search deviations…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-44" options={[{ value: "", label: "All statuses" }, ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
        <Dropdown placeholder="All severities" value={sevFilter} onChange={setSevFilter} width="w-36" options={[{ value: "", label: "All severities" }, { value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} />
        <Dropdown placeholder="All categories" value={catFilter} onChange={setCatFilter} width="w-40" options={[{ value: "", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))]} />
        {(searchQuery || statusFilter || sevFilter || catFilter) && <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearchQuery(""); setStatusFilter(""); setSevFilter(""); setCatFilter(""); }}>Clear filters</Button>}
      </div>

      {/* Main content — table (full-width). Detail lives in a centered
          modal below, matching the CAPA detail container pattern. */}
      <div className="grid gap-4 grid-cols-1">
        {/* Table */}
        <div className="card overflow-hidden">
          <DataTable
            ariaLabel="Deviation register"
            caption="List of deviations with status and severity"
            minWidth={800}
            data={filtered}
            rowKey={(dev) => dev.id}
            onRowClick={(dev) => setSelectedId(dev.id)}
            rowClassName={(dev) => clsx(selected?.id === dev.id && (isDark ? "bg-[#0d2a4a]" : "bg-[#f0f7ff]"))}
            rowStyle={(dev) => (dev.status === "closed" ? { opacity: 0.6 } : undefined)}
            emptyState={
              <div className="text-center py-8"><AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" /><p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{tenantDevs.length === 0 ? "No deviations reported yet" : "No deviations match filters"}</p></div>
            }
            columns={[
              {
                key: "id",
                header: "ID",
                cellClassName: "font-mono text-[11px] text-(--brand)",
                render: (dev) => dev.reference ?? dev.id.slice(0, 8),
              },
              {
                key: "title",
                header: "Title",
                cellClassName: "text-[12px] font-medium max-w-[180px] truncate text-(--text-primary)",
                render: (dev) => dev.title,
              },
              {
                key: "category",
                header: "Category",
                cellClassName: "text-[11px] capitalize text-(--text-secondary)",
                render: (dev) => dev.category,
              },
              {
                key: "severity",
                header: "Severity",
                render: (dev) => <Badge variant={getSeverityVariant(dev.severity, "fda")}>{normalizeSeverityForDisplay(dev.severity, "fda") ?? dev.severity}</Badge>,
              },
              {
                key: "area",
                header: "Area",
                cellClassName: "text-[11px] text-(--text-secondary)",
                render: (dev) => dev.area,
              },
              {
                key: "detected",
                header: "Detected",
                cellClassName: "text-[11px] text-(--text-secondary)",
                render: (dev) => dayjs.utc(dev.detectedDate).tz(timezone).format("DD MMM"),
              },
              {
                key: "owner",
                header: "Owner",
                cellClassName: "text-[11px] text-(--text-secondary)",
                render: (dev) => ownerName(dev.owner),
              },
              {
                key: "due",
                header: "Due",
                render: (dev) => {
                  const isOd = dev.status !== "closed" && dev.status !== "rejected" && dayjs.utc(dev.dueDate).isBefore(dayjs());
                  return (
                    <span className="text-[11px]" style={{ color: isOd ? "#ef4444" : "var(--text-secondary)" }}>{dayjs.utc(dev.dueDate).tz(timezone).format("DD MMM")}{isOd && <span className="block text-[9px] text-[#ef4444]">Overdue</span>}</span>
                  );
                },
              },
              {
                key: "capa",
                header: "CAPA",
                render: (dev) => dev.linkedCAPAId ? <Badge variant="blue">{dev.linkedCAPARef ?? dev.linkedCAPAId.slice(0, 8)}</Badge> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>,
              },
              {
                key: "status",
                header: "Status",
                render: (dev) => <Badge variant={STATUS_VARIANT[dev.status]}>{STATUS_LABEL[dev.status]}</Badge>,
              },
              {
                key: "open",
                header: "Open",
                srOnly: true,
                render: () => <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />,
              },
            ] satisfies Column<DeviationItem>[]}
          />
        </div>

      </div>

      {/* Detail modal — shared detail-modal frame (max-w-2xl,
          centered, dimmed backdrop, Escape + outside-click close via
          the shared Modal primitive). Content body is the same single-
          scroll composition the side panel used; only the container
          changed. The ID lives in the modal title bar (Modal renders
          its own close button), so the previous header row with ID +
          close button collapses into a status/severity badge row. */}
      {selected && (
        <Modal
          open
          onClose={() => setSelectedId(null)}
          title={`Deviation ${selected.reference ?? selected.id.slice(0, 8)}`}
          className="max-w-2xl"
          header={
            <div className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-(--bg-border)">
              <p className="text-[14px] font-semibold text-(--text-primary) mt-1 truncate">{`Deviation ${selected.reference ?? selected.id.slice(0, 8)}`}</p>
              <button type="button" onClick={() => setSelectedId(null)} aria-label="Close" className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors duration-150 shrink-0">
                <X className="w-3.5 h-3.5 text-(--text-muted)" aria-hidden="true" />
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Governance Phase 2 — provenance when this deviation was raised by converting a Risk. */}
            <RaisedFromRiskBanner target="Deviation" recordId={selected.id} />

            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>
              <Badge variant={getSeverityVariant(selected.severity, "fda")}>{normalizeSeverityForDisplay(selected.severity, "fda") ?? selected.severity}</Badge>
              {/* Summarize AI - top-right of the status row (moved out of the header). */}
              <div className="ml-auto">
                <DocumentSummaryPanel
                  title={`Deviation ${selected.reference ?? selected.id.slice(0, 8)}`}
                  recordId={selected.id}
                  module="deviation"
                  content={[
                    `Title: ${selected.title}`,
                    `Description: ${selected.description}`,
                    `Category: ${selected.category}; Type: ${selected.type}; Area: ${selected.area}`,
                    `Impact - Patient safety: ${selected.patientSafetyImpact}; Product quality: ${selected.productQualityImpact}; Regulatory: ${selected.regulatoryImpact}`,
                    selected.immediateAction ? `Immediate action: ${selected.immediateAction}` : "",
                    selected.rootCause ? `Root cause: ${selected.rootCause}` : "",
                  ].filter(Boolean).join("\n\n")}
                />
              </div>
            </div>

            <div>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Title</p>
              <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{selected.title}</p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Description</p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{selected.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div><p style={{ color: "var(--text-muted)" }}>Category</p><p className="capitalize font-medium" style={{ color: "var(--text-primary)" }}>{selected.category}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Type</p><p className="capitalize font-medium" style={{ color: "var(--text-primary)" }}>{selected.type}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Area</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{selected.area}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Site</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{siteName(selected.siteId)}</p></div>
              {/* "Detected by" removed — it duplicated Owner (owner = creator). Owner
                  stays in the body row; "Detected date" kept (distinct timestamp). */}
              <div><p style={{ color: "var(--text-muted)" }}>Detected date</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{dayjs.utc(selected.detectedDate).tz(timezone).format(dateFormat)}</p></div>
            </div>

            {/* Impact */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Impact assessment</p>
              <div className="space-y-1.5">
                {([["Patient safety", selected.patientSafetyImpact], ["Product quality", selected.productQualityImpact], ["Regulatory", selected.regulatoryImpact]] as const).map(([label, level]) => (
                  <div key={label} className="flex items-center justify-between text-[11px]">
                    <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                    <Badge variant={level === "high" ? "red" : level === "medium" ? "amber" : level === "low" ? "green" : "gray"}>{level.charAt(0).toUpperCase() + level.slice(1)}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Immediate action */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Immediate action</p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{selected.immediateAction}</p>
            </div>

            {/* Tier 2, Item 4 — Investigation (RCA). INVESTIGATION-FIRST phase
                model: hidden at "open" (only the Start Investigation action shows
                there); appears once under investigation and stays (read-only RCA
                via STATE C) at pending_qa_review / capa_pending / closed. */}
            {selected.status !== "open" && (
              <InvestigationSection
                deviation={selected}
                currentUserId={user?.id}
                isQA={isQADecider}
                writable={selected.status !== "closed" && selected.status !== "rejected" && !isViewer}
                resolveUser={ownerName}
                onChanged={(msg) => { setSuccessMsg(msg); setSuccessPopup(true); router.refresh(); }}
                onError={(msg) => { setErrorMsg(msg); setErrorPopup(true); }}
              />
            )}

            {/* Tier 2, Item 3 — CAPA Decision (made after investigation, by QA;
                hidden until the investigation is complete). */}
            <CapaDecisionSection
              deviation={selected}
              currentUserId={user?.id}
              isQA={isQADecider}
              writable={selected.status !== "closed" && selected.status !== "rejected" && !isViewer}
              resolveUser={ownerName}
              onChanged={(msg) => { setSuccessMsg(msg); setSuccessPopup(true); router.refresh(); }}
              onError={(msg) => { setErrorMsg(msg); setErrorPopup(true); }}
              linkedCapaId={selected.linkedCAPAId}
              linkedCapaRef={selected.linkedCAPARef}
            />

            {selected.batchesAffected && selected.batchesAffected.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Batches affected</p>
                <div className="flex flex-wrap gap-1">{selected.batchesAffected.map((b) => <Badge key={b} variant="gray">{b}</Badge>)}</div>
              </div>
            )}

            {/* Linked-CAPA section removed (req 1) — redundant with the disposition
                banner's Raise CAPA and the CAPA-Pending banner's CAPA link below. */}

            {/* Documents — persisted via the shared document pipeline (#11), so
                they survive router.refresh()/reload. Part A: attach/delete of
                DEVIATION-level evidence is uploaded by the DOER (the reporter);
                QA REVIEWS it (segregation of duties), matching the tightened
                attachDeviationDocument server gate. The task assignee uploads to
                THEIR task in the worklist instead. */}
            {(() => {
              const docsLocked = selected.status === "closed" || selected.status === "rejected";
              const isReporter = !!user && !!selected.createdById && selected.createdById === user.id;
              const canManageDocs = isReporter && !docsLocked;
              return (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Documents</p>
                  <DocList
                    docs={(selected.documents ?? []).map((d) => ({
                      id: d.id,
                      fileName: d.fileName,
                      downloadHref: d.dataUrl ?? `/api/documents/${d.id}`,
                      uploadedBy: d.uploadedBy,
                      uploadedAt: d.uploadedAt,
                    }))}
                    emptyText="No documents attached."
                    onRemove={canManageDocs ? (id) => void handleDeleteDoc(id) : undefined}
                    busyId={deletingDocId}
                  />
                  {canManageDocs && (
                    <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer underline" style={{ color: "var(--brand)" }}>
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {docBusy ? "Uploading…" : "Attach document"}
                      <input type="file" className="hidden" disabled={docBusy} accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAttachDoc(selected.id, f); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              );
            })()}

            {/* Owner + Due */}
            <div className="grid grid-cols-2 gap-3 text-[11px] pt-2 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
              <div><p style={{ color: "var(--text-muted)" }}>Owner</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{ownerName(selected.owner)}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Due date</p><p className="font-medium" style={{ color: dayjs.utc(selected.dueDate).isBefore(dayjs()) && selected.status !== "closed" ? "#ef4444" : "var(--text-primary)" }}>{dayjs.utc(selected.dueDate).tz(timezone).format(dateFormat)}</p></div>
            </div>

            {selected.closedBy && (
              <p className="text-[10px]" style={{ color: "#10b981" }}>Closed by {selected.closedBy} · {selected.closedDate ? dayjs.utc(selected.closedDate).tz(timezone).format(dateFormat) : ""}</p>
            )}

            {/* SME Section 1, Stage 1 — CAPA Decision Gate banner. Critical
                deviation with no linked CAPA. INVESTIGATION-FIRST: this is a
                Raise-CAPA / close-gate affordance, so it appears only at the
                disposition phase (pending_qa_review), not during investigation.
                Mirrors the server-side gate in closeDeviation. */}
            {capaRequired && selected.status === "pending_qa_review" && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3 rounded-lg border"
                style={{ background: "var(--danger-bg)", borderColor: "var(--danger)" }}
              >
                <AlertOctagon
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{ color: "var(--danger)" }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold" style={{ color: "var(--danger)" }}>
                    CAPA required before closure
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    Critical deviation requires a linked CAPA before it can be closed. Raise a CAPA from this deviation to continue.
                  </p>
                  {isQAHead && (
                    <div className="mt-2">
                      <Button variant="secondary" size="sm" icon={Plus} onClick={handleRaiseCAPAFromDetail}>
                        Raise CAPA
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PRIORITY ROUTING (disposition). INVESTIGATION-FIRST: this is the
                single priority-based disposition surface and appears ONLY after
                the investigation completes (status pending_qa_review) — NOT from
                "open" onward. HIGH/MEDIUM → Raise CAPA (→ capa_pending; QA
                sign-closes when the CAPA closes); LOW → Assign Task. Also hidden
                once a CAPA is linked, when the Critical close-gate banner already
                offers Raise CAPA, and (low) once a task exists. */}
            {selected.status === "pending_qa_review" && !selected.linkedCAPAId && !capaRequired && !selected.activeTask && selected.priority && (
              <div className="p-3 rounded-lg border" style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}>
                {selected.priority === "High" || selected.priority === "Medium" ? (
                  <>
                    <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{selected.priority} priority — raise a CAPA</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>The deviation stays open and linked (CAPA Pending) until the CAPA closes; QA then signs it closed.</p>
                    {isQAHead && (
                      <div className="mt-2"><Button variant="secondary" size="sm" icon={Plus} onClick={handleRaiseCAPAFromDetail}>Raise CAPA</Button></div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Low priority — assign as a task</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Low-priority deviations are worked as a lightweight assigned task (assign → submit → QA review), or raise a CAPA if systematic correction is needed.</p>
                    {isQAHead && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="primary" size="sm" icon={Plus} onClick={() => { setAssignError(null); setAssignOpen(true); }}>Assign Task</Button>
                        <Button variant="secondary" size="sm" icon={Plus} onClick={handleRaiseCAPAFromDetail}>Raise CAPA</Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Stage 4 — low-priority TASK PANEL (disposition phase). Shows the
                assigned task's state + QA review actions. INVESTIGATION-FIRST:
                only at pending_qa_review (a task is only assignable there). */}
            {selected.activeTask && selected.status === "pending_qa_review" && (
              <div className="p-3 rounded-lg border" style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Low-priority task</p>
                  <Badge variant={selected.activeTask.status === "submitted" ? "purple" : selected.activeTask.status === "rework" ? "red" : "amber"}>{DEV_TASK_STATUS_LABEL[selected.activeTask.status] ?? selected.activeTask.status}</Badge>
                </div>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>Assigned to <strong>{selected.activeTask.assignee}</strong>{selected.activeTask.dueDate ? ` · due ${dayjs.utc(selected.activeTask.dueDate).tz(timezone).format(dateFormat)}` : ""}</p>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{selected.activeTask.message}</p>
                {selected.activeTask.completionNotes && (
                  <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}><span className="font-medium">Completion notes:</span> {selected.activeTask.completionNotes}</p>
                )}
                {/* The worker's uploaded task documents (grouped by GxP category) —
                    now surfaced to QA (previously only a count was loaded). */}
                {selected.activeTask.taskDocs.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Task documents</p>
                    <GroupedTaskDocs docs={selected.activeTask.taskDocs} emptyText="" />
                  </div>
                )}
                {/* QA review — a SUBMITTED task can be signed-closed (the Part 11
                    closeDeviation, which also completes the task + enforces
                    SoD) or sent back for rework. At any open stage QA may
                    escalate to a CAPA (which cancels the task). */}
                {isQAHead && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.activeTask.status === "submitted" && (
                      <>
                        <Button variant="primary" size="sm" icon={CheckCircle2} onClick={() => { setCloseError(null); setCloseModal(true); }}>Sign &amp; Close</Button>
                        <Button variant="secondary" size="sm" icon={Wrench} onClick={() => { setReworkTaskError(null); setReworkTaskOpen(true); }}>Send for Rework</Button>
                      </>
                    )}
                    {isQAHead && (
                      <Button variant="ghost" size="sm" icon={Plus} onClick={handleRaiseCAPAFromDetail}>Raise CAPA instead</Button>
                    )}
                  </div>
                )}
                {/* Stage 5 — flat QA↔worker conversation (same thread the worker
                    sees in the worklist). QA composes here; rework feedback also
                    lands here automatically via reworkDeviationTask. */}
                <div className="mt-3 pt-2 border-t" style={{ borderColor: "var(--bg-border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Conversation</p>
                  <TaskThread messages={selected.activeTask.messages} currentUserId={user?.id} fmt={(iso) => dayjs.utc(iso).tz(timezone).format(`${dateFormat} HH:mm`)} />
                  {isQAHead && (
                    <div className="flex items-end gap-2 mt-2">
                      <textarea className="input text-[12px] w-full min-h-14" placeholder="Message the assignee…" value={taskMsgBody} onChange={(e) => setTaskMsgBody(e.target.value)} maxLength={2000} disabled={taskMsgPosting} />
                      <Button variant="secondary" size="sm" icon={Send} disabled={taskMsgPosting || taskMsgBody.trim().length === 0} loading={taskMsgPosting} onClick={handlePostTaskMessage}>Send</Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stage 3 — CAPA Pending: the deviation waits on its linked CAPA.
                Closing the CAPA unblocks it to QA review for a signed close.
                Req 3 — the raised state shows the CAPA reference as a link. */}
            {selected.status === "capa_pending" && (
              <div className="p-3 rounded-lg border" style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>CAPA Pending</p>
                  {selected.linkedCAPAId && (
                    <button type="button" onClick={() => router.push(`/capa/${selected.linkedCAPAId}`)} className="text-[12px] font-mono text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0">{selected.linkedCAPARef ?? selected.linkedCAPAId.slice(0, 8)} →</button>
                  )}
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>A CAPA is raised and linked. This deviation stays open until the CAPA closes — that moves it back to QA review for a Part 11 signed close. No auto-close.</p>
              </div>
            )}

            {/* Action buttons — only the phases that own a status-action button:
                "open" (Start Investigation) and "pending_qa_review" (Sign & Close
                / Reject). under_investigation acts via the InvestigationSection;
                capa_pending waits on the CAPA. */}
            {(selected.status === "open" || selected.status === "pending_qa_review") && (
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
                {selected.status === "open" && isQAHead && (
                  <Button variant="primary" size="sm" fullWidth icon={Search} onClick={handleStartInvestigation}>Start Investigation</Button>
                )}
                {/* INVESTIGATION-FIRST — the former "Submit for QA Review" step is
                    gone: completeInvestigation now advances under_investigation →
                    pending_qa_review directly. During under_investigation the RCA
                    lives in the InvestigationSection above ("Complete Investigation").
                    Req 3 — when a low-priority TASK is in flight, the disposition is
                    the task: its own panel owns Sign & Close (only once submitted),
                    so don't show the generic close here (it appeared prematurely
                    right after assigning). Only the no-task path closes here. */}
                {selected.status === "pending_qa_review" && isQAHead && !selected.activeTask && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      fullWidth
                      icon={CheckCircle2}
                      onClick={() => setCloseModal(true)}
                      disabled={capaRequired}
                      title={capaRequired ? "Critical deviations require a linked CAPA before closure" : undefined}
                    >
                      Sign & Close Deviation
                    </Button>
                    <Button variant="ghost" size="sm" fullWidth onClick={() => setRejectModal(true)}>Reject</Button>
                  </>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ═══ REPORT MODAL ═══ */}
      <Modal
        open={addOpen}
        onClose={() => { setAddOpen(false); reset(); setPendingDocs([]); }}
        title="Report Deviation"
        persistent
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAddOpen(false); reset(); setPendingDocs([]); }}>Cancel</Button>
            <Button icon={Plus} onClick={handleSubmit(onReport)} disabled={!isValid || isSubmitting} loading={isSubmitting}>
              {isSubmitting ? "Saving…" : "Report Deviation"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit(onReport)} noValidate className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Basic information</p>
            <div className="space-y-3">
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Title *</p><Controller name="title" control={control} render={({ field }) => <Input id="dev-title" {...field} error={errors.title?.message} placeholder="Short descriptive title" />} /></div>
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Description *</p><Controller name="description" control={control} render={({ field }) => (<><textarea {...field} rows={3} className="input w-full resize-none" style={errors.description ? { borderColor: "#ef4444" } : undefined} placeholder="What happened?" /><p className="text-[10px] text-right mt-0.5" style={{ color: (field.value?.length ?? 0) < 10 ? "var(--danger)" : "var(--text-muted)" }}>{field.value?.length ?? 0} characters{(field.value?.length ?? 0) < 10 ? " · min 10" : ""}</p></>)} />{errors.description && <p className="text-[11px] text-[#ef4444] mt-1">{errors.description.message}</p>}</div>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Type *</p><Controller name="type" control={control} render={({ field }) => <Dropdown options={[{ value: "planned", label: "Planned" }, { value: "unplanned", label: "Unplanned" }]} value={field.value} onChange={field.onChange} width="w-full" className={errors.type ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.type && <p className="text-[11px] text-[#ef4444] mt-1">{errors.type.message}</p>}</div>
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Category *</p><Controller name="category" control={control} render={({ field }) => <Dropdown options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select..." className={errors.category ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.category && <p className="text-[11px] text-[#ef4444] mt-1">{errors.category.message}</p>}</div>
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Severity *</p><Controller name="severity" control={control} render={({ field }) => <Dropdown options={[{ value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} value={field.value} onChange={(v) => { field.onChange(v); setValue("priority", severityToPriority(v as DeviationSeverity), { shouldValidate: true }); }} width="w-full" className={errors.severity ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.severity && <p className="text-[11px] text-[#ef4444] mt-1">{errors.severity.message}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Area *</p><Controller name="area" control={control} render={({ field }) => <Dropdown options={AREAS.map((a) => ({ value: a, label: a }))} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select area..." className={errors.area ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.area && <p className="text-[11px] text-[#ef4444] mt-1">{errors.area.message}</p>}</div>
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Site *</p><Controller name="siteId" control={control} render={({ field }) => <Dropdown options={allSites.map((s) => ({ value: s.id, label: s.name }))} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select site..." className={errors.siteId ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.siteId && <p className="text-[11px] text-[#ef4444] mt-1">{errors.siteId.message}</p>}</div>
              </div>
            </div>
          </div>
          <div>
            {/* NB: required by both addSchema and the server's CreateDeviationSchema
                (min 5). The task framed this as optional, but changing that needs
                schema edits on both sides (out of scope) — kept required + marked. */}
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Immediate action *</p>
            <Controller name="immediateAction" control={control} render={({ field }) => <textarea {...field} rows={2} className="input w-full resize-none" style={errors.immediateAction ? { borderColor: "#ef4444" } : undefined} placeholder="What was done immediately after detection?" />} />
            {errors.immediateAction && <p className="text-[11px] text-[#ef4444] mt-1">{errors.immediateAction.message}</p>}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Impact assessment</p>
            <div className="grid grid-cols-3 gap-3">
              {(["patientSafetyImpact", "productQualityImpact", "regulatoryImpact"] as const).map((key) => (
                <div key={key}><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{key === "patientSafetyImpact" ? "Patient safety" : key === "productQualityImpact" ? "Product quality" : "Regulatory"} *</p><Controller name={key} control={control} render={({ field }) => <Dropdown options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }, { value: "none", label: "None" }]} value={field.value} onChange={field.onChange} width="w-full" className={errors[key] ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors[key] && <p className="text-[11px] text-[#ef4444] mt-1">{errors[key]?.message}</p>}</div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Scheduling</p>
            {/* Priority removed from the report form (severity/priority dedup) - it
                is a QA triage value DERIVED from severity (severityToPriority) and
                filled in server-side; the reporter picks only severity. Priority
                stays on the record and still drives the low->task / high->CAPA
                disposition (kept in sync via the Severity onChange above). */}
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Due date *</p><Controller name="dueDate" control={control} render={({ field }) => <DatePicker id="dev-due" value={field.value ?? ""} onChange={field.onChange} min={minDueDate} error={errors.dueDate?.message} />} /></div>
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Batches affected (optional)</p><Controller name="batchesAffected" control={control} render={({ field }) => <Input id="dev-batches" {...field} placeholder="e.g. STB-2026-042, STB-2026-043" />} /></div>
            </div>
          </div>
          {/* Optional supporting document — reuses the shared DocumentUpload.
              Files are staged client-side (the deviation has no id yet) and
              attached to the new deviation in onReport once it's created. */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Supporting document (optional)</p>
            <DocumentUpload
              recordId="new"
              recordTitle="New deviation"
              module="Deviation Management"
              existingDocs={pendingDocs}
              onUpload={(doc) => setPendingDocs((p) => [...p, doc])}
              onDelete={(id) => setPendingDocs((p) => p.filter((d) => d.id !== id))}
            />
          </div>
          {!isValid && !isSubmitting && (
            <p className="text-[10px] text-right" style={{ color: "var(--text-muted)" }}>Fill all required fields to enable submit</p>
          )}
        </form>
      </Modal>

      {/* ═══ CLOSE MODAL ═══ */}
      <Modal
        open={closeModal}
        onClose={closeBusy ? () => undefined : () => { setCloseModal(false); setCloseError(null); }}
        title="Sign &amp; Close Deviation"
      >
        <div className="space-y-4">
          <p id="sign-deviation-notice" className="alert alert-info text-[12px]">
            This is a GxP electronic signature under 21 CFR Part 11. Your
            identity, the meaning of this signature (Closed), and a content
            hash will be recorded and cannot be altered.
          </p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Deviation <strong>{selected?.reference ?? selected?.id}</strong> will be marked Closed.
          </p>
          <div>
            <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Closure message <span style={{ color: "var(--danger)" }}>*</span>
            </p>
            <textarea
              rows={3}
              className="input w-full resize-none"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Summary of investigation outcome (required, min 5 chars)..."
              disabled={closeBusy}
            />
          </div>
          <div>
            <label
              htmlFor="sign-deviation-pw"
              className="text-[11px] font-medium mb-1 block"
              style={{ color: "var(--text-secondary)" }}
            >
              Confirm your password <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <div className="relative">
              <input
                id="sign-deviation-pw"
                type={showClosePw ? "text" : "password"}
                className="input text-[12px] w-full pr-9"
                value={closePassword}
                onChange={(e) => setClosePassword(e.target.value)}
                placeholder="Re-enter your password"
                disabled={closeBusy}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShowClosePw((v) => !v)} aria-label={showClosePw ? "Hide password" : "Show password"} aria-pressed={showClosePw} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center border-none bg-transparent cursor-pointer text-(--text-muted) hover:text-(--text-primary)">
                {showClosePw ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
              </button>
            </div>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
              Required for identity verification under 21 CFR Part 11
            </p>
          </div>
          {closeError && (
            <p
              role="alert"
              className="text-[11px]"
              style={{ color: "var(--danger)" }}
            >
              {closeError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button
              variant="secondary"
              onClick={() => { setCloseModal(false); setCloseError(null); }}
              disabled={closeBusy}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              onClick={handleClose}
              disabled={closeBusy || !closePassword || closeNotes.trim().length < 5}
              loading={closeBusy}
            >
              Sign &amp; Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══ REJECT MODAL ═══ */}
      <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Reject Deviation">
        <div className="space-y-4">
          <p className="alert alert-info text-[12px]">This is a GxP electronic signature under 21 CFR Part 11. Your identity, the meaning of this signature (Rejected), and the message are recorded; your password is verified on the server.</p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Deviation <strong>{selected?.reference ?? selected?.id}</strong> will be rejected and returned to investigation.</p>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Rejection message <span style={{ color: "var(--danger)" }}>*</span></p><textarea rows={3} className="input w-full resize-none" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this being rejected? (required, min 5 chars)" disabled={rejectBusy} /></div>
          <div>
            <label htmlFor="reject-deviation-pw" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>Confirm your password <span style={{ color: "var(--danger)" }}>*</span></label>
            <div className="relative">
              <input id="reject-deviation-pw" type={showRejectPw ? "text" : "password"} className="input text-[12px] w-full pr-9" value={rejectPassword} onChange={(e) => setRejectPassword(e.target.value)} placeholder="Re-enter your password" disabled={rejectBusy} autoComplete="current-password" />
              <button type="button" onClick={() => setShowRejectPw((v) => !v)} aria-label={showRejectPw ? "Hide password" : "Show password"} aria-pressed={showRejectPw} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center border-none bg-transparent cursor-pointer text-(--text-muted) hover:text-(--text-primary)">
                {showRejectPw ? <EyeOff className="w-3.5 h-3.5" aria-hidden="true" /> : <Eye className="w-3.5 h-3.5" aria-hidden="true" />}
              </button>
            </div>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Verified server-side under 21 CFR Part 11</p>
          </div>
          {rejectError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{rejectError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => { setRejectModal(false); setRejectError(null); }} disabled={rejectBusy}>Cancel</Button>
            <Button variant="primary" icon={AlertOctagon} disabled={rejectBusy || rejectReason.trim().length < 5 || !rejectPassword} loading={rejectBusy} onClick={handleReject}>Sign &amp; Reject</Button>
          </div>
        </div>
      </Modal>

      {/* Req 1 — Raise-CAPA confirm/preview modal. Previews what carries over
          (computed from the deviation's CURRENT state); raises only on confirm. */}
      <Modal open={raiseConfirmOpen} onClose={raiseBusy ? () => undefined : () => setRaiseConfirmOpen(false)} title="Raise CAPA from deviation">
        <div className="space-y-3">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Raise a CAPA from <strong>{selected?.reference ?? selected?.id}</strong> — {selected?.title}. This will carry the following into the new CAPA:
          </p>
          <ul className="space-y-1.5 text-[12px]">
            <li className="flex items-start gap-2" style={{ color: "var(--text-primary)" }}><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#10b981" }} aria-hidden="true" /> You{user?.name ? ` (${user.name})` : ""} become the CAPA owner.</li>
            {selected?.rootCause ? (
              <li className="flex items-start gap-2" style={{ color: "var(--text-primary)" }}><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#10b981" }} aria-hidden="true" /> The deviation's root-cause analysis text carries into the CAPA.</li>
            ) : (
              <li className="flex items-start gap-2" style={{ color: "var(--text-muted)" }}><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> No root-cause text recorded yet — nothing to carry.</li>
            )}
            {selected?.activeTask ? (
              <li className="flex items-start gap-2" style={{ color: "var(--text-primary)" }}><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#10b981" }} aria-hidden="true" /> The active task (worker <strong>{selected.activeTask.assignee}</strong>) becomes a CAPA action item, preserving their work — and the task is cancelled.</li>
            ) : (
              <li className="flex items-start gap-2" style={{ color: "var(--text-muted)" }}><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> No active worker task — no action item is created.</li>
            )}
            <li className="flex items-start gap-2" style={{ color: "var(--text-primary)" }}><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#10b981" }} aria-hidden="true" /> {(selected?.documents?.length ?? 0)} deviation document{(selected?.documents?.length ?? 0) === 1 ? "" : "s"}{selected?.activeTask ? ` + ${selected.activeTask.docCount} task document${selected.activeTask.docCount === 1 ? "" : "s"}` : ""} will be linked as read-only references (not copied into evidence).</li>
          </ul>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>The deviation moves to “CAPA Pending” and stays open until the CAPA closes; you then sign-close it. No auto-close.</p>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setRaiseConfirmOpen(false)} disabled={raiseBusy}>Cancel</Button>
            <Button variant="primary" icon={Plus} onClick={handleConfirmRaiseCAPA} disabled={raiseBusy} loading={raiseBusy}>Confirm: Raise CAPA</Button>
          </div>
        </div>
      </Modal>

      {/* Stage 4 (deviation redesign) — Assign low-priority task. Assignee pool
          = ANY active tenant user (broadened from the old compliance-only
          picker). Server (assignDeviationTask) re-validates qa_head + low
          priority + active assignee. */}
      <Modal open={assignOpen} onClose={assignBusy ? () => undefined : () => { setAssignOpen(false); setAssignError(null); }} title="Assign Task">
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Assign <strong>{selected?.reference ?? selected?.id}</strong> to a user as a lightweight task. They complete the work and submit it for your review; closure is still your signed sign-off.</p>
          <div>
            <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Assignee *</p>
            <Dropdown
              options={complianceUsers.map((u) => ({ value: u.id, label: `${u.name} · ${roleLabel(u.role)}` }))}
              value={assignAssigneeId}
              onChange={setAssignAssigneeId}
              width="w-full"
              placeholder="Select a user..."
            />
          </div>
          <div>
            <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Instruction *</p>
            <textarea rows={3} className="input w-full resize-none" value={assignMessage} onChange={(e) => setAssignMessage(e.target.value)} placeholder="What should the assignee do? (≥ 5 characters)" disabled={assignBusy} />
          </div>
          <div>
            <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Due date (optional)</p>
            <DatePicker id="assign-due" value={assignDueDate} onChange={setAssignDueDate} min={minDueDate} disabled={assignBusy} placeholder="Select a date" />
          </div>
          {assignError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{assignError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => { setAssignOpen(false); setAssignError(null); }} disabled={assignBusy}>Cancel</Button>
            <Button variant="primary" icon={Plus} onClick={handleAssignTask} disabled={assignBusy || !assignAssigneeId || assignMessage.trim().length < 5} loading={assignBusy}>Assign Task</Button>
          </div>
        </div>
      </Modal>

      {/* Stage 4 (deviation redesign) — QA sends a submitted task back for
          rework (the CLOSE outcome reuses the signed-close modal above). */}
      <Modal open={reworkTaskOpen} onClose={reworkTaskBusy ? () => undefined : () => { setReworkTaskOpen(false); setReworkTaskError(null); }} title="Send Task for Rework">
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Return this task to <strong>{selected?.activeTask?.assignee}{(() => { const r = users.find((u) => u.id === selected?.activeTask?.assigneeId)?.role; return r ? ` · ${roleLabel(r)}` : ""; })()}</strong> with a reason. It reappears in their worklist.</p>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason for rework *</p><textarea rows={3} className="input w-full resize-none" value={reworkTaskReason} onChange={(e) => setReworkTaskReason(e.target.value)} placeholder="What needs to be corrected? (≥ 5 characters)" disabled={reworkTaskBusy} /></div>
          {reworkTaskError && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{reworkTaskError}</p>}
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => { setReworkTaskOpen(false); setReworkTaskError(null); }} disabled={reworkTaskBusy}>Cancel</Button>
            <Button variant="primary" icon={Wrench} onClick={handleReworkTask} disabled={reworkTaskBusy || reworkTaskReason.trim().length < 5} loading={reworkTaskBusy}>Send for Rework</Button>
          </div>
        </div>
      </Modal>

      <Popup isOpen={successPopup} variant="success" title="Success" description={successMsg} onDismiss={() => setSuccessPopup(false)} />
      <Popup isOpen={errorPopup} variant="error" title="Action failed" description={errorMsg} onDismiss={() => setErrorPopup(false)} />
        </div>
      </PageLayout>
  );
}