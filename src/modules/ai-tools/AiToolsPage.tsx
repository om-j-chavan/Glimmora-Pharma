"use client";

import { useState, type ReactNode } from "react";
import { Search, Send, Sparkles, Activity, Database, ShieldCheck, Users, Wrench } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Button } from "@/components/ui/Button";
import {
  rcaStatus,
  actionPlanStatus,
  monitoringStatus,
  effectivenessStatus,
  closureStatus,
  auditRecord,
  usersList,
  aiHealth,
  aiVoiceHealth,
  selectAiToken,
  AiBackendError,
} from "@/lib/aiBackend";

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
          Direct lookups for every AI backend endpoint — paste an ID, hit Submit, see the raw response.
        </p>
      </header>

      {/* ── Stage status by ID ───────────────────────────────────── */}
      <Section title="Stage status lookups" subtitle="Fetch a specific RCA / Action Plan / Monitoring / Effectiveness / Closure record by its own id (returned by the matching submit endpoint).">
        <LookupCard
          icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
          title="RCA status"
          path="GET /api/v1/rca/status/{rca_id}"
          inputLabel="rca_id"
          placeholder="RCA-2026-101"
          onSubmit={(id) => rcaStatus(id, token)}
        />
        <LookupCard
          icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
          title="Action plan status"
          path="GET /api/v1/action-plan/status/{action_plan_id}"
          inputLabel="action_plan_id"
          placeholder="AP-2026-201"
          onSubmit={(id) => actionPlanStatus(id, token)}
        />
        <LookupCard
          icon={<Activity className="w-4 h-4" aria-hidden="true" />}
          title="Monitoring status"
          path="GET /api/v1/monitoring/status/{monitoring_id}"
          inputLabel="monitoring_id"
          placeholder="MON-2026-301"
          onSubmit={(id) => monitoringStatus(id, token)}
        />
        <LookupCard
          icon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}
          title="Effectiveness status"
          path="GET /api/v1/effectiveness/status/{effectiveness_id}"
          inputLabel="effectiveness_id"
          placeholder="EFF-2026-501"
          onSubmit={(id) => effectivenessStatus(id, token)}
        />
        <LookupCard
          icon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}
          title="Closure status"
          path="GET /api/v1/closure/status/{closure_id}"
          inputLabel="closure_id"
          placeholder="CLO-2026-901"
          onSubmit={(id) => closureStatus(id, token)}
        />
      </Section>

      {/* ── Audit record ─────────────────────────────────────────── */}
      <Section title="Audit record" subtitle="Fetch a single audit log entry by audit_id.">
        <LookupCard
          icon={<Database className="w-4 h-4" aria-hidden="true" />}
          title="Audit record"
          path="GET /api/v1/audit/record/{record_id}"
          inputLabel="record_id"
          placeholder="AUDIT-20260430123026-ac1bd3b9"
          onSubmit={(id) => auditRecord(id, token)}
        />
      </Section>

      {/* ── Diagnostics (no input) ───────────────────────────────── */}
      <Section title="Diagnostics" subtitle="Health and inventory checks. No input required — these endpoints return immediately.">
        <PingCard
          icon={<Activity className="w-4 h-4" aria-hidden="true" />}
          title="AI Assistant health"
          path="GET /api/ai/health"
          onSubmit={() => aiHealth()}
        />
        <PingCard
          icon={<Activity className="w-4 h-4" aria-hidden="true" />}
          title="AI Voice health"
          path="GET /api/ai/voice/health"
          onSubmit={() => aiVoiceHealth()}
        />
        <PingCard
          icon={<Users className="w-4 h-4" aria-hidden="true" />}
          title="Users endpoint"
          path="GET /api/v1/users/"
          onSubmit={() => usersList()}
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
  path: string;
  inputLabel: string;
  placeholder: string;
  onSubmit: (id: string) => Promise<unknown>;
}

function LookupCard({ icon, title, path, inputLabel, placeholder, onSubmit }: LookupCardProps) {
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
      setResult(r ?? "(no body)");
    } catch (e) {
      setError(e instanceof AiBackendError ? `${e.status}: ${e.message}` : e instanceof Error ? e.message : "Request failed");
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
        <code className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{path}</code>
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
        <ResultPanel result={result} error={error} />
      </div>
    </article>
  );
}

/* ── Diagnostic ping card (no input) ───────────────────────────── */

interface PingCardProps {
  icon: ReactNode;
  title: string;
  path: string;
  onSubmit: () => Promise<unknown>;
}

function PingCard({ icon, title, path, onSubmit }: PingCardProps) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await onSubmit();
      setResult(r ?? "(no body)");
    } catch (e) {
      setError(e instanceof AiBackendError ? `${e.status}: ${e.message}` : e instanceof Error ? e.message : "Request failed");
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
        <code className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{path}</code>
      </div>
      <div className="card-body space-y-3">
        <Button variant="secondary" icon={Search} loading={busy} onClick={submit}>Ping</Button>
        <ResultPanel result={result} error={error} />
      </div>
    </article>
  );
}

/* ── Shared result + error panel ───────────────────────────────── */

function ResultPanel({ result, error }: { result: unknown; error: string | null }) {
  if (error == null && result == null) return null;
  return (
    <div className="space-y-2">
      {error && (
        <div role="alert" className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
          {error}
        </div>
      )}
      {result != null && (
        <pre
          className="text-[11px] rounded-lg p-3 overflow-auto max-h-[280px]"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-primary)" }}
        >
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
