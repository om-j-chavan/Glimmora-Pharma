"use client";

import { useState, type ReactNode } from "react";
import { Search, Send, Sparkles, Activity, Database, ShieldCheck, Wrench, CheckCircle2, XCircle, AlertTriangle, Info, FileText } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/shared";
import {
  rcaStatus,
  actionPlanStatus,
  monitoringStatus,
  effectivenessStatus,
  closureStatus,
  auditRecord,
  aiHealth,
  aiVoiceHealth,
  selectAiToken,
} from "@/lib/aiBackend";
import { friendlyAiError } from "@/lib/friendlyError";
import { formatDateTime } from "@/lib/dates";

/**
 * AI Backend Tools — direct lookups for every endpoint that doesn't have
 * a dedicated UI surface elsewhere in the app. Each card mirrors the
 * AI CAPA modal pattern: a focused header, a small input row, a Submit
 * button, and a JSON result panel with consistent error handling.
 *
 * Endpoints surfaced here:
 *   GET  /api/v1/rca/status/{rca_id}
 *   GET  /api/v1/action-plan/status/{action_plan_id}
 *   GET  /api/v1/monitoring/status/{monitoring_id}
 *   GET  /api/v1/effectiveness/status/{effectiveness_id}
 *   GET  /api/v1/closure/status/{closure_id}
 *   GET  /api/v1/audit/record/{record_id}
 *   GET  /api/v1/users/
 *   GET  /api/ai/health
 *   GET  /api/ai/voice/health
 */

export function AiToolsPage() {
  const token = useAppSelector(selectAiToken);

  if (!token) {
    return (
      <main className="p-6">
        <h1 className="page-title">AI Backend Tools</h1>
        <p className="text-[13px] mt-3" style={{ color: "var(--danger)" }}>
          AI session is missing. Sign out and sign in again to refresh your token.
        </p>
      </main>
    );
  }

  return (
    <main id="main-content" aria-label="AI backend tools" className="w-full space-y-5">
      <header>
        <h1 className="page-title flex items-center gap-2">
          <Wrench className="w-5 h-5" aria-hidden="true" style={{ color: "var(--brand)" }} />
          AI Backend Tools
        </h1>
        <p className="page-subtitle mt-1">
          Direct lookups for every AI backend record — paste an ID and submit to see a structured summary.
        </p>
      </header>

      {/* ── Stage status by ID ───────────────────────────────────── */}
      <Section title="Stage status lookups" subtitle="Fetch a specific RCA / Action Plan / Monitoring / Effectiveness / Closure record by its own id (returned by the matching submit endpoint).">
        <LookupCard
          icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
          title="RCA status"
          inputLabel="rca_id"
          placeholder="RCA-2026-101"
          onSubmit={(id) => rcaStatus(id, token)}
          renderResult={(r) => <RcaSummary data={r} />}
        />
        <LookupCard
          icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
          title="Action plan status"
          inputLabel="action_plan_id"
          placeholder="AP-2026-201"
          onSubmit={(id) => actionPlanStatus(id, token)}
          renderResult={(r) => <ActionPlanSummary data={r} />}
        />
        <LookupCard
          icon={<Activity className="w-4 h-4" aria-hidden="true" />}
          title="Monitoring status"
          inputLabel="monitoring_id"
          placeholder="MON-2026-301"
          onSubmit={(id) => monitoringStatus(id, token)}
          renderResult={(r) => <MonitoringSummary data={r} />}
        />
        <LookupCard
          icon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}
          title="Effectiveness status"
          inputLabel="effectiveness_id"
          placeholder="EFF-2026-501"
          onSubmit={(id) => effectivenessStatus(id, token)}
          renderResult={(r) => <EffectivenessSummary data={r} />}
        />
        <LookupCard
          icon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}
          title="Closure status"
          inputLabel="closure_id"
          placeholder="CLO-2026-901"
          onSubmit={(id) => closureStatus(id, token)}
          renderResult={(r) => <ClosureSummary data={r} />}
        />
      </Section>

      {/* ── Audit record ─────────────────────────────────────────── */}
      <Section title="Audit record" subtitle="Fetch a single audit log entry by audit_id.">
        <LookupCard
          icon={<Database className="w-4 h-4" aria-hidden="true" />}
          title="Audit record"
          inputLabel="record_id"
          placeholder="AUDIT-20260430123026-ac1bd3b9"
          onSubmit={(id) => auditRecord(id, token)}
          renderResult={(r) => <AuditSummary data={r} />}
        />
      </Section>

      {/* ── Diagnostics (no input) ───────────────────────────────── */}
      <Section title="Diagnostics" subtitle="Health and inventory checks. No input required — these endpoints return immediately.">
        <PingCard
          icon={<Activity className="w-4 h-4" aria-hidden="true" />}
          title="AI Assistant health"
          onSubmit={() => aiHealth()}
          renderResult={(r) => <HealthSummary data={r} label="AI Assistant" />}
        />
        <PingCard
          icon={<Activity className="w-4 h-4" aria-hidden="true" />}
          title="AI Voice health"
          onSubmit={() => aiVoiceHealth()}
          renderResult={(r) => <HealthSummary data={r} label="AI Voice" showVoices />}
        />
      </Section>
    </main>
  );
}

