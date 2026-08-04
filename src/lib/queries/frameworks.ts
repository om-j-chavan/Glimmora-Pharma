import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { frameworkLabel, RESERVED_FRAMEWORK_KEYS } from "@/constants/frameworks";

/**
 * Frameworks read layer (Phase 1). All reads are tenant-scoped. The Super Admin
 * exemption (no tenant context) is applied by the caller/action via
 * isPlatformAdmin — these queries themselves are pure tenant-scoped resolvers.
 *
 * PARITY: a framework is enabled for a tenant unless a TenantFramework row
 * explicitly disables it (enabled=false). Absence of a row = enabled — so an
 * existing tenant with no rows still sees every platform-enabled, region-matched
 * framework, exactly as before.
 */

export interface EffectiveFramework {
  key: string;
  name: string;
  label: string;
  description: string | null;
}

/**
 * Region predicate: GLOBAL frameworks always match; a region-specific one
 * matches when ANY of the tenant's regions is in its FrameworkRegion set.
 *
 * A tenant holding several regions therefore sees the UNION of their frameworks
 * — the correct reading of multi-region: a site shipping to both the US and the
 * EU must satisfy Part 11 AND Annex 11, not the intersection. `some … in` also
 * keeps one row per framework, so a framework scoped to two of the tenant's
 * regions is still listed once.
 */
function regionWhere(regions: string[]) {
  return {
    OR: [
      { appliesToAllRegions: true },
      ...(regions.length ? [{ regions: { some: { region: { in: regions } } } }] : []),
    ],
  };
}

/** The tenant's assigned region values ([] when it has none). Sorted so the
 *  Frameworks tab's per-region sections render in a stable order rather than in
 *  link-row insertion order, which changes every time the set is edited. */
async function tenantRegionValues(tenantId: string): Promise<string[]> {
  const rows = await prisma.tenantRegion.findMany({
    where: { tenantId },
    select: { region: true },
    orderBy: { region: "asc" },
  });
  return rows.map((r) => r.region);
}

/**
 * Stage 4 — the "≥1 active framework per region" guard resolver. Returns the
 * ACTIVE regions that would be left with ZERO active applicable frameworks if
 * the given framework were disabled (platformEnabled → false).
 *
 * "active for region" MUST match the Stage-2 per-region view exactly:
 *   (region's FrameworkRegion links ∪ all GLOBAL) AND platformEnabled AND archivedAt=null.
 *
 * The non-obvious part is the GLOBAL edge: disabling a region-specific framework
 * only affects the region(s) it links to, but disabling a GLOBAL framework
 * affects EVERY region — so the set of regions to re-check depends on the
 * framework's scope. Archived regions are excluded (they hold no live config).
 */
export async function regionsEmptiedByDisabling(frameworkId: string): Promise<{ value: string; label: string }[]> {
  const target = await prisma.framework.findUnique({
    where: { id: frameworkId },
    select: { appliesToAllRegions: true, platformEnabled: true, archivedAt: true, regions: { select: { region: true } } },
  });
  // Not currently active → disabling changes nothing about the active set.
  if (!target || !target.platformEnabled || target.archivedAt) return [];

  // The active set that REMAINS after disabling the target = every other
  // platform-enabled, non-archived framework.
  const others = await prisma.framework.findMany({
    where: { id: { not: frameworkId }, platformEnabled: true, archivedAt: null },
    select: { appliesToAllRegions: true, regions: { select: { region: true } } },
  });
  const globalRemains = others.some((f) => f.appliesToAllRegions);
  const regionsWithLocalActive = new Set<string>();
  for (const f of others) if (!f.appliesToAllRegions) for (const r of f.regions) regionsWithLocalActive.add(r.region);

  // Regions to re-check: GLOBAL target → every active region; region-specific
  // target → only the active regions it links to.
  const activeRegions = await prisma.regulatoryRegion.findMany({ where: { archivedAt: null }, select: { value: true, label: true } });
  const labelByValue = new Map(activeRegions.map((r) => [r.value, r.label]));
  const affected = target.appliesToAllRegions
    ? activeRegions.map((r) => r.value)
    : [...new Set(target.regions.map((r) => r.region))].filter((v) => labelByValue.has(v));

  const emptied: { value: string; label: string }[] = [];
  for (const v of affected) {
    // After disabling the target, region v keeps an active framework iff a GLOBAL
    // one remains OR it still has a region-specific active framework.
    const stillHasActive = globalRemains || regionsWithLocalActive.has(v);
    if (!stillHasActive) emptied.push({ value: v, label: labelByValue.get(v)! });
  }
  return emptied;
}

/**
 * THE single source of truth for "which frameworks does this tenant see enabled":
 *   platformEnabled  AND  (GLOBAL OR region matches)  AND  not tenant-disabled.
 */
