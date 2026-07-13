"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Search, Wrench, Plus, X, Link2, Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem } from "@/types/csv-csa";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { RiskControlsPanel, type RiskClassificationPatch } from "@/modules/csv-csa/detail/RiskControlsPanel";
import {
  saveRiskFactors as saveRiskFactorsServer,
  saveRiskClassification as saveRiskClassificationServer,
  saveRemediation as saveRemediationServer,
  linkFindingToSystem,
  unlinkFindingFromSystem,
  raiseCAPAFromSystem,
} from "@/actions/systems";
import { canCreateCAPA } from "@/lib/permissions/roleSets";

export interface AvailableFinding { id: string; reference?: string; requirement: string; status: string; }

/** Which content blocks to render. Defaults to all (legacy behaviour). The
 *  RUNG 2.6 workflow tabs split these: Assess renders ["risk"], Inspect
 *  renders ["di","remediation","findings","capas"]. */
export type ComplianceSection = "risk" | "di" | "remediation" | "findings" | "capas";
const ALL_SECTIONS: ComplianceSection[] = ["risk", "di", "remediation", "findings", "capas"];

export interface ComplianceFindingsTabProps {
  system: GxPSystem;
  role: string;
  showPart11: boolean;
  showAnnex11: boolean;
  showGAMP5: boolean;
  /** Tenant findings not yet linked to this system (for the Link modal). */
  availableFindings: AvailableFinding[];
  onError: (msg: string) => void;
  onOk: (msg: string) => void;
  sections?: ComplianceSection[];
}

