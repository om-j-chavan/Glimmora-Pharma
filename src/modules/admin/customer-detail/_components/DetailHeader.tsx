"use client";

import { Building2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import dayjs from "@/lib/dayjs";
import { planLabel } from "@/lib/plans";
import { planState } from "@/lib/tenantStatus";
import { type Tenant, type PlanConfig } from "@/store/auth.slice";

interface DetailHeaderProps {
  tenant: Tenant;
  plan: PlanConfig | null;
  onEdit: () => void;
}

/**
 * Header: org icon + name + a single identity subline
 * "CODE · TIER · STATUS · created DATE". The subline replaces the old separate
 * tier + status badges (which duplicated facts shown elsewhere on the page).
 */
export function DetailHeader({ tenant, plan, onEdit }: DetailHeaderProps) {
  // Bug 11 — match the Customer Accounts list: derive the subline status from
  // BOTH lifecycle (tenant.active) and subscription (planState), so an
  // expired-but-not-suspended tenant no longer wrongly reads "Active" here
  // while the list shows "Expired". Suspended (lifecycle) takes precedence,
  // then the plan's expiry/absence, else Active — keeping the two distinct.
  const subStatus = planState({ plan: plan ?? null }); // "ok" | "expired" | "none"
  const statusLabel =
    tenant.active === false
      ? "Suspended"
      : subStatus === "expired"
        ? "Expired"
        : subStatus === "none"
          ? "No plan"
          : "Active";

  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center"
          style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}
        >
          <Building2 className="w-7 h-7" style={{ color: "var(--brand)" }} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-[24px] font-bold" style={{ color: "var(--text-primary)" }}>
            {tenant.name}
          </h1>
          <p className="text-[12.5px] mt-1" style={{ color: "var(--text-secondary)" }}>
            <span className="font-mono font-medium">{tenant.customerCode ?? "—"}</span>
            {" · "}{plan ? planLabel(plan.tier, plan.displayName) : "No plan"}
            {" · "}{statusLabel}
            {" · created "}{tenant.createdAt ? dayjs(tenant.createdAt).format("D MMM YYYY") : "—"}
          </p>
        </div>
      </div>
      <Button variant="primary" icon={Pencil} onClick={onEdit}>
        Edit Account
      </Button>
    </div>
  );
}