/* ── Layout primitives ─────────────────────────────────────────── */

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {subtitle && (
          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

/* ── Lookup-by-ID card ─────────────────────────────────────────── */

interface LookupCardProps {
  icon: ReactNode;
  title: string;
  inputLabel: string;
  placeholder: string;
  onSubmit: (id: string) => Promise<unknown>;
  renderResult: (data: unknown) => ReactNode;
}

function LookupCard({ icon, title, inputLabel, placeholder, onSubmit, renderResult }: LookupCardProps) {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!id.trim()) {
      setError(`${inputLabel} is required.`);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await onSubmit(id.trim());
      setResult(r ?? null);
    } catch (e) {
      console.error("[ai-tools] request failed", e); setError(friendlyAiError(e, "Request failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--brand)" }}>{icon}</span>
          <span className="card-title">{title}</span>
        </div>
      </div>
      <div className="card-body space-y-3">
        <label className="block">
          <span className="text-[11px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
            {inputLabel} <span style={{ color: "var(--danger)" }}>*</span>
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="input text-[12px] flex-1"
              placeholder={placeholder}
              value={id}
              onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
              disabled={busy}
            />
            <Button variant="primary" icon={Send} loading={busy} onClick={submit}>Submit</Button>
          </div>
        </label>
        <ResultPanel result={result} error={error} renderResult={renderResult} />
      </div>
    </article>
  );
}

/* ── Diagnostic ping card (no input) ───────────────────────────── */

interface PingCardProps {
  icon: ReactNode;
  title: string;
  onSubmit: () => Promise<unknown>;
  renderResult: (data: unknown) => ReactNode;
}

function PingCard({ icon, title, onSubmit, renderResult }: PingCardProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await onSubmit();
      setResult(r ?? null);
    } catch (e) {
      console.error("[ai-tools] request failed", e); setError(friendlyAiError(e, "Request failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--brand)" }}>{icon}</span>
          <span className="card-title">{title}</span>
        </div>
      </div>
      <div className="card-body space-y-3">
        <Button variant="secondary" icon={Search} loading={busy} onClick={submit}>Check</Button>
        <ResultPanel result={result} error={error} renderResult={renderResult} />
      </div>
    </article>
  );
}

/* ── Shared result + error panel ───────────────────────────────── */

