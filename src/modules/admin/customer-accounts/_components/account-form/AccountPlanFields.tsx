"use client";

import { TAILORED_CEILINGS, resolvePlanCaps, resolveExpiry, type PlanTier } from "@/lib/plans";
import { Dropdown } from "@/components/ui/Dropdown";
import { DatePicker } from "@/components/ui/DatePicker";
import dayjs from "@/lib/dayjs";
import { type PlanDraft, makePlanDraft } from "../../helpers";

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
}

/**
 * Inline plan-assignment section of the account form — tier, dates, and caps
 * all live directly in the Modal body (no separate "Assign Plan" popup). The
 * editor mutates form.plan in place; the account's single Save submits the
 * plan along with the rest of the form (assignPlan-on-save wiring lives in the
 * parent hook).
 */
export function AccountPlanFields({ plan, onPlanChange, maxUsersError, onMaxUsersBlur, maxSitesError, onMaxSitesBlur, retentionError, onRetentionBlur, durationError, onDurationBlur }: AccountPlanFieldsProps) {
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Max users</label>
              {/* valueAsNumber yields NaN (not 0) for an emptied field, and the
                  value falls back to "" so the box shows blank instead of a
                  silently-coerced 0 — letting the modal's validation catch it. */}
              <input
                type="number"
                min={1}
                max={TAILORED_CEILINGS.maxUsers}
                value={Number.isFinite(activeSub.maxUsers) ? activeSub.maxUsers : ""}
                disabled={activeSub.tier !== "TAILORED"}
                onChange={(e) => updateSub({ maxUsers: e.target.valueAsNumber })}
                onBlur={onMaxUsersBlur}
                aria-invalid={!!maxUsersError}
                aria-describedby={maxUsersError ? "plan-max-users-error" : undefined}
                className={`input text-[12px] ${maxUsersError ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              />
              {maxUsersError && (
                <p id="plan-max-users-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{maxUsersError}</p>
              )}
            </div>
            <div>
              <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Max sites</label>
              {/* valueAsNumber → NaN (not 0) on empty; blank fallback so an
                  emptied field is caught by validation, not silently coerced. */}
              <input
                type="number"
                min={1}
                max={TAILORED_CEILINGS.maxSites}
                value={Number.isFinite(activeSub.maxSites) ? activeSub.maxSites : ""}
                disabled={activeSub.tier !== "TAILORED"}
                onChange={(e) => updateSub({ maxSites: e.target.valueAsNumber })}
                onBlur={onMaxSitesBlur}
                aria-invalid={!!maxSitesError}
                aria-describedby={maxSitesError ? "plan-max-sites-error" : undefined}
                className={`input text-[12px] ${maxSitesError ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              />
              {maxSitesError && (
                <p id="plan-max-sites-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{maxSitesError}</p>
              )}
            </div>
            <div>
              <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Retention (yr)</label>
              {/* minRetentionYears — a minimum, floor 1 (same as users/sites).
                  valueAsNumber + blank fallback as above. */}
              <input
                type="number"
                min={1}
                max={TAILORED_CEILINGS.minRetentionYears}
                value={Number.isFinite(activeSub.minRetentionYears) ? activeSub.minRetentionYears : ""}
                disabled={activeSub.tier !== "TAILORED"}
                onChange={(e) => updateSub({ minRetentionYears: e.target.valueAsNumber })}
                onBlur={onRetentionBlur}
                aria-invalid={!!retentionError}
                aria-describedby={retentionError ? "plan-retention-error" : undefined}
                className={`input text-[12px] ${retentionError ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              />
              {retentionError && (
                <p id="plan-retention-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{retentionError}</p>
              )}
            </div>
            <div>
              <label className={LABEL} style={{ color: "var(--text-secondary)" }}>Duration (mo)</label>
              {/* Subscription term — tier preset, editable only for TAILORED
                  (same pattern as the caps). Drives the derived expiry above. */}
              <input
                type="number"
                min={1}
                max={TAILORED_CEILINGS.durationMonths}
                value={Number.isFinite(activeSub.durationMonths) ? activeSub.durationMonths : ""}
                disabled={activeSub.tier !== "TAILORED"}
                onChange={(e) => setDurationMonths(e.target.valueAsNumber)}
                onBlur={onDurationBlur}
                aria-invalid={!!durationError}
                aria-describedby={durationError ? "plan-duration-error" : undefined}
                className={`input text-[12px] ${durationError ? "border-[#dc2626] focus:border-[#dc2626]" : ""}`}
              />
              {durationError && (
                <p id="plan-duration-error" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>{durationError}</p>
              )}
            </div>
          </div>
          {activeSub.tier !== "TAILORED" ? (
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Caps are fixed for this tier. Choose Tailored to set custom caps.</p>
          ) : (
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Tailored ceilings: {TAILORED_CEILINGS.maxUsers} users / {TAILORED_CEILINGS.maxSites} sites / {TAILORED_CEILINGS.minRetentionYears}yr / {TAILORED_CEILINGS.durationMonths}mo.</p>
          )}
        </div>
      )}
    </div>
  );
}
