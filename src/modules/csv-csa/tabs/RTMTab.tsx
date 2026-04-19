import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import clsx from "clsx";
import {
  CheckCircle2, AlertTriangle, X, ChevronRight, Search, Download,
  Plus, FileText, SkipForward, Clock,
} from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { addRTMEntry, type RTMEntry, type TraceabilityStatus, type TestResult } from "@/store/rtm.slice";
import { auditLog } from "@/lib/audit";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Popup } from "@/components/ui/Popup";
import { StatCard } from "@/components/shared";

/* ── Helpers ── */
const TR_VARIANT: Record<TraceabilityStatus, "green" | "amber" | "red"> = { complete: "green", partial: "amber", broken: "red" };
const TR_LABEL: Record<TraceabilityStatus, string> = { complete: "Complete", partial: "Partial", broken: "Broken" };
const TEST_BADGE: Record<string, { variant: "green" | "amber" | "red" | "gray"; label: string }> = {
  pass: { variant: "green", label: "Pass" },
  fail: { variant: "red", label: "Fail" },
  pending: { variant: "amber", label: "Pending" },
  na: { variant: "gray", label: "N/A" },
};

function testBadge(r?: TestResult) {
  if (!r) return <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>\u2014</span>;
  const cfg = TEST_BADGE[r] ?? TEST_BADGE.pending;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function linkBadge(status: string, ref?: string) {
  if (status === "linked" && ref) return <span className="text-[10px] font-mono text-[#10b981]" title={ref}>{ref} \u2713</span>;
  if (status === "skipped") return <span className="text-[10px]" style={{ color: "#94a3b8" }}>\u23ED Skip</span>;
  if (status === "na") return <span className="text-[10px]" style={{ color: "#94a3b8" }}>N/A</span>;
  return <span className="text-[10px] text-[#ef4444]">\u2717 Missing</span>;
}

function borderColor(s: TraceabilityStatus): string {
  if (s === "complete") return "#10b981";
  if (s === "partial") return "#f59e0b";
  return "#ef4444";
}

/* ── Component ── */

export interface RTMTabProps {
  isDark: boolean;
}

export function RTMTab({ isDark }: RTMTabProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const entries = useAppSelector((s) => s.rtm.items);
  const { isQAHead } = usePermissions();
  const { tenantId } = useTenantConfig();
  const systems = useAppSelector((s) => s.systems.items).filter((s) => s.tenantId === tenantId);
  const canEdit = isQAHead || usePermissions().role === "csv_val_lead";

  const tenantEntries = entries.filter((e) => e.tenantId === tenantId);

  const [selectedSystem, setSelectedSystem] = useState(systems[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<RTMEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [successPopup, setSuccessPopup] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const sysEntries = useMemo(() => {
    let r = tenantEntries.filter((e) => !selectedSystem || e.systemId === selectedSystem);
    if (searchQuery) { const q = searchQuery.toLowerCase(); r = r.filter((e) => e.ursRequirement.toLowerCase().includes(q) || e.ursId.toLowerCase().includes(q) || e.ursRegulation.toLowerCase().includes(q)); }
    if (statusFilter) r = r.filter((e) => e.traceabilityStatus === statusFilter);
    return r;
  }, [tenantEntries, selectedSystem, searchQuery, statusFilter]);

  const completeCount = sysEntries.filter((e) => e.traceabilityStatus === "complete").length;
  const partialCount = sysEntries.filter((e) => e.traceabilityStatus === "partial").length;
  const brokenCount = sysEntries.filter((e) => e.traceabilityStatus === "broken").length;
  const coveragePct = sysEntries.length > 0 ? Math.round((completeCount / sysEntries.length) * 100) : 0;

  // Add form state
  const [formUrsId, setFormUrsId] = useState("");
  const [formReq, setFormReq] = useState("");
  const [formReg, setFormReg] = useState("");
  const [formPriority, setFormPriority] = useState<"critical" | "high" | "medium">("high");

  function handleAdd() {
    if (!formUrsId.trim() || !formReq.trim() || !formReg.trim()) return;
    const id = `RTM-${String(tenantEntries.length + 1).padStart(3, "0")}`;
    const sys = systems.find((s) => s.id === selectedSystem);
    const entry: RTMEntry = {
      id, tenantId: tenantId ?? "", systemId: selectedSystem,
      systemName: sys?.name ?? selectedSystem,
      ursId: formUrsId, ursRequirement: formReq, ursRegulation: formReg, ursPriority: formPriority,
      fsStatus: "missing", dsStatus: "missing",
      evidenceStatus: "missing", traceabilityStatus: "broken",
    };
    dispatch(addRTMEntry(entry));
    auditLog({ action: "RTM_ENTRY_ADDED", module: "CSV/CSA", recordId: id, recordTitle: formReq.slice(0, 50) });
    setAddOpen(false);
    setFormUrsId(""); setFormReq(""); setFormReg("");
    setSuccessMsg(`${id} added to RTM`);
    setSuccessPopup(true);
  }

  function exportCSV() {
    const header = "ID,URS,Requirement,Regulation,Priority,FS,DS,IQ,OQ,PQ,Evidence,Status";
    const rows = sysEntries.map((e) =>
      [e.id, e.ursId, `"${e.ursRequirement}"`, e.ursRegulation, e.ursPriority,
        e.fsStatus, e.dsStatus, e.iqResult ?? "—", e.oqResult ?? "—", e.pqResult ?? "—",
        e.evidenceStatus, e.traceabilityStatus].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `RTM-${dayjs().format("YYYY-MM-DD")}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label="Requirement Traceability Matrix" className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>Requirement Traceability Matrix</p>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Full validation lifecycle traceability for all GxP-critical systems</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Download} onClick={exportCSV}>Export RTM</Button>
          {canEdit && <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddOpen(true)}>Add Requirement</Button>}
        </div>
      </div>

      {/* System selector + KPIs */}
      <div className="flex items-center gap-3 flex-wrap">
        <Dropdown value={selectedSystem} onChange={setSelectedSystem} placeholder="Select system..." width="w-64" options={systems.map((s) => ({ value: s.id, label: s.name }))} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={FileText} color="#0ea5e9" label="Total requirements" value={String(sysEntries.length)} sub={`${coveragePct}% coverage`} />
        <StatCard icon={CheckCircle2} color="#10b981" label="Complete" value={String(completeCount)} sub="Full traceability" />
        <StatCard icon={Clock} color="#f59e0b" label="Partial" value={String(partialCount)} sub="Some links missing" />
        <StatCard icon={AlertTriangle} color={brokenCount > 0 ? "#ef4444" : "#10b981"} label="Broken" value={String(brokenCount)} sub={brokenCount > 0 ? "Immediate attention" : "No broken links"} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <input type="text" className="input pl-9 w-full text-[12px]" placeholder="Search requirements..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <Dropdown placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} width="w-40" options={[{ value: "", label: "All statuses" }, { value: "complete", label: "Complete" }, { value: "partial", label: "Partial" }, { value: "broken", label: "Broken" }]} />
        {(searchQuery || statusFilter) && <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearchQuery(""); setStatusFilter(""); }}>Clear</Button>}
      </div>

      {/* Main grid */}
      <div className={clsx("grid gap-4", selected ? "grid-cols-1 lg:grid-cols-[1fr_380px]" : "grid-cols-1")}>
        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table" style={{ minWidth: 900 }} aria-label="RTM entries">
              <caption className="sr-only">Requirement traceability matrix showing validation lifecycle</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: 200 }}>URS Requirement</th>
                  <th scope="col">Regulation</th>
                  <th scope="col">FS</th>
                  <th scope="col">DS</th>
                  <th scope="col">IQ</th>
                  <th scope="col">OQ</th>
                  <th scope="col">PQ</th>
                  <th scope="col">Evidence</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {sysEntries.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8"><FileText className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" /><p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{systems.length === 0 ? "Add a system first" : "No RTM entries for this system"}</p></td></tr>
                ) : sysEntries.map((e) => (
                  <tr key={e.id} className={clsx("cursor-pointer", selected?.id === e.id && (isDark ? "bg-[#0d2a4a]" : "bg-[#f0f7ff]"))} onClick={() => setSelected(e)} style={{ borderLeft: `3px solid ${borderColor(e.traceabilityStatus)}` }}>
                    <td>
                      <p className="text-[11px] font-mono" style={{ color: "var(--brand)" }}>{e.ursId}</p>
                      <p className="text-[11px] line-clamp-2" style={{ color: "var(--text-primary)", maxWidth: 200 }}>{e.ursRequirement}</p>
                    </td>
                    <td className="text-[10px] font-mono" style={{ color: "var(--text-secondary)" }}>{e.ursRegulation}</td>
                    <td>{linkBadge(e.fsStatus, e.fsReference)}</td>
                    <td>{linkBadge(e.dsStatus, e.dsReference)}</td>
                    <td>{e.iqTestId ? <span className="text-[10px] font-mono text-[#10b981]">{e.iqTestId}</span> : null} {testBadge(e.iqResult)}</td>
                    <td>{e.oqTestId ? <span className="text-[10px] font-mono text-[#10b981]">{e.oqTestId}</span> : null} {testBadge(e.oqResult)}</td>
                    <td>{e.pqTestId ? <span className="text-[10px] font-mono text-[#10b981]">{e.pqTestId}</span> : null} {testBadge(e.pqResult)}</td>
                    <td><Badge variant={e.evidenceStatus === "complete" ? "green" : e.evidenceStatus === "partial" ? "amber" : "red"}>{e.evidenceStatus.charAt(0).toUpperCase() + e.evidenceStatus.slice(1)}</Badge></td>
                    <td><Badge variant={TR_VARIANT[e.traceabilityStatus]}>{TR_LABEL[e.traceabilityStatus]}</Badge></td>
                    <td><ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <aside className="card p-4 space-y-4 h-fit max-h-[calc(100vh-200px)] overflow-y-auto" aria-label={`RTM ${selected.ursId} details`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[12px] font-semibold" style={{ color: "var(--brand)" }}>{selected.id} — {selected.ursId}</p>
                <Badge variant={TR_VARIANT[selected.traceabilityStatus]}>{TR_LABEL[selected.traceabilityStatus]}</Badge>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-1 cursor-pointer border-none bg-transparent" style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>URS Requirement</p>
              <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>{selected.ursRequirement}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="gray">{selected.ursRegulation}</Badge>
                <Badge variant={selected.ursPriority === "critical" ? "red" : selected.ursPriority === "high" ? "amber" : "blue"}>{selected.ursPriority.charAt(0).toUpperCase() + selected.ursPriority.slice(1)}</Badge>
              </div>
            </div>

            {/* Traceability chain */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Traceability chain</p>
              <div className="space-y-0">
                {[
                  { label: selected.ursId, desc: "URS Requirement", ok: true, detail: selected.ursRequirement.slice(0, 60) + "..." },
                  { label: selected.fsReference ?? "FS", desc: "Functional Spec", ok: selected.fsStatus === "linked", detail: selected.fsDescription, skip: false, missing: selected.fsStatus === "missing" },
                  { label: selected.dsReference ?? "DS", desc: "Design Spec", ok: selected.dsStatus === "linked", detail: selected.dsDescription, skip: selected.dsStatus === "skipped" || selected.dsStatus === "na", missing: selected.dsStatus === "missing" },
                  { label: selected.iqTestId ?? "IQ", desc: `IQ Test${selected.iqResult ? ` — ${selected.iqResult.toUpperCase()}` : ""}`, ok: selected.iqResult === "pass", detail: selected.iqTestDescription, doc: selected.iqDocument, pending: selected.iqResult === "pending", missing: !selected.iqTestId && selected.iqResult !== "na" },
                  { label: selected.oqTestId ?? "OQ", desc: `OQ Test${selected.oqResult ? ` — ${selected.oqResult.toUpperCase()}` : ""}`, ok: selected.oqResult === "pass", detail: selected.oqTestDescription, doc: selected.oqDocument, pending: selected.oqResult === "pending", missing: !selected.oqTestId && selected.oqResult !== "na" },
                  { label: selected.pqTestId ?? "PQ", desc: `PQ Test${selected.pqResult ? ` — ${selected.pqResult.toUpperCase()}` : ""}`, ok: selected.pqResult === "pass", detail: selected.pqTestDescription, doc: selected.pqDocument, pending: selected.pqResult === "pending", missing: !selected.pqTestId && selected.pqResult !== "na" },
                  { label: "Evidence", desc: selected.evidenceStatus.charAt(0).toUpperCase() + selected.evidenceStatus.slice(1), ok: selected.evidenceStatus === "complete", pending: selected.evidenceStatus === "partial", missing: selected.evidenceStatus === "missing" },
                ].map((step, i, arr) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: step.skip ? "#94a3b818" : step.ok ? "#10b98118" : step.pending ? "#f59e0b18" : step.missing ? "#ef444418" : "#64748b18", color: step.skip ? "#94a3b8" : step.ok ? "#10b981" : step.pending ? "#f59e0b" : step.missing ? "#ef4444" : "#64748b" }}>
                        {step.skip ? <SkipForward className="w-3 h-3" /> : step.ok ? <CheckCircle2 className="w-3 h-3" /> : step.pending ? <Clock className="w-3 h-3" /> : step.missing ? <AlertTriangle className="w-3 h-3" /> : <span>\u25CB</span>}
                      </div>
                      {i < arr.length - 1 && <div className="w-0.5 flex-1 min-h-3" style={{ background: isDark ? "#1e3a5a" : "#e2e8f0" }} />}
                    </div>
                    <div className="pb-3 flex-1 min-w-0">
                      <p className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{step.label}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{step.desc}</p>
                      {step.detail && <p className="text-[10px] line-clamp-2" style={{ color: "var(--text-muted)" }}>{step.detail}</p>}
                      {step.doc && <p className="text-[10px] flex items-center gap-1" style={{ color: "var(--brand)" }}><FileText className="w-3 h-3" aria-hidden="true" />{step.doc}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gaps */}
            {selected.traceabilityStatus !== "complete" && (
              <div className={clsx("rounded-lg p-2.5", isDark ? "bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.2)]" : "bg-[#fef2f2] border border-[#fecaca]")}>
                <p className="text-[11px] font-semibold text-[#ef4444] mb-1">Gaps identified</p>
                <ul className="list-none p-0 m-0 space-y-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  {selected.pqResult === "pending" && <li>PQ test pending</li>}
                  {selected.oqResult === "pending" && !selected.oqTestId && <li>OQ test missing</li>}
                  {selected.evidenceStatus !== "complete" && <li>Evidence {selected.evidenceStatus}</li>}
                  {selected.fsStatus === "missing" && <li>Functional spec missing</li>}
                  {selected.dsStatus === "missing" && <li>Design spec missing</li>}
                </ul>
              </div>
            )}

            {/* Linked */}
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <p style={{ color: "var(--text-muted)" }}>Finding</p>
                {selected.linkedFindingId ? <button type="button" onClick={() => navigate("/gap-assessment", { state: { openFindingId: selected.linkedFindingId } })} className="font-mono text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0">{selected.linkedFindingId}</button> : <p style={{ color: "var(--text-muted)" }}>\u2014</p>}
              </div>
              <div>
                <p style={{ color: "var(--text-muted)" }}>CAPA</p>
                {selected.linkedCAPAId ? <button type="button" onClick={() => navigate("/capa", { state: { openCapaId: selected.linkedCAPAId } })} className="font-mono text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0">{selected.linkedCAPAId}</button> : <p style={{ color: "var(--text-muted)" }}>\u2014</p>}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Requirement to RTM">
        <div className="space-y-3">
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>URS ID *</p><input className="input w-full" value={formUrsId} onChange={(e) => setFormUrsId(e.target.value)} placeholder="URS-007" /></div>
          <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Requirement *</p><textarea rows={3} className="input w-full resize-none" value={formReq} onChange={(e) => setFormReq(e.target.value)} placeholder="System shall..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Regulation *</p><input className="input w-full" value={formReg} onChange={(e) => setFormReg(e.target.value)} placeholder="21 CFR 11.10(e)" /></div>
            <div><p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Priority *</p><Dropdown value={formPriority} onChange={(v) => setFormPriority(v as "critical" | "high" | "medium")} options={[{ value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }]} width="w-full" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: isDark ? "#1e3a5a" : "#e2e8f0" }}>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" icon={Plus} disabled={!formUrsId.trim() || !formReq.trim() || !formReg.trim()} onClick={handleAdd}>Add to RTM</Button>
          </div>
        </div>
      </Modal>

      <Popup isOpen={successPopup} variant="success" title="RTM updated" description={successMsg} onDismiss={() => setSuccessPopup(false)} />
    </section>
  );
}