function ResultPanel({ result, error, renderResult }: { result: unknown; error: string | null; renderResult: (data: unknown) => ReactNode }) {
  if (error == null && result == null) return null;
  return (
    <div className="space-y-2">
      {error && (
        <div role="alert" className="rounded-lg px-3 py-2 text-[12px] flex items-start gap-2" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {result != null && renderResult(result)}
    </div>
  );
}

/* ── Shared display primitives ─────────────────────────────────── */

function getField(obj: unknown, key: string): unknown {
  return obj && typeof obj === "object" && key in obj ? (obj as Record<string, unknown>)[key] : undefined;
}

function asString(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  return String(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function formatDate(v: unknown): string {
  if (typeof v !== "string") return "—";
  return formatDateTime(v);
}

function StatusBanner({ tone, icon, title, body }: { tone: "success" | "warning" | "danger" | "info"; icon: ReactNode; title: string; body?: string }) {
  const bg =
    tone === "success" ? "var(--success-bg)" :
    tone === "warning" ? "var(--warning-bg)" :
    tone === "danger" ? "var(--danger-bg)" :
    "var(--brand-muted)";
  const fg =
    tone === "success" ? "var(--success)" :
    tone === "warning" ? "var(--warning)" :
    tone === "danger" ? "var(--danger)" :
    "var(--brand)";
  return (
    <div role="status" className="rounded-lg px-3 py-2 flex items-start gap-2" style={{ background: bg, color: fg, border: `1px solid ${fg}` }}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
      <div>
        <p className="text-[12px] font-semibold">{title}</p>
        {body && <p className="text-[11px] mt-0.5 opacity-90">{body}</p>}
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "gray" | "purple"; children: ReactNode }) {
  const cls =
    tone === "green" ? "badge badge-green" :
    tone === "amber" ? "badge badge-amber" :
    tone === "red" ? "badge badge-red" :
    tone === "blue" ? "badge badge-blue" :
    tone === "purple" ? "badge badge-purple" :
    "badge badge-gray";
  return <span className={cls}>{children}</span>;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] uppercase tracking-wider shrink-0 w-32" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[12px] flex-1 break-all" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

function ratingTone(r: string): "green" | "amber" | "red" | "gray" {
  const v = r.toUpperCase();
  if (v === "STRONG") return "green";
  if (v === "MODERATE") return "amber";
  if (v === "WEAK") return "red";
  return "gray";
}

function riskTone(r: string): "green" | "amber" | "red" | "gray" {
  const v = r.toUpperCase();
  if (v === "LOW") return "green";
  if (v === "MEDIUM") return "amber";
  if (v === "HIGH") return "red";
  return "gray";
}

/* ── Result summaries ──────────────────────────────────────────── */

function RcaSummary({ data }: { data: unknown }) {
  const rating = asString(getField(data, "quality_rating"));
  const risk = asString(getField(data, "recurrence_risk"));
  const score = getField(data, "rca_quality_score");
  const whys = ["why_1", "why_2", "why_3", "why_4", "why_5"]
    .map((k) => asString(getField(data, k)))
    .filter((v) => v && v !== "—");
  return (
    <div className="space-y-3">
      <StatusBanner tone="success" icon={<CheckCircle2 className="w-4 h-4" />} title={`RCA ${asString(getField(data, "rca_id"))} found`} body={`Submitted ${formatDate(getField(data, "created_at"))}`} />
      <div className="flex flex-wrap gap-2">
        <Pill tone="blue">{asString(getField(data, "rca_method"))}</Pill>
        {rating !== "—" && <Pill tone={ratingTone(rating)}>Quality: {rating}{typeof score === "number" ? ` · ${score}/100` : ""}</Pill>}
        {risk !== "—" && <Pill tone={riskTone(risk)}>Recurrence: {risk}</Pill>}
      </div>
      <div className="space-y-1.5">
        <Row label="CAPA" value={asString(getField(data, "capa_id"))} />
        <Row label="Root cause" value={asString(getField(data, "root_cause"))} />
      </div>
      {whys.length > 0 && (
        <div className="rounded-lg p-3 space-y-1" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>5-Why chain</p>
          {whys.map((w, i) => (
            <p key={i} className="text-[12px]"><span className="font-semibold" style={{ color: "var(--brand)" }}>Why {i + 1}.</span> {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionPlanSummary({ data }: { data: unknown }) {
  const rating = asString(getField(data, "overall_plan_rating") ?? getField(data, "overall_rating"));
  const cosmetic = getField(data, "is_cosmetic_capa") === true;
  const actions = asArray(getField(data, "actions"));
  const total = getField(data, "total_actions") ?? actions.length;
  return (
    <div className="space-y-3">
      <StatusBanner tone={cosmetic ? "warning" : "success"} icon={<CheckCircle2 className="w-4 h-4" />} title={`Action Plan ${asString(getField(data, "action_plan_id"))} found`} body={`Submitted ${formatDate(getField(data, "created_at"))}`} />
      <div className="flex flex-wrap gap-2">
        {rating !== "—" && <Pill tone={ratingTone(rating)}>Plan: {rating}</Pill>}
        {cosmetic && <Pill tone="red">Cosmetic CAPA alert</Pill>}
        <Pill tone="blue">{String(total)} action{Number(total) === 1 ? "" : "s"}</Pill>
      </div>
      <div className="space-y-1.5">
        <Row label="CAPA" value={asString(getField(data, "capa_id"))} />
        <Row label="RCA" value={asString(getField(data, "rca_id"))} />
        <Row label="Effectiveness (current)" value={asString(getField(data, "effectiveness_prediction_current"))} />
        <Row label="Effectiveness (improved)" value={asString(getField(data, "effectiveness_prediction_improved"))} />
      </div>
      {actions.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
          <DataTable
            ariaLabel="Action plan actions"
            data={actions.map((a, i) => ({ i, o: (a && typeof a === "object" ? a : {}) as Record<string, unknown> }))}
            rowKey={(row) => String(row.i)}
            columns={[
              { key: "action", header: "Action", render: ({ o }) => asString(o.action_description) },
              { key: "responsible", header: "Responsible", render: ({ o }) => asString(o.responsible_person) },
              { key: "due", header: "Due", render: ({ o }) => formatDate(o.due_date) },
            ] satisfies Column<{ i: number; o: Record<string, unknown> }>[]}
          />
        </div>
      )}
    </div>
  );
}

function MonitoringSummary({ data }: { data: unknown }) {
  const updates = asArray(getField(data, "action_updates"));
  const overdue = Number(getField(data, "overdue_count") ?? 0);
  const onTrack = Number(getField(data, "on_track_count") ?? 0);
  const completed = Number(getField(data, "completed_count") ?? 0);
  const overall = asString(getField(data, "overall_status") ?? getField(data, "overall_capa_status"));
  const tone = overdue > 0 ? "warning" : "success";
  return (
    <div className="space-y-3">
      <StatusBanner tone={tone} icon={<CheckCircle2 className="w-4 h-4" />} title={`Monitoring ${asString(getField(data, "monitoring_id"))} found`} body={`Submitted ${formatDate(getField(data, "created_at"))}`} />
      <div className="flex flex-wrap gap-2">
        {overall !== "—" && <Pill tone={overdue > 0 ? "amber" : "green"}>{overall}</Pill>}
        <Pill tone="green">{completed} completed</Pill>
        <Pill tone="blue">{onTrack} on track</Pill>
        {overdue > 0 && <Pill tone="red">{overdue} overdue</Pill>}
      </div>
      {updates.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
          <DataTable
            ariaLabel="Monitoring action updates"
            data={updates.map((u, i) => ({ i, o: (u && typeof u === "object" ? u : {}) as Record<string, unknown> }))}
            rowKey={(row) => String(row.i)}
            columns={[
              { key: "action", header: "Action", render: ({ o }) => asString(o.action_description) },
              {
                key: "status",
                header: "Status",
                render: ({ o }) => {
                  const s = asString(o.status);
                  const stone: "green" | "amber" | "red" | "blue" | "gray" =
                    /complet/i.test(s) ? "green" : /delay|overdue/i.test(s) ? "red" : /track|progress/i.test(s) ? "blue" : "gray";
                  return s !== "—" ? <Pill tone={stone}>{s}</Pill> : "—";
                },
              },
              { key: "note", header: "Note", render: ({ o }) => asString(o.progress_note) },
            ] satisfies Column<{ i: number; o: Record<string, unknown> }>[]}
          />
        </div>
      )}
    </div>
  );
}

function EffectivenessSummary({ data }: { data: unknown }) {
  const verdict = asString(getField(data, "verdict") ?? getField(data, "status"));
  const score = getField(data, "effectiveness_score");
  const newIssues = getField(data, "new_issues_reported") === true;
  return (
    <div className="space-y-3">
      <StatusBanner tone={newIssues ? "warning" : "success"} icon={<CheckCircle2 className="w-4 h-4" />} title={`Effectiveness ${asString(getField(data, "effectiveness_id"))} found`} body={`Submitted ${formatDate(getField(data, "created_at"))}`} />
      <div className="flex flex-wrap gap-2">
        {verdict !== "—" && <Pill tone="blue">{verdict}</Pill>}
        {typeof score === "number" && <Pill tone={score >= 70 ? "green" : score >= 40 ? "amber" : "red"}>Score: {score}</Pill>}
        <Pill tone={newIssues ? "amber" : "green"}>{newIssues ? "New issues reported" : "No new issues"}</Pill>
        {getField(data, "days_since_capa") != null && (
          <Pill tone="gray">{String(getField(data, "days_since_capa"))} days since CAPA</Pill>
        )}
      </div>
      <div className="space-y-1.5">
        <Row label="CAPA" value={asString(getField(data, "capa_id"))} />
        <Row label="Action plan" value={asString(getField(data, "action_plan_id"))} />
        {newIssues && <Row label="New issue details" value={asString(getField(data, "new_issue_details"))} />}
      </div>
    </div>
  );
}

function ClosureSummary({ data }: { data: unknown }) {
  const finalStatus = asString(getField(data, "capa_final_status") ?? getField(data, "status"));
  return (
    <div className="space-y-3">
      <StatusBanner tone="success" icon={<CheckCircle2 className="w-4 h-4" />} title={`Closure ${asString(getField(data, "closure_id"))} found`} body={`Closed ${formatDate(getField(data, "closed_at") ?? getField(data, "created_at"))}`} />
      <div className="flex flex-wrap gap-2">
        {finalStatus !== "—" && <Pill tone="green">{finalStatus}</Pill>}
        <Pill tone={getField(data, "related_capas_reviewed") ? "green" : "amber"}>Related CAPAs: {getField(data, "related_capas_reviewed") ? "Reviewed" : "Not reviewed"}</Pill>
        <Pill tone={getField(data, "document_changes_approved") ? "green" : "amber"}>Doc changes: {getField(data, "document_changes_approved") ? "Approved" : "Pending"}</Pill>
      </div>
      <div className="space-y-1.5">
        <Row label="CAPA" value={asString(getField(data, "capa_id"))} />
        <Row label="Approved by" value={`${asString(getField(data, "approved_by"))} · ${asString(getField(data, "designation"))}`} />
        <Row label="Signature" value={<span className="font-mono">{asString(getField(data, "electronic_signature"))}</span>} />
        <Row label="Rationale" value={asString(getField(data, "closure_rationale"))} />
      </div>
    </div>
  );
}

function AuditSummary({ data }: { data: unknown }) {
  const logs = asArray(getField(data, "audit_logs"));
  const total = Number(getField(data, "total") ?? logs.length);
  return (
    <div className="space-y-3">
      <StatusBanner tone="success" icon={<FileText className="w-4 h-4" />} title={`Audit trail retrieved`} body={`${total} entr${total === 1 ? "y" : "ies"} for record ${asString(getField(data, "record_id"))}`} />
      {logs.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
          <DataTable
            ariaLabel="Audit trail"
            data={logs.map((l, i) => ({ i, o: (l && typeof l === "object" ? l : {}) as Record<string, unknown> }))}
            rowKey={(row) => String(row.i)}
            columns={[
              { key: "action", header: "Action", render: ({ o }) => <span className="font-mono text-[11px]">{asString(o.action_type ?? o.feature_id)}</span> },
              { key: "user", header: "User", render: ({ o }) => asString(o.username) },
              { key: "when", header: "When", render: ({ o }) => formatDate(o.created_at ?? o.timestamp) },
            ] satisfies Column<{ i: number; o: Record<string, unknown> }>[]}
          />
        </div>
      )}
    </div>
  );
}

function HealthSummary({ data, label, showVoices }: { data: unknown; label: string; showVoices?: boolean }) {
  const statusText = asString(getField(data, "status") ?? getField(data, "message"));
  const healthy = /running|ok|healthy|✅|working/i.test(statusText);
  const voices = asArray(getField(data, "voices"));
  const tone = healthy ? "success" : statusText === "—" ? "info" : "warning";
  const Icon = healthy ? CheckCircle2 : statusText === "—" ? Info : AlertTriangle;
  return (
    <div className="space-y-3">
      <StatusBanner
        tone={tone}
        icon={<Icon className="w-4 h-4" />}
        title={healthy ? `${label} is healthy` : `${label} responded`}
        body={statusText !== "—" ? statusText.replace(/[✅✔️]/g, "").trim() : undefined}
      />
      {showVoices && voices.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Available voices</p>
          <div className="flex flex-wrap gap-1.5">
            {voices.map((v, i) => <Pill key={i} tone="purple">{asString(v)}</Pill>)}
          </div>
        </div>
      )}
    </div>
  );
}
