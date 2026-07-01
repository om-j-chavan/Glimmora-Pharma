"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, Circle, Save, Plus } from "lucide-react";
import type { RTMEntry, TraceabilityStatus, TestResult } from "@/types/csv-csa";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { Dropdown } from "@/components/ui/Dropdown";
import { updateRTMEntry, createRTMEntry } from "@/actions/rtm";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type Column } from "@/components/shared";

const TR_VARIANT: Record<TraceabilityStatus, "green" | "amber" | "red"> = { complete: "green", partial: "amber", broken: "red" };
const TR_LABEL: Record<TraceabilityStatus, string> = { complete: "Traced", partial: "Partial", broken: "Broken" };
const RESULT_OPTS = [
  { value: "pending", label: "Pending" },
  { value: "pass", label: "PASS" },
  { value: "fail", label: "FAIL" },
  { value: "na", label: "N/A" },
];

function truncate(s: string, n: number) { return s.length > n ? `${s.slice(0, n)}…` : s; }

export interface SystemRTMTabProps {
  systemId: string;
  entries: RTMEntry[];
  canEdit: boolean;
  onError: (msg: string) => void;
}

export function SystemRTMTab({ systemId, entries, canEdit, onError }: SystemRTMTabProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const total = entries.length;
  const traced = entries.filter((e) => e.traceabilityStatus === "complete").length;
  const partial = entries.filter((e) => e.traceabilityStatus === "partial").length;
  const broken = entries.filter((e) => e.traceabilityStatus === "broken").length;
  const coverage = total > 0 ? Math.round((traced / total) * 100) : 0;

  const filtered = entries.filter((e) =>
    (!statusFilter || e.traceabilityStatus === statusFilter) &&
    (!priorityFilter || e.ursPriority === priorityFilter));
  const selected = selectedId ? entries.find((e) => e.id === selectedId) ?? null : null;

  const RTM_HEADERS = ["URS ID", "Requirement", "Priority", "FS", "DS", "IQ", "OQ", "PQ", "Evidence", "Traceability"];
  function buildRtmRows() {
    return entries.map((e) => [e.ursId, e.ursRequirement, e.ursPriority, e.fsReference ?? "", e.dsReference ?? "", e.iqResult ?? "", e.oqResult ?? "", e.pqResult ?? "", e.evidenceStatus, e.traceabilityStatus]);
  }

  return (
    <div className="space-y-3">
      {/* Stat tiles */}
      <div className="grid grid-cols-4 gap-2">
        {[["Total", total, "var(--text-primary)"], ["Traced", traced, "#10b981"], ["Partial", partial, "#f59e0b"], ["Broken", broken, "#ef4444"]].map(([l, v, c]) => (
          <div key={l as string} className="card"><div className="card-body py-2 text-center"><p className="text-[18px] font-bold" style={{ color: c as string }}>{v as number}</p><p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{l as string}</p></div></div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Dropdown value={statusFilter} onChange={setStatusFilter} width="w-36" options={[{ value: "", label: "All status" }, { value: "complete", label: "Traced" }, { value: "partial", label: "Partial" }, { value: "broken", label: "Broken" }]} />
        <Dropdown value={priorityFilter} onChange={setPriorityFilter} width="w-36" options={[{ value: "", label: "All priority" }, { value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }]} />
        <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>Coverage: <strong style={{ color: "var(--text-primary)" }}>{coverage}%</strong></span>
        <ExportMenu
          filename={`RTM-${systemId.slice(0, 8)}`}
          title="Requirement Traceability Matrix"
          subtitle={`${entries.length} requirements`}
          headers={RTM_HEADERS}
          rows={buildRtmRows}
          variant="ghost"
          disabled={entries.length === 0}
        />
        {canEdit && <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAddOpen(true)}>Add</Button>}
      </div>
      <div className="card overflow-hidden">
        <DataTable
          ariaLabel="Requirements traceability"
          data={filtered}
          rowKey={(e) => e.id}
          onRowClick={(e) => setSelectedId(e.id)}
          emptyState={
            <p className="text-center py-6 text-[12px]" style={{ color: "var(--text-muted)" }}>No requirements{total > 0 ? " match filters" : " captured yet"}.</p>
          }
          columns={[
            {
              key: "ursId",
              header: "URS ID",
              cellClassName: "font-mono text-[11px]",
              render: (e) => <span style={{ color: "var(--brand)" }}>{e.reference ?? e.ursId}</span>,
            },
            {
              key: "requirement",
              header: "Requirement",
              cellClassName: "text-[12px]",
              render: (e) => <span style={{ color: "var(--text-primary)" }} title={e.ursRequirement}>{truncate(e.ursRequirement, 60)}</span>,
            },
            {
              key: "priority",
              header: "Priority",
              render: (e) => <Badge variant={e.ursPriority === "critical" ? "red" : e.ursPriority === "high" ? "amber" : "blue"}>{e.ursPriority}</Badge>,
            },
            {
              key: "coverage",
              header: "Coverage",
              render: (e) => (
                <span className="inline-flex items-center gap-1.5">
                  {e.traceabilityStatus === "complete" ? <CheckCircle2 className="w-3.5 h-3.5 text-[#10b981]" /> : e.traceabilityStatus === "partial" ? <AlertTriangle className="w-3.5 h-3.5 text-[#f59e0b]" /> : <Circle className="w-3.5 h-3.5 text-[#ef4444]" />}
                  <Badge variant={TR_VARIANT[e.traceabilityStatus]}>{TR_LABEL[e.traceabilityStatus]}</Badge>
                  <span className="text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>
                    FS{e.fsReference ? "✓" : "○"} IQ{e.iqResult === "pass" ? "✓" : "○"} OQ{e.oqResult === "pass" ? "✓" : "○"} PQ{e.pqResult === "pass" ? "✓" : "○"}
                  </span>
                </span>
              ),
            },
          ] satisfies Column<RTMEntry>[]}
        />
      </div>

      {selected && (
        <RTMDetailModal key={selected.id} entry={selected} canEdit={canEdit} onClose={() => setSelectedId(null)} onError={onError} onSaved={() => router.refresh()} router={router} />
      )}

      {addOpen && <AddRequirementModal systemId={systemId} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); router.refresh(); }} onError={onError} />}
    </div>
  );
}