export const effectiveFrameworksForTenant = cache(async (tenantId: string): Promise<EffectiveFramework[]> => {
  const regions = await tenantRegionValues(tenantId);
  const rows = await prisma.framework.findMany({
    // archivedAt: null → archived frameworks are invisible to tenants (Stage 2).
    where: { platformEnabled: true, archivedAt: null, ...regionWhere(regions) },
    include: { tenantFrameworks: { where: { tenantId }, select: { enabled: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], // manual order (Item #5), then stable tiebreak
  });
  return rows
    .filter((f) => f.tenantFrameworks[0]?.enabled !== false) // no row = enabled (parity)
    .map((f) => ({ key: f.key, name: f.name, label: frameworkLabel(f.key, f.name), description: f.description }));
});

export interface TenantFrameworkSetting extends EffectiveFramework {
  /** Framework catalog id — needed to call setTenantFrameworkEnabled. */
  id: string;
  enabled: boolean;
  /** Optional grouping label (Item #5) — display only. */
  category: string | null;
  /** GLOBAL (appliesToAllRegions) → renders in the tab's "Global" section once. */
  appliesToAllRegions: boolean;
  /** Which of the tenant's regions this framework is region-linked to (empty for
   *  GLOBAL). The tab groups a region-specific framework under the FIRST of these
   *  in the tenant's region order, so it never appears under two regions. */
  matchedRegions: string[];
}

/** Grouped shape for the multi-region Frameworks tab: the tenant's region SET
 *  (ordered — one section each, empty ones included) + the flat framework list,
 *  each tagged for grouping. */
export interface TenantFrameworkGroups {
  regions: string[];
  frameworks: TenantFrameworkSetting[];
}

/** Customer-Admin view: every platform-enabled + region-matched framework with
 *  its current per-tenant enabled state (so the tab can toggle each), plus the
 *  tenant's region set and per-framework grouping tags for the by-region layout.
 *  The union across the tenant's whole region set — findMany still returns each
 *  framework once, even when it is scoped to two of the tenant's regions. */
export const getTenantFrameworkSettings = cache(async (tenantId: string): Promise<TenantFrameworkGroups> => {
  const regions = await tenantRegionValues(tenantId);
  const rows = await prisma.framework.findMany({
    // archivedAt: null → archived frameworks never appear in the tenant tab.
    where: { platformEnabled: true, archivedAt: null, ...regionWhere(regions) },
    include: {
      tenantFrameworks: { where: { tenantId }, select: { enabled: true } },
      // Only the tenant's own regions — enough to group each framework by region.
      regions: { where: { region: { in: regions } }, select: { region: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], // manual order (Item #5)
  });
  const frameworks = rows.map((f) => ({
    id: f.id,
    key: f.key,
    name: f.name,
    label: frameworkLabel(f.key, f.name),
    description: f.description,
    enabled: f.tenantFrameworks[0]?.enabled !== false,
    category: f.category,
    appliesToAllRegions: f.appliesToAllRegions,
    matchedRegions: f.regions.map((r) => r.region),
  }));
  return { regions, frameworks };
});

export interface CatalogFramework {
  id: string;
  key: string;
  name: string;
  description: string | null;
  platformEnabled: boolean;
  appliesToAllRegions: boolean;
  regions: string[];
  reserved: boolean;
  /** Soft-archived (Stage 2). The SA catalog still lists these; tenants don't. */
  archived: boolean;
  /** For a superseded (archived) row — its successor via old.aliasOf (Stage 3). */
  successor: { key: string; name: string } | null;
  /** Display metadata (Item #5). */
  sortOrder: number;
  category: string | null;
}

/** Super-Admin view: the FULL platform catalog (active + archived) with region
 *  links + reserved flag. The SA sees everything; the `archived` flag lets the
 *  page split Active / Archived. Tenant-facing reads exclude archived rows. */
export const getFrameworkCatalog = cache(async (): Promise<CatalogFramework[]> => {
  const rows = await prisma.framework.findMany({
    include: { regions: { select: { region: true } }, aliasOf: { select: { key: true, name: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], // manual order (Item #5)
  });
  return rows.map((f) => ({
    id: f.id,
    key: f.key,
    name: f.name,
    description: f.description,
    platformEnabled: f.platformEnabled,
    appliesToAllRegions: f.appliesToAllRegions,
    regions: f.regions.map((r) => r.region),
    reserved: RESERVED_FRAMEWORK_KEYS.has(f.key),
    archived: f.archivedAt !== null,
    successor: f.aliasOf ? { key: f.aliasOf.key, name: f.aliasOf.name } : null,
    sortOrder: f.sortOrder,
    category: f.category,
  }));
});
