"use client";

/**
 * 90-day action plan.
 *
 * Wraps the existing `ActionPlanTable` (unchanged) around the now-pure, memoised
 * `buildActionPlan`. Rows come exclusively from visibility-scoped arrays, and CAPA
 * rows appear only for a CAPA-module role — the same rule the old page applied, now
 * driven by the resolved access context rather than a prop.
 */

import { memo, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ClipboardList } from "lucide-react";
import { CardSection } from "@/components/shared";
import { Badge } from "@/components/ui/Badge";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { useTenantData } from "@/hooks/useTenantData";
import { displayUserName } from "@/lib/identity-display";
import { ActionPlanTable } from "../ActionPlanTable";
import { buildActionPlan, type CommitmentLike } from "../config/derive";
import { WidgetEmpty } from "./primitives";
import type { DashboardWidgetProps } from "./types";

export const ActionPlanWidget = memo(function ActionPlanWidget({
  data, dashboard, access, canOpen,
}: DashboardWidgetProps) {
  const router = useRouter();
  const { users } = useTenantConfig();
  // The CSV roadmap slice (still [] post server-first migration, so this contributes
  // nothing today — read here rather than dropped so the plan lights up unchanged if
  // that slice is ever re-seeded).
  const { roadmap } = useTenantData();

  // 483 commitments the viewer may act on. Gated on the fda483 module because a
  // commitment row names a real event and links to /fda-483.
  const commitments = useMemo<CommitmentLike[]>(() => {
    if (!canOpen("fda483")) return [];
    return data.fda483.flatMap((e) =>
      e.commitments.map((c, i) => {
        const row = c as typeof c & { id?: string; description?: string; owner?: string | null };
        return {
          id: row.id ?? `${e.id ?? "evt"}-cmt-${i}`,
          description: row.description ?? "483 commitment",
          owner: row.owner ?? null,
          status: c.status,
          dueDate: c.dueDate ?? null,
          eventReference: e.referenceNumber ?? null,
        };
      }),
    );
  }, [data.fda483, canOpen]);

  const items = useMemo(
    () => buildActionPlan({
      findings: data.visibleFindings,
      capas: data.visibleCAPAs,
      systems: data.visibleSystems,
      roadmap,
      commitments,
      includeCAPAs: access.canViewCAPAModule,
      focusArea: dashboard.focusArea,
      now: data.now,
    }),
    [
      data.visibleFindings, data.visibleCAPAs, data.visibleSystems, data.now,
      roadmap, commitments, access.canViewCAPAModule, dashboard.focusArea,
    ],
  );

  return (
    <CardSection
      icon={Calendar}
      iconColor="#f59e0b"
      title="90-day action plan"
      badge={items.length > 0 ? <Badge variant="amber">{items.length}</Badge> : undefined}
    >
      {items.length === 0 ? (
        <WidgetEmpty
          icon={ClipboardList}
          message="No open actions"
          hint={dashboard.focusArea ? `Nothing outstanding in ${dashboard.focusArea}.` : "Nothing outstanding in the next 90 days."}
          action={canOpen("gap") ? { label: "Log a finding", href: "/gap-assessment" } : undefined}
        />
      ) : (
        <ActionPlanTable
          items={items}
          ownerName={(id) => displayUserName(id, users)}
          timezone={data.timezone}
          dateFormat={data.dateFormat}
          router={router}
        />
      )}
    </CardSection>
  );
});
