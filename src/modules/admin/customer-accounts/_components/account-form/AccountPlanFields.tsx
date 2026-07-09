"use client";

import { TAILORED_CEILINGS, PLAN_FIELD_BOUNDS, resolvePlanCaps, resolveExpiry, type PlanTier } from "@/lib/plans";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import { Stepper } from "@/components/ui/Stepper";
import dayjs from "@/lib/dayjs";
import { type PlanDraft, makePlanDraft } from "../../helpers";

/** Labelled – / + stepper field for the plan caps (disabled = tier-fixed display). */
function StepperField({ label, value, min, max, disabled, error, onChange }: {
  label: string; value: number; min: number; max: number; disabled: boolean; error?: string; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className={LABEL} style={{ color: "var(--text-secondary)" }}>{label}</label>
      <Stepper value={Number.isFinite(value) ? value : min} onChange={onChange} min={min} max={max} disabled={disabled} invalid={!!error} ariaLabel={label} />
      {error && <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}

const TIER_OPTIONS = [
  { value: "ESSENTIALS", label: "Essentials" },
  { value: "PROFESSIONAL", label: "Professional" },
  { value: "ENTERPRISE", label: "Enterprise" },
  { value: "TAILORED", label: "Tailored" },
];

const LABEL = "block text-[11px] font-medium mb-1" as const;

interface AccountPlanFieldsProps {
  plan: PlanDraft | null;
  onPlanChange: (plan: PlanDraft | null) => void;
  /** Visible inline error for the Max users cap, supplied by the modal's
   *  validation (undefined when valid or not yet surfaced). Mirrors the
   *  field-error pattern in AccountInfoFields. */
  maxUsersError?: string;
  /** Marks the Max users field touched so its error surfaces on blur. */
  onMaxUsersBlur?: () => void;
  /** Same as maxUsersError/onMaxUsersBlur, for the Max sites cap. */
  maxSitesError?: string;
  onMaxSitesBlur?: () => void;
  /** Same, for the Retention (years) cap. */
  retentionError?: string;
  onRetentionBlur?: () => void;
  /** Same, for the Duration (months) term. */
  durationError?: string;
  onDurationBlur?: () => void;
  /** Hide the Max Users field (Create mode) — the total is shown/derived in the
   *  Role Limits section instead (fixed for standard, Σ role caps for Tailored). */
  hideMaxUsers?: boolean;
}

/**
 * Inline plan-assignment section of the account form — tier, dates, and caps
 * all live directly in the Modal body (no separate "Assign Plan" popup). The
 * editor mutates form.plan in place; the account's single Save submits the
 * plan along with the rest of the form (assignPlan-on-save wiring lives in the
 * parent hook).
 */
export function AccountPlanFields({ plan, onPlanChange, maxUsersError, maxSitesError, retentionError, durationError, hideMaxUsers = false }: AccountPlanFieldsProps) {
  const activeSub = plan;

  const updateSub = (patch: Partial<PlanDraft>) => {
    if (activeSub) onPlanChange({ ...activeSub, ...patch });
  };
  // Expiry is DERIVED (start + duration), never hand-entered — recompute the
  // read-only preview whenever start or duration changes.
  const derivedExpiry = (startDate: string, durationMonths: number): string =>
    startDate && Number.isFinite(durationMonths)
      ? dayjs.utc(resolveExpiry(startDate, durationMonths)).format("YYYY-MM-DD")
      : "";
  const setStartDate = (v: string) => {
    if (!activeSub) return;
    updateSub({ startDate: v, expiryDate: derivedExpiry(v, activeSub.durationMonths) });
  };
  const setDurationMonths = (n: number) => {
    if (!activeSub) return;
    updateSub({ durationMonths: n, expiryDate: derivedExpiry(activeSub.startDate, n) });
  };
  // Switching tier re-freezes caps from the tier defaults. TAILORED keeps its
  // editable caps; fixed tiers reset to preset caps (incl. duration) + expiry.
  const changeTier = (tier: PlanTier) => {
    if (!activeSub) return;
    if (tier === "TAILORED") {
      onPlanChange({ ...activeSub, tier });
    } else {
      const caps = resolvePlanCaps(tier);
      onPlanChange({
        ...activeSub, tier, displayName: "",
        maxUsers: caps.maxUsers, maxSites: caps.maxSites, minRetentionYears: caps.minRetentionYears,
        durationMonths: caps.durationMonths,
        expiryDate: derivedExpiry(activeSub.startDate, caps.durationMonths),
      });
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Subscription</h3>
        {activeSub && (
          <button type="button" onClick={() => onPlanChange(null)} className="text-[11px] font-medium border-none bg-transparent cursor-pointer" style={{ color: "var(--danger)" }}>Remove plan</button>
        )}
      </div>

      {!activeSub ? (
        // Neutral card — "no subscription" is the default state for a fresh
        // tenant. Assigning reveals the editor inline (no popup).
        <div className="rounded-lg p-4 flex items-center justify-between" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>No plan assigned</span>
          <button type="button" onClick={() => onPlanChange(makePlanDraft())} className="text-[11px] font-semibold border-none bg-transparent cursor-pointer" style={{ color: "var(--brand)" }}>+ Assign Plan</button>
        </div>
      ) : (
        <div className="rounded-lg p-4 space-y-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
          <div>
            <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Plan tier <span style={{ color: "var(--danger)" }}>*</span></label>
            <Dropdown
              value={activeSub.tier}
              onChange={(v) => changeTier(v as PlanTier)}
              options={TIER_OPTIONS}
              width="w-full"
              size="sm"
            />
          </div>
          {activeSub.tier === "TAILORED" && (
            <div>
              <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Display name</label>
              <input type="text" placeholder="TAILORED" value={activeSub.displayName} onChange={(e) => updateSub({ displayName: e.target.value })} className="input text-[12px]" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {/* Admin picks the start; expiry is DERIVED from start + duration
                (below) and shown read-only — no manual expiry entry. */}
            <DatePicker
              id="plan-start-date"
              label="Start date"
              required
              value={activeSub.startDate}
              onChange={setStartDate}
            />
            <div>
              <label className={LABEL} style={{ color: "var(--text-secondary)" }}>
                Expiry date <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(auto)</span>
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={activeSub.expiryDate ? dayjs.utc(activeSub.expiryDate).format("DD MMM YYYY") : "—"}
                aria-label="Computed expiry date (start + duration)"
                className="input text-[12px]"
              />
            </div>
          </div>
          {/* Caps — – / + steppers, editable only for TAILORED (fixed tiers show
              their preset, disabled). Max Users is hidden in Create mode: the
              total lives in the Role Limits section (fixed for standard tiers,
              Σ role caps for Tailored). Each stepper is clamped to its bound. */}
          <div className="grid grid-cols-2 gap-3">
            {!hideMaxUsers && (
              <StepperField
                label="Max users"
                value={activeSub.maxUsers}
                min={1}
                max={TAILORED_CEILINGS.maxUsers}
                disabled={activeSub.tier !== "TAILORED"}
                error={maxUsersError}
                onChange={(v) => updateSub({ maxUsers: v })}
              />
            )}
            <StepperField
              label="Max sites"
              value={activeSub.maxSites}
              min={PLAN_FIELD_BOUNDS.maxSites.min}
              max={PLAN_FIELD_BOUNDS.maxSites.max}
              disabled={activeSub.tier !== "TAILORED"}
              error={maxSitesError}
              onChange={(v) => updateSub({ maxSites: v })}
            />
            <StepperField
              label="Retention (yr)"
              value={activeSub.minRetentionYears}
              min={PLAN_FIELD_BOUNDS.retentionYears.min}
              max={PLAN_FIELD_BOUNDS.retentionYears.max}
              disabled={activeSub.tier !== "TAILORED"}
              error={retentionError}
              onChange={(v) => updateSub({ minRetentionYears: v })}
            />
            <StepperField
              label="Duration (mo)"
              value={activeSub.durationMonths}
              min={PLAN_FIELD_BOUNDS.durationMonths.min}
              max={PLAN_FIELD_BOUNDS.durationMonths.max}
              disabled={activeSub.tier !== "TAILORED"}
              error={durationError}
              onChange={setDurationMonths}
            />
          </div>
          {activeSub.tier !== "TAILORED" ? (
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Caps are fixed for this tier. Choose Tailored to set custom caps.</p>
          ) : (
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Tailored bounds: ≤ {TAILORED_CEILINGS.maxUsers} users · {PLAN_FIELD_BOUNDS.maxSites.min}–{PLAN_FIELD_BOUNDS.maxSites.max} sites · {PLAN_FIELD_BOUNDS.retentionYears.min}–{PLAN_FIELD_BOUNDS.retentionYears.max}yr · {PLAN_FIELD_BOUNDS.durationMonths.min}–{PLAN_FIELD_BOUNDS.durationMonths.max}mo.</p>
          )}
        </div>
      )}
    </div>
  );
}
