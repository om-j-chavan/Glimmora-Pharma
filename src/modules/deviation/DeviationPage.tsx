"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import clsx from "clsx";
import {
  AlertTriangle, AlertOctagon, Plus, Search, ChevronRight, Clock, CheckCircle2,
  ClipboardList, ShieldCheck, X, Info, FileText,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import {
  setDeviations,
  type DeviationSeverity,
} from "@/store/deviation.slice";
import {
  createDeviation as createDeviationAction,
  startInvestigation as startInvestigationAction,
  submitDeviationForReview as submitDeviationForReviewAction,
  closeDeviation as closeDeviationAction,
  rejectDeviation as rejectDeviationAction,
  attachDeviationDocument,
} from "@/actions/deviations";
import { createCAPA as createCAPAAction } from "@/actions/capas";
import { deleteDocument } from "@/actions/documents";
import { displayName, displayUserName, displaySiteName } from "@/lib/identity-display";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { PageHeader, StatCard, StatusGuide } from "@/components/shared";
import { DEVIATION_STATUSES } from "@/constants/statusTaxonomy";
import {
  STATUS_VARIANT, STATUS_LABEL, IMPACT_COLOR, CATEGORIES, AREAS,
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
  // Capability mirrors of the server (exclude super_admin from authoring).
  const devCan = usePermissions("deviation");
  const capaCan = usePermissions("capa");
  // Evidence-author capability — mirrors createDocument's COMPLIANCE_AUTHOR_ROLES
  // server gate (the SAME gate attachDeviationDocument enforces). Tightens the
  // attach/delete affordance from the old "not viewer" to the author set, so UI
  // and server agree (qc_lab_director / it_cdo / operations_head lose attach).
  const canAttachDocs = usePermissions("evidence").canCreate;
  const [docBusy, setDocBusy] = useState(false);

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
    setDocBusy(true);
    const res = await deleteDocument(docId);
    setDocBusy(false);
    if (!res.success) { setErrorMsg(res.error || "Failed to delete document."); setErrorPopup(true); return; }
    router.refresh();
  }
  // QA-decider gate for the Tier 2 CAPA decision — mirrors the server check
  // in saveCAPADecision (qa_head OR super_admin).
  const isQADecider = currentRole === "qa_head" || currentRole === "super_admin";
  const { tenantId, org, users, allSites } = useTenantConfig();
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
  // (see PageHeader actions); the results card mounts only after a run.
  const deviationIntel = useDeviationIntelligence(deviationIntelInput);

  const openCount = tenantDevs.filter((d) => d.status === "open").length;
  const investigatingCount = tenantDevs.filter((d) => d.status === "under_investigation").length;
  const overdueCount = tenantDevs.filter((d) => d.status !== "closed" && d.status !== "rejected" && dayjs.utc(d.dueDate).isBefore(dayjs())).length;

  function ownerName(id: string) { return displayUserName(id, users); }
  function siteName(id: string) { return displaySiteName(id, allSites); }


  // State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (selectedId ? tenantDevs.find((d) => d.id === selectedId) ?? null : null),
    [tenantDevs, selectedId],
  );
  // SME Section 1, Stage 1 — CAPA Decision Gate (client mirror).
  // Server enforces the same rule in closeDeviation (incl. the orphan-link
  // case where linkedCAPAId is set but the CAPA was hard-deleted). The
  // client only knows about the obvious "no link" case; if the orphan path
  // is hit it surfaces via the server error string in handleClose.
  const capaRequired = !!selected && normalizeSeverityForDisplay(selected.severity, "fda") === "Critical" && !selected.linkedCAPAId;
  const [addOpen, setAddOpen] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [closePassword, setClosePassword] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
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
    defaultValues: { type: "unplanned", severity: "Major", priority: "Medium", patientSafetyImpact: "medium", productQualityImpact: "medium", regulatoryImpact: "medium" },
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
        siteId: allSites[0]?.id || undefined,
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
      // record. The CAPA decision is now made AFTER the investigation (see the
      // CAPA Decision section in the detail modal), so no CAPA is auto-raised
      // here. The old "Raise CAPA immediately" checkbox has been removed.
      setAddOpen(false);
      reset();
      setSuccessMsg(`${created.reference ?? created.id.slice(0, 8)} reported`);
      setSuccessPopup(true);
      router.refresh();
    } catch (err) {
      // Unexpected throw (network/runtime) — previously unhandled, which was
      // part of the silent-failure surface. Surface it visibly.
      console.error("createDeviation failed:", err);
      setErrorMsg("An unexpected error occurred. Please try again.");
      setErrorPopup(true);
    }
  }


  async function handleRaiseCAPAFromDetail() {
    if (!selected || !user) return;
    const result = await createCAPAAction({
      title: selected.title.slice(0, 120),
      description: `${selected.title} (from ${selected.id})`,
      source: "Deviation",
      risk: severityToRisk(selected.severity),
      owner: selected.owner,
      dueDate: selected.dueDate,
      siteId: selected.siteId || undefined,
      linkedDeviationId: selected.id,
    });
    if (!result.success) {
      setErrorMsg(result.error || "Failed to raise CAPA. Please try again.");
      setErrorPopup(true);
      return;
    }
    const capaData = result.data as { id: string; reference?: string | null };
    setSuccessMsg(`CAPA ${capaData.reference ?? capaData.id.slice(0, 8)} raised from ${selected.reference ?? selected.id.slice(0, 8)}`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleClose() {
    if (!selected || !user) return;
    setCloseBusy(true);
    setCloseError(null);
    const result = await closeDeviationAction(selected.id, {
      password: closePassword,
      notes: closeNotes || undefined,
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
    if (!selected || !user || !rejectReason.trim()) return;
    const result = await rejectDeviationAction(selected.id, { reason: rejectReason });
    if (!result.success) {
      setErrorMsg(result.error || "Failed to reject deviation. Please try again.");
      setErrorPopup(true);
      return;
    }
    setRejectModal(false);
    setRejectReason("");
    setSelectedId(null);
    setSuccessMsg(`${selected.reference ?? selected.id.slice(0, 8)} rejected — returned to investigation`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleSubmitForReview() {
    if (!selected) return;
    const result = await submitDeviationForReviewAction(selected.id);
    if (!result.success) {
      setErrorMsg(result.error || "Failed to submit for review. Please try again.");
      setErrorPopup(true);
      return;
    }
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

  return (
    <main id="main-content" aria-label="Deviation management" className="w-full space-y-5">
      <PageHeader
        title="Deviation Management"
        subtitle={tenantDevs.length === 0 ? "No deviations reported yet" : `${tenantDevs.length} deviations \u00b7 ${openCount} open \u00b7 ${investigatingCount} under investigation`}
        actions={
          <div className="flex items-center gap-3">
            <StatusGuide module="Deviation Management" statuses={DEVIATION_STATUSES} />
            <DeviationIntelligenceRunButton state={deviationIntel} />
            {devCan.canCreate ? <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Report Deviation</Button> : <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Contact QA Head to report deviations</p>}
          </div>
        }
      />

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
          <div className="overflow-x-auto">
            <table className="data-table" style={{ minWidth: 800 }} aria-label="Deviation register">
              <caption className="sr-only">List of deviations with status and severity</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Title</th>
                  <th scope="col">Category</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Area</th>
                  <th scope="col">Detected</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Due</th>
                  <th scope="col">CAPA</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8"><AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" /><p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{tenantDevs.length === 0 ? "No deviations reported yet" : "No deviations match filters"}</p></td></tr>
                ) : filtered.map((dev) => {
                  const isOd = dev.status !== "closed" && dev.status !== "rejected" && dayjs.utc(dev.dueDate).isBefore(dayjs());
                  return (
                    <tr key={dev.id} className={clsx("cursor-pointer", selected?.id === dev.id && (isDark ? "bg-[#0d2a4a]" : "bg-[#f0f7ff]"))} onClick={() => setSelectedId(dev.id)} style={dev.status === "closed" ? { opacity: 0.6 } : undefined}>
                      <td className="font-mono text-[11px]" style={{ color: "var(--brand)" }}>{dev.reference ?? dev.id.slice(0, 8)}</td>
                      <td className="text-[12px] font-medium max-w-[180px] truncate" style={{ color: "var(--text-primary)" }}>{dev.title}</td>
                      <td className="text-[11px] capitalize" style={{ color: "var(--text-secondary)" }}>{dev.category}</td>
                      <td><Badge variant={getSeverityVariant(dev.severity, "fda")}>{normalizeSeverityForDisplay(dev.severity, "fda") ?? dev.severity}</Badge></td>
                      <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{dev.area}</td>
                      <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(dev.detectedDate).tz(timezone).format("DD MMM")}</td>
                      <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{ownerName(dev.owner)}</td>
                      <td className="text-[11px]" style={{ color: isOd ? "#ef4444" : "var(--text-secondary)" }}>{dayjs.utc(dev.dueDate).tz(timezone).format("DD MMM")}{isOd && <span className="block text-[9px] text-[#ef4444]">Overdue</span>}</td>
                      <td>{dev.linkedCAPAId ? <Badge variant="blue">{dev.linkedCAPARef ?? dev.linkedCAPAId.slice(0, 8)}</Badge> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</td>
                      <td><Badge variant={STATUS_VARIANT[dev.status]}>{STATUS_LABEL[dev.status]}</Badge></td>
                      <td><ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>
              <Badge variant={getSeverityVariant(selected.severity, "fda")}>{normalizeSeverityForDisplay(selected.severity, "fda") ?? selected.severity}</Badge>
            </div>

            <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{selected.title}</p>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{selected.description}</p>

            {/* Feature 3 — Document Summarizing */}
            <DocumentSummaryPanel
              title={`Deviation ${selected.reference ?? selected.id.slice(0, 8)}`}
              recordId={selected.id}
              module="deviation"
              content={[
                `Title: ${selected.title}`,
                `Description: ${selected.description}`,
                `Category: ${selected.category}; Type: ${selected.type}; Area: ${selected.area}`,
                `Impact — Patient safety: ${selected.patientSafetyImpact}; Product quality: ${selected.productQualityImpact}; Regulatory: ${selected.regulatoryImpact}`,
                selected.immediateAction ? `Immediate action: ${selected.immediateAction}` : "",
                selected.rootCause ? `Root cause: ${selected.rootCause}` : "",
              ].filter(Boolean).join("\n\n")}
            />

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div><p style={{ color: "var(--text-muted)" }}>Category</p><p className="capitalize font-medium" style={{ color: "var(--text-primary)" }}>{selected.category}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Type</p><p className="capitalize font-medium" style={{ color: "var(--text-primary)" }}>{selected.type}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Area</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{selected.area}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Site</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{siteName(selected.siteId)}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Detected by</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{displayName({ name: selected.detectedBy })}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Detected date</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{dayjs.utc(selected.detectedDate).tz(timezone).format(dateFormat)}</p></div>
            </div>

            {/* Impact */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Impact assessment</p>
              <div className="space-y-1.5">
                {([["Patient safety", selected.patientSafetyImpact], ["Product quality", selected.productQualityImpact], ["Regulatory", selected.regulatoryImpact]] as const).map(([label, level]) => (
                  <div key={label} className="flex items-center justify-between text-[11px]">
                    <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                    <span className="font-semibold capitalize" style={{ color: IMPACT_COLOR[level] }}>{level}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Immediate action */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Immediate action</p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{selected.immediateAction}</p>
            </div>

            {/* Tier 2, Item 4 — Investigation (RCA). Replaces the old read-only
                "Root cause" block; the Completed state renders the readable RCA. */}
            <InvestigationSection
              deviation={selected}
              currentUserId={user?.id}
              isQA={isQADecider}
              writable={selected.status !== "closed" && selected.status !== "rejected" && !isViewer}
              resolveUser={ownerName}
              onChanged={(msg) => { setSuccessMsg(msg); setSuccessPopup(true); router.refresh(); }}
              onError={(msg) => { setErrorMsg(msg); setErrorPopup(true); }}
            />

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
              onRaiseCAPA={handleRaiseCAPAFromDetail}
              linkedCapaId={selected.linkedCAPAId}
              linkedCapaRef={selected.linkedCAPARef}
            />

            {selected.batchesAffected && selected.batchesAffected.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Batches affected</p>
                <div className="flex flex-wrap gap-1">{selected.batchesAffected.map((b) => <Badge key={b} variant="gray">{b}</Badge>)}</div>
              </div>
            )}

            {/* Linked CAPA */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Linked CAPA</p>
              {selected.linkedCAPAId ? (
                <button type="button" onClick={() => router.push(`/capa/${selected.linkedCAPAId}`)} className="text-[12px] font-mono text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0">{selected.linkedCAPARef ?? selected.linkedCAPAId.slice(0, 8)}</button>
              ) : selected.status !== "closed" && selected.status !== "rejected" && capaCan.canCreate ? (
                <Button variant="secondary" size="sm" icon={Plus} onClick={handleRaiseCAPAFromDetail}>Raise CAPA</Button>
              ) : (
                <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No CAPA raised</p>
              )}
            </div>

            {/* Documents — persisted via the shared document pipeline (#11), so
                they survive router.refresh()/reload. Attach/delete gated by
                canAttachDocs (COMPLIANCE_AUTHOR_ROLES — UI matches the server). */}
            {(() => {
              const docsLocked = selected.status === "closed" || selected.status === "rejected";
              const canManageDocs = canAttachDocs && !docsLocked;
              return (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Documents</p>
                  {(selected.documents ?? []).length === 0 ? (
                    <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No documents attached.</p>
                  ) : (
                    <ul className="space-y-1">
                      {(selected.documents ?? []).map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-[12px]">
                          <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
                          <a href={d.dataUrl} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate underline" style={{ color: "var(--brand)" }}>{d.fileName}</a>
                          {canManageDocs && (
                            <button type="button" onClick={() => handleDeleteDoc(d.id)} disabled={docBusy} aria-label={`Delete ${d.fileName}`} className="border-none bg-transparent cursor-pointer shrink-0" style={{ color: "var(--text-muted)" }}><X className="w-3.5 h-3.5" aria-hidden="true" /></button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
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

            {/* SME Section 1, Stage 1 — CAPA Decision Gate banner.
                Shown when a Critical deviation has no linked CAPA and is not
                yet closed/rejected. Mirrors the server-side gate in
                closeDeviation and links to the existing Raise CAPA flow. */}
            {capaRequired && selected.status !== "closed" && selected.status !== "rejected" && (
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
                  {capaCan.canCreate && (
                    <div className="mt-2">
                      <Button variant="secondary" size="sm" icon={Plus} onClick={handleRaiseCAPAFromDetail}>
                        Raise CAPA
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Stage 3 (deviation redesign) — PRIORITY ROUTING. The triage
                priority decides the path: HIGH/MEDIUM raise a CAPA (deviation →
                CAPA Pending, stays open + linked until the CAPA closes, then QA
                SIGN-closes — NO auto-close); LOW is worked as a lightweight
                assigned task (the DeviationTask subsystem lands in Stage 4).
                Hidden once a CAPA is linked and when the Critical close-gate
                banner above already offers Raise CAPA. */}
            {selected.status !== "closed" && selected.status !== "rejected" && selected.status !== "capa_pending" && !selected.linkedCAPAId && !capaRequired && selected.priority && (
              <div className="p-3 rounded-lg border" style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}>
                {selected.priority === "High" || selected.priority === "Medium" ? (
                  <>
                    <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{selected.priority} priority — raise a CAPA</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>The deviation stays open and linked (CAPA Pending) until the CAPA closes; QA then signs it closed.</p>
                    {capaCan.canCreate && (
                      <div className="mt-2"><Button variant="secondary" size="sm" icon={Plus} onClick={handleRaiseCAPAFromDetail}>Raise CAPA</Button></div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>Low priority — assign as a task</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Low-priority deviations are worked as a lightweight assigned task (assign → submit → QA review). The task subsystem arrives in the next stage.</p>
                  </>
                )}
              </div>
            )}

            {/* Stage 3 — CAPA Pending: the deviation waits on its linked CAPA.
                Closing the CAPA unblocks it to QA review for a signed close. */}
            {selected.status === "capa_pending" && (
              <div className="p-3 rounded-lg border" style={{ background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}>
                <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>CAPA Pending</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>A CAPA is raised and linked. This deviation stays open until the CAPA closes — that moves it back to QA review for a Part 11 signed close. No auto-close.</p>
              </div>
            )}

            {/* Action buttons */}
            {selected.status !== "closed" && selected.status !== "rejected" && (
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
                {selected.status === "open" && devCan.canEdit && (
                  <Button variant="primary" size="sm" fullWidth icon={Search} onClick={handleStartInvestigation}>Start Investigation</Button>
                )}
                {selected.status === "under_investigation" && (user?.id === selected.owner || isQAHead) && (
                  <Button variant="primary" size="sm" fullWidth icon={ShieldCheck} onClick={handleSubmitForReview}>Submit for QA Review</Button>
                )}
                {selected.status === "pending_qa_review" && isQAHead && (
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
      <Modal open={addOpen} onClose={() => { setAddOpen(false); reset(); }} title="Report Deviation">
        <form onSubmit={handleSubmit(onReport)} noValidate className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Basic information</p>
            <div className="space-y-3">
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Title *</p><Controller name="title" control={control} render={({ field }) => <input {...field} className="input w-full" style={errors.title ? { borderColor: "#ef4444" } : undefined} placeholder="Short descriptive title" />} />{errors.title && <p className="text-[11px] text-[#ef4444] mt-1">{errors.title.message}</p>}</div>
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Description *</p><Controller name="description" control={control} render={({ field }) => <textarea {...field} rows={3} className="input w-full resize-none" style={errors.description ? { borderColor: "#ef4444" } : undefined} placeholder="What happened?" />} />{errors.description && <p className="text-[11px] text-[#ef4444] mt-1">{errors.description.message}</p>}</div>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Type *</p><Controller name="type" control={control} render={({ field }) => <Dropdown options={[{ value: "planned", label: "Planned" }, { value: "unplanned", label: "Unplanned" }]} value={field.value} onChange={field.onChange} width="w-full" className={errors.type ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.type && <p className="text-[11px] text-[#ef4444] mt-1">{errors.type.message}</p>}</div>
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Category *</p><Controller name="category" control={control} render={({ field }) => <Dropdown options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select..." className={errors.category ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.category && <p className="text-[11px] text-[#ef4444] mt-1">{errors.category.message}</p>}</div>
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Severity *</p><Controller name="severity" control={control} render={({ field }) => <Dropdown options={[{ value: "Critical", label: "Critical" }, { value: "Major", label: "Major" }, { value: "Minor", label: "Minor" }]} value={field.value} onChange={(v) => { field.onChange(v); setValue("priority", severityToPriority(v as DeviationSeverity), { shouldValidate: true }); }} width="w-full" className={errors.severity ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.severity && <p className="text-[11px] text-[#ef4444] mt-1">{errors.severity.message}</p>}</div>
              </div>
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Area *</p><Controller name="area" control={control} render={({ field }) => <Dropdown options={AREAS.map((a) => ({ value: a, label: a }))} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select area..." className={errors.area ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.area && <p className="text-[11px] text-[#ef4444] mt-1">{errors.area.message}</p>}</div>
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
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Triage</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Priority * <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(from severity, editable)</span></p><Controller name="priority" control={control} render={({ field }) => <Dropdown options={[{ value: "High", label: "High" }, { value: "Medium", label: "Medium" }, { value: "Low", label: "Low" }]} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select..." className={errors.priority ? "ring-1 ring-[#ef4444] rounded-lg" : undefined} />} />{errors.priority && <p className="text-[11px] text-[#ef4444] mt-1">{errors.priority.message}</p>}</div>
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Due date *</p><Controller name="dueDate" control={control} render={({ field }) => <input type="date" {...field} className="input w-full" style={errors.dueDate ? { borderColor: "#ef4444" } : undefined} />} />{errors.dueDate && <p className="text-[11px] text-[#ef4444] mt-1">{errors.dueDate.message}</p>}</div>
            </div>
            <div className="mt-2"><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Batches affected (optional, comma-separated)</p><Controller name="batchesAffected" control={control} render={({ field }) => <input {...field} className="input w-full" placeholder="e.g. STB-2026-042, STB-2026-043" />} /></div>
          </div>
          <div className="flex flex-col items-end gap-1.5 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            {!isValid && !isSubmitting && (
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Fill all required fields to enable submit</p>
            )}
            <div className="flex justify-end gap-2">
              {/* Cancel stays enabled during submit (per spec). */}
              <Button variant="secondary" onClick={() => { setAddOpen(false); reset(); }}>Cancel</Button>
              <Button type="submit" icon={Plus} disabled={!isValid || isSubmitting} loading={isSubmitting}>
                {isSubmitting ? "Saving…" : "Report Deviation"}
              </Button>
            </div>
          </div>
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
            Deviation <strong>{selected?.id}</strong> will be marked Closed.
          </p>
          <div>
            <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Closure notes
            </p>
            <textarea
              rows={3}
              className="input w-full resize-none"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
              placeholder="Summary of investigation outcome..."
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
            <input
              id="sign-deviation-pw"
              type="password"
              className="input text-[12px] w-full"
              value={closePassword}
              onChange={(e) => setClosePassword(e.target.value)}
              placeholder="Re-enter your password"
              disabled={closeBusy}
              autoComplete="current-password"
            />
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
              disabled={closeBusy || !closePassword}
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
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Deviation <strong>{selected?.id}</strong> will be rejected and returned to investigation.</p>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Reason for rejection *</p><textarea rows={3} className="input w-full resize-none" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Why is this being rejected?" /></div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setRejectModal(false)}>Cancel</Button>
            <Button variant="primary" disabled={!rejectReason.trim()} onClick={handleReject}>Reject</Button>
          </div>
        </div>
      </Modal>

      <Popup isOpen={successPopup} variant="success" title="Success" description={successMsg} onDismiss={() => setSuccessPopup(false)} />
      <Popup isOpen={errorPopup} variant="error" title="Action failed" description={errorMsg} onDismiss={() => setErrorPopup(false)} />
    </main>
  );
}