"use client";

import { useEffect, useState } from "react";
import { CreditCard, Users, MapPin, Info, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlanLimitUsageBar } from "@/components/shared";
import { RoleMatrixTable } from "@/components/shared/RoleMatrixTable";
import { getMyRoleMatrix } from "@/actions/roleLimits";
import type { RoleMatrixSummary } from "@/lib/roleLimits";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { planLabel } from "@/lib/plans";
import { planState } from "@/lib/tenantStatus";
import { errorCodeLabel } from "@/lib/labels/errorCodes";
import dayjs from "@/lib/dayjs";

/**
 * Read-only subscription view for customer_admin (Settings → Subscription).
 *
 * Shows the tenant's OWN plan, caps, live usage, and expiry so they can see
 * why cap blocks happen — WITHOUT any control to change tier / caps / dates /
 * MFA. The bright line: customer_admin sees their plan but does not control it
 * (that's super_admin only). Data comes from useTenantConfig(), which is
 * scoped to the current user's tenant — there is no tenant picker and no
 * mutation path here.
 */
export function SubscriptionTab() {
  const {
    tenantName,
    plan,
    usedAccounts,
    maxUsers,
    isAtAccountLimit,
    usedSites,
    maxSites,
    isAtSiteLimit,
    daysRemaining,
  } = useTenantConfig();

  // READ-ONLY role matrix for the CA's OWN tenant. getMyRoleMatrix is scoped to
  // the session tenant and exposes no write — no config control is rendered here.
  // Hook runs before the early `if (!plan)` return (Rules of Hooks).
  const [roleMatrix, setRoleMatrix] = useState<RoleMatrixSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getMyRoleMatrix();
      if (!cancelled && res.success) setRoleMatrix(res.data);
    })();
    return () => { cancelled = true; };
  }, []);

  // No plan → minimal informational card (no controls).
  if (!plan) {
    return (
      <div className="w-full">
        <Card
          header={
            <>
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
                <span className="card-title">Subscription</span>
              </div>
              <Badge variant="gray">No plan</Badge>
            </>
          }
        >
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              No subscription plan is assigned to <strong style={{ color: "var(--text-primary)" }}>{tenantName}</strong> yet.
              Contact your platform administrator to have one assigned.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const state = planState({ plan }); // "ok" | "expired" | "none"
  const status: { variant: "green" | "red" | "gray"; text: string } =
    state === "ok" ? { variant: "green", text: "Active" } :
    state === "expired" ? { variant: "red", text: "Expired" } :
    { variant: "gray", text: "No plan" };

  const userNear = maxUsers > 0 && usedAccounts / maxUsers >= 0.8;
  const siteNear = maxSites > 0 && usedSites / maxSites >= 0.8;
  const label = planLabel(plan.tier, plan.displayName);

  return (
    <div className="w-full space-y-5">
      {/* 1. Plan details — single horizontal row that stacks below `sm`.
          Cost / interval is intentionally omitted: PlanConfig carries no
          price/billing field, and the spec says not to render a placeholder. */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Plan</span>
          </div>
        }
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Plan name */}
          <p className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>{label}</p>
          {/* Plan type */}
          <Badge variant="blue">{plan.tier}</Badge>
          {/* Renewal date (pushed right on wide screens) */}
          <div className="sm:ml-auto text-left sm:text-right">
            <p className="text-[11px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>
              {state === "expired" ? "Expired" : "Renews"}
            </p>
            <p className="text-[13px] font-medium" style={{ color: state === "expired" ? "var(--danger)" : "var(--text-primary)" }}>
              {dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}
              {state !== "expired" && daysRemaining !== null ? ` · in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          {/* Status pill */}
          <Badge variant={status.variant}>{status.text}</Badge>
        </div>
      </Card>

      {/* Capacity — consolidated. Quota resources (Users, Sites) show used/limit
          + a progress bar via the shared PlanLimitUsageBar; Retention and Expiry
          are value-only rows (no bar). Storage is intentionally omitted — the
          data model tracks no storage quota (do not add a placeholder). */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Capacity</span>
          </div>
        }
      >
        <div className="space-y-4">
          <PlanLimitUsageBar icon={Users} label="Users" count={usedAccounts} limit={maxUsers} plan={label} atLimit={isAtAccountLimit} nearLimit={userNear} />
          <PlanLimitUsageBar icon={MapPin} label="Sites" count={usedSites} limit={maxSites} plan={label} atLimit={isAtSiteLimit} nearLimit={siteNear} />
          {/* Retention — value only (fixed per tier, no quota bar) */}
          <div className="flex items-center justify-between pt-3 border-t border-(--bg-border)">
            <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>Retention</span>
            <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {plan.minRetentionYears} year{plan.minRetentionYears === 1 ? "" : "s"}
            </span>
          </div>
          {/* Expiry — value only */}
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>Expiry</span>
            <span className="text-[13px]" style={{ color: state === "expired" ? "var(--danger)" : "var(--text-secondary)" }}>
              {dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}
            </span>
          </div>
        </div>
      </Card>

      {/* Per-role limits — READ-ONLY (item 3). LIMIT / USED / REMAINING from the
          resolver (getMyRoleMatrix). No edit controls; caps are SA-managed. Shown
          only when at least one role is capped (else the total-only view above
          already tells the whole story). */}
      {roleMatrix && roleMatrix.rows.some((r) => r.cap !== "unlimited") && (
        <Card
          header={
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="card-title">Users by role</span>
            </div>
          }
        >
          <RoleMatrixTable rows={roleMatrix.rows} variant="usage" />
          <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
            Per-role limits are managed by the platform administrator.
          </p>
        </Card>
      )}

      {/* 4. At/over-cap helper — informational only (no upgrade button) */}
      {(isAtAccountLimit || isAtSiteLimit) && (
        <div className="rounded-2xl p-4 space-y-2" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
          {isAtAccountLimit && (
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden="true" />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {errorCodeLabel("PLAN_CAP_EXCEEDED")}. Contact your platform administrator to increase it.
              </p>
            </div>
          )}
          {isAtSiteLimit && (
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} aria-hidden="true" />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {errorCodeLabel("SITE_CAP_EXCEEDED")}. Contact your platform administrator to increase it.
              </p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