/* ── Editable detail modal (replaces the former slide-in side panel) ── */
function RTMDetailModal({ entry, canEdit, onClose, onError, onSaved, router }: {
  entry: RTMEntry; canEdit: boolean; onClose: () => void; onError: (m: string) => void; onSaved: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [fs, setFs] = useState(entry.fsReference ?? "");
  const [ds, setDs] = useState(entry.dsReference ?? "");
  const [iqId, setIqId] = useState(entry.iqTestId ?? "");
  const [iqR, setIqR] = useState<string>(entry.iqResult ?? "pending");
  const [oqId, setOqId] = useState(entry.oqTestId ?? "");
  const [oqR, setOqR] = useState<string>(entry.oqResult ?? "pending");
  const [pqId, setPqId] = useState(entry.pqTestId ?? "");
  const [pqR, setPqR] = useState<string>(entry.pqResult ?? "pending");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [req, setReq] = useState(entry.ursRequirement);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (req.trim().length < 10) { onError("Requirement must be at least 10 characters."); return; }
    setBusy(true);
    const result = await updateRTMEntry(entry.id, {
      ursRequirement: req.trim(),
      fsReference: fs, dsReference: ds,
      iqTestId: iqId, iqResult: iqR as TestResult,
      oqTestId: oqId, oqResult: oqR as TestResult,
      pqTestId: pqId, pqResult: pqR as TestResult,
      notes,
    });
    setBusy(false);
    if (!result.success) { onError(result.error || "Failed to save requirement."); return; }
    onClose();
    onSaved();
  }

  const lbl = "text-[10px] uppercase tracking-wider font-semibold block mb-0.5";
  const priorityVariant = entry.ursPriority === "critical" ? "red" : entry.ursPriority === "high" ? "amber" : "blue";

  const footer = canEdit ? (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      <Button variant="primary" size="sm" icon={Save} loading={busy} disabled={busy} onClick={save}>Save Changes</Button>
    </div>
  ) : undefined;

  return (
    <Modal open onClose={onClose} title={entry.reference ?? entry.ursId} footer={footer}>
      <div className="space-y-3">
        {/* Reference (read-only) + author tag + priority + regulation */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "var(--text-muted)" }}>
          {entry.reference && <span className="font-mono font-semibold" style={{ color: "var(--brand)" }}>{entry.reference}</span>}
          <span>Tag: {entry.ursId}</span>
          <Badge variant={priorityVariant}>{entry.ursPriority}</Badge>
          {entry.ursRegulation && <span>{entry.ursRegulation}</span>}
        </div>

        {/* Requirement text — editable (RUNG 2.8) */}
        <div>
          <label className={lbl} style={{ color: "var(--text-muted)" }}>Requirement</label>
          <textarea rows={3} className="input text-[12px] resize-none w-full" disabled={!canEdit} value={req} onChange={(e) => setReq(e.target.value)} placeholder="Describe the user requirement (min 10 characters)…" />
        </div>

        <div><label className={lbl} style={{ color: "var(--text-muted)" }}>FS reference</label><input className="input text-[11px]" disabled={!canEdit} value={fs} onChange={(e) => setFs(e.target.value)} placeholder="FS-..." /></div>
        <div><label className={lbl} style={{ color: "var(--text-muted)" }}>DS reference</label><input className="input text-[11px]" disabled={!canEdit} value={ds} onChange={(e) => setDs(e.target.value)} placeholder="DS-..." /></div>

        {([["IQ", iqId, setIqId, iqR, setIqR], ["OQ", oqId, setOqId, oqR, setOqR], ["PQ", pqId, setPqId, pqR, setPqR]] as const).map(([label, id, setId, res, setRes]) => (
          <div key={label} className="grid grid-cols-2 gap-2">
            <div><label className={lbl} style={{ color: "var(--text-muted)" }}>{label} test ID</label><input className="input text-[11px]" disabled={!canEdit} value={id} onChange={(e) => (setId as (v: string) => void)(e.target.value)} /></div>
            <div><label className={lbl} style={{ color: "var(--text-muted)" }}>{label} result</label><Dropdown value={res} onChange={setRes as (v: string) => void} width="w-full" options={RESULT_OPTS} /></div>
          </div>
        ))}

        <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Notes</label><textarea rows={2} className="input text-[11px] resize-none w-full" disabled={!canEdit} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        {/* Coverage status (read-only, auto-derived on save) */}
        <div>
          <label className={lbl} style={{ color: "var(--text-muted)" }}>Coverage status</label>
          <div className="flex items-center gap-2">
            <Badge variant={TR_VARIANT[entry.traceabilityStatus]}>{TR_LABEL[entry.traceabilityStatus]}</Badge>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Auto-derived from FS/IQ/OQ/PQ on save (Evidence: {entry.evidenceStatus})</span>
          </div>
        </div>

        {/* Linked finding / CAPA (read-only deep links) */}
        {(entry.findingRef || entry.capaRef) && (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div><span className={lbl} style={{ color: "var(--text-muted)" }}>Finding</span>{entry.findingRef ? <button type="button" onClick={() => router.push("/gap-assessment")} className="font-mono text-[#0ea5e9] hover:underline border-none bg-transparent p-0 cursor-pointer">{entry.findingRef.reference ?? entry.findingRef.id.slice(0, 8)}</button> : "—"}</div>
            <div><span className={lbl} style={{ color: "var(--text-muted)" }}>CAPA</span>{entry.capaRef ? <button type="button" onClick={() => router.push(`/capa/${entry.capaRef!.id}`)} className="font-mono text-[#0ea5e9] hover:underline border-none bg-transparent p-0 cursor-pointer">{entry.capaRef.reference ?? entry.capaRef.id.slice(0, 8)}</button> : "—"}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Add Requirement modal (per-system) ── */
function AddRequirementModal({ systemId, onClose, onSaved, onError }: { systemId: string; onClose: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [ursId, setUrsId] = useState("");
  const [req, setReq] = useState("");
  const [reg, setReg] = useState("");
  const [priority, setPriority] = useState<"critical" | "high" | "medium">("high");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!ursId.trim() || req.trim().length < 10 || !reg.trim()) return;
    setBusy(true);
    const result = await createRTMEntry({ systemId, ursId, ursRequirement: req, ursRegulation: reg, ursPriority: priority });
    setBusy(false);
    if (!result.success) { onError(result.error || "Failed to add requirement."); return; }
    onSaved();
  }

  const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";
  return (
    <Modal open onClose={onClose} title="Add requirement">
      <div className="space-y-3">
        <div><label className={lbl} style={{ color: "var(--text-muted)" }}>URS ID *</label><input className="input text-[12px]" value={ursId} onChange={(e) => setUrsId(e.target.value)} placeholder="URS-..." /></div>
        <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Requirement *</label><textarea rows={3} className="input text-[12px] resize-none w-full" value={req} onChange={(e) => setReq(e.target.value)} placeholder="Min 10 characters" /></div>
        <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Regulation *</label><input className="input text-[12px]" value={reg} onChange={(e) => setReg(e.target.value)} /></div>
        <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Priority</label><Dropdown value={priority} onChange={(v) => setPriority(v as "critical" | "high" | "medium")} width="w-full" options={[{ value: "critical", label: "Critical" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }]} /></div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" icon={Plus} loading={busy} disabled={busy || !ursId.trim() || req.trim().length < 10 || !reg.trim()} onClick={add}>Add</Button>
        </div>
      </div>
    </Modal>
  );
}
