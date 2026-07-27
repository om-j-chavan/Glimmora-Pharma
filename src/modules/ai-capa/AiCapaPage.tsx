"use client";

import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Plus, Trash2, AlertTriangle, CheckCircle2, Send, Sparkles, RotateCcw, Copy, Check } from "lucide-react";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Button } from "@/components/ui/Button";
import { AIButton } from "@/components/ai";
import { Modal } from "@/components/ui/Modal";
import { DataTable, type Column } from "@/components/shared";
import {
  capaCreate, capaStatus,
  rcaByCapa, rcaStatus, rcaSubmit,
  actionPlanByCapa, actionPlanStatus, actionPlanSubmit, type ActionItem,
  monitoringByCapa, monitoringStatus, monitoringCheck, type ActionProgressUpdate,
  effectivenessByCapa, effectivenessStatus, effectivenessCheck, type EvidenceItem, type TrendData,
  closureByCapa, closureStatus, closureInitiate,
  selectAiToken, selectAiCustomerId,
  AiBackendError,
} from "@/lib/aiBackend";
import { friendlyAiError } from "@/lib/friendlyError";
import { formatDateTime } from "@/lib/dates";

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
  const userRole = useAppSelector((s) => s.auth.user?.role ?? "");
  const isCustomerAdmin = userRole === "customer_admin" || userRole === "super_admin";
  // Local CAPA lookup so we can offer "Register with AI backend" when the
  // user lands here via the per-row sparkle on a manually-created CAPA
  // that isn't tracked upstream. Match by either Prisma id or the
  // human-readable reference — the sparkle passes whichever is available.
  const localCapa = useAppSelector((s) =>
    s.capa.items.find((c) => c.id === capaId || c.reference === capaId) ?? null,
  );
  // After a successful register-with-backend call, the AI backend assigns
  // its own capa_id which is different from the URL's capaId. We keep
  // that mapping locally so the stage submit modals target the AI id
  // without forcing a navigation (which would re-mount the page and may
  // race the backend's read-after-write availability for capaStatus).
  // Persist the mapping in localStorage keyed by the local id so the user
  // doesn't have to re-register every time they navigate back to the page.
  const aiCapaIdStorageKey = `glimmora.aiCapaIdFor:${capaId}`;
  const [aiCapaId, setAiCapaIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return window.localStorage.getItem(aiCapaIdStorageKey); } catch { return null; }
  });
  const setAiCapaId = useCallback((next: string | null) => {
    setAiCapaIdState(next);
    if (typeof window === "undefined") return;
    try {
      if (next) window.localStorage.setItem(aiCapaIdStorageKey, next);
      else window.localStorage.removeItem(aiCapaIdStorageKey);
    } catch { /* storage disabled — keep in-memory only */ }
  }, [aiCapaIdStorageKey]);
  const effectiveCapaId = aiCapaId ?? capaId;

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

  // Registration state for the "not tracked in AI backend" empty-state.
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  async function registerWithAiBackend() {
    if (!token || !customerId || !localCapa) return;
    setRegistering(true);
    setRegisterError(null);
    try {
      // Local CAPA stores Area / Equipment inside the description blob;
      // pull them back out if we wrote them in the AI-generate flow,
      // otherwise fall back to safe placeholders so the backend accepts.
      const desc = localCapa.description ?? "";
      const areaMatch = desc.match(/Area:\s*([^\n]+)/i);
      const equipMatch = desc.match(/Equipment\/Product:\s*([^\n]+)/i);
      const problemStatement = desc.split("\n")[0]?.trim() || desc.trim() || "—";
      const res = await capaCreate(
        {
          customer_id: customerId,
          problem_statement: problemStatement,
          source: localCapa.source ?? "Other",
          area_affected: areaMatch?.[1]?.trim() || "—",
          equipment_product: equipMatch?.[1]?.trim() || "—",
          initial_severity: localCapa.risk ?? "Medium",
        },
        token,
      );
      // Optimistically render StageCards from the create response so the
      // user immediately sees the RCA "Submit RCA" action; don't navigate
      // away (capaStatus may not be read-after-write consistent yet).
      setAiCapaId(res.capa_id);
      setCapa(res);
      setRca(null); setPlan(null); setMonitoring(null); setEffectiveness(null); setClosure(null);
    } catch (e) {
      console.error("[ai-capa] register failed", e);
      setRegisterError(friendlyAiError(e, "Could not register this CAPA with the AI backend."));
    } finally {
      setRegistering(false);
    }
  }

  const refresh: Refresh = useCallback(async () => {
    if (!token) {
      setError("AI session is missing. Sign out and sign in again to refresh your token.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const c = await capaStatus(effectiveCapaId, token).then(
        (v) => ({ status: "fulfilled" as const, value: v }),
        (reason) => ({ status: "rejected" as const, reason }),
      );
      if (c.status === "rejected") {
        setCapa(null);
        setRca(null); setPlan(null); setMonitoring(null); setEffectiveness(null); setClosure(null);
        const reason = c.reason instanceof AiBackendError ? c.reason.message : String(c.reason);
        // If the cached AI mapping points to a CAPA the backend no longer
        // knows about (deleted, wiped DB, wrong customer), drop the mapping
        // so the empty-state lets the user register fresh instead of
        // looping the 404 forever.
        if (aiCapaId && c.reason instanceof AiBackendError && c.reason.status === 404) {
          setAiCapaId(null);
        }
        setError(`CAPA fetch failed: ${reason}`);
        return;
      }
      setCapa(c.value);
      // Skip by-capa fetches we *know* will 404 — fresh CAPA with status
      // "Open" has no RCA/AP/Mon/Eff/Closure yet. Once the user submits
      // anything we just fetch all five and let extractRecord handle the
      // expected 404s silently. (Backend's `stage` field is unreliable;
      // `status` is the source of truth.)
      const status = (c.value && typeof c.value === "object" && "status" in c.value
        ? String((c.value as { status?: unknown }).status ?? "") : "").toLowerCase();
      const isOpen = status === "open" || status === "";
      const wantRca = !isOpen;
      const wantPlan = !isOpen;
      const wantMon = !isOpen;
      const wantEff = !isOpen;
      const wantClosure = !isOpen;
      const [r, p, m, e, cl] = await Promise.allSettled([
        wantRca ? rcaByCapa(effectiveCapaId, token) : Promise.resolve(null),
        wantPlan ? actionPlanByCapa(effectiveCapaId, token) : Promise.resolve(null),
        wantMon ? monitoringByCapa(effectiveCapaId, token) : Promise.resolve(null),
        wantEff ? effectivenessByCapa(effectiveCapaId, token) : Promise.resolve(null),
        wantClosure ? closureByCapa(effectiveCapaId, token) : Promise.resolve(null),
      ]);
      const rcaRec = extractRecord(r);
      const planRec = extractRecord(p);
      const monRec = extractRecord(m);
      const effRec = extractRecord(e);
      const closeRec = extractRecord(cl);

      // The by-capa endpoints only return summary fields. Follow up with
      // /status/{id} for any stage that has an id so the structured views
      // get the full record (actions[], action_updates[], evidence[], etc).
      const rId = rcaId(rcaRec);
      const apId = planId(planRec);
      const mId = recordIdFrom(monRec, "monitoring_id", "monitoring_history", "monitorings");
      const effId = effectivenessId(effRec);
      const clId = recordIdFrom(closeRec, "closure_id", "closures");

      const [rDetail, pDetail, mDetail, eDetail, clDetail] = await Promise.allSettled([
        rId ? rcaStatus(rId, token) : Promise.resolve(null),
        apId ? actionPlanStatus(apId, token) : Promise.resolve(null),
        mId ? monitoringStatus(mId, token) : Promise.resolve(null),
        effId ? effectivenessStatus(effId, token) : Promise.resolve(null),
        clId ? closureStatus(clId, token) : Promise.resolve(null),
      ]);
      setRca(rDetail.status === "fulfilled" && rDetail.value ? rDetail.value : rcaRec);
      setPlan(pDetail.status === "fulfilled" && pDetail.value ? pDetail.value : planRec);
      setMonitoring(mDetail.status === "fulfilled" && mDetail.value ? mDetail.value : monRec);
      setEffectiveness(eDetail.status === "fulfilled" && eDetail.value ? eDetail.value : effRec);
      setClosure(clDetail.status === "fulfilled" && clDetail.value ? clDetail.value : closeRec);
    } finally {
      setLoading(false);
    }
  }, [effectiveCapaId, token, aiCapaId, setAiCapaId]);

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
  const capaStatusLabel = (() => {
    const s = getField(capa, "status");
    return typeof s === "string" ? s : "—";
  })();
  const capaCreatedAtLabel = formatDate(getField(capa, "created_at"));

  return (
    <main className="w-full space-y-5" aria-label="AI CAPA lifecycle">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <BackLink onClick={() => router.push("/capa")} />
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Sparkles className="w-5 h-5" aria-hidden="true" style={{ color: "var(--brand)" }} />
              {effectiveCapaId}
            </h1>
            <p className="page-subtitle mt-1">
              AI-managed CAPA lifecycle · customer {customerId ?? "—"}
              {aiCapaId && aiCapaId !== capaId ? ` · linked from ${capaId}` : ""}
            </p>
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
        <SummaryBody
          loading={loading}
          hasCapa={capa != null}
          status={capaStatusLabel}
          riskScore={riskScore}
          recurring={recurring}
          createdAt={capaCreatedAtLabel}
        />
      </Section>

      {/* Stage IDs — copy-friendly panel so users can grab every stage id
          in one place (for the /ai-tools page, audit lookups, etc.) without
          hunting through each card. */}
      {capa != null && isCustomerAdmin && (
        <Section title="Stage IDs" subtitle="Admin diagnostic — click any id to copy it for use on the AI Tools page or external lookups.">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            <CopyableId label="CAPA" value={effectiveCapaId} />
            <CopyableId label="RCA" value={rcaId(rca)} />
            <CopyableId label="Action plan" value={planId(plan)} />
            <CopyableId label="Monitoring" value={recordIdFrom(monitoring, "monitoring_id", "monitoring_history", "monitorings")} />
            <CopyableId label="Effectiveness" value={effectivenessId(effectiveness)} />
            <CopyableId label="Closure" value={recordIdFrom(closure, "closure_id", "closures")} />
          </div>
        </Section>
      )}

      {/* Lifecycle stages — only meaningful when the CAPA actually exists
          in the AI backend. If the capa fetch 404'd (e.g. the user opened
          a manually-created CAPA via the per-row sparkle button), render
          a dedicated empty-state instead of letting them fill stage
          modals that will all 404 on submit. */}
      {capa ? (
        <>
          <StageCard
            title="Root Cause Analysis (RCA)"
            data={rca}
            renderData={(d) => <RcaView data={d} />}
            onRedo={() => setOpenModal("rca")}
            redoLabel="Redo RCA"
            emptyAction={
              <Button variant="primary" icon={Plus} onClick={() => setOpenModal("rca")}>Submit RCA</Button>
            }
          />

          <StageCard
            title="Action Plan"
            data={plan}
            renderData={(d) => <ActionPlanView data={d} />}
            onRedo={rcaId(rca) ? () => setOpenModal("plan") : undefined}
            redoLabel="Redo plan"
            emptyAction={
              <Button variant="primary" icon={Plus} onClick={() => setOpenModal("plan")} disabled={!rcaId(rca)}>
                {rcaId(rca) ? "Submit action plan" : "Submit RCA first"}
              </Button>
            }
          />

          <StageCard
            title="Implementation Monitoring"
            data={monitoring}
            renderData={(d) => <MonitoringView data={d} />}
            onRedo={planId(plan) ? () => setOpenModal("monitoring") : undefined}
            redoLabel="Redo check"
            emptyAction={
              <Button variant="primary" icon={Plus} onClick={() => setOpenModal("monitoring")} disabled={!planId(plan)}>
                {planId(plan) ? "Submit monitoring check" : "Submit action plan first"}
              </Button>
            }
          />

          <StageCard
            title="Effectiveness Check"
            data={effectiveness}
            renderData={(d) => <EffectivenessView data={d} />}
            onRedo={planId(plan) ? () => setOpenModal("effectiveness") : undefined}
            redoLabel="Redo check"
            emptyAction={
              <Button variant="primary" icon={Plus} onClick={() => setOpenModal("effectiveness")} disabled={!planId(plan)}>
                {planId(plan) ? "Run effectiveness check" : "Submit action plan first"}
              </Button>
            }
          />

          <StageCard
            title="Closure"
            data={closure}
            renderData={(d) => <ClosureView data={d} />}
            onRedo={effectivenessId(effectiveness) ? () => setOpenModal("closure") : undefined}
            redoLabel="Redo closure"
            emptyAction={
              <Button variant="primary" icon={Plus} onClick={() => setOpenModal("closure")} disabled={!effectivenessId(effectiveness)}>
                {effectivenessId(effectiveness) ? "Initiate closure" : "Run effectiveness check first"}
              </Button>
            }
          />
        </>
      ) : !loading ? (
        <Section title="Not tracked in AI backend">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            CAPA <code>{capaId}</code> exists in the local CAPA library but
            is not registered with the AI backend yet. Register it now to
            unlock the RCA &rarr; Action plan &rarr; Monitoring &rarr;
            Effectiveness &rarr; Closure lifecycle stages.
          </p>
          {registerError && (
            <div role="alert" className="rounded-lg px-3 py-2 text-[12px] mt-3" style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
              {registerError}
            </div>
          )}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <AIButton
              loading={registering}
              loadingLabel="Registering…"
              disabled={!localCapa || !customerId}
              onClick={registerWithAiBackend}
            >
              Register with AI backend
            </AIButton>
            <Button variant="secondary" onClick={() => router.push("/capa")}>Back to CAPA Tracker</Button>
            <Button variant="ghost" onClick={() => router.push("/ai-capa")}>View all AI CAPAs</Button>
          </div>
          {!localCapa && (
            <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
              This CAPA isn't loaded in the local tracker either. Open the
              CAPA Tracker first so the row is available, then try again.
            </p>
          )}
          {!customerId && (
            <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
              Your tenant has no AI customer id assigned. Ask the customer
              admin to complete the AI signup flow before registering CAPAs.
            </p>
          )}
        </Section>
      ) : null}

      {/* Modals */}
      <RcaModal
        open={openModal === "rca"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={effectiveCapaId}
        customerId={customerId ?? ""}
        token={token}
      />
      <ActionPlanModal
        open={openModal === "plan"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={effectiveCapaId}
        customerId={customerId ?? ""}
        rcaId={rcaId(rca) ?? ""}
        token={token}
      />
      <MonitoringModal
        open={openModal === "monitoring"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={effectiveCapaId}
        customerId={customerId ?? ""}
        actionPlanId={planId(plan) ?? ""}
        defaultActions={planActions(plan)}
        token={token}
      />
      <EffectivenessModal
        open={openModal === "effectiveness"}
        onClose={() => setOpenModal(null)}
        onSubmitted={refresh}
        capaId={effectiveCapaId}
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
        capaId={effectiveCapaId}
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

function SummaryBody({ loading, hasCapa, status, riskScore, recurring, createdAt }: {
  loading: boolean;
  hasCapa: boolean;
  status: string;
  riskScore: number | null;
  recurring: boolean;
  createdAt: string;
}) {
  if (loading && !hasCapa) {
    return <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }
  if (!hasCapa) {
    return <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No CAPA data.</p>;
  }
  const riskColor =
    riskScore != null && riskScore >= 0.75 ? "var(--danger)" :
    riskScore != null && riskScore >= 0.4 ? "var(--warning)" :
    "var(--success)";
  const riskValue = riskScore != null ? `${Math.round(riskScore * 100)}%` : "—";
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat label="Status" value={status} />
      <Stat label="Risk score" value={riskValue} valueColor={riskColor} />
      <Stat label="Recurring" value={recurring ? "Yes" : "No"} valueColor={recurring ? "var(--warning)" : "var(--text-primary)"} />
      <Stat label="Created" value={createdAt} />
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-header" style={{ flexDirection: "column", alignItems: "flex-start" }}>
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

function CopyableId({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  const empty = !value;
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked — silently no-op */ }
  }
  return (
    <button
      type="button"
      onClick={copy}
      disabled={empty}
      title={empty ? "Not yet generated" : "Click to copy"}
      className="rounded-lg px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--bg-border)",
        cursor: empty ? "not-allowed" : "pointer",
        opacity: empty ? 0.55 : 1,
      }}
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
        <p className="text-[12px] font-mono truncate" style={{ color: "var(--text-primary)" }}>{value ?? "—"}</p>
      </div>
      {!empty && (
        copied
          ? <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" style={{ color: "var(--success)" }} />
          : <Copy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
      )}
    </button>
  );
}

function StageCard({ title, data, emptyAction, renderData, onRedo, redoLabel = "Redo" }: { title: string; data: unknown; emptyAction: ReactNode; renderData?: (data: unknown) => ReactNode; onRedo?: () => void; redoLabel?: string }) {
  const empty = data == null;
  return (
    <section className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="card-title">{title}</h2>
        <div className="flex items-center gap-2">
          {!empty && onRedo && (
            <Button variant="ghost" size="xs" icon={RotateCcw} onClick={onRedo}>{redoLabel}</Button>
          )}
          {empty ? (
            <span className="badge badge-gray" role="status">Not started</span>
          ) : (
            <span className="badge badge-green" role="status">
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Recorded
            </span>
          )}
        </div>
      </div>
      <div className="card-body">
        {empty ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              This stage hasn't been recorded yet.
            </p>
            {emptyAction}
          </div>
        ) : renderData ? (
          renderData(data)
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

/* ── Stage data views ─────────────────────────────────────────── */

function firstRecord(data: unknown, ...arrayKeys: string[]): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  for (const k of arrayKeys) {
    const v = o[k];
    if (Array.isArray(v) && v.length > 0 && v[0] && typeof v[0] === "object") {
      return v[0] as Record<string, unknown>;
    }
  }
  // Some endpoints return the record directly at the top level.
  return o;
}

function asString(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  return String(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}

function Field({ label, value, full, valueColor }: { label: string; value: ReactNode; full?: boolean; valueColor?: string }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${full ? "md:col-span-2" : ""}`} style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
      <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <div className="text-[12px] whitespace-pre-wrap" style={{ color: valueColor ?? "var(--text-primary)" }}>{value}</div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "gray"; children: ReactNode }) {
  const cls =
    tone === "green" ? "badge badge-green" :
    tone === "amber" ? "badge badge-amber" :
    tone === "red" ? "badge badge-red" :
    tone === "blue" ? "badge badge-blue" :
    "badge badge-gray";
  return <span className={cls}>{children}</span>;
}

function ratingTone(rating: string): "green" | "amber" | "red" | "gray" {
  const r = rating.toUpperCase();
  if (r === "STRONG") return "green";
  if (r === "MODERATE") return "amber";
  if (r === "WEAK") return "red";
  return "gray";
}

function riskTone(risk: string): "green" | "amber" | "red" | "gray" {
  const r = risk.toUpperCase();
  if (r === "LOW") return "green";
  if (r === "MEDIUM") return "amber";
  if (r === "HIGH") return "red";
  return "gray";
}

function statusTone(status: string): "green" | "amber" | "red" | "blue" | "gray" {
  const s = status.toLowerCase();
  if (/(complet|approv|effective|closed|pass|on track)/.test(s)) return "green";
  if (/(in progress|moderate|pending|submitted)/.test(s)) return "blue";
  if (/(delay|overdue|warning)/.test(s)) return "amber";
  if (/(fail|reject|block|weak)/.test(s)) return "red";
  return "gray";
}

function RcaView({ data }: { data: unknown }) {
  const r = firstRecord(data, "rcas", "rca");
  if (!r) return null;
  const whys = ["why_1", "why_2", "why_3", "why_4", "why_5"]
    .map((k) => asString(r[k]))
    .filter((v) => v && v !== "—");
  const rating = asString(r.quality_rating);
  const risk = asString(r.recurrence_risk);
  const score = r.rca_quality_score;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="blue">{asString(r.rca_method)}</Pill>
        {rating !== "—" && <Pill tone={ratingTone(rating)}>Quality: {rating}{typeof score === "number" ? ` · ${score}/100` : ""}</Pill>}
        {risk !== "—" && <Pill tone={riskTone(risk)}>Recurrence: {risk}</Pill>}
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>RCA ID: <span className="font-mono">{asString(r.rca_id)}</span></span>
      </div>
      <FieldGrid>
        <Field label="Root cause" value={asString(r.root_cause)} full />
        {asString(r.contributing_factors) !== "—" && (
          <Field label="Contributing factors" value={asString(r.contributing_factors)} full />
        )}
        {asString(r.evidence) !== "—" && (
          <Field label="Evidence" value={asString(r.evidence)} full />
        )}
      </FieldGrid>
      {whys.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>5-Why Chain</p>
          <ol className="space-y-1.5">
            {whys.map((w, i) => (
              <li key={i} className="flex gap-2 text-[12px]" style={{ color: "var(--text-primary)" }}>
                <span className="font-semibold shrink-0" style={{ color: "var(--brand)" }}>Why {i + 1}.</span>
                <span>{w}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {asString(r.created_at) !== "—" && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Submitted {formatDate(r.created_at)}</p>
      )}
    </div>
  );
}

function ActionPlanView({ data }: { data: unknown }) {
  const r = firstRecord(data, "action_plans", "plans");
  if (!r) return null;
  const actions = asArray(r.actions);
  const rating = asString(r.overall_plan_rating ?? r.overall_rating);
  const cosmetic = r.is_cosmetic_capa === true;
  const effCurr = asString(r.effectiveness_prediction_current);
  const effImpr = asString(r.effectiveness_prediction_improved);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Plan ID: <span className="font-mono">{asString(r.action_plan_id)}</span></span>
        {rating !== "—" && <Pill tone={ratingTone(rating)}>Plan: {rating}</Pill>}
        {cosmetic && <Pill tone="red">Cosmetic CAPA alert</Pill>}
        {asString(r.status) !== "—" && <Pill tone={statusTone(asString(r.status))}>{asString(r.status)}</Pill>}
      </div>
      {(effCurr !== "—" || effImpr !== "—") && (
        <FieldGrid>
          {effCurr !== "—" && <Field label="Effectiveness (current)" value={effCurr} />}
          {effImpr !== "—" && <Field label="Effectiveness (improved)" value={effImpr} />}
        </FieldGrid>
      )}
      {actions.length > 0 ? (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
          <DataTable
            ariaLabel="Action plan actions"
            data={actions.map((a, i) => ({ i, o: (a && typeof a === "object" ? a : {}) as Record<string, unknown> }))}
            rowKey={(row) => String(row.i)}
            columns={[
              { key: "action", header: "Action", render: ({ o }) => asString(o.action_description) },
              { key: "responsible", header: "Responsible", render: ({ o }) => asString(o.responsible_person) },
              { key: "due", header: "Due date", render: ({ o }) => formatDate(o.due_date) },
            ] satisfies Column<{ i: number; o: Record<string, unknown> }>[]}
          />
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No actions recorded.</p>
      )}
      {asString(r.created_at) !== "—" && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Submitted {formatDate(r.created_at)}</p>
      )}
    </div>
  );
}

function MonitoringView({ data }: { data: unknown }) {
  const r = firstRecord(data, "monitoring_history", "monitorings", "monitoring");
  if (!r) return null;
  const updates = asArray(r.action_updates);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Monitoring ID: <span className="font-mono">{asString(r.monitoring_id)}</span></span>
        {asString(r.overall_status) !== "—" && <Pill tone={statusTone(asString(r.overall_status))}>{asString(r.overall_status)}</Pill>}
      </div>
      {updates.length > 0 ? (
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
                  return s !== "—" ? <Pill tone={statusTone(s)}>{s}</Pill> : "—";
                },
              },
              { key: "note", header: "Note", render: ({ o }) => asString(o.progress_note) },
            ] satisfies Column<{ i: number; o: Record<string, unknown> }>[]}
          />
        </div>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No progress updates recorded.</p>
      )}
      {asString(r.created_at) !== "—" && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Submitted {formatDate(r.created_at)}</p>
      )}
    </div>
  );
}

function EffectivenessView({ data }: { data: unknown }) {
  const r = firstRecord(data, "effectiveness_checks", "effectiveness");
  if (!r) return null;
  const evidence = asArray(r.evidence_items);
  const trend = asArray(r.trend_data);
  const verdict = asString(r.verdict ?? r.status);
  const newIssues = r.new_issues_reported === true;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Effectiveness ID: <span className="font-mono">{asString(r.effectiveness_id)}</span></span>
        {verdict !== "—" && <Pill tone={statusTone(verdict)}>{verdict}</Pill>}
        <Pill tone={newIssues ? "amber" : "green"}>{newIssues ? "New issues reported" : "No new issues"}</Pill>
        {r.days_since_capa != null && (
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{String(r.days_since_capa)} days since CAPA</span>
        )}
      </div>
      {newIssues && asString(r.new_issue_details) !== "—" && (
        <FieldGrid><Field label="New issue details" value={asString(r.new_issue_details)} full /></FieldGrid>
      )}
      {evidence.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Evidence</p>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
            <DataTable
              ariaLabel="Effectiveness evidence"
              data={evidence.map((ev, i) => ({ i, o: (ev && typeof ev === "object" ? ev : {}) as Record<string, unknown> }))}
              rowKey={(row) => String(row.i)}
              columns={[
                { key: "action", header: "Action", render: ({ o }) => asString(o.action_description) },
                { key: "completed", header: "Completed", render: ({ o }) => o.completed ? <Pill tone="green">Yes</Pill> : <Pill tone="gray">No</Pill> },
                { key: "evidence", header: "Evidence", render: ({ o }) => o.evidence_attached ? <Pill tone="green">Attached</Pill> : <Pill tone="amber">Missing</Pill> },
                { key: "note", header: "Note", render: ({ o }) => asString(o.evidence_note) },
              ] satisfies Column<{ i: number; o: Record<string, unknown> }>[]}
            />
          </div>
        </div>
      )}
      {trend.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Trend metrics</p>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--bg-border)" }}>
            <DataTable
              ariaLabel="Effectiveness trend metrics"
              data={trend.map((t, i) => ({ i, o: (t && typeof t === "object" ? t : {}) as Record<string, unknown> }))}
              rowKey={(row) => String(row.i)}
              columns={[
                { key: "metric", header: "Metric", render: ({ o }) => asString(o.metric_name) },
                { key: "before", header: "Before", render: ({ o }) => asString(o.before_capa) },
                { key: "after", header: "After", render: ({ o }) => asString(o.after_capa) },
                { key: "unit", header: "Unit", render: ({ o }) => asString(o.unit) },
              ] satisfies Column<{ i: number; o: Record<string, unknown> }>[]}
            />
          </div>
        </div>
      )}
      {asString(r.created_at) !== "—" && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Submitted {formatDate(r.created_at)}</p>
      )}
    </div>
  );
}

function ClosureView({ data }: { data: unknown }) {
  const r = firstRecord(data, "closures", "closure");
  if (!r) return null;
  const status = asString(r.status);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Closure ID: <span className="font-mono">{asString(r.closure_id)}</span></span>
        {status !== "—" && <Pill tone={statusTone(status)}>{status}</Pill>}
      </div>
      <FieldGrid>
        <Field label="Approved by" value={asString(r.approved_by)} />
        <Field label="Designation" value={asString(r.designation)} />
        <Field label="Electronic signature" value={<span className="font-mono">{asString(r.electronic_signature)}</span>} />
        <Field label="Closed at" value={formatDate(r.closed_at ?? r.created_at)} />
        <Field label="Related CAPAs reviewed" value={r.related_capas_reviewed ? "Yes" : "No"} />
        <Field label="Document changes approved" value={r.document_changes_approved ? "Yes" : "No"} />
        <Field label="Closure rationale" value={asString(r.closure_rationale)} full />
      </FieldGrid>
    </div>
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

// The backend wraps lookup responses in plural arrays (rcas[], action_plans[],
// monitorings[], effectiveness_checks[], closures[]) when fetched via the
// *ByCapa endpoints. These helpers reach into the first element of the
// matching array, falling back to a top-level field if the response isn't
// wrapped (e.g. status endpoints return the record directly).
function firstFromArrayField<T = unknown>(obj: unknown, ...keys: string[]): T | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = o[key];
    if (Array.isArray(v) && v.length > 0) return v[0] as T;
  }
  return null;
}

function recordIdFrom(obj: unknown, idKey: string, ...arrayKeys: string[]): string | null {
  // Prefer the id at the top level (status endpoints return the record
  // directly). Fall back to the first element of the wrapper array.
  const top = getField(obj, idKey);
  if (typeof top === "string") return top;
  const inner = firstFromArrayField<Record<string, unknown>>(obj, ...arrayKeys);
  if (inner && typeof inner[idKey] === "string") return inner[idKey] as string;
  return null;
}

function rcaId(rca: unknown): string | null {
  return recordIdFrom(rca, "rca_id", "rcas", "rca");
}

function planId(plan: unknown): string | null {
  return recordIdFrom(plan, "action_plan_id", "action_plans", "plans");
}

function effectivenessId(eff: unknown): string | null {
  return recordIdFrom(eff, "effectiveness_id", "effectiveness_checks", "effectiveness");
}

function planActions(plan: unknown): ActionItem[] {
  // Look at top level first, then inside the wrapped record.
  let v = getField(plan, "actions");
  if (!Array.isArray(v)) {
    const inner = firstFromArrayField<Record<string, unknown>>(plan, "action_plans", "plans");
    v = inner ? inner.actions : undefined;
  }
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
  return formatDateTime(v);
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
  const [method, setMethod] = useState("5 Why");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setMethod("5 Why"); setEvidence(""); setError(null); } }, [open]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      await rcaSubmit({ capa_id: capaId, customer_id: customerId, rca_method: method, evidence: evidence || null }, token);
      await onSubmitted();
      onClose();
    } catch (e) {
      console.error("[ai-capa] submit failed", e); setError(friendlyAiError(e, "Submit failed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Submit RCA" open={open} onClose={onClose} busy={busy} error={error} onSubmit={submit} submitLabel="Submit">
      <FieldRow label="RCA method" required>
        <select className="select text-[12px]" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option>5 Why</option><option>Fishbone</option><option>Fault Tree</option><option>Other</option>
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
      console.error("[ai-capa] submit failed", e); setError(friendlyAiError(e, "Submit failed. Please try again."));
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
      console.error("[ai-capa] submit failed", e); setError(friendlyAiError(e, "Submit failed. Please try again."));
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
                <option>On Track</option><option>In Progress</option><option>Overdue</option><option>Completed</option>
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
      console.error("[ai-capa] submit failed", e); setError(friendlyAiError(e, "Submit failed. Please try again."));
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
      console.error("[ai-capa] submit failed", e); setError(friendlyAiError(e, "Submit failed. Please try again."));
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
