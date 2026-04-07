import { useAppSelector } from "./useAppSelector";
import { useTenantConfig } from "./useTenantConfig";

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

  const capas = useAppSelector((s) => (s.capa?.items ?? []).filter((c) => !c.tenantId || c.tenantId === tenantId));

  const systems = useAppSelector((s) =>
    (s.systems?.items ?? []).filter((sys) => {
      if (sys.tenantId && sys.tenantId !== tenantId) return false;
      if (sys.siteId && !accessibleSiteIds.includes(sys.siteId)) return false;
      if (selectedSiteId && sys.siteId !== selectedSiteId) return false;
      return true;
    }),
  );

  const roadmap = useAppSelector((s) => (s.systems?.roadmap ?? []).filter((r) => !r.tenantId || r.tenantId === tenantId));

  const fda483Events = useAppSelector((s) =>
    (s.fda483?.items ?? []).filter((e) => {
      if (e.tenantId && e.tenantId !== tenantId) return false;
      if (e.siteId && !accessibleSiteIds.includes(e.siteId)) return false;
      if (selectedSiteId && e.siteId !== selectedSiteId) return false;
      return true;
    }),
  );

  const evidenceDocs = useAppSelector((s) => (s.evidence?.documents ?? []).filter((d) => !d.tenantId || d.tenantId === tenantId));
  const evidencePacks = useAppSelector((s) => (s.evidence?.packs ?? []).filter((p) => !p.tenantId || p.tenantId === tenantId));
  const raidItems = useAppSelector((s) => (s.raid?.items ?? []).filter((r) => !r.tenantId || r.tenantId === tenantId));
  const driftAlerts = useAppSelector((s) => (s.agiDrift?.alerts ?? []).filter((a) => !a.tenantId || a.tenantId === tenantId));
  const driftMetrics = useAppSelector((s) => s.agiDrift?.metrics ?? []);

  return {
    tenantId: tenantId ?? "",
    findings,
    capas,
    systems,
    roadmap,
    fda483Events,
    evidenceDocs,
    evidencePacks,
    raidItems,
    driftAlerts,
    driftMetrics,
  };
}
