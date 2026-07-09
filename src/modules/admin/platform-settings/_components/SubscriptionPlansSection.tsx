import { Layers, Users, MapPin, Archive, CalendarClock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import {
  PLAN_TIERS,
  TAILORED_CEILINGS,
  MIN_TAILORED_RETENTION_YEARS,
  defaultRoleCapsForPlan,
  type PlanTier,
} from "@/lib/plans";
import { CAP_ELIGIBLE_ROLES, roleLabel } from "@/lib/labels/roles";

/**
 * Subscription Plans — READ-ONLY reference (Platform Settings, super_admin).
 *
 * One card per plan (the three fixed Standard tiers + Tailored). All values are
 * DERIVED from src/lib/plans.ts — nothing is hardcoded and there is NO setter on
 * this screen:
 *   • Caps (users / sites / retention / duration) come from PLAN_TIERS
 *     (Tailored → TAILORED_CEILINGS, i.e. the configurable ceilings).
 *   • Per-role limits come from defaultRoleCapsForPlan(maxUsers) — the SAME
 *     function that seeds each plan's PlanRoleLimit rows, so these numbers match
 *     the seeded defaults exactly and always sum to the plan total (the
 *     sum(caps) == maxUsers invariant). Concrete integers only — no ∞.
 *   • Role names use the shared roleLabel(); the supported-role count is
 *     CAP_ELIGIBLE_ROLES.length.
 *
 * "Plan Features" and "Current Status": neither the Plan model (prisma) nor
 * PLAN_TIERS carries a features list or a per-tier status field — so features are
 * presented as the plan's capability/capacity summary, and status is the
 * tier-catalog fact "Available" (a tier is always offerable; the active/expired
 * SUBSCRIPTION status is a per-TENANT concept, shown on each tenant, not here).
 */

const SUPPORTED_ROLES = CAP_ELIGIBLE_ROLES.length;
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

interface PlanView {
  key: string;
  name: string;
  type: "Standard" | "Tailored";
  totalUsers: string;
  totalSites: string;
  retention: string;
  duration: string;
  /** Concrete per-role caps for the fixed tiers; null for Tailored (per-tenant). */
  roleCaps: { role: string; cap: number }[] | null;
  /** Sum of the role caps (== total users) for fixed tiers. */
  roleTotal: number | null;
}

function buildPlans(): PlanView[] {
  const fixed = (Object.keys(PLAN_TIERS) as Array<Exclude<PlanTier, "TAILORED">>).map((tier) => {
    const t = PLAN_TIERS[tier];
    const caps = defaultRoleCapsForPlan(t.maxUsers); // seeded defaults; sums to maxUsers
    return {
      key: tier,
      name: titleCase(tier),
      type: "Standard" as const,
      totalUsers: String(t.maxUsers),
      totalSites: String(t.maxSites),
      retention: plural(t.minRetentionYears, "year"),
      duration: plural(t.durationMonths, "month"),
      roleCaps: CAP_ELIGIBLE_ROLES.map((role) => ({ role, cap: caps[role] ?? 0 })),
      roleTotal: t.maxUsers,
    };
  });

  const tailored: PlanView = {
    key: "TAILORED",
    name: "Tailored",
    type: "Tailored",
    totalUsers: `Custom · up to ${TAILORED_CEILINGS.maxUsers}`,
    totalSites: `Custom · up to ${TAILORED_CEILINGS.maxSites}`,
    retention: `${MIN_TAILORED_RETENTION_YEARS}–${TAILORED_CEILINGS.minRetentionYears} years (custom)`,
    duration: `1–${TAILORED_CEILINGS.durationMonths} months (custom)`,
    roleCaps: null,
    roleTotal: null,
  };

  return [...fixed, tailored];
}

/** A labelled stat cell (icon + label + value) used in the per-plan grid. */
function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</p>
      </div>
      <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function PlanCard({ plan }: { plan: PlanView }) {
  return (
    <Card
      header={
        <>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">{plan.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={plan.type === "Tailored" ? "amber" : "gray"}>{plan.type}</Badge>
            <Badge variant="green">Available</Badge>
          </div>
        </>
      }
    >
      {/* Capacity summary — doubles as the plan's "features" (no dedicated
          features field exists on the Plan model / PLAN_TIERS). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <Stat icon={Users} label="Total Users" value={plan.totalUsers} />
        <Stat icon={MapPin} label="Total Sites" value={plan.totalSites} />
        <Stat icon={ShieldCheck} label="Supported Roles" value={String(SUPPORTED_ROLES)} />
        <Stat icon={Archive} label="Data Retention" value={plan.retention} />
        <Stat icon={CalendarClock} label="Duration" value={plan.duration} />
      </div>

      {/* Role Limits — per-role caps. Fixed tiers show concrete seeded defaults
          (sum == total); Tailored is configured per tenant at assignment. */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Role Limits</p>
          {plan.roleTotal !== null && (
            <p className="text-[11px]" style={{ color: "var(--success)" }}>
              Allocated <span className="font-semibold tabular-nums">{plan.roleTotal}</span> / {plan.roleTotal} &middot; fully allocated
            </p>
          )}
        </div>

        {plan.roleCaps ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {plan.roleCaps.map((r) => (
              <div
                key={r.role}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}
              >
                <span className="text-[11.5px] min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>{roleLabel(r.role)}</span>
                <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{r.cap}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] rounded-lg px-3 py-2.5" style={{ color: "var(--text-secondary)", background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
            Per-role caps are configured for each tenant at assignment (up to the plan total), across the same {SUPPORTED_ROLES} supported roles. Defaults distribute the chosen total across those roles.
          </p>
        )}
      </div>
    </Card>
  );
}

export function SubscriptionPlansSection() {
  const plans = buildPlans();
  return (
    <section aria-labelledby="subscription-plans-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
          <h2 id="subscription-plans-heading" className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Subscription Plans</h2>
        </div>
        <Badge variant="gray">Reference — read-only</Badge>
      </div>
      <p className="text-[12px] -mt-1" style={{ color: "var(--text-muted)" }}>
        All plans and their configuration. Caps are frozen onto each tenant&apos;s plan at assignment; these values come from{" "}
        <span className="font-mono">src/lib/plans.ts</span> and cannot be edited here.
      </p>

      {plans.map((plan) => (
        <PlanCard key={plan.key} plan={plan} />
      ))}
    </section>
  );
}
