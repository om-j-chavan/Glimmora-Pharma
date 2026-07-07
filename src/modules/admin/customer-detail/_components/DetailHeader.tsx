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
  /** When provided (super admin only), the logo avatar becomes a button that
   *  opens the crop-and-upload modal. Omit to render a static avatar. */
  onEditLogo?: () => void;
}

/**
 * Header: org icon + name + a single identity subline
 * "CODE · TIER · STATUS · created DATE". The subline replaces the old separate
 * tier + status badges (which duplicated facts shown elsewhere on the page).
 */
export function DetailHeader({ tenant, plan, onEdit, onEditLogo }: DetailHeaderProps) {
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
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-4">
        {/* Logo is a PREVIEW, not a click-to-upload target. Editing is triggered
            only from the explicit pencil affordance (super admin). */}
        <div className="relative w-14 h-14 shrink-0">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden"
            style={{ background: "var(--brand-muted)", border: "1px solid var(--brand-border)" }}
          >
            {tenant.logoUrl ? (
              <img src={tenant.logoUrl} alt={`${tenant.name} logo`} className="w-full h-full object-cover" />
            ) : (
              <Building2 className="w-7 h-7" style={{ color: "var(--brand)" }} aria-hidden="true" />
            )}
          </div>
          {onEditLogo && (
            <button
              type="button"
              onClick={onEditLogo}
              aria-label="Edit logo"
              title="Edit logo"
              className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center border cursor-pointer shadow-sm"
              style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)", color: "var(--brand)" }}
            >
              <Pencil className="w-3 h-3" aria-hidden="true" />
            </button>
          )}
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
