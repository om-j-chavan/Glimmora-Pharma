import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getRegionCatalog, getFrameworkCatalog } from "@/lib/queries";
import { RegionsLandingPage, type RegionListRow } from "@/modules/admin/platform-regions";

// Platform-level screen — super_admin only.
const ALLOWED_ROLES = new Set(["super_admin"]);

export const metadata = {
  title: "Regulatory Regions & Frameworks — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "admin",
    recordId: "platform-regions",
    recordTitle: "/admin/regions",
    extra: { path: "/admin/regions" },
  });

  const [catalog, frameworks] = await Promise.all([getRegionCatalog(), getFrameworkCatalog()]);

  // "N frameworks apply" per region = active frameworks whose scope covers it:
  // every Global framework UNION frameworks region-linked to this value. Archived
  // frameworks are excluded (they don't apply to anyone).
  const activeFrameworks = frameworks.filter((f) => !f.archived);
  const rows: RegionListRow[] = catalog.map((r) => ({
    ...r,
    frameworkApplyCount: activeFrameworks.filter(
      (f) => f.appliesToAllRegions || f.regions.includes(r.value),
    ).length,
  }));

  return <RegionsLandingPage rows={rows} />;
}
