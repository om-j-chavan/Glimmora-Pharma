import { useMemo } from "react";
import { useAppSelector } from "./useAppSelector";
import { useTenantConfig } from "./useTenantConfig";
import type { Finding } from "@/store/findings.slice";
import type { CAPA } from "@/store/capa.slice";
import type { Deviation } from "@/store/deviation.slice";
import type { EvidenceDocument, EvidencePack } from "@/store/evidence.slice";
import type { RAIDItem } from "@/store/raid.slice";
import type { GxPSystem, RoadmapActivity } from "@/types/csv-csa";
import type { FDA483Event } from "@/types/fda483";
import type { DriftAlert, DriftMetric } from "@/types/agi";

// Module-scoped empty fallbacks. Each useAppSelector below uses one of these
// instead of an inline `?? []`, so the selector returns the same reference
// on every call when the slice is undefined or empty. Without this, every
// dispatch elsewhere in the store causes Redux's referential equality check
// to fail and re-renders the consuming component (and triggers the
// "Selector returned a different result" dev warning).
const EMPTY_FINDINGS: Finding[] = [];
const EMPTY_CAPAS: CAPA[] = [];
const EMPTY_DEVIATIONS: Deviation[] = [];
const EMPTY_SYSTEMS: GxPSystem[] = [];
const EMPTY_EVIDENCE_DOCS: EvidenceDocument[] = [];
const EMPTY_EVIDENCE_PACKS: EvidencePack[] = [];
const EMPTY_RAID: RAIDItem[] = [];

export function useTenantData() {
  const tenantId = useAppSelector((s) => s.auth.currentTenant);
  const selectedSiteId = useAppSelector((s) => s.auth.selectedSiteId);
  const { sites: accessibleSites } = useTenantConfig();

  // Stable raw selectors — return the slice array directly (or a shared
  // empty constant). The tenant/site filtering happens in useMemo below so
  // the selector itself returns a referentially stable value.
  const findingsRaw = useAppSelector((s) => s.findings?.items ?? EMPTY_FINDINGS);
  const capasRaw = useAppSelector((s) => s.capa?.items ?? EMPTY_CAPAS);
  const deviationsRaw = useAppSelector((s) => s.deviation?.items ?? EMPTY_DEVIATIONS);
  const systemsRaw = useAppSelector((s) => s.systems?.items ?? EMPTY_SYSTEMS);
  const evidenceDocsRaw = useAppSelector((s) => s.evidence?.documents ?? EMPTY_EVIDENCE_DOCS);
  const evidencePacksRaw = useAppSelector((s) => s.evidence?.packs ?? EMPTY_EVIDENCE_PACKS);
  const raidItemsRaw = useAppSelector((s) => s.raid?.items ?? EMPTY_RAID);

  const accessibleSiteIds = useMemo(
    () => accessibleSites.map((s) => s.id),
    [accessibleSites],
  );

  const findings = useMemo(
    () =>
      findingsRaw.filter((f) => {
        if (f.tenantId && f.tenantId !== tenantId) return false;
        if (f.siteId && !accessibleSiteIds.includes(f.siteId)) return false;
        if (selectedSiteId && f.siteId !== selectedSiteId) return false;
        return true;
      }),
    [findingsRaw, tenantId, selectedSiteId, accessibleSiteIds],
  );

  const capas = useMemo(
    () =>
      capasRaw.filter((c) => {
        if (c.tenantId && c.tenantId !== tenantId) return false;
        if (c.siteId && !accessibleSiteIds.includes(c.siteId)) return false;
        if (selectedSiteId && c.siteId !== selectedSiteId) return false;
        return true;
      }),
    [capasRaw, tenantId, selectedSiteId, accessibleSiteIds],
  );

  const deviations = useMemo(
    () =>
      deviationsRaw.filter((d) => {
        if (d.tenantId && d.tenantId !== tenantId) return false;
        if (d.siteId && !accessibleSiteIds.includes(d.siteId)) return false;
        if (selectedSiteId && d.siteId !== selectedSiteId) return false;
        return true;
      }),
    [deviationsRaw, tenantId, selectedSiteId, accessibleSiteIds],
  );

  // Seeded by the dashboard (and any future server-first consumer); filtered
  // by tenant + accessible/selected site, mirroring findings/capas/deviations.
  const systems = useMemo(
    () =>
      systemsRaw.filter((s) => {
        if (s.tenantId && s.tenantId !== tenantId) return false;
        if (s.siteId && !accessibleSiteIds.includes(s.siteId)) return false;
        if (selectedSiteId && s.siteId !== selectedSiteId) return false;
        return true;
      }),
    [systemsRaw, tenantId, selectedSiteId, accessibleSiteIds],
  );

  const evidenceDocs = useMemo(
    () =>
      evidenceDocsRaw.filter((d) => {
        if (d.tenantId && d.tenantId !== tenantId) return false;
        if (d.siteId && !accessibleSiteIds.includes(d.siteId)) return false;
        if (selectedSiteId && d.siteId && d.siteId !== selectedSiteId) return false;
        return true;
      }),
    [evidenceDocsRaw, tenantId, selectedSiteId, accessibleSiteIds],
  );

  const evidencePacks = useMemo(
    () => evidencePacksRaw.filter((p) => !p.tenantId || p.tenantId === tenantId),
    [evidencePacksRaw, tenantId],
  );

  const raidItems = useMemo(
    () =>
      raidItemsRaw.filter((r) => {
        if (r.tenantId && r.tenantId !== tenantId) return false;
        if (r.siteId && !accessibleSiteIds.includes(r.siteId)) return false;
        // RAID items are tenant-level (no siteId) — only apply the selected-site
        // filter to items that actually carry a site, mirroring the evidenceDocs
        // guard above. Without the `r.siteId &&` guard, every RAID row (siteId
        // "") was dropped whenever a site was selected, so newly-added items
        // never appeared in the table.
        if (selectedSiteId && r.siteId && r.siteId !== selectedSiteId) return false;
        return true;
      }),
    [raidItemsRaw, tenantId, selectedSiteId, accessibleSiteIds],
  );

  // The roadmap / fda483 / agiDrift slices were deleted in the server-first
  // migration. /csv-csa, /fda-483, etc. each fetch their own Prisma data
  // server-side now. We return empty arrays here typed as the real entity
  // types so consumers (Dashboard, Governance, AGI, Evidence,
  // useNotificationEngine) type-check correctly even though the data is empty.
  // Wiring those consumers to server-fetched props is a separate (deferred)
  // project — until then their UIs render zero values. (systems is the
  // exception: it has a slice again and is seeded above.)
  const roadmap: RoadmapActivity[] = [];
  const fda483Events: FDA483Event[] = [];

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
