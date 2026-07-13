"use client";

import { useEffect, useState } from "react";
import { CreditCard, Users, MapPin, Archive, Info, ShieldCheck } from "lucide-react";
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
    accountsRemaining,
    isAtAccountLimit,
    usedSites,
    maxSites,
    sitesRemaining,
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
      {/* 1. Plan summary */}
      <Card
        header={
          <>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="card-title">Plan</span>
            </div>
            <Badge variant={status.variant}>{status.text}</Badge>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Tier</p>
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{label}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Term</p>
            <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              {dayjs.utc(plan.startDate).format("DD MMM YYYY")} &ndash; {dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Duration</p>
            <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
              {plan.durationMonths} month{plan.durationMonths === 1 ? "" : "s"}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
              {state === "expired" ? "Expired" : "Expires"}
            </p>
            <p className="text-[13px] font-medium" style={{ color: state === "expired" ? "var(--danger)" : "var(--text-primary)" }}>
              {state === "expired"
                ? `on ${dayjs.utc(plan.expiryDate).format("DD MMM YYYY")}`
                : daysRemaining !== null
                  ? `in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
                  : "—"}
            </p>
          </div>
        </div>
      </Card>

      {/* Capacity — explicit Total / Current / Remaining for users and sites
          (item 3), read-only. Numbers come from useTenantConfig (the same source
          the meters below use), so they always agree with the usage bars. */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Capacity</span>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: Users, label: "Users", total: maxUsers, current: usedAccounts, remaining: accountsRemaining, atLimit: isAtAccountLimit },
            { icon: MapPin, label: "Sites", total: maxSites, current: usedSites, remaining: sitesRemaining, atLimit: isAtSiteLimit },
          ].map((row) => (
            <div key={row.label} className="rounded-lg p-3" style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
              <div className="flex items-center gap-1.5 mb-2">
                <row.icon className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{row.label}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[16px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{row.total}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Total</p>
                </div>
                <div>
                  <p className="text-[16px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{row.current}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Current</p>
                </div>
                <div>
                  <p className="text-[16px] font-bold tabular-nums" style={{ color: row.atLimit ? "var(--danger)" : "var(--success)" }}>{row.remaining}</p>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Remaining</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 2. Usage vs caps — the "why am I blocked" answer, made visible */}
      <div className="space-y-3">
        <PlanLimitUsageBar icon={Users} label="Users" count={usedAccounts} limit={maxUsers} plan={label} atLimit={isAtAccountLimit} nearLimit={userNear} />
        <PlanLimitUsageBar icon={MapPin} label="Sites" count={usedSites} limit={maxSites} plan={label} atLimit={isAtSiteLimit} nearLimit={siteNear} />
      </div>

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

      {/* 3. Retention — read-only / informational */}
      <Card
        header={
          <div className="flex items-center gap-2">
            <Archive className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Retention</span>
          </div>
        }
      >
        <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
          Minimum retention: <strong>{plan.minRetentionYears} year{plan.minRetentionYears === 1 ? "" : "s"}</strong>
        </p>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
          Records and audit history are retained for at least this period under your plan. Retention is fixed for your tier and managed by the platform administrator.
        </p>
      </Card>
    </div>
  );
}
