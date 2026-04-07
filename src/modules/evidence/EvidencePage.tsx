import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import clsx from "clsx";
import {
  FolderOpen, Package, Plus, Download, Eye,
  FileText, ClipboardList, Shield, CheckSquare, BarChart3, GitBranch,
  Award, BookOpen, File, ClipboardCheck,
} from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useRole } from "@/hooks/useRole";
import { useTenantData } from "@/hooks/useTenantData";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { addDocument, addPack, updatePack, type EvidenceDocument, type EvidencePack, type DocType, type DocArea, type DocStatus } from "@/store/evidence.slice";
import { auditLog } from "@/lib/audit";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { Modal } from "@/components/ui/Modal";

import { DocumentLibraryTab } from "./tabs/DocumentLibraryTab";
import { PackBuilderTab } from "./tabs/PackBuilderTab";
import { DILStatusTab } from "./tabs/DILStatusTab";

/* ── Constants ── */

type LucideIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;

const DOC_TYPE_ICONS: Record<DocType, LucideIcon> = { SOP: FileText, Record: ClipboardList, "Audit Trail": Shield, Validation: CheckSquare, Report: BarChart3, Protocol: GitBranch, Certificate: Award, Policy: BookOpen, Other: File };
const DOC_TYPES: DocType[] = ["SOP", "Record", "Audit Trail", "Validation", "Report", "Protocol", "Certificate", "Policy", "Other"];
const DOC_AREAS: DocArea[] = ["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT", "Regulatory", "Training", "HR"];
const DOC_STATUSES: DocStatus[] = ["Current", "Draft", "Superseded", "Missing", "Under Review"];

function docStatusBadge(s: DocStatus) {
  const m: Record<DocStatus, "green" | "blue" | "gray" | "red" | "amber"> = { Current: "green", Draft: "blue", Superseded: "gray", Missing: "red", "Under Review": "amber" };
  return <Badge variant={m[s]}>{s}</Badge>;
}

/* ── Schemas ── */

const docSchema = z.object({
  title: z.string().min(2, "Title required"), reference: z.string().min(1, "Reference required"),
  type: z.enum(["SOP", "Record", "Audit Trail", "Validation", "Report", "Protocol", "Certificate", "Policy", "Other"]),
  area: z.enum(["Manufacturing", "QC Lab", "Warehouse", "Utilities", "QMS", "CSV/IT", "Regulatory", "Training", "HR"]),
  version: z.string().min(1, "Version required"), status: z.enum(["Current", "Draft", "Superseded", "Missing", "Under Review"]),
  author: z.string().min(1, "Author required"), effectiveDate: z.string().min(1, "Effective date required"),
  expiryDate: z.string().optional(), systemId: z.string().optional(), findingId: z.string().optional(),
  capaId: z.string().optional(), url: z.string().optional(), tags: z.string().optional(),
});
type DocForm = z.infer<typeof docSchema>;

const packSchema = z.object({ name: z.string().min(2, "Name required"), purpose: z.string().min(5, "Purpose required") });
type PackForm = z.infer<typeof packSchema>;

/* ══════════════════════════════════════ */

