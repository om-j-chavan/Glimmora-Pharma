"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, AlertTriangle, CheckCircle2, Circle, Hash, RotateCcw } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem } from "@/types/csv-csa";
import { VALIDATION_STAGE_KEYS } from "@/types/csv-csa";
import { Button } from "@/components/ui/Button";
import { getSignOffReadiness, signValidation, unsignValidation } from "@/actions/systems";
import type { WorkflowTab } from "@/modules/csv-csa/detail/workflow";

interface Readiness {
  allStagesComplete: boolean;
  outstandingStages: string[];
  stages: { name: string; status: string }[];
  approvedCount: number;
  stagesTotal: number;
  currentRtmCoverage: number;
  openFindings: number;
  openCriticalCAPAs: number;
  readyToSign: boolean;
}

// Stage status label — identical vocabulary to ValidationPanel's stageLabel
// (Not Started / In Progress / Under Review / Approved / Rejected / Skipped).
// No new status words.
function stageStatusLabel(status: string): string {
  if (status === "approved" || status === "complete") return "Approved";
  if (status === "in_review") return "Under Review";
  if (status === "in_progress" || status === "draft" || status === "in-progress") return "In Progress";
  if (status === "rejected") return "Rejected";
  if (status === "skipped") return "Skipped";
  return "Not Started";
}

// Single next action per non-resolved stage — echoes computeNextStep's verbs
// ("submit … for QA review", "awaiting QA approval", "Re-execute and resubmit")
// plus "Upload evidence" for an empty stage. null = resolved (approved/skipped).
function stageNextAction(status: string): string | null {
  if (status === "approved" || status === "complete" || status === "skipped") return null;
  if (status === "in_review") return "Awaiting QA approval";
  if (status === "in_progress" || status === "draft" || status === "in-progress") return "Submit for QA review";
  if (status === "rejected") return "Re-execute and resubmit";
  return "Upload evidence"; // not_started
}

export interface SignOffTabProps {
  system: GxPSystem;
  role: string;
  timezone: string;
  dateFormat: string;
  onError: (msg: string) => void;
  onOk: (msg: string) => void;
  onNavigateTab: (tab: WorkflowTab) => void;
}

/**
 * RUNG 2.6 — Part 11 validation sign-off. Three states:
 *   A · NOT READY     — gating checklist (stages / findings / CAPAs).
 *   B · READY TO SIGN — password + meaning + next-review attestation form.
 *   C · SIGNED OFF    — immutable signed-record snapshot (+ super-admin revoke).
 */