export function ComplianceFindingsTab({ system, role, showPart11, showAnnex11, showGAMP5, availableFindings, onError, onOk, sections = ALL_SECTIONS }: ComplianceFindingsTabProps) {
  const router = useRouter();
  const canManage = role === "qa_head" || role === "customer_admin" || role === "super_admin";
  const show = (s: ComplianceSection) => sections.includes(s);
  const findings = system.findings ?? [];
  const capas = system.capas ?? [];
  const refresh = () => router.refresh();

  // Inline editors reuse the Rung 1 server actions (self-contained here).
  const [remPlan, setRemPlan] = useState(system.remediationPlan ?? "");
  const [remStatus, setRemStatus] = useState(system.remediationStatus ?? "open");
  const [remBusy, setRemBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [raiseOpen, setRaiseOpen] = useState(false);

  async function saveRemediation() {
    setRemBusy(true);
    const r = await saveRemediationServer(system.id, { remediationPlan: remPlan, remediationStatus: remStatus as "open" | "in-progress" | "closed" });
    setRemBusy(false);
    if (!r.success) { onError(r.error || "Failed to save remediation."); return; }
    onOk("Remediation saved."); refresh();
  }

  // DI status (derived from Part 11 / Annex 11 + open linked CAPAs).
  const p11 = system.part11Status, a11 = system.annex11Status;
  const atBad = p11 === "Non-Compliant" || a11 === "Non-Compliant";
  const atAmber = !atBad && (p11 === "In Progress" || a11 === "In Progress");
  const openCapas = capas.filter((c) => c.status.toLowerCase() !== "closed");

  function statusRow(bad: boolean, amber: boolean, label: string, desc: string) {
    const color = bad ? "#ef4444" : amber ? "#f59e0b" : "#10b981";
    return (
      <div className="flex items-start gap-2 p-2.5 rounded-lg text-[12px]" style={{ background: "var(--bg-surface)" }}>
        {bad || amber ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />}
        <div><span className="font-semibold block" style={{ color }}>{label}</span><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{desc}</span></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Risk classification + risk factors + compliance status (reused) */}
      {show("risk") && (
      <RiskControlsPanel
        system={system} role={role}
        showPart11={showPart11} showAnnex11={showAnnex11} showGAMP5={showGAMP5}
        onNavigateSettings={() => router.push("/settings")}
        onSaveRiskFactors={async (text) => { const r = await saveRiskFactorsServer(system.id, text); if (!r.success) onError(r.error || "Failed"); else { onOk("Risk factors saved."); refresh(); } }}
        onSaveRiskClassification={async (patch: RiskClassificationPatch) => { const r = await saveRiskClassificationServer(system.id, patch); if (!r.success) onError(r.error || "Failed"); else { onOk("Risk classification saved."); refresh(); } }}
      />
      )}

      {/* Data integrity status */}
      {show("di") && (
      <div className="card"><div className="card-header"><span className="card-title">Data integrity status</span></div><div className="card-body space-y-2">
        {statusRow(atBad, atAmber, atBad ? "Audit trail non-compliant" : atAmber ? "Audit trail remediation in progress" : "Audit trail compliant", "Derived from Part 11 / Annex 11 status")}
        {statusRow(p11 === "Non-Compliant", p11 === "In Progress", p11 === "Non-Compliant" ? "E-signature non-compliant" : p11 === "In Progress" ? "E-signature remediation in progress" : "E-signature compliant", "Derived from 21 CFR Part 11 status")}
        {statusRow(openCapas.length > 0, false, openCapas.length > 0 ? `DI gate open — ${openCapas.length} CAPA(s) in progress` : "DI gate cleared", openCapas.length > 0 ? "Open CAPAs linked to this system" : "No open CAPAs linked")}
      </div></div>
      )}

      {/* Remediation */}
      {show("remediation") && (
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Wrench className="w-4 h-4" style={{ color: "#854f0b" }} /><span className="card-title">Remediation plan</span></div></div><div className="card-body space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
          <div><label className="text-[10px] uppercase tracking-wider font-semibold block mb-0.5" style={{ color: "var(--text-muted)" }}>Status</label>
            <Dropdown value={remStatus} onChange={setRemStatus} width="w-full" options={[{ value: "open", label: "Open" }, { value: "in-progress", label: "In progress" }, { value: "closed", label: "Closed" }]} /></div>
          <div><label className="text-[10px] uppercase tracking-wider font-semibold block mb-0.5" style={{ color: "var(--text-muted)" }}>Plan</label>
            <textarea rows={2} className="input text-[12px] resize-none w-full" value={remPlan} onChange={(e) => setRemPlan(e.target.value)} placeholder="Remediation plan and actions…" /></div>
        </div>
        {canManage && <div className="flex justify-end"><Button variant="primary" size="xs" icon={Save} loading={remBusy} disabled={remBusy} onClick={saveRemediation}>Save</Button></div>}
      </div></div>
      )}

      {/* Linked findings */}
      {show("findings") && (
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><Search className="w-4 h-4 text-[#a78bfa]" /><span className="card-title">Linked findings</span>{findings.length > 0 && <Badge variant="amber">{findings.length}</Badge>}</div>
        {canManage && <Button variant="ghost" size="sm" icon={Link2} className="ml-auto" onClick={() => setLinkOpen(true)}>Link finding</Button>}
      </div><div className="card-body space-y-2">
        {findings.length === 0 ? <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No findings linked to this system.</p> : findings.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: "var(--bg-surface)" }}>
            <div className="min-w-0">
              <button type="button" onClick={() => router.push("/gap-assessment")} className="font-mono text-[12px] font-semibold text-[#0ea5e9] hover:underline border-none bg-transparent p-0 cursor-pointer">{f.reference ?? f.id.slice(0, 8)}</button>
              <span className="text-[11px] ml-2" style={{ color: "var(--text-secondary)" }}>{f.requirement.slice(0, 70)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={f.status === "Closed" ? "green" : "amber"}>{f.status}</Badge>
              {canManage && <button type="button" aria-label="Unlink" onClick={async () => { const r = await unlinkFindingFromSystem(system.id, f.id); if (!r.success) onError(r.error || "Failed"); else { onOk("Finding unlinked."); refresh(); } }} className="p-0.5 border-none bg-transparent cursor-pointer" style={{ color: "var(--text-muted)" }}><X className="w-3.5 h-3.5" /></button>}
            </div>
          </div>
        ))}
      </div></div>
      )}

      {/* Linked CAPAs */}
      {show("capas") && (
      <div className="card"><div className="card-header"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#10b981]" /><span className="card-title">Linked CAPAs</span>{capas.length > 0 && <Badge variant="blue">{capas.length}</Badge>}</div>
        {/* Raising a CAPA is QA-only (createCAPA gate) — stricter than canManage,
            which also allows customer_admin. Hide for everyone else. */}
        {canCreateCAPA(role) && <Button variant="secondary" size="sm" icon={Plus} className="ml-auto" onClick={() => setRaiseOpen(true)}>Raise CAPA</Button>}
      </div><div className="card-body space-y-2">
        {capas.length === 0 ? <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No CAPAs raised against this system.</p> : capas.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg" style={{ background: "var(--bg-surface)" }}>
            <div className="min-w-0">
              <button type="button" onClick={() => router.push(`/capa/${c.id}`)} className="font-mono text-[12px] font-semibold text-[#0ea5e9] hover:underline border-none bg-transparent p-0 cursor-pointer">{c.reference ?? c.id.slice(0, 8)}</button>
              <span className="text-[11px] ml-2" style={{ color: "var(--text-secondary)" }}>{c.description.slice(0, 60)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0"><Badge variant="gray">{c.risk}</Badge><Badge variant={c.status === "closed" ? "green" : "amber"}>{c.status}</Badge></div>
          </div>
        ))}
      </div></div>
      )}

      {linkOpen && <LinkFindingModal availableFindings={availableFindings} onClose={() => setLinkOpen(false)} onLink={async (fid) => { const r = await linkFindingToSystem(system.id, fid); if (!r.success) { onError(r.error || "Failed"); return; } onOk("Finding linked."); setLinkOpen(false); refresh(); }} />}
      {raiseOpen && <RaiseCAPAModal systemId={system.id} onClose={() => setRaiseOpen(false)} onError={onError} onRaised={() => { onOk("CAPA raised."); setRaiseOpen(false); refresh(); }} />}
    </div>
  );
}

