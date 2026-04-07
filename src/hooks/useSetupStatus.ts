import { useTenantConfig } from "./useTenantConfig";
import { useAppSelector } from "./useAppSelector";

export function useSetupStatus() {
  const { sites, users } = useTenantConfig();
  const frameworks = useAppSelector((s) => s.settings.frameworks);
  const findings = useAppSelector((s) => s.findings.items);

  const steps = [
    {
      key: "sites",
      done: sites.length > 0,
      label: "Add at least one site",
      desc: "Sites track compliance by location",
      action: "Settings \u2192 Sites",
      link: "/settings",
      tab: "sites",
    },
    {
      key: "users",
      done: users.length > 0,
      label: "Add team members",
      desc: "Users needed to assign findings and CAPAs",
      action: "Settings \u2192 Users",
      link: "/settings",
      tab: "users",
    },
    {
      key: "frameworks",
      done: Object.values(frameworks).some((v) => v === true),
      label: "Enable compliance frameworks",
      desc: "Part 11, Annex 11, GAMP 5 etc.",
      action: "Settings \u2192 Frameworks",
      link: "/settings",
      tab: "frameworks",
    },
    {
      key: "findings",
      done: findings.length > 0,
      label: "Log your first finding",
      desc: "Start tracking GxP compliance gaps",
      action: "Gap Assessment",
      link: "/gap-assessment",
      tab: null,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const isComplete = completedCount === steps.length;
  const setupNeeded = !isComplete;
  const hasSites = sites.length > 0;
  const hasUsers = users.length > 0;

  return {
    steps,
    completedCount,
    totalSteps: steps.length,
    isComplete,
    setupNeeded,
    hasSites,
    hasUsers,
    progressPct: Math.round((completedCount / steps.length) * 100),
  };
}
