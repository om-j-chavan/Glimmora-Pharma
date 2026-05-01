import { useAppSelector } from "./useAppSelector";
import { useTenantConfig } from "./useTenantConfig";
import type { GxPSystem, RoadmapActivity } from "@/types/csv-csa";
import type { FDA483Event } from "@/types/fda483";
import type { DriftAlert, DriftMetric } from "@/types/agi";

export function useTenantData() {
  const tenantId = useAppSelector((s) => s.auth.currentTenant);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { sites: accessibleSites } = useTenantConfig();
  const accessibleSiteIds = accessibleSites.map((s) => s.id);

  const findings = useAppSelector((s) =>
    (s.findings?.items ?? []).filter((f) => {
      if (f.tenantId && f.tenantId !== tenantId) return false;
      if (f.siteId && !accessibleSiteIds.includes(f.siteId)) return false;
      if (selectedSiteId && f.siteId !== selectedSiteId) return false;
      return true;
    }),
  );

  const capas = useAppSelector((s) =>
    (s.capa?.items ?? []).filter((c) => {
      if (c.tenantId && c.tenantId !== tenantId) return false;
      if (c.siteId && !accessibleSiteIds.includes(c.siteId)) return false;
      if (selectedSiteId && c.siteId !== selectedSiteId) return false;
      return true;
    }),
  );

  // The systems / roadmap / fda483 / agiDrift slices were deleted in the
  // server-first migration. /csv-csa, /fda-483, etc. each fetch their own
  // Prisma data server-side now. We return empty arrays here typed as the
  // real entity types so consumers (Dashboard, Governance, AGI, Evidence,
  // useNotificationEngine) type-check correctly even though the data is
  // empty. Wiring those consumers to server-fetched props is a separate
  // (deferred) project — until then their UIs render zero values.
  const systems: GxPSystem[] = [];
  const roadmap: RoadmapActivity[] = [];
  const fda483Events: FDA483Event[] = [];

  const deviations = useAppSelector((s) =>
    (s.deviation?.items ?? []).filter((d) => {
      if (d.tenantId && d.tenantId !== tenantId) return false;
      if (d.siteId && !accessibleSiteIds.includes(d.siteId)) return false;
      if (selectedSiteId && d.siteId !== selectedSiteId) return false;
      return true;
    }),
  );

  const evidenceDocs = useAppSelector((s) =>
    (s.evidence?.documents ?? []).filter((d) => {
      if (d.tenantId && d.tenantId !== tenantId) return false;
      if (d.siteId && !accessibleSiteIds.includes(d.siteId)) return false;
      if (selectedSiteId && d.siteId && d.siteId !== selectedSiteId) return false;
      return true;
    }),
  );

  const evidencePacks = useAppSelector((s) => (s.evidence?.packs ?? []).filter((p) => !p.tenantId || p.tenantId === tenantId));

  const raidItems = useAppSelector((s) =>
    (s.raid?.items ?? []).filter((r) => {
      if (r.tenantId && r.tenantId !== tenantId) return false;
      if (r.siteId && !accessibleSiteIds.includes(r.siteId)) return false;
      if (selectedSiteId && r.siteId !== selectedSiteId) return false;
      return true;
    }),
  );

  // Same migration story as above — typed as the real entities so consumers
  // type-check; AGI Console derives drift signals server-side from AuditLog.
  const driftAlerts: DriftAlert[] = [];
  const driftMetrics: DriftMetric[] = [];

  return {
    tenantId: tenantId ?? "",
    findings,
    capas,
    systems,
    roadmap,
    fda483Events,
    deviations,
    evidenceDocs,
    evidencePacks,
    raidItems,
    driftAlerts,
    driftMetrics,
  };
}
