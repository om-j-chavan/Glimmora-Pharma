"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Plus, Trash2, AlertTriangle, CheckCircle2, Send, Sparkles } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  capaStatus,
  rcaByCapa, rcaSubmit,
  actionPlanByCapa, actionPlanSubmit, type ActionItem,
  monitoringByCapa, monitoringCheck, type ActionProgressUpdate,
  effectivenessByCapa, effectivenessCheck, type EvidenceItem, type TrendData,
  closureByCapa, closureInitiate,
  selectAiToken, selectAiCustomerId,
  AiBackendError,
} from "@/lib/aiBackend";

/**
 * AI CAPA lifecycle dashboard.
 *
 * One page per CAPA. Calls capaStatus + every *ByCapa endpoint to render
 * a single scroll view of every stage. Each stage shows the data if it
 * exists, or a "Submit X" button that opens a modal wired to the matching
 * submit/check/initiate endpoint. After a successful submit, the page
 * refetches so the section flips from "Submit" to read-only.
 *
 * Token + customer_id come from Redux (refreshed at app login).
 */

interface Props {
  capaId: string;
}

type Refresh = () => Promise<void>;

export function AiCapaPage({ capaId }: Props) {
  const router = useRouter();
  const token = useAppSelector(selectAiToken);
  const customerId = useAppSelector(selectAiCustomerId);

  const [capa, setCapa] = useState<unknown>(null);
  const [rca, setRca] = useState<unknown>(null);
  const [plan, setPlan] = useState<unknown>(null);
  const [monitoring, setMonitoring] = useState<unknown>(null);
  const [effectiveness, setEffectiveness] = useState<unknown>(null);
  const [closure, setClosure] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state — only one open at a time.
  const [openModal, setOpenModal] = useState<null | "rca" | "plan" | "monitoring" | "effectiveness" | "closure">(null);

  const refresh: Refresh = useCallback(async () => {
    if (!token) {
      setError("AI session is missing. Sign out and sign in again to refresh your token.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [c, r, p, m, e, cl] = await Promise.allSettled([
        capaStatus(capaId, token),
        rcaByCapa(capaId, token),
        actionPlanByCapa(capaId, token),
        monitoringByCapa(capaId, token),
        effectivenessByCapa(capaId, token),
        closureByCapa(capaId, token),
      ]);
      setCapa(c.status === "fulfilled" ? c.value : null);
      setRca(extractRecord(r));
      setPlan(extractRecord(p));
      setMonitoring(extractRecord(m));
      setEffectiveness(extractRecord(e));
      setClosure(extractRecord(cl));
      // Only the CAPA fetch is required; the rest are expected to 404 when
      // the stage hasn't been submitted yet.
      if (c.status === "rejected") {
        const reason = c.reason instanceof AiBackendError ? c.reason.message : String(c.reason);
        setError(`CAPA fetch failed: ${reason}`);
      }
    } finally {
      setLoading(false);
    }
  }, [capaId, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!token) {
    return (
      <main className="p-6">
        <BackLink onClick={() => router.push("/capa")} />
        <p className="text-[13px] mt-4" style={{ color: "var(--danger)" }}>
          AI session is missing. Sign out and sign in again to refresh your token.
        </p>
      </main>
    );
  }

  const recurring = isRecurring(capa);
  const riskScore = getRiskScore(capa);

  return (
    <main className="w-full space-y-5" aria-label="AI CAPA lifecycle">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <BackLink onClick={() => router.push("/capa")} />
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Sparkles className="w-5 h-5" aria-hidden="true" style={{ color: "var(--brand)" }} />
              {capaId}
            </h1>
            <p className="page-subtitle mt-1">AI-managed CAPA lifecycle · customer {customerId ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" icon={RefreshCw} onClick={refresh} loading={loading}>Refresh</Button>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
          {error}
        </div>
      )}

      {/* Summary card */}
      <Section title="Summary">
        {loading && !capa ? (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : capa ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Status" value={String(getField(capa, "status") ?? "—")} />
            <Stat label="Risk score" value={riskScore != null ? `${Math.round(riskScore * 100)}%` : "—"} valueColor={riskScore != null && riskScore >= 0.75 ? "var(--danger)" : riskScore != null && riskScore >= 0.4 ? "var(--warning)" : "var(--success)"} />
            <Stat label="Recurring" value={recurring ? "Yes" : "No"} valueColor={recurring ? "var(--warning)" : "var(--text-primary)"} />
            <Stat label="Created" value={formatDate(getField(capa, "created_at"))} />
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No CAPA data.</p>
        )}
      </Section>

      <StageCard
        title="Root Cause Analysis (RCA)"
        data={rca}
        emptyAction={
          <Button variant="primary" icon={Plus} onClick={() => setOpenModal("rca")}>Submit RCA</Button>
        }
      />

      <StageCard
        title="Action Plan"
        data={plan}
        emptyAction={
          <Button variant="primary" icon={Plus} onClick={() => setOpenModal("plan")} disabled={!rcaId(rca)}>
            {rcaId(rca) ? "Submit action plan" : "Submit RCA first"}
          </Button>
        }
      />

      <StageCard
        title="Implementation Monitoring"
        data={monitoring}
        emptyAction={
          <Button variant="primary" icon={Plus} onClick={() => setOpenModal("monitoring")} disabled={!planId(plan)}>
            {planId(plan) ? "Submit monitoring check" : "Submit action plan first"}
          </Button>
        }
      />

      <StageCard
        title="Effectiveness Check"
        data={effectiveness}
        emptyAction={
          <Button variant="primary" icon={Plus} onClick={() => setOpenModal("effectiveness")} disabled={!planId(plan)}>
            {planId(plan) ? "Run effectiveness check" : "Submit action plan first"}
          </Button>
        }
      />

      <StageCard
        title="Closure"
        data={closure}
        emptyAction={
          <Button variant="primary" icon={Plus} onClick={() => setOpenModal("closure")} disabled={!effectivenessId(effectiveness)}>
            {effectivenessId(effectiveness) ? "Initiate closure" : "Run effectiveness check first"}
          </Button>
        }
      />

      {/* Modals */}
      <RcaModal
        open={openModal === "rca"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={capaId}
        customerId={customerId ?? ""}
        token={token}
      />
      <ActionPlanModal
        open={openModal === "plan"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={capaId}
        customerId={customerId ?? ""}
        rcaId={rcaId(rca) ?? ""}
        token={token}
      />
      <MonitoringModal
        open={openModal === "monitoring"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={capaId}
        customerId={customerId ?? ""}
        actionPlanId={planId(plan) ?? ""}
        defaultActions={planActions(plan)}
        token={token}
      />
      <EffectivenessModal
        open={openModal === "effectiveness"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={capaId}
        customerId={customerId ?? ""}
        actionPlanId={planId(plan) ?? ""}
        defaultEvidence={planActions(plan).map((a) => ({
          action_description: a.action_description,
          completed: true,
          evidence_attached: true,
          evidence_note: "",
        }))}
        token={token}
      />
      <ClosureModal
        open={openModal === "closure"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={capaId}
        customerId={customerId ?? ""}
        effectivenessId={effectivenessId(effectiveness) ?? ""}
        token={token}
      />
    </main>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer bg-transparent border-0 p-0"
      style={{ color: "var(--text-secondary)" }}
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
      Back to CAPA
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

function StageCard({ title, data, emptyAction }: { title: string; data: unknown; emptyAction: ReactNode }) {
  const empty = data == null;
  return (
    <section className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title">{title}</h2>
        {empty ? (
          <span className="badge badge-gray" role="status">Not started</span>
        ) : (
          <span className="badge badge-green" role="status">
            <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> {String(getField(data, "status") ?? "Submitted")}
          </span>
        )}
      </div>
      <div className="card-body">
        {empty ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              This stage hasn't been recorded yet.
            </p>
            {emptyAction}
          </div>
        ) : (
          <pre
            className="text-[11px] rounded-lg p-3 overflow-auto max-h-[240px]"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-[14px] font-semibold" style={{ color: valueColor ?? "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function getField(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" && key in obj ? (obj as Record<string, unknown>)[key] : undefined;
}

function extractRecord(settled: PromiseSettledResult<unknown>): unknown {
  if (settled.status === "rejected") {
    // 404 is the expected "not yet submitted" signal — silently treat as null.
    if (settled.reason instanceof AiBackendError && settled.reason.status === 404) return null;
    return null;
  }
  const v = settled.value;
  // Some endpoints return {detail: "..."} or {status: "not_found"} on absence.
  if (v && typeof v === "object" && "detail" in v && !("status" in v) && !("rca_id" in v)) return null;
  // Empty array / object → null.
  if (Array.isArray(v) && v.length === 0) return null;
  return v;
}

function isRecurring(capa: unknown): boolean {
  return getField(capa, "is_recurring") === true;
}

function getRiskScore(capa: unknown): number | null {
  const v = getField(capa, "risk_score");
  return typeof v === "number" ? v : null;
}

function rcaId(rca: unknown): string | null {
  const v = getField(rca, "rca_id");
  return typeof v === "string" ? v : null;
}

function planId(plan: unknown): string | null {
  const v = getField(plan, "action_plan_id");
  return typeof v === "string" ? v : null;
}

function effectivenessId(eff: unknown): string | null {
  const v = getField(eff, "effectiveness_id");
  return typeof v === "string" ? v : null;
}

function planActions(plan: unknown): ActionItem[] {
  const v = getField(plan, "actions");
  if (!Array.isArray(v)) return [];
  return v
    .map((a) => {
      if (!a || typeof a !== "object") return null;
      const o = a as Record<string, unknown>;
      return {
        action_description: String(o.action_description ?? ""),
        responsible_person: String(o.responsible_person ?? ""),
        due_date: String(o.due_date ?? ""),
      };
    })
    .filter((x): x is ActionItem => !!x);
}

function formatDate(v: unknown): string {
  if (typeof v !== "string") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

/* ── Submit modals ────────────────────────────────────────────── */

interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
  capaId: string;
  customerId: string;
  token: string;
}

function ModalShell({ title, open, onClose, busy, error, onSubmit, submitLabel, children }: {
  title: string;
  open: boolean;
  onClose: () => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  submitLabel: string;
  children: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {children}
        {error && (
          <div role="alert" className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" type="button" icon={Send} loading={busy} onClick={onSubmit}>{submitLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
        {label} {required && <span style={{ color: "var(--danger)" }}>*</span>}
      </span>
      {children}
    </label>
  );
}

/* — RCA — */

function RcaModal({ open, onClose, onSubmitted, capaId, customerId, token }: BaseModalProps) {
  const [method, setMethod] = useState("5-Why");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setMethod("5-Why"); setEvidence(""); setError(null); } }, [open]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await rcaSubmit({ capa_id: capaId, customer_id: customerId, rca_method: method, evidence: evidence || null }, token);
      await onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof AiBackendError ? e.message : e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Submit RCA" open={open} onClose={onClose} busy={busy} error={error} onSubmit={submit} submitLabel="Submit">
      <FieldRow label="RCA method" required>
        <select className="select text-[12px]" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option>5-Why</option><option>Fishbone</option><option>Fault Tree</option><option>Other</option>
        </select>
      </FieldRow>
      <FieldRow label="Evidence (optional)">
        <textarea rows={3} className="input text-[12px] resize-none" placeholder="What did the analysis surface?" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
      </FieldRow>
    </ModalShell>
  );
}

/* — Action Plan — */

interface ActionPlanProps extends BaseModalProps { rcaId: string }

function ActionPlanModal({ open, onClose, onSubmitted, capaId, customerId, rcaId, token }: ActionPlanProps) {
  const [actions, setActions] = useState<ActionItem[]>([{ action_description: "", responsible_person: "", due_date: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setActions([{ action_description: "", responsible_person: "", due_date: "" }]); setError(null); } }, [open]);

  const update = (i: number, patch: Partial<ActionItem>) =>
    setActions((arr) => arr.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  async function submit() {
    if (actions.some((a) => !a.action_description || !a.responsible_person || !a.due_date)) {
      setError("Every action needs a description, owner, and due date.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await actionPlanSubmit({ capa_id: capaId, customer_id: customerId, rca_id: rcaId, actions }, token);
      await onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof AiBackendError ? e.message : e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Submit action plan" open={open} onClose={onClose} busy={busy} error={error} onSubmit={submit} submitLabel="Submit">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>RCA: <span className="font-mono">{rcaId}</span></p>
      <div className="space-y-2">
        {actions.map((a, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_140px_auto] gap-2 items-end">
            <FieldRow label={i === 0 ? "Action" : ""} required={i === 0}><input className="input text-[12px]" value={a.action_description} onChange={(e) => update(i, { action_description: e.target.value })} /></FieldRow>
            <FieldRow label={i === 0 ? "Responsible" : ""} required={i === 0}><input className="input text-[12px]" value={a.responsible_person} onChange={(e) => update(i, { responsible_person: e.target.value })} /></FieldRow>
            <FieldRow label={i === 0 ? "Due date" : ""} required={i === 0}><input type="date" className="input text-[12px]" value={a.due_date} onChange={(e) => update(i, { due_date: e.target.value })} /></FieldRow>
            <Button variant="ghost" icon={Trash2} onClick={() => setActions((arr) => arr.filter((_, idx) => idx !== i))} disabled={actions.length === 1}>Remove</Button>
          </div>
        ))}
      </div>
      <Button variant="secondary" icon={Plus} onClick={() => setActions((arr) => [...arr, { action_description: "", responsible_person: "", due_date: "" }])}>Add action</Button>
    </ModalShell>
  );
}

/* — Monitoring — */

interface MonitoringProps extends BaseModalProps {
  actionPlanId: string;
  defaultActions: ActionItem[];
}

function MonitoringModal({ open, onClose, onSubmitted, capaId, customerId, actionPlanId, defaultActions, token }: MonitoringProps) {
  const [updates, setUpdates] = useState<ActionProgressUpdate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUpdates(
        defaultActions.length > 0
          ? defaultActions.map((a) => ({ ...a, status: "On Track", progress_note: "" }))
          : [{ action_description: "", responsible_person: "", due_date: "", status: "On Track", progress_note: "" }],
      );
      setError(null);
    }
  }, [open, defaultActions]);

  const update = (i: number, patch: Partial<ActionProgressUpdate>) =>
    setUpdates((arr) => arr.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));

  async function submit() {
    setBusy(true); setError(null);
    try {
      await monitoringCheck({ capa_id: capaId, customer_id: customerId, action_plan_id: actionPlanId, action_updates: updates }, token);
      await onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof AiBackendError ? e.message : e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Submit monitoring check" open={open} onClose={onClose} busy={busy} error={error} onSubmit={submit} submitLabel="Submit">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Plan: <span className="font-mono">{actionPlanId}</span></p>
      <div className="space-y-2">
        {updates.map((u, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_1fr] gap-2 items-end">
            <FieldRow label={i === 0 ? "Action" : ""} required={i === 0}><input className="input text-[12px]" value={u.action_description} onChange={(e) => update(i, { action_description: e.target.value })} /></FieldRow>
            <FieldRow label={i === 0 ? "Status" : ""}>
              <select className="select text-[12px]" value={u.status} onChange={(e) => update(i, { status: e.target.value })}>
                <option>On Track</option><option>Delayed</option><option>Completed</option><option>Blocked</option>
              </select>
            </FieldRow>
            <FieldRow label={i === 0 ? "Note" : ""}><input className="input text-[12px]" value={u.progress_note ?? ""} onChange={(e) => update(i, { progress_note: e.target.value })} /></FieldRow>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

/* — Effectiveness — */

interface EffectivenessProps extends BaseModalProps {
  actionPlanId: string;
  defaultEvidence: EvidenceItem[];
}

function EffectivenessModal({ open, onClose, onSubmitted, capaId, customerId, actionPlanId, defaultEvidence, token }: EffectivenessProps) {
  const [days, setDays] = useState(90);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [trend, setTrend] = useState<TrendData[]>([{ metric_name: "", before_capa: 0, after_capa: 0, unit: "" }]);
  const [newIssues, setNewIssues] = useState(false);
  const [issueDetails, setIssueDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDays(90);
      setEvidence(defaultEvidence.length > 0 ? defaultEvidence : [{ action_description: "", completed: true, evidence_attached: true, evidence_note: "" }]);
      setTrend([{ metric_name: "", before_capa: 0, after_capa: 0, unit: "" }]);
      setNewIssues(false);
      setIssueDetails("");
      setError(null);
    }
  }, [open, defaultEvidence]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await effectivenessCheck({
        capa_id: capaId,
        customer_id: customerId,
        action_plan_id: actionPlanId,
        days_since_capa: days,
        evidence_items: evidence,
        trend_data: trend,
        new_issues_reported: newIssues,
        new_issue_details: issueDetails || null,
      }, token);
      await onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof AiBackendError ? e.message : e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Run effectiveness check" open={open} onClose={onClose} busy={busy} error={error} onSubmit={submit} submitLabel="Submit">
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Days since CAPA" required><input type="number" className="input text-[12px]" value={days} onChange={(e) => setDays(Number(e.target.value))} /></FieldRow>
        <FieldRow label="New issues reported?">
          <select className="select text-[12px]" value={String(newIssues)} onChange={(e) => setNewIssues(e.target.value === "true")}>
            <option value="false">No</option><option value="true">Yes</option>
          </select>
        </FieldRow>
      </div>
      {newIssues && (
        <FieldRow label="New issue details"><textarea rows={2} className="input text-[12px] resize-none" value={issueDetails} onChange={(e) => setIssueDetails(e.target.value)} /></FieldRow>
      )}
      <p className="text-[11px] mt-2 mb-1" style={{ color: "var(--text-secondary)" }}>Evidence</p>
      <div className="space-y-2">
        {evidence.map((ev, i) => (
          <div key={i} className="grid grid-cols-[1fr_120px_120px_1fr] gap-2 items-end">
            <FieldRow label={i === 0 ? "Action" : ""}><input className="input text-[12px]" value={ev.action_description} onChange={(e) => setEvidence((arr) => arr.map((x, j) => (j === i ? { ...x, action_description: e.target.value } : x)))} /></FieldRow>
            <FieldRow label={i === 0 ? "Completed" : ""}>
              <select className="select text-[12px]" value={String(ev.completed)} onChange={(e) => setEvidence((arr) => arr.map((x, j) => (j === i ? { ...x, completed: e.target.value === "true" } : x)))}>
                <option value="true">Yes</option><option value="false">No</option>
              </select>
            </FieldRow>
            <FieldRow label={i === 0 ? "Evidence" : ""}>
              <select className="select text-[12px]" value={String(ev.evidence_attached)} onChange={(e) => setEvidence((arr) => arr.map((x, j) => (j === i ? { ...x, evidence_attached: e.target.value === "true" } : x)))}>
                <option value="true">Attached</option><option value="false">None</option>
              </select>
            </FieldRow>
            <FieldRow label={i === 0 ? "Note" : ""}><input className="input text-[12px]" value={ev.evidence_note ?? ""} onChange={(e) => setEvidence((arr) => arr.map((x, j) => (j === i ? { ...x, evidence_note: e.target.value } : x)))} /></FieldRow>
          </div>
        ))}
      </div>
      <Button variant="secondary" icon={Plus} onClick={() => setEvidence((arr) => [...arr, { action_description: "", completed: true, evidence_attached: true, evidence_note: "" }])}>Add evidence</Button>

      <p className="text-[11px] mt-2 mb-1" style={{ color: "var(--text-secondary)" }}>Trend metrics</p>
      <div className="space-y-2">
        {trend.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_100px_100px] gap-2 items-end">
            <FieldRow label={i === 0 ? "Metric" : ""}><input className="input text-[12px]" value={t.metric_name} onChange={(e) => setTrend((arr) => arr.map((x, j) => (j === i ? { ...x, metric_name: e.target.value } : x)))} /></FieldRow>
            <FieldRow label={i === 0 ? "Before" : ""}><input type="number" step="0.01" className="input text-[12px]" value={t.before_capa} onChange={(e) => setTrend((arr) => arr.map((x, j) => (j === i ? { ...x, before_capa: Number(e.target.value) } : x)))} /></FieldRow>
            <FieldRow label={i === 0 ? "After" : ""}><input type="number" step="0.01" className="input text-[12px]" value={t.after_capa} onChange={(e) => setTrend((arr) => arr.map((x, j) => (j === i ? { ...x, after_capa: Number(e.target.value) } : x)))} /></FieldRow>
            <FieldRow label={i === 0 ? "Unit" : ""}><input className="input text-[12px]" value={t.unit} onChange={(e) => setTrend((arr) => arr.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} /></FieldRow>
          </div>
        ))}
      </div>
      <Button variant="secondary" icon={Plus} onClick={() => setTrend((arr) => [...arr, { metric_name: "", before_capa: 0, after_capa: 0, unit: "" }])}>Add metric</Button>
    </ModalShell>
  );
}

/* — Closure — */

interface ClosureProps extends BaseModalProps { effectivenessId: string }

function ClosureModal({ open, onClose, onSubmitted, capaId, customerId, effectivenessId: effId, token }: ClosureProps) {
  const [approvedBy, setApprovedBy] = useState("");
  const [designation, setDesignation] = useState("");
  const [signature, setSignature] = useState("");
  const [rationale, setRationale] = useState("");
  const [relatedReviewed, setRelatedReviewed] = useState(true);
  const [docsApproved, setDocsApproved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setApprovedBy(""); setDesignation(""); setSignature(""); setRationale("");
      setRelatedReviewed(true); setDocsApproved(true); setError(null);
    }
  }, [open]);

  async function submit() {
    if (!approvedBy.trim() || !designation.trim() || !signature.trim() || rationale.trim().length < 5) {
      setError("All fields are required (rationale ≥ 5 chars).");
      return;
    }
    setBusy(true); setError(null);
    try {
      await closureInitiate({
        capa_id: capaId, customer_id: customerId, effectiveness_id: effId,
        approved_by: approvedBy, designation, electronic_signature: signature,
        closure_rationale: rationale,
        related_capas_reviewed: relatedReviewed,
        document_changes_approved: docsApproved,
      }, token);
      await onSubmitted();
      onClose();
    } catch (e) {
      setError(e instanceof AiBackendError ? e.message : e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Initiate closure" open={open} onClose={onClose} busy={busy} error={error} onSubmit={submit} submitLabel="Initiate">
      <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--warning-bg)", color: "var(--warning)", border: "1px solid var(--warning)" }}>
        <AlertTriangle className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" /> Electronic signature is logged immutably. 21 CFR Part 11.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Approved by" required><input className="input text-[12px]" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} /></FieldRow>
        <FieldRow label="Designation" required><input className="input text-[12px]" value={designation} onChange={(e) => setDesignation(e.target.value)} /></FieldRow>
        <FieldRow label="Electronic signature" required><input className="input text-[12px]" value={signature} onChange={(e) => setSignature(e.target.value)} /></FieldRow>
        <FieldRow label="Related CAPAs reviewed?">
          <select className="select text-[12px]" value={String(relatedReviewed)} onChange={(e) => setRelatedReviewed(e.target.value === "true")}>
            <option value="true">Yes</option><option value="false">No</option>
          </select>
        </FieldRow>
        <FieldRow label="Document changes approved?">
          <select className="select text-[12px]" value={String(docsApproved)} onChange={(e) => setDocsApproved(e.target.value === "true")}>
            <option value="true">Yes</option><option value="false">No</option>
          </select>
        </FieldRow>
      </div>
      <FieldRow label="Closure rationale" required><textarea rows={3} className="input text-[12px] resize-none" value={rationale} onChange={(e) => setRationale(e.target.value)} /></FieldRow>
    </ModalShell>
  );
}
