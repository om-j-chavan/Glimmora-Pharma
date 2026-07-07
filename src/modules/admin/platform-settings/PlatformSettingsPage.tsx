"use client";

import { ShieldCheck, Archive } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { PlanCatalogCard } from "./_components/PlanCatalogCard";

/**
 * Platform Settings — read-mostly super_admin screen.
 *   1. Plan Catalog (read-only tier table, extracted)
 *   2. MFA Default (no platform-wide setting exists yet → disabled, explained)
 *   3. Retention Policy (static, informational)
 * Cards 2 & 3 are small, so they stay inline (don't over-split).
 */
// Hidden for now — no platform-wide MFA default is wired yet, so the card is
// suppressed (code kept intact). Flip to true to bring it back once a backing
// setting exists.
const SHOW_MFA_DEFAULT_CARD = false;

export function PlatformSettingsPage() {
  return (
    <div className="w-full max-w-[1000px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-bold" style={{ color: "var(--text-primary)" }}>Platform Settings</h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
          Platform-wide configuration for the admin console
        </p>
      </div>

      <div className="space-y-6">
        {/* 1. Plan Catalog */}
        <PlanCatalogCard />

        {/* 2. MFA Default — no backing platform setting yet (Phase 2). Hidden
            for now (SHOW_MFA_DEFAULT_CARD); code retained for when it's wired. */}
        {SHOW_MFA_DEFAULT_CARD && (
        <Card
          header={
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="card-title">MFA Default</span>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                New tenants default MFA: <strong>Off</strong>
              </p>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                Per-tenant override is always allowed (set MFA on the tenant&apos;s Edit screen). A
                platform-wide default for new tenants is not yet wired — this toggle is read-only
                until a platform-wide default is added.
              </p>
            </div>
            <Toggle id="mfa-default" label="New-tenant MFA default" hideLabel checked={false} onChange={() => {}} disabled />
          </div>
        </Card>
        )}

        {/* 3. Retention Policy — static / informational. */}
        <Card
          header={
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <span className="card-title">Retention Policy</span>
            </div>
          }
        >
          <ul className="space-y-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            <li>• Each plan carries a <strong style={{ color: "var(--text-primary)" }}>minimum retention</strong> (Essentials 1yr, Professional 3yr, Enterprise 7yr, Tailored up to 10yr), frozen onto the tenant&apos;s plan at assignment.</li>
            <li>• Retention is a <strong style={{ color: "var(--text-primary)" }}>promise not to delete</strong> before the minimum — there is <strong style={{ color: "var(--text-primary)" }}>no purge before Phase 4</strong>.</li>
            <li>• Accounts are never hard-deleted from the console — the destructive action is <strong style={{ color: "var(--text-primary)" }}>Suspend</strong> (lifecycle), which preserves all data.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