export function EvidencePage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { findings, capas, systems, fda483Events, evidenceDocs, evidencePacks, tenantId } = useTenantData();
  const evidence = { documents: evidenceDocs, packs: evidencePacks };
  const { org, users } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const companyName = org.companyName;
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";
  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();

  /* ── Aggregate documents ── */
  function getAllDocuments(): EvidenceDocument[] {
    const docs: EvidenceDocument[] = [...evidence.documents];
    findings.forEach((f) => {
      if (f.evidenceLink?.trim() && !docs.find((d) => d.reference === f.evidenceLink)) {
        docs.push({ id: `finding-${f.id}`, title: f.requirement, reference: f.evidenceLink, type: "Record", area: (f.area as DocArea) || "QMS", findingId: f.id, version: "1.0", status: f.status === "Closed" ? "Current" : "Under Review", author: f.owner, effectiveDate: f.createdAt, tags: [f.framework, f.severity].filter(Boolean), complianceTags: [f.framework], createdAt: f.createdAt });
      }
    });
    capas.forEach((c) => {
      c.evidenceLinks.forEach((link, i) => {
        if (!docs.find((d) => d.reference === link)) {
          docs.push({ id: `capa-${c.id}-${i}`, title: `${c.id} \u2014 Evidence ${i + 1}`, reference: link, type: "Record", area: "QMS", capaId: c.id, version: "1.0", status: c.status === "Closed" ? "Current" : "Under Review", author: c.owner, effectiveDate: c.createdAt, tags: ["CAPA", c.source], complianceTags: [c.source], createdAt: c.createdAt });
        }
      });
    });
    fda483Events.forEach((e) => {
      if (e.responseDraft?.trim() && !docs.find((d) => d.eventId === e.id)) {
        docs.push({ id: `event-${e.id}`, title: `${e.referenceNumber} \u2014 Response Draft`, reference: e.referenceNumber, type: "Record", area: "Regulatory", eventId: e.id, version: "1.0", status: e.status === "Response Submitted" ? "Current" : "Draft", author: "", effectiveDate: e.createdAt, tags: [e.type, e.agency], complianceTags: [e.type], createdAt: e.createdAt });
      }
    });
    return docs;
  }

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<"library" | "builder" | "dil">("library");
  const [previewPack, setPreviewPack] = useState<EvidencePack | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [systemFilter, setSystemFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [addedPopup, setAddedPopup] = useState(false);
  const [buildPackOpen, setBuildPackOpen] = useState(false);
  const [packSavedPopup, setPackSavedPopup] = useState(false);
  const [justCreatedPack, setJustCreatedPack] = useState<EvidencePack | null>(null);
  const [exporting, setExporting] = useState(false);

  const allDocs = getAllDocuments();

  function ownerName(id: string) { return users.find((u) => u.id === id)?.name ?? id; }

  function exportPack(pack: EvidencePack) {
    const docs = pack.documentIds.map((id) => allDocs.find((d) => d.id === id)).filter((d): d is EvidenceDocument => Boolean(d));
    const sc = (s: DocStatus) => ({ Current: "#10b981", Draft: "#0ea5e9", Superseded: "#94a3b8", Missing: "#ef4444", "Under Review": "#f59e0b" }[s] ?? "#94a3b8");
    const rows = docs.map((d, i) => `<tr style="background:${i % 2 === 0 ? "#fff" : "#f8fafc"}"><td style="padding:8px 12px;border:1px solid #e2e8f0;font-family:monospace;font-size:11px;color:#0ea5e9">${d.reference}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:12px;color:#0a1628;font-weight:500">${d.title}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:11px;color:#475569">${d.type}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:11px;color:#475569">${d.area}</td><td style="padding:8px 12px;border:1px solid #e2e8f0"><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;background:${sc(d.status)}18;color:${sc(d.status)}">${d.status}</span></td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:11px;color:#475569">v${d.version}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;font-size:11px;color:#475569">${d.effectiveDate ? dayjs.utc(d.effectiveDate).format(dateFormat) : "\u2014"}</td><td style="padding:8px 12px;border:1px solid #e2e8f0">${d.complianceTags.map((t) => `<span style="display:inline-block;margin:1px;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:600;background:rgba(99,102,241,0.1);color:#6366f1">${t}</span>`).join("")}</td></tr>`).join("");
    const cc = docs.filter((d) => d.status === "Current").length;
    const mc = docs.filter((d) => d.status === "Missing").length;
    const areas = [...new Set(docs.map((d) => d.area))].join(", ");
    const types = [...new Set(docs.map((d) => d.type))].join(", ");
    const prepBy = ownerName(user?.id ?? "");
    const expDate = dayjs().format("DD MMM YYYY HH:mm");
    const orgName = companyName || "Pharma Glimmora";
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${pack.name}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,Arial,sans-serif;font-size:13px;color:#0a1628;padding:40px;background:#fff}.header{border-bottom:2px solid #0ea5e9;padding-bottom:20px;margin-bottom:24px}.logo-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.logo{font-size:14px;font-weight:700;color:#0ea5e9}h1{font-size:22px;font-weight:700;margin-bottom:6px}.purpose{font-size:13px;color:#475569;margin-bottom:16px}.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}.meta-card{padding:12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0}.meta-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin-bottom:4px}.meta-value{font-size:14px;font-weight:700;color:#0a1628}.green{color:#10b981}.red{color:#ef4444}table{width:100%;border-collapse:collapse;margin-bottom:24px}thead tr{background:#0a1f38}th{padding:10px 12px;text-align:left;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;border:1px solid #1e3a5a}.part11{padding:12px 16px;border-radius:8px;background:rgba(99,102,241,.06);border:1px solid rgba(99,102,241,.2);font-size:11px;color:#6366f1;margin-bottom:20px}.footer{border-top:1px solid #e2e8f0;padding-top:16px;display:flex;justify-content:space-between}.footer-left,.footer-right{font-size:10px;color:#94a3b8;line-height:1.6}.footer-right{text-align:right}@media print{body{padding:20px}}</style></head><body><div class="header"><div class="logo-row"><span class="logo">${orgName}</span><span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:4px;background:rgba(14,165,233,.1);color:#0ea5e9">GxP Evidence Pack</span></div><h1>${pack.name}</h1><p class="purpose">${pack.purpose}</p></div><div class="meta-grid"><div class="meta-card"><div class="meta-label">Total documents</div><div class="meta-value">${docs.length}</div></div><div class="meta-card"><div class="meta-label">Current / ready</div><div class="meta-value green">${cc}</div></div><div class="meta-card"><div class="meta-label">Missing / gaps</div><div class="meta-value ${mc > 0 ? "red" : "green"}">${mc}</div></div><div class="meta-card"><div class="meta-label">Areas covered</div><div class="meta-value" style="font-size:11px;font-weight:600">${areas}</div></div></div><div class="part11">\uD83D\uDD12 This evidence pack was prepared under 21 CFR Part 11 audit controls. Export event recorded in the immutable audit trail. Prepared by: <strong>${prepBy}</strong> \u00b7 Exported: <strong>${expDate} UTC</strong></div><table><thead><tr><th>Reference</th><th>Document title</th><th>Type</th><th>Area</th><th>Status</th><th>Version</th><th>Effective date</th><th>Compliance tags</th></tr></thead><tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94a3b8;font-style:italic">No documents in this pack</td></tr>'}</tbody></table><div class="footer"><div class="footer-left">Document types: ${types}<br/>Pack ID: ${pack.id}<br/>Generated by ${orgName}</div><div class="footer-right">Exported: ${expDate} UTC<br/>Prepared by: ${prepBy}<br/>For regulatory inspection use only</div></div></body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pack.name.replace(/[^a-zA-Z0-9\-_]/g, "-")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    dispatch(updatePack({ id: pack.id, patch: { exportedAt: dayjs().toISOString() } }));
    auditLog({ action: "EVIDENCE_PACK_EXPORTED", module: "evidence", recordId: pack.id, newValue: { documentCount: docs.length, exportedBy: user?.id, exportedAt: dayjs().toISOString() } });
  }

  const currentCount = allDocs.filter((d) => d.status === "Current").length;
  const missingCount = allDocs.filter((d) => d.status === "Missing").length;
  const anyFilter = !!(search || areaFilter || typeFilter || systemFilter || statusFilter || dateFrom || dateTo);
  function clearFilters() { setSearch(""); setAreaFilter(""); setTypeFilter(""); setSystemFilter(""); setStatusFilter(""); setDateFrom(""); setDateTo(""); }

  const filteredDocs = allDocs.filter((d) => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.reference.toLowerCase().includes(search.toLowerCase())) return false;
    if (areaFilter && d.area !== areaFilter) return false;
    if (typeFilter && d.type !== typeFilter) return false;
    if (systemFilter && d.systemId !== systemFilter) return false;
    if (statusFilter && d.status !== statusFilter) return false;
    if (dateFrom && d.effectiveDate && dayjs(d.effectiveDate).isBefore(dayjs(dateFrom))) return false;
    if (dateTo && d.effectiveDate && dayjs(d.effectiveDate).isAfter(dayjs(dateTo))) return false;
    return true;
  });

  function toggleDocSelection(id: string) { setSelectedDocs((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  /* ── Forms ── */
  const docForm = useForm<DocForm>({ resolver: zodResolver(docSchema), defaultValues: { type: "SOP", area: "QMS", status: "Current", version: "1.0" } });
  const packForm = useForm<PackForm>({ resolver: zodResolver(packSchema) });

  function onDocSave(data: DocForm) {
    const id = crypto.randomUUID();
    const complianceTags: string[] = [];
    if (data.area === "CSV/IT") { complianceTags.push("Part 11", "Annex 11"); }
    if (data.type === "Audit Trail") complianceTags.push("ALCOA+");
    if (data.type === "Validation") complianceTags.push("GAMP 5");
    const tagsList = data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    dispatch(addDocument({ ...data, id, tenantId: tenantId ?? "", complianceTags, tags: tagsList, effectiveDate: dayjs(data.effectiveDate).utc().toISOString(), expiryDate: data.expiryDate ? dayjs(data.expiryDate).utc().toISOString() : undefined, systemId: data.systemId || undefined, findingId: data.findingId || undefined, capaId: data.capaId || undefined, url: data.url || undefined, createdAt: "" }));
    auditLog({ action: "EVIDENCE_DOCUMENT_ADDED", module: "evidence", recordId: id, newValue: data });
    setAddDocOpen(false); setAddedPopup(true); docForm.reset();
  }

  function onPackSave(data: PackForm) {
    const newPack: EvidencePack = { id: crypto.randomUUID(), tenantId: tenantId ?? "", name: data.name, purpose: data.purpose, documentIds: [...selectedDocs], createdBy: user?.id ?? "", createdAt: dayjs().toISOString() };
    dispatch(addPack(newPack));
    auditLog({ action: "EVIDENCE_PACK_CREATED", module: "evidence", recordId: newPack.id, newValue: data });
    setBuildPackOpen(false); setSelectedDocs(new Set()); packForm.reset(); setJustCreatedPack(newPack);
  }

  const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";

  /* ══════════════════════════════════════ */

  return (
    <main id="main-content" aria-label="Evidence and document workspace" className="w-full space-y-5">
      {/* Header */}
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">Evidence &amp; Document Workspace</h1>
          <p className="page-subtitle mt-1">{allDocs.length === 0 ? "No documents yet" : `${allDocs.length} documents \u00b7 ${currentCount} current \u00b7 ${missingCount} missing`}</p>
        </div>
        <div className="flex gap-2">
          {selectedDocs.size > 0 && <Button variant="secondary" icon={Package} onClick={() => setBuildPackOpen(true)}>Build pack ({selectedDocs.size})</Button>}
          {role !== "viewer" && <Button variant="primary" icon={Plus} onClick={() => setAddDocOpen(true)}>Add document</Button>}
        </div>
      </header>

      {/* Tabs */}
      <div role="tablist" aria-label="Evidence sections" className="flex gap-1 border-b border-(--bg-border)">
        {([{ id: "library" as const, label: "Document Library", Icon: FolderOpen }, { id: "builder" as const, label: "Evidence Pack Builder", Icon: Package }, { id: "dil" as const, label: "DIL Status Board", Icon: ClipboardCheck }]).map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={activeTab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setActiveTab(t.id)}
            className={clsx("inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors bg-transparent border-x-0 border-t-0 cursor-pointer outline-none", activeTab === t.id ? "border-b-(--brand) text-(--brand)" : "border-b-transparent text-(--text-muted) hover:text-(--text-secondary)")}>
            <t.Icon className="w-3.5 h-3.5" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" id="panel-library" aria-labelledby="tab-library" tabIndex={0} hidden={activeTab !== "library"}>
        <DocumentLibraryTab allDocs={allDocs} filteredDocs={filteredDocs} search={search} setSearch={setSearch} areaFilter={areaFilter} setAreaFilter={setAreaFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} systemFilter={systemFilter} setSystemFilter={setSystemFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} anyFilter={anyFilter} clearFilters={clearFilters} viewMode={viewMode} setViewMode={setViewMode} selectedDocs={selectedDocs} toggleDocSelection={toggleDocSelection} setSelectedDocs={setSelectedDocs} systems={systems} isDark={isDark} role={role} timezone={timezone} dateFormat={dateFormat} onAddDocOpen={() => setAddDocOpen(true)} onNavigate={navigate} />
      </div>

      <div role="tabpanel" id="panel-builder" aria-labelledby="tab-builder" tabIndex={0} hidden={activeTab !== "builder"}>
        <PackBuilderTab allDocs={allDocs} packs={evidence.packs} selectedDocs={selectedDocs} toggleDocSelection={toggleDocSelection} isDark={isDark} onBuildPackOpen={() => setBuildPackOpen(true)} onPreviewPack={setPreviewPack} onExportPack={exportPack} onSwitchToLibrary={() => setActiveTab("library")} />
      </div>

      <div role="tabpanel" id="panel-dil" aria-labelledby="tab-dil" tabIndex={0} hidden={activeTab !== "dil"}>
        <DILStatusTab allDocs={allDocs} currentCount={currentCount} missingCount={missingCount} findings={findings} isDark={isDark} />
      </div>

      {/* Add Document Modal */}
      <Modal open={addDocOpen} onClose={() => setAddDocOpen(false)} title="Add document">
        <form onSubmit={docForm.handleSubmit(onDocSave)} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label htmlFor="doc-title" className={lbl} style={{ color: "var(--text-muted)" }}>Document title *</label><input id="doc-title" className="input text-[12px]" placeholder="e.g. SOP-QC-042 OOS Investigation Procedure" {...docForm.register("title")} />{docForm.formState.errors.title && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{docForm.formState.errors.title.message}</p>}</div>
            <div><label htmlFor="doc-ref" className={lbl} style={{ color: "var(--text-muted)" }}>Reference *</label><input id="doc-ref" className="input text-[12px]" placeholder="e.g. SOP-QC-042-v3" {...docForm.register("reference")} /></div>
            <div><label htmlFor="doc-ver" className={lbl} style={{ color: "var(--text-muted)" }}>Version *</label><input id="doc-ver" className="input text-[12px]" placeholder="e.g. 3.0" {...docForm.register("version")} /></div>
            <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Type *</label><Controller name="type" control={docForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={DOC_TYPES.map((t) => ({ value: t, label: t }))} />} /></div>
            <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Area *</label><Controller name="area" control={docForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={DOC_AREAS.map((a) => ({ value: a, label: a }))} />} /></div>
            <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Status *</label><Controller name="status" control={docForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={DOC_STATUSES.map((s) => ({ value: s, label: s }))} />} /></div>
            <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Author *</label><Controller name="author" control={docForm.control} render={({ field }) => <Dropdown value={field.value} onChange={field.onChange} placeholder="Select author" width="w-full" options={users.filter((u) => u.status === "Active").map((u) => ({ value: u.id, label: u.name }))} />} /></div>
            <div><label htmlFor="doc-eff" className={lbl} style={{ color: "var(--text-muted)" }}>Effective date *</label><input id="doc-eff" type="date" className="input text-[12px]" {...docForm.register("effectiveDate")} /></div>
            <div><label htmlFor="doc-exp" className={lbl} style={{ color: "var(--text-muted)" }}>Expiry date</label><input id="doc-exp" type="date" className="input text-[12px]" {...docForm.register("expiryDate")} /></div>
            <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Linked system</label><Controller name="systemId" control={docForm.control} render={({ field }) => <Dropdown value={field.value ?? ""} onChange={field.onChange} placeholder="Select system" width="w-full" options={[{ value: "", label: "None" }, ...systems.map((s) => ({ value: s.id, label: s.name }))]} />} /></div>
            <div><label htmlFor="doc-find" className={lbl} style={{ color: "var(--text-muted)" }}>Linked finding</label><input id="doc-find" className="input text-[12px]" placeholder="e.g. FIND-001" {...docForm.register("findingId")} /></div>
            <div><label htmlFor="doc-capa" className={lbl} style={{ color: "var(--text-muted)" }}>Linked CAPA</label><input id="doc-capa" className="input text-[12px]" placeholder="e.g. CAPA-0042" {...docForm.register("capaId")} /></div>
            <div className="col-span-2"><label htmlFor="doc-url" className={lbl} style={{ color: "var(--text-muted)" }}>Document URL</label><input id="doc-url" className="input text-[12px]" placeholder="https://docs.company.com/..." {...docForm.register("url")} /></div>
            <div className="col-span-2"><label htmlFor="doc-tags" className={lbl} style={{ color: "var(--text-muted)" }}>Tags (comma separated)</label><input id="doc-tags" className="input text-[12px]" placeholder="e.g. Part 11, LIMS, Audit Trail" {...docForm.register("tags")} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={() => setAddDocOpen(false)}>Cancel</Button><Button variant="primary" type="submit" loading={docForm.formState.isSubmitting}>Add document</Button></div>
        </form>
      </Modal>

      {/* Build Pack Modal */}
      <Modal open={buildPackOpen} onClose={() => setBuildPackOpen(false)} title="Build evidence pack">
        <form onSubmit={packForm.handleSubmit(onPackSave)} noValidate className="space-y-4">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{selectedDocs.size} document{selectedDocs.size !== 1 ? "s" : ""} selected for this pack.</p>
          <div><label htmlFor="pack-name" className={lbl} style={{ color: "var(--text-muted)" }}>Pack name *</label><input id="pack-name" className="input text-[12px]" placeholder="e.g. FDA 483 Response — Mumbai Site" {...packForm.register("name")} />{packForm.formState.errors.name && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{packForm.formState.errors.name.message}</p>}</div>
          <div><label htmlFor="pack-purpose" className={lbl} style={{ color: "var(--text-muted)" }}>Purpose *</label><textarea id="pack-purpose" rows={3} className="input text-[12px] resize-none" placeholder="Describe the purpose of this evidence pack..." {...packForm.register("purpose")} />{packForm.formState.errors.purpose && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{packForm.formState.errors.purpose.message}</p>}</div>
          <div className="flex justify-end gap-2 pt-2"><Button variant="ghost" type="button" onClick={() => setBuildPackOpen(false)}>Cancel</Button><Button variant="primary" type="submit" icon={Package} loading={packForm.formState.isSubmitting}>Create pack</Button></div>
        </form>
      </Modal>

      {/* Popups */}
      <Popup isOpen={addedPopup} variant="success" title="Document added" description="Added to the evidence library. Select it to include in an evidence pack." onDismiss={() => setAddedPopup(false)} />
      <Popup isOpen={packSavedPopup} variant="success" title="Evidence pack created" description="Pack created with selected documents. View it in the Evidence Pack Builder tab." onDismiss={() => setPackSavedPopup(false)} />
      <Popup isOpen={justCreatedPack !== null} variant="success" title="Evidence pack created" description={`${justCreatedPack?.documentIds.length ?? 0} documents saved. Export now to download the HTML report.`} onDismiss={() => setJustCreatedPack(null)} actions={[{ label: "Export now", style: "primary", onClick: () => { if (justCreatedPack) exportPack(justCreatedPack); setJustCreatedPack(null); } }, { label: "Later", style: "ghost", onClick: () => setJustCreatedPack(null) }]} />

      {/* Floating selection bar */}
      {selectedDocs.size > 0 && (
        <div className={clsx("fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-lg", isDark ? "bg-[#0a1f38] border border-[#1e3a5a]" : "bg-white border border-[#e2e8f0]")} style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }} role="status" aria-live="polite">
          <Package className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" />
          <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{selectedDocs.size} document{selectedDocs.size !== 1 ? "s" : ""} selected</span>
          <Button variant="primary" size="sm" icon={Package} onClick={() => { setActiveTab("builder"); setBuildPackOpen(true); }}>Build evidence pack</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedDocs(new Set())}>Clear</Button>
        </div>
      )}

      {/* Pack preview modal */}
      <Modal open={previewPack !== null} onClose={() => setPreviewPack(null)} title={previewPack?.name ?? "Pack preview"}>
        {previewPack && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4 text-[12px]">
              {([["Purpose", previewPack.purpose], ["Documents", String(previewPack.documentIds.length)], ["Created by", users.find((u) => u.id === previewPack.createdBy)?.name ?? previewPack.createdBy], ["Exported", previewPack.exportedAt ? "Yes" : "Not yet"]] as const).map(([l, v]) => (
                <div key={l}><span className="text-[10px] uppercase tracking-wider font-semibold block mb-0.5" style={{ color: "var(--text-muted)" }}>{l}</span><span style={{ color: "var(--text-primary)" }}>{v}</span></div>
              ))}
            </div>
            <h3 className="text-[12px] font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Documents</h3>
            <div className="space-y-0 max-h-[300px] overflow-y-auto">
              {previewPack.documentIds.map((id) => { const doc = allDocs.find((d) => d.id === id); if (!doc) return null; return (
                <div key={id} className="flex items-center justify-between py-2 border-b last:border-0" style={{ borderColor: isDark ? "#0f2039" : "#f1f5f9" }}>
                  <div><p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>{doc.title}</p><p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{doc.reference} &middot; v{doc.version}</p></div>
                  {docStatusBadge(doc.status)}
                </div>
              ); })}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" type="button" onClick={() => setPreviewPack(null)}>Close</Button>
              <Button variant="primary" icon={Download} loading={exporting} onClick={() => { setExporting(true); setTimeout(() => { exportPack(previewPack); setExporting(false); setPreviewPack(null); }, 300); }}>Export pack</Button>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}
