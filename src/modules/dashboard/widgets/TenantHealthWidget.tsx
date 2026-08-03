"use client";

/**
 * Tenant health — Customer Admin.
 *
 * The organisation view the role actually owns: seat and site utilisation against
 * the licensed caps, licence term, and module adoption measured as REAL RECORD
 * COUNTS per module. "Adoption" here is not a telemetry estimate — it is how many
 * findings, deviations, CAPAs, systems, inspection events and inspections the tenant
 * has, which is the only adoption signal the schema can evidence.
 *
 * Every row links only where the viewer may go: the module list is filtered by
 * `canOpen`, so a revoked module still reports its count but is not clickable.
 */

import { memo } from "react";
import { Building2, Users } from "lucide-react";
import { READINESS_COLORS } from "@/lib/kpi";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { ListRow, MetricRow, ProportionBar } from "./primitives";
import type { LinkModule } from "../config/derive";
import type { DashboardWidgetProps } from "./types";

/** Module key in the adoption list → the permission module that gates its route. */
const ADOPTION_MODULE: Record<string, LinkModule | undefined> = {
  gap: "gap",
  deviation: "deviation",
  capa: "capa",
  csv: "csv",
  fda483: "fda483",
  readiness: "readiness",
};

export const TenantHealthWidget = memo(function TenantHealthWidget({
  data, canOpen,
}: DashboardWidgetProps) {
  const t = data.tenant;
  const maxRecords = Math.max(...t.moduleAdoption.map((m) => m.records), 1);

  const licenceBadge = t.licenceExpired
    ? <Badge variant="red">Expired</Badge>
    : t.licenceDaysRemaining !== null && t.licenceDaysRemaining <= 14
      ? <Badge variant="amber">{t.licenceDaysRemaining}d left</Badge>
      : t.planName
        ? <Badge variant="green">{t.planName}</Badge>
        : <Badge variant="gray">No plan</Badge>;

  return (
    <CardSection icon={Building2} iconColor="#0ea5e9" title="Tenant health" badge={licenceBadge}>
      {/* ── Capacity ── */}
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
        Licence capacity
      </p>
      {t.seatsTotal > 0 ? (
        <ProportionBar
          label={`User seats · ${t.seatsUsed} of ${t.seatsTotal}`}
          value={t.seatsUsed}
          max={t.seatsTotal}
          color={t.seatUtilisation !== null && t.seatUtilisation >= 90 ? READINESS_COLORS.risk : READINESS_COLORS.ready}
        />
      ) : (
        <p className="text-[11px] italic mb-2" style={{ color: "var(--text-muted)" }}>
          No plan assigned — seat capacity is not enforced.
        </p>
      )}
      {t.siteCapacity > 0 && (
        <ProportionBar
          label={`Sites · ${t.activeSites} of ${t.siteCapacity}`}
          value={t.activeSites}
          max={t.siteCapacity}
          color={READINESS_COLORS.ready}
        />
      )}

      {/* ── People ── */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            User accounts
          </p>
        </div>
        <MetricRow label="Active" value={t.activeUsers} valueColor={READINESS_COLORS.ready} />
        <MetricRow
          label="Inactive"
          value={t.inactiveUsers}
          valueColor={t.inactiveUsers > 0 ? READINESS_COLORS.watch : READINESS_COLORS.none}
          detail={t.inactiveUsers > 0 ? "still consuming licensed seats" : undefined}
        />
      </div>

      {/* ── Adoption ── */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
          Module usage · {t.modulesInUse} of {t.moduleAdoption.length} in use
        </p>
        <div className="space-y-0.5">
          {t.moduleAdoption.map((m) => {
            const gate = ADOPTION_MODULE[m.module];
            const openable = m.records > 0 && (!gate || canOpen(gate));
            return (
              <ListRow
                key={m.module}
                title={m.label}
                meta={
                  <span>
                    {m.records === 0 ? "no records yet" : `${m.records} record${m.records === 1 ? "" : "s"}`}
                  </span>
                }
                href={openable ? m.href : null}
                badge={
                  <span className="w-16 shrink-0" aria-hidden="true">
                    <span className="block h-1 rounded-full mt-2" style={{ background: "var(--bg-border)" }}>
                      <span
                        className="block h-1 rounded-full"
                        style={{
                          width: `${Math.round((m.records / maxRecords) * 100)}%`,
                          background: m.records === 0 ? READINESS_COLORS.none : "#0ea5e9",
                        }}
                      />
                    </span>
                  </span>
                }
              />
            );
          })}
        </div>
      </div>
    </CardSection>
  );
});