function LinkFindingModal({ availableFindings, onClose, onLink }: { availableFindings: AvailableFinding[]; onClose: () => void; onLink: (id: string) => void }) {
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Link a finding">
      <div className="space-y-3">
        {availableFindings.length === 0 ? <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No unlinked findings available in this tenant.</p> : (
          <Dropdown value={sel} onChange={setSel} placeholder="Select a finding" width="w-full" options={availableFindings.map((f) => ({ value: f.id, label: `${f.reference ?? f.id.slice(0, 8)} — ${f.requirement.slice(0, 50)}` }))} />
        )}
        <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" icon={Link2} disabled={!sel || busy} loading={busy} onClick={() => { setBusy(true); onLink(sel); }}>Link</Button></div>
      </div>
    </Modal>
  );
}

function RaiseCAPAModal({ systemId, onClose, onError, onRaised }: { systemId: string; onClose: () => void; onError: (m: string) => void; onRaised: () => void }) {
  const [description, setDescription] = useState("");
  const [risk, setRisk] = useState<"Critical" | "High" | "Medium" | "Low">("High");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";
  async function raise() {
    if (description.trim().length < 10 || !dueDate) return;
    setBusy(true);
    const r = await raiseCAPAFromSystem(systemId, { description, risk, dueDate: dayjs(dueDate).utc().toISOString() });
    setBusy(false);
    if (!r.success) {
      // The trigger is QA-only; this guards the stale-UI / race case with a
      // friendly, consistent message for the policy rejection.
      if (r.error === "Only QA Head can create a CAPA.") {
        console.warn("[csv] raise CAPA denied:", r.error);
        onError("Only your QA Head can create a CAPA from this system.");
      } else {
        onError(r.error || "Failed to raise CAPA.");
      }
      return;
    }
    onRaised();
  }
  return (
    <Modal open onClose={onClose} title="Raise CAPA for this system">
      <div className="space-y-3">
        <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Description *</label><textarea rows={3} className="input text-[12px] resize-none w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Min 10 characters" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Risk *</label><Dropdown value={risk} onChange={(v) => setRisk(v as typeof risk)} width="w-full" options={["Critical", "High", "Medium", "Low"].map((r) => ({ value: r, label: r }))} /></div>
          <div><label className={lbl} style={{ color: "var(--text-muted)" }}>Due date *</label><input type="date" className="input text-[12px]" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button><Button variant="primary" size="sm" icon={Plus} loading={busy} disabled={busy || description.trim().length < 10 || !dueDate} onClick={raise}>Raise CAPA</Button></div>
      </div>
    </Modal>
  );
}
