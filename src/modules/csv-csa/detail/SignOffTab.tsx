"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, AlertTriangle, CheckCircle2, Circle, Hash, RotateCcw, ShieldAlert } from "lucide-react";
import dayjs from "@/lib/dayjs";
import type { GxPSystem } from "@/types/csv-csa";
import { VALIDATION_STAGE_KEYS } from "@/types/csv-csa";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { DatePicker } from "@/components/ui/DatePicker";
import { getSignOffReadiness, signValidation, unsignValidation, verifyCSVSignOff } from "@/actions/systems";
import type { WorkflowTab } from "@/modules/csv-csa/detail/workflow";

interface Readiness {
  allStagesComplete: boolean;
  outstandingStages: string[];
  stages: { name: string; status: string }[];
  approvedCount: number;
  stagesTotal: number;
  currentRtmCoverage: number;
  rtmEntriesTotal: number;
  rtmUntraced: number;
  rtmCoverageSufficient: boolean;
  openFindings: number;
  openCriticalCAPAs: number;
  readyToSign: boolean;
  hardBlockersClear: boolean;
}

/** Gate-4 blocker text — mirrors the wording signValidation returns so the tab
 *  and the server describe the same shortfall. */
function rtmBlockerText(r: Readiness): string {
  if (r.rtmCoverageSufficient) {
    return `All ${r.rtmEntriesTotal} requirement(s) fully traced (100% RTM coverage)`;
  }
  if (r.rtmEntriesTotal === 0) {
    return "No requirements captured in the RTM — traceability cannot be demonstrated";
  }
  return `${r.rtmUntraced} of ${r.rtmEntriesTotal} requirement(s) not fully traced (${r.currentRtmCoverage}% RTM coverage)`;
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
  // Gate-4 exception. Only collected (and only sent) when RTM coverage is short
  // of full — matching the server contract, which discards it otherwise.
  const [rtmOverride, setRtmOverride] = useState("");

  // Revoke (state C).
  const [revoking, setRevoking] = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeBusy, setRevokeBusy] = useState(false);

  // C2 — signed-state integrity. Recomputed server-side from current state and
  // compared to the stored hash. Surfaced only; never auto-remediated.
  const [integrity, setIntegrity] = useState<
    { matches: boolean; changedInputs: string[]; boundDocumentManifest: boolean; currentDocumentCount: number } | null
  >(null);
  const [integrityError, setIntegrityError] = useState(false);

  useEffect(() => {
    if (!isSigned) { setIntegrity(null); setIntegrityError(false); return; }
    let active = true;
    verifyCSVSignOff(system.id).then((r) => {
      if (!active) return;
      if (r.success) { setIntegrity(r.data); setIntegrityError(false); }
      else { setIntegrity(null); setIntegrityError(true); }
    });
    return () => { active = false; };
  }, [system.id, isSigned]);

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
    // Gate 4 — an RTM shortfall needs a documented reason. The server enforces
    // this independently; this check only spares a round-trip.
    const needsRtmOverride = readiness ? !readiness.rtmCoverageSufficient : false;
    if (needsRtmOverride && rtmOverride.trim().length < 20) {
      onError("RTM coverage is incomplete — record an override reason (at least 20 characters) to sign with a traceability exception.");
      return;
    }
    if (!password) { setPwError("Password is required to sign."); return; }
    setBusy(true);
    const r = await signValidation(system.id, {
      nextReviewDate,
      reason,
      password,
      ...(needsRtmOverride ? { rtmOverrideReason: rtmOverride } : {}),
    });
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
            {/* Gate-4 exception — a sign-off taken without full traceability must
                say so on the record, not only in the audit trail. Legacy sign-offs
                predating the gate have this null and render nothing. */}
            {system.signedOffRtmOverride && (
              <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "#f59e0b1a" }}>
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} aria-hidden="true" />
                <div className="text-[12px]">
                  <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Signed with a traceability exception</p>
                  <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
                    RTM coverage was {system.signedOffRtmCoverage ?? 0}% at signing — below full requirements traceability.
                  </p>
                  {system.signedOffRtmOverrideReason && (
                    <p className="mt-1" style={{ color: "var(--text-secondary)" }}>Reason: {system.signedOffRtmOverrideReason}</p>
                  )}
                </div>
              </div>
            )}
            {/* C2 — signed-state integrity. The reader that makes drift visible:
                the stored hash is recomputed from CURRENT state on every view.
                Reports only; remediation is a QA decision, not an automatic one. */}
            {integrityError ? (
              <div className="flex items-start gap-2 p-2.5 rounded-lg text-[12px]" style={{ background: "var(--bg-surface)" }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} aria-hidden="true" />
                <span style={{ color: "var(--text-secondary)" }}>Signed state integrity: could not be checked.</span>
              </div>
            ) : integrity === null ? (
              <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>Checking signed state integrity…</p>
            ) : integrity.matches ? (
              <div className="flex items-start gap-2 p-2.5 rounded-lg text-[12px]" style={{ background: "#10b9811a" }}>
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#10b981" }} aria-hidden="true" />
                <span style={{ color: "var(--text-secondary)" }}>
                  Signed state integrity: <strong>verified</strong> — the record still hashes to its signature
                  {integrity.boundDocumentManifest
                    ? `, including all ${integrity.currentDocumentCount} evidence document(s)`
                    : ""}.
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "#ef44441a" }}>
                <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#ef4444" }} aria-hidden="true" />
                <div className="text-[12px]">
                  <p className="font-semibold" style={{ color: "#ef4444" }}>Signed state integrity: DRIFT DETECTED</p>
                  <p className="mt-1" style={{ color: "var(--text-secondary)" }}>
                    This system no longer hashes to the state that was signed. The signature below attests to a
                    record that has since changed. Investigate before relying on this validation.
                  </p>
                  {integrity.changedInputs.length > 0 && (
                    <ul className="mt-1.5 list-disc pl-4" style={{ color: "var(--text-secondary)" }}>
                      {integrity.changedInputs.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}
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
                  <Textarea id="signoff-revoke-reason" rows={2} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="Reason for revoking (min 10 characters)…" />
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

  /* ── STATE A — not ready ──────────────────────────────────────────
   * Gated on hardBlockersClear (gates 1-3), NOT readyToSign (all four).
   * An RTM-coverage shortfall is the one OVERRIDABLE gate, so it must not
   * strand the QA Head here — it falls through to state B, which requires a
   * documented override reason. Gates 1-3 remain absolute. */
  if (!readiness?.hardBlockersClear) {
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
      // Gate 4 — a real blocker, no longer an informational footnote. Shown
      // alongside the other three; resolvable on the Plan tab (which hosts the
      // RTM) or, failing that, by a documented override at signing time.
      {
        ok: readiness?.rtmCoverageSufficient ?? false,
        text: readiness ? rtmBlockerText(readiness) : "RTM coverage unknown",
        tab: "plan" as WorkflowTab,
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
          <span style={{ color: "var(--text-secondary)" }}>All stages resolved, no open findings, no open critical CAPAs.</span>
        </div>

        {/* Gate 4 — RTM coverage short of full. The signing form stays open (this
            is the one overridable gate) but the server refuses without a
            documented reason, so surface the shortfall prominently here. */}
        {!readiness.rtmCoverageSufficient && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg text-[12px]" style={{ background: "#f59e0b1a" }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} aria-hidden="true" />
            <div className="flex-1">
              <span style={{ color: "var(--text-primary)" }}>{rtmBlockerText(readiness)}</span>
              <button type="button" onClick={() => onNavigateTab("plan")} className="ml-2 text-[11px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer p-0">→ Complete the RTM</button>
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Signing now records a traceability exception against this validation. It requires a documented reason and is bound into the signature hash.
              </p>
            </div>
          </div>
        )}

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
                <DatePicker id="signoff-next-review" value={nextReviewDate} onChange={setNextReviewDate} />
              </div>
            </div>
            <div>
              <label className={lbl} style={{ color: "var(--text-muted)" }}>Signature meaning *</label>
              <Textarea id="signoff-meaning" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I certify this system is validated and fit for intended use (min 10 characters)." />
            </div>
            {/* Rendered ONLY on an RTM shortfall — mirrors the server, which
                discards this field when coverage is already sufficient. */}
            {!readiness.rtmCoverageSufficient && (
              <div>
                <label className={lbl} style={{ color: "var(--text-muted)" }}>RTM coverage override reason *</label>
                <Textarea
                  id="signoff-rtm-override"
                  rows={3}
                  value={rtmOverride}
                  onChange={(e) => setRtmOverride(e.target.value)}
                  maxLength={2000}
                  aria-label="RTM coverage override reason"
                  placeholder="Why is this system being signed off without full requirements traceability? (min 20 characters)"
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Recorded on the system and hashed into the signed record as a documented traceability exception.
                </p>
              </div>
            )}
            <div>
              <label className={lbl} style={{ color: "var(--text-muted)" }}>Password *</label>
              {/* pwError moves onto the component's own `error` prop — same
                  text, same 11px/mt-1 treatment, plus aria-invalid + role="alert".
                  The manual <p> is removed so the message renders once. */}
              <Input
                id="signoff-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPwError(null); }}
                placeholder="Re-enter your password to sign"
                error={pwError ?? undefined}
              />
            </div>
            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                icon={ShieldCheck}
                loading={busy}
                disabled={
                  busy || reason.trim().length < 10 || !password || !nextReviewDate ||
                  (!readiness.rtmCoverageSufficient && rtmOverride.trim().length < 20)
                }
                onClick={onSign}
              >
                {readiness.rtmCoverageSufficient ? "Sign off validation" : "Sign off with RTM exception"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
