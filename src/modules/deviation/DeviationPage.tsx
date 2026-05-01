"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  AlertTriangle, Plus, Search, ChevronRight, Clock, CheckCircle2,
  ClipboardList, ShieldCheck, X, Info,
} from "lucide-react";
import type { Deviation as PrismaDeviation } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useComplianceUsers } from "@/hooks/useComplianceUsers";
import {
  setDeviations, addDeviationDocument, removeDeviationDocument,
  type Deviation, type DeviationStatus, type DeviationSeverity, type ImpactLevel,
} from "@/store/deviation.slice";
import {
  createDeviation as createDeviationAction,
  updateDeviation as updateDeviationAction,
  closeDeviation as closeDeviationAction,
  rejectDeviation as rejectDeviationAction,
} from "@/actions/deviations";
import { createCAPA as createCAPAAction } from "@/actions/capas";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { PageHeader, StatCard, DocumentUpload, StatusGuide } from "@/components/shared";
import { DEVIATION_STATUSES } from "@/constants/statusTaxonomy";

/* ── Adapt Prisma Deviation → slice Deviation shape ── */
function adaptDeviation(p: PrismaDeviation): Deviation {
  return {
    id: p.id,
    tenantId: p.tenantId,
    siteId: p.siteId ?? "",
    title: p.title,
    description: p.description,
    type: p.type as Deviation["type"],
    category: p.category as Deviation["category"],
    severity: p.severity as DeviationSeverity,
    area: p.area,
    detectedBy: p.detectedBy,
    detectedDate: p.detectedDate.toISOString(),
    reportedBy: p.detectedBy,
    reportedDate: p.detectedDate.toISOString(),
    owner: p.owner,
    dueDate: p.dueDate ? p.dueDate.toISOString() : "",
    status: p.status as DeviationStatus,
    immediateAction: p.immediateAction ?? "",
    rootCause: p.rootCause ?? undefined,
    rcaMethod: (p.rcaMethod ?? undefined) as Deviation["rcaMethod"],
    patientSafetyImpact: (p.patientSafetyImpact ?? "none") as ImpactLevel,
    productQualityImpact: (p.productQualityImpact ?? "none") as ImpactLevel,
    regulatoryImpact: (p.regulatoryImpact ?? "none") as ImpactLevel,
    batchesAffected: p.batchesAffected
      ? p.batchesAffected.split(",").map((b) => b.trim()).filter(Boolean)
      : undefined,
    linkedCAPAId: p.linkedCAPAId ?? undefined,
    documents: [],
    closedBy: p.closedBy ?? undefined,
    closedDate: p.closedDate ? p.closedDate.toISOString() : undefined,
    closureNotes: p.closureNotes ?? undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/* ── Constants ── */
const STATUS_VARIANT: Record<DeviationStatus, "gray" | "blue" | "amber" | "purple" | "green" | "red"> = {
  draft: "gray", open: "blue", under_investigation: "amber", pending_qa_review: "purple", closed: "green", rejected: "red",
};
const STATUS_LABEL: Record<DeviationStatus, string> = {
  draft: "Draft", open: "Open", under_investigation: "Under Investigation", pending_qa_review: "Pending QA Review", closed: "Closed", rejected: "Rejected",
};
const SEV_VARIANT: Record<DeviationSeverity, "red" | "amber" | "green"> = { critical: "red", major: "amber", minor: "green" };
const IMPACT_COLOR: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#10b981", none: "#64748b" };
const CATEGORIES = ["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"];
const AREAS = ["QC Lab", "Manufacturing", "Warehouse", "Utilities", "QMS", "R&D", "Packaging"];

const addSchema = z.object({
  title: z.string().min(5, "Title required (min 5 chars)"),
  description: z.string().min(10, "Description required"),
  type: z.enum(["planned", "unplanned"]),
  category: z.enum(["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"]),
  severity: z.enum(["critical", "major", "minor"]),
  area: z.string().min(1, "Area required"),
  immediateAction: z.string().min(5, "Immediate action required"),
  patientSafetyImpact: z.enum(["high", "medium", "low", "none"]),
  productQualityImpact: z.enum(["high", "medium", "low", "none"]),
  regulatoryImpact: z.enum(["high", "medium", "low", "none"]),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  batchesAffected: z.string().optional(),
  raiseCAPA: z.boolean().optional(),
});
type AddForm = z.infer<typeof addSchema>;

/* ══════════════════════════════════════ */

export interface DeviationPageProps {
  /** Server-fetched deviations (Prisma rows) — seeded into Redux on mount. */
  deviations?: PrismaDeviation[];
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
  useRole(); // ensure permissions matrix is loaded
  const { isCustomerAdmin, isViewer, isQAHead } = usePermissions();
  const { tenantId, org, users, allSites } = useTenantConfig();
  const complianceUsers = useComplianceUsers();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;

  const tenantDevs = deviations.filter((d) => d.tenantId === tenantId);
  const openCount = tenantDevs.filter((d) => d.status === "open").length;
  const investigatingCount = tenantDevs.filter((d) => d.status === "under_investigation").length;
  const overdueCount = tenantDevs.filter((d) => d.status !== "closed" && d.status !== "rejected" && dayjs.utc(d.dueDate).isBefore(dayjs())).length;

  function ownerName(id: string) { return users.find((u) => u.id === id)?.name ?? id; }
  function siteName(id: string) { return allSites.find((s) => s.id === id)?.name ?? id; }

  const canReport = !isCustomerAdmin && !isViewer;

  // State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (selectedId ? tenantDevs.find((d) => d.id === selectedId) ?? null : null),
    [tenantDevs, selectedId],
  );
  const [addOpen, setAddOpen] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [successPopup, setSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sevFilter, setSevFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const filtered = useMemo(() => {
    let r = tenantDevs;
    if (searchQuery) { const q = searchQuery.toLowerCase(); r = r.filter((d) => d.id.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)); }
    if (statusFilter) r = r.filter((d) => d.status === statusFilter);
    if (sevFilter) r = r.filter((d) => d.severity === sevFilter);
    if (catFilter) r = r.filter((d) => d.category === catFilter);
    return r;
  }, [tenantDevs, searchQuery, statusFilter, sevFilter, catFilter]);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<AddForm>({
    resolver: zodResolver(addSchema),
    defaultValues: { type: "unplanned", severity: "major", patientSafetyImpact: "medium", productQualityImpact: "medium", regulatoryImpact: "medium", raiseCAPA: false },
  });

  function severityToRisk(s: DeviationSeverity): "Critical" | "High" | "Medium" | "Low" {
    if (s === "critical") return "Critical";
    if (s === "major") return "High";
    return "Low";
  }

  async function onReport(data: AddForm) {
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
      owner: data.owner,
      dueDate: dayjs(data.dueDate).utc().toISOString(),
      siteId: allSites[0]?.id || undefined,
      batchesAffected: data.batchesAffected || undefined,
    });
    if (!result.success) {
      console.error("[deviation] createDeviation failed:", result.error);
      return;
    }
    const created = result.data as PrismaDeviation;
    let capaMsg = "";
    if (data.raiseCAPA) {
      const capaResult = await createCAPAAction({
        description: `${data.title} (from ${created.id})`,
        source: "Deviation",
        risk: severityToRisk(data.severity),
        owner: data.owner,
        dueDate: dayjs(data.dueDate).utc().toISOString(),
        siteId: created.siteId ?? undefined,
        linkedDeviationId: created.id,
      });
      if (capaResult.success) capaMsg = " + CAPA raised";
    }
    setAddOpen(false);
    reset();
    setSuccessMsg(`${created.id} reported${capaMsg}`);
    setSuccessPopup(true);
    router.refresh();
  }


  async function handleRaiseCAPAFromDetail() {
    if (!selected || !user) return;
    const result = await createCAPAAction({
      description: `${selected.title} (from ${selected.id})`,
      source: "Deviation",
      risk: severityToRisk(selected.severity),
      owner: selected.owner,
      dueDate: selected.dueDate,
      siteId: selected.siteId || undefined,
      linkedDeviationId: selected.id,
    });
    if (!result.success) {
      console.error("[deviation] createCAPA failed:", result.error);
      return;
    }
    const capaData = result.data as { id: string };
    setSuccessMsg(`CAPA ${capaData.id} raised from ${selected.id}`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleClose() {
    if (!selected || !user) return;
    const result = await closeDeviationAction(selected.id, closeNotes);
    if (!result.success) {
      console.error("[deviation] closeDeviation failed:", result.error);
      return;
    }
    setCloseModal(false);
    setCloseNotes("");
    setSelectedId(null);
    setSuccessMsg(`${selected.id} closed`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleReject() {
    if (!selected || !user || !rejectReason.trim()) return;
    const result = await rejectDeviationAction(selected.id, { reason: rejectReason });
    if (!result.success) {
      console.error("[deviation] rejectDeviation failed:", result.error);
      return;
    }
    setRejectModal(false);
    setRejectReason("");
    setSelectedId(null);
    setSuccessMsg(`${selected.id} rejected — returned to investigation`);
    setSuccessPopup(true);
    router.refresh();
  }

  async function handleSubmitForReview() {
    if (!selected) return;
    const result = await updateDeviationAction(selected.id, { status: "pending_qa_review" });
    if (!result.success) {
      console.error("[deviation] submitForReview failed:", result.error);
      return;
    }
    router.refresh();
  }

  async function handleStartInvestigation() {
    if (!selected) return;
    const result = await updateDeviationAction(selected.id, { status: "under_investigation" });
    if (!result.success) {
      console.error("[deviation] startInvestigation failed:", result.error);
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
            {canReport ? <Button variant="primary" icon={Plus} onClick={() => setAddOpen(true)}>Report Deviation</Button> : <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Contact QA Head to report deviations</p>}
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={ClipboardList} color="#0ea5e9" label="Total" value={String(tenantDevs.length)} sub="All deviations" />
        <StatCard icon={AlertTriangle} color="#f59e0b" label="Open" value={String(openCount)} sub="Needs investigation" />
        <StatCard icon={Search} color="#6366f1" label="Under investigation" value={String(investigatingCount)} sub="In progress" />
        <StatCard icon={Clock} color={overdueCount > 0 ? "#ef4444" : "#10b981"} label="Overdue" value={String(overdueCount)} sub={overdueCount > 0 ? "Needs attention" : "On track"} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input type="text" className="input pl-9 w-full text-[12px]" placeholder="Search deviations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-44" options={[{ value: "", label: "All statuses" }, ...Object.entries(STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))]} />
        <Dropdown placeholder="All severities" value={sevFilter} onChange={setSevFilter} width="w-36" options={[{ value: "", label: "All severities" }, { value: "critical", label: "Critical" }, { value: "major", label: "Major" }, { value: "minor", label: "Minor" }]} />
        <Dropdown placeholder="All categories" value={catFilter} onChange={setCatFilter} width="w-40" options={[{ value: "", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))]} />
        {(searchQuery || statusFilter || sevFilter || catFilter) && <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearchQuery(""); setStatusFilter(""); setSevFilter(""); setCatFilter(""); }}>Clear</Button>}
      </div>

      {/* Main content — table + detail panel */}
      <div className={clsx("grid gap-4", selected ? "grid-cols-1 lg:grid-cols-[1fr_400px]" : "grid-cols-1")}>
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
                      <td className="font-mono text-[11px]" style={{ color: "var(--brand)" }}>{dev.id}</td>
                      <td className="text-[12px] font-medium max-w-[180px] truncate" style={{ color: "var(--text-primary)" }}>{dev.title}</td>
                      <td className="text-[11px] capitalize" style={{ color: "var(--text-secondary)" }}>{dev.category}</td>
                      <td><Badge variant={SEV_VARIANT[dev.severity]}>{dev.severity.charAt(0).toUpperCase() + dev.severity.slice(1)}</Badge></td>
                      <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{dev.area}</td>
                      <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{dayjs.utc(dev.detectedDate).tz(timezone).format("DD MMM")}</td>
                      <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{ownerName(dev.owner)}</td>
                      <td className="text-[11px]" style={{ color: isOd ? "#ef4444" : "var(--text-secondary)" }}>{dayjs.utc(dev.dueDate).tz(timezone).format("DD MMM")}{isOd && <span className="block text-[9px] text-[#ef4444]">Overdue</span>}</td>
                      <td>{dev.linkedCAPAId ? <Badge variant="blue">{dev.linkedCAPAId}</Badge> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>\u2014</span>}</td>
                      <td><Badge variant={STATUS_VARIANT[dev.status]}>{STATUS_LABEL[dev.status]}</Badge></td>
                      <td><ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <aside className="card p-4 space-y-4 h-fit max-h-[calc(100vh-200px)] overflow-y-auto" aria-label={`Deviation ${selected.id} details`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[12px] font-semibold" style={{ color: "var(--brand)" }}>{selected.id}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={STATUS_VARIANT[selected.status]}>{STATUS_LABEL[selected.status]}</Badge>
                  <Badge variant={SEV_VARIANT[selected.severity]}>{selected.severity.charAt(0).toUpperCase() + selected.severity.slice(1)}</Badge>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedId(null)} className="p-1 cursor-pointer border-none bg-transparent" style={{ color: "var(--text-muted)" }} aria-label="Close detail panel"><X className="w-4 h-4" /></button>
            </div>

            <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{selected.title}</p>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{selected.description}</p>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div><p style={{ color: "var(--text-muted)" }}>Category</p><p className="capitalize font-medium" style={{ color: "var(--text-primary)" }}>{selected.category}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Type</p><p className="capitalize font-medium" style={{ color: "var(--text-primary)" }}>{selected.type}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Area</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{selected.area}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Site</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{siteName(selected.siteId)}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Detected by</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{ownerName(selected.detectedBy)}</p></div>
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

            {selected.rootCause && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Root cause{selected.rcaMethod && ` (${selected.rcaMethod})`}</p>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{selected.rootCause}</p>
              </div>
            )}

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
                <button type="button" onClick={() => router.push("/capa")} className="text-[12px] font-mono text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0">{selected.linkedCAPAId}</button>
              ) : selected.status !== "closed" && selected.status !== "rejected" && canReport ? (
                <Button variant="secondary" size="sm" icon={Plus} onClick={handleRaiseCAPAFromDetail}>Raise CAPA</Button>
              ) : (
                <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No CAPA raised</p>
              )}
            </div>

            {/* Documents */}
            <DocumentUpload
              recordId={selected.id}
              recordTitle={selected.title}
              module="Deviation Management"
              existingDocs={selected.documents ?? []}
              onUpload={(doc) => dispatch(addDeviationDocument({ deviationId: selected.id, doc }))}
              onDelete={(docId) => dispatch(removeDeviationDocument({ deviationId: selected.id, docId }))}
              readOnly={selected.status === "closed" || selected.status === "rejected" || isViewer}
            />

            {/* Owner + Due */}
            <div className="grid grid-cols-2 gap-3 text-[11px] pt-2 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
              <div><p style={{ color: "var(--text-muted)" }}>Owner</p><p className="font-medium" style={{ color: "var(--text-primary)" }}>{ownerName(selected.owner)}</p></div>
              <div><p style={{ color: "var(--text-muted)" }}>Due date</p><p className="font-medium" style={{ color: dayjs.utc(selected.dueDate).isBefore(dayjs()) && selected.status !== "closed" ? "#ef4444" : "var(--text-primary)" }}>{dayjs.utc(selected.dueDate).tz(timezone).format(dateFormat)}</p></div>
            </div>

            {selected.closedBy && (
              <p className="text-[10px]" style={{ color: "#10b981" }}>Closed by {selected.closedBy} · {selected.closedDate ? dayjs.utc(selected.closedDate).tz(timezone).format(dateFormat) : ""}</p>
            )}

            {/* Action buttons */}
            {selected.status !== "closed" && selected.status !== "rejected" && (
              <div className="space-y-2 pt-2 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
                {selected.status === "open" && canReport && (
                  <Button variant="primary" size="sm" fullWidth icon={Search} onClick={handleStartInvestigation}>Start Investigation</Button>
                )}
                {selected.status === "under_investigation" && (user?.id === selected.owner || isQAHead) && (
                  <Button variant="primary" size="sm" fullWidth icon={ShieldCheck} onClick={handleSubmitForReview}>Submit for QA Review</Button>
                )}
                {selected.status === "pending_qa_review" && isQAHead && (
                  <>
                    <Button variant="primary" size="sm" fullWidth icon={CheckCircle2} onClick={() => setCloseModal(true)}>Sign & Close Deviation</Button>
                    <Button variant="ghost" size="sm" fullWidth onClick={() => setRejectModal(true)}>Reject</Button>
                  </>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ═══ REPORT MODAL ═══ */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); reset(); }} title="Report Deviation">
        <form onSubmit={handleSubmit(onReport)} noValidate className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Basic information</p>
            <div className="space-y-3">
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Title *</p><Controller name="title" control={control} render={({ field }) => <input {...field} className="input w-full" placeholder="Short descriptive title" />} />{errors.title && <p className="text-[11px] text-[#ef4444] mt-1">{errors.title.message}</p>}</div>
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Description *</p><Controller name="description" control={control} render={({ field }) => <textarea {...field} rows={3} className="input w-full resize-none" placeholder="What happened?" />} />{errors.description && <p className="text-[11px] text-[#ef4444] mt-1">{errors.description.message}</p>}</div>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Type *</p><Controller name="type" control={control} render={({ field }) => <Dropdown options={[{ value: "planned", label: "Planned" }, { value: "unplanned", label: "Unplanned" }]} value={field.value} onChange={field.onChange} width="w-full" />} /></div>
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Category *</p><Controller name="category" control={control} render={({ field }) => <Dropdown options={CATEGORIES.map((c) => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select..." />} /></div>
                <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Severity *</p><Controller name="severity" control={control} render={({ field }) => <Dropdown options={[{ value: "critical", label: "Critical" }, { value: "major", label: "Major" }, { value: "minor", label: "Minor" }]} value={field.value} onChange={field.onChange} width="w-full" />} /></div>
              </div>
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Area *</p><Controller name="area" control={control} render={({ field }) => <Dropdown options={AREAS.map((a) => ({ value: a, label: a }))} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select area..." />} />{errors.area && <p className="text-[11px] text-[#ef4444] mt-1">{errors.area.message}</p>}</div>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Immediate action</p>
            <Controller name="immediateAction" control={control} render={({ field }) => <textarea {...field} rows={2} className="input w-full resize-none" placeholder="What was done immediately after detection?" />} />
            {errors.immediateAction && <p className="text-[11px] text-[#ef4444] mt-1">{errors.immediateAction.message}</p>}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Impact assessment</p>
            <div className="grid grid-cols-3 gap-3">
              {(["patientSafetyImpact", "productQualityImpact", "regulatoryImpact"] as const).map((key) => (
                <div key={key}><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{key === "patientSafetyImpact" ? "Patient safety" : key === "productQualityImpact" ? "Product quality" : "Regulatory"} *</p><Controller name={key} control={control} render={({ field }) => <Dropdown options={[{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }, { value: "none", label: "None" }]} value={field.value} onChange={field.onChange} width="w-full" />} /></div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Assignment</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Owner *</p><Controller name="owner" control={control} render={({ field }) => <Dropdown options={complianceUsers.map((u) => ({ value: u.id, label: u.name }))} value={field.value} onChange={field.onChange} width="w-full" placeholder="Select..." />} />{errors.owner && <p className="text-[11px] text-[#ef4444] mt-1">{errors.owner.message}</p>}</div>
              <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Due date *</p><Controller name="dueDate" control={control} render={({ field }) => <input type="date" {...field} className="input w-full" />} />{errors.dueDate && <p className="text-[11px] text-[#ef4444] mt-1">{errors.dueDate.message}</p>}</div>
            </div>
            <div className="mt-2"><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Batches affected (optional, comma-separated)</p><Controller name="batchesAffected" control={control} render={({ field }) => <input {...field} className="input w-full" placeholder="e.g. STB-2026-042, STB-2026-043" />} /></div>
          </div>
          <Controller name="raiseCAPA" control={control} render={({ field }) => (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#0ea5e9]" checked={field.value ?? false} onChange={(e) => field.onChange(e.target.checked)} />
              <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>Raise CAPA immediately</span>
            </label>
          )} />
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => { setAddOpen(false); reset(); }}>Cancel</Button>
            <Button type="submit" icon={Plus}>Report Deviation</Button>
          </div>
        </form>
      </Modal>

      {/* ═══ CLOSE MODAL ═══ */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Close Deviation">
        <div className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Deviation <strong>{selected?.id}</strong> will be marked Closed. This action is recorded in the audit trail.</p>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Closure notes</p><textarea rows={3} className="input w-full resize-none" value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Summary of investigation outcome..." /></div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setCloseModal(false)}>Cancel</Button>
            <Button variant="primary" icon={CheckCircle2} onClick={handleClose}>Sign & Close</Button>
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
    </main>
  );
}