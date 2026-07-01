import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/shared";
import { PLAN_TIERS, TAILORED_CEILINGS } from "@/lib/plans";

/**
 * Read-only catalog of the plan tiers. Values are pulled from
 * PLAN_TIERS / TAILORED_CEILINGS (src/lib/plans.ts) — not hardcoded — because
 * caps are frozen onto each tenant's plan at assignment time and cannot be
 * edited here.
 */
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function PlanCatalogCard() {
  const fixedRows = (Object.keys(PLAN_TIERS) as Array<keyof typeof PLAN_TIERS>).map((k) => ({
    tier: titleCase(k),
    ...PLAN_TIERS[k],
    ceiling: false,
  }));
  const rows = [
    ...fixedRows,
    {
      tier: "Tailored",
      maxUsers: TAILORED_CEILINGS.maxUsers,
      maxSites: TAILORED_CEILINGS.maxSites,
      minRetentionYears: TAILORED_CEILINGS.minRetentionYears,
      ceiling: true,
    },
  ];
  type PlanRow = (typeof rows)[number];

  return (
    <Card
      padding="none"
      header={
        <>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
            <span className="card-title">Plan Catalog</span>
          </div>
          <Badge variant="gray">Fixed tiers — read-only</Badge>
        </>
      }
    >
      <DataTable
        ariaLabel="Plan catalog"
        data={rows}
        rowKey={(r) => r.tier}
        columns={[
          {
            key: "tier",
            header: "Tier",
            render: (r) => (
              <>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{r.tier}</span>
                {r.ceiling && (
                  <span className="text-[10px] ml-2" style={{ color: "var(--text-muted)" }}>(ceiling — caps configurable up to these)</span>
                )}
              </>
            ),
          },
          { key: "maxUsers", header: "Max Users", render: (r) => r.maxUsers },
          { key: "maxSites", header: "Max Sites", render: (r) => r.maxSites },
          { key: "minRetention", header: "Min Retention", render: (r) => <>{r.minRetentionYears} yr</> },
        ] satisfies Column<PlanRow>[]}
      />
      <p className="text-[11px] px-5 py-3" style={{ color: "var(--text-muted)" }}>
        Caps are frozen onto each tenant&apos;s plan at assignment — these tier values come from <span className="font-mono">src/lib/plans.ts</span> and are not editable here.
      </p>
    </Card>
  );
}