export function SignOffTab({ system, role, timezone, dateFormat, onError, onOk, onNavigateTab }: SignOffTabProps) {
  const router = useRouter();
  const canSign = role === "qa_head" || role === "super_admin";
  const canRevoke = role === "super_admin";
  const isSigned = !!system.signedOffAt;

  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(!isSigned);

  // Attestation form (state B).
  const defaultNextReview = dayjs().add(1, "year").format("YYYY-MM-DD");
  const [nextReviewDate, setNextReviewDate] = useState(defaultNextReview);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Revoke (state C).
  const [revoking, setRevoking] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeBusy, setRevokeBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (isSigned) { setLoading(false); return; }
    setLoading(true);
    getSignOffReadiness(system.id).then((r) => {
      if (!active) return;
      if (r.success) setReadiness(r.data);
      else onError(r.error || "Failed to compute sign-off readiness.");
      setLoading(false);
    });
    return () => { active = false; };
    // Re-run when the underlying lifecycle state changes.
  }, [system.id, isSigned, system.validationStatus, onError]);

  async function onSign() {
    setPwError(null);
    if (reason.trim().length < 10) { onError("Add the sign-off meaning (at least 10 characters)."); return; }
    if (!password) { setPwError("Password is required to sign."); return; }
    setBusy(true);
    const r = await signValidation(system.id, { nextReviewDate, reason, password });
    setBusy(false);
    if (!r.success) {
      if (r.fieldErrors?.password) setPwError(r.fieldErrors.password[0] ?? "Incorrect password");
      onError(r.error || "Sign-off failed.");
      return;
    }
    setPassword("");
    onOk("Validation signed off.");
    router.refresh();
  }

  async function onRevoke() {
    if (revokeReason.trim().length < 10) { onError("A reason (≥10 chars) is required to revoke."); return; }
    setRevokeBusy(true);
    const r = await unsignValidation(system.id, { reason: revokeReason });
    setRevokeBusy(false);
    if (!r.success) { onError(r.error || "Failed to revoke sign-off."); return; }
    setRevoking(false); setRevokeReason("");
    onOk("Sign-off revoked.");
    router.refresh();
  }

  const lbl = "text-[11px] font-semibold uppercase tracking-wider block mb-1";

  /* ── STATE C — signed off ─────────────────────────────────────── */
  if (isSigned) {
    const snap = [
      { label: "Stages approved", value: system.signedOffStagesApproved != null ? `${system.signedOffStagesApproved}/${system.signedOffStagesTotal}` : "—" },
      { label: "RTM coverage", value: system.signedOffRtmCoverage != null ? `${system.signedOffRtmCoverage}%` : "—" },
      { label: "21 CFR Part 11", value: system.signedOffPart11Compliant == null ? "—" : system.signedOffPart11Compliant ? "Compliant" : "Not compliant" },
      { label: "EU Annex 11", value: system.signedOffAnnex11Compliant == null ? "—" : system.signedOffAnnex11Compliant ? "Compliant" : "Not compliant" },
    ];
    return (
      <div className="space-y-4">
        <div className="card" style={{ borderColor: "#10b98155" }}>
          <div className="card-header"><div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" style={{ color: "#10b981" }} aria-hidden="true" /><span className="card-title">Validation signed off</span></div></div>
          <div className="card-body space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "#10b9811a" }}>
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#10b981" }} aria-hidden="true" />
              <div className="text-[12px]">
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  Signed off by {system.signedOffByName ?? "—"}
                  {system.signedOffAt ? ` on ${dayjs.utc(system.signedOffAt).tz(timezone).format(dateFormat)}` : ""}
                </p>
                {system.signedOffReason && <p className="mt-1" style={{ color: "var(--text-secondary)" }}>Meaning: {system.signedOffReason}</p>}
                <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                  Next requalification review: {system.nextReview ? dayjs.utc(system.nextReview).tz(timezone).format(dateFormat) : "Not set"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {snap.map((s) => (
                <div key={s.label} className="p-2.5 rounded-lg" style={{ background: "var(--bg-surface)" }}>
                  <span className="text-[10px] uppercase tracking-wider font-semibold block" style={{ color: "var(--text-muted)" }}>{s.label}</span>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{s.value}</span>
                </div>
              ))}
            </div>
            {system.signedOffContentHash && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono break-all" style={{ color: "var(--text-muted)" }}>
                <Hash className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>SHA-256: {system.signedOffContentHash}</span>
              </div>
            )}
            <button type="button" onClick={() => onNavigateTab("inspect")} className="text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0">→ Review inspection readiness</button>
          </div>
        </div>

        {canRevoke && (
          <div className="card">
            <div className="card-header"><span className="card-title">Revoke sign-off</span></div>
            <div className="card-body space-y-2">
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Revoking clears the sign-off snapshot and re-derives the validation status from the current stages. The original signature stays in the Part 11 ledger (it is never deleted). Super-admin only.
              </p>
              {!revoking ? (
                <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setRevoking(true)}>Revoke sign-off</Button>
              ) : (
                <div className="space-y-2">
                  <textarea rows={2} className="input text-[12px] resize-none w-full" value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Reason for revoking (min 10 characters)…" />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setRevoking(false); setRevokeReason(""); }}>Cancel</Button>
                    <Button variant="danger" size="sm" loading={revokeBusy} disabled={revokeBusy || revokeReason.trim().length < 10} onClick={onRevoke}>Confirm revoke</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="card"><div className="card-body"><p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>Checking sign-off readiness…</p></div></div>;
  }

  /* ── STATE A — not ready ──────────────────────────────────────── */
  if (!readiness?.readyToSign) {
    const blockers = [
      {
        ok: readiness?.allStagesComplete ?? false,
        text: readiness?.allStagesComplete ? "All validation stages approved or skipped" : `${readiness?.outstandingStages.length ?? 0} stage(s) not yet resolved: ${readiness?.outstandingStages.join(", ") || "—"}`,
        tab: "execute" as WorkflowTab,
      },
      {
        ok: (readiness?.openFindings ?? 0) === 0,
        text: (readiness?.openFindings ?? 0) === 0 ? "No open findings" : `${readiness?.openFindings} open finding(s) require remediation`,
        tab: "inspect" as WorkflowTab,
      },
      {
        ok: (readiness?.openCriticalCAPAs ?? 0) === 0,
        text: (readiness?.openCriticalCAPAs ?? 0) === 0 ? "No open critical/high CAPAs" : `${readiness?.openCriticalCAPAs} open critical/high CAPA(s) must be closed`,
        tab: "inspect" as WorkflowTab,
      },
    ];
    return (
      <div className="card">
        <div className="card-header"><div className="flex items-center gap-2"><Lock className="w-4 h-4" style={{ color: "#f59e0b" }} aria-hidden="true" /><span className="card-title">Not ready to sign off</span></div></div>
        <div className="card-body space-y-2">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Resolve the items below before this validation can be signed off.</p>
          {blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg text-[12px]" style={{ background: "var(--bg-surface)" }}>
              {b.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#10b981" }} aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} aria-hidden="true" />}
              <div className="flex-1">
                <span style={{ color: b.ok ? "var(--text-muted)" : "var(--text-primary)" }}>{b.text}</span>
                {!b.ok && <button type="button" onClick={() => onNavigateTab(b.tab)} className="ml-2 text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0">→ Resolve</button>}
              </div>
            </div>
          ))}

          {/* RUNG 3A.2 — read-only per-stage readiness breakdown. Surfaces
              every stage's blocker (status + single next action), not just the
              names-only summary above. Gating is unchanged. */}
          <div className="pt-2 mt-1 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
              {readiness?.approvedCount ?? 0} of {readiness?.stagesTotal ?? VALIDATION_STAGE_KEYS.length} stages approved
            </p>
            <div className="space-y-1">
              {VALIDATION_STAGE_KEYS.map((key) => {
                const status = readiness?.stages.find((s) => s.name === key)?.status ?? "not_started";
                const approved = status === "approved" || status === "complete";
                const action = stageNextAction(status);
                return (
                  <div key={key} className="flex items-center gap-2 text-[11px]">
                    {approved
                      ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#10b981" }} aria-hidden="true" />
                      : <Circle className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />}
                    <span className="font-mono font-semibold w-9 shrink-0" style={{ color: "var(--text-primary)" }}>{key}</span>
                    <span style={{ color: "var(--text-secondary)" }}>{stageStatusLabel(status)}</span>
                    {action && <span style={{ color: "var(--text-muted)" }}>· {action}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] pt-1" style={{ color: "var(--text-muted)" }}>RTM coverage: {readiness?.currentRtmCoverage ?? 0}% (informational)</p>
        </div>
      </div>
    );
  }

  /* ── STATE B — ready to sign ──────────────────────────────────── */
  return (
    <div className="card" style={{ borderColor: "var(--brand-border)" }}>
      <div className="card-header"><div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" /><span className="card-title">Sign off validation</span></div></div>
      <div className="card-body space-y-3">
        <div className="flex items-start gap-2 p-2.5 rounded-lg text-[12px]" style={{ background: "#10b9811a" }}>
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#10b981" }} aria-hidden="true" />
          <span style={{ color: "var(--text-secondary)" }}>All stages resolved, no open findings, no open critical CAPAs. RTM coverage {readiness.currentRtmCoverage}%.</span>
        </div>

        {!canSign ? (
          <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>You do not have permission to sign off validation. A QA Head must complete this step.</p>
        ) : (
          <>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Signing electronically certifies this system is validated and fit for its intended GxP use (21 CFR Part 11 §11.200). Your password re-authenticates the signature.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={lbl} style={{ color: "var(--text-muted)" }}>Next requalification review *</label>
                <input type="date" className="input text-[12px]" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className={lbl} style={{ color: "var(--text-muted)" }}>Signature meaning *</label>
              <textarea rows={2} className="input text-[12px] resize-none w-full" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I certify this system is validated and fit for intended use (min 10 characters)." />
            </div>
            <div>
              <label className={lbl} style={{ color: "var(--text-muted)" }}>Password *</label>
              <input type="password" autoComplete="current-password" className="input text-[12px]" value={password} onChange={(e) => { setPassword(e.target.value); setPwError(null); }} placeholder="Re-enter your password to sign" />
              {pwError && <p className="text-[11px] mt-1" style={{ color: "#ef4444" }}>{pwError}</p>}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" size="sm" icon={ShieldCheck} loading={busy} disabled={busy || reason.trim().length < 10 || !password || !nextReviewDate} onClick={onSign}>Sign off validation</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
