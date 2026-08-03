import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getRegionCatalog, getFrameworkCatalog, getActiveRegions } from "@/lib/queries";
import { RegionFrameworksPage } from "@/modules/admin/platform-regions";

// Platform-level screen — super_admin only.
const ALLOWED_ROLES = new Set(["super_admin"]);

export const metadata = {
  title: "Region frameworks — Pharma Glimmora",
};

export default async function Page({ params }: { params: Promise<{ value: string }> }) {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "admin",
    recordId: "platform-regions",
    recordTitle: "/admin/regions",
    extra: { path: "/admin/regions" },
  });

  const { value: rawValue } = await params;
  const value = decodeURIComponent(rawValue);

  const [catalog, frameworks, regions] = await Promise.all([
    getRegionCatalog(),
    getFrameworkCatalog(),
    getActiveRegions(),
  ]);

  const region = catalog.find((r) => r.value === value);
  if (!region) notFound();

  return (
    <RegionFrameworksPage
      region={{ value: region.value, label: region.label }}
      regionTenantCount={region.tenantCount}
      frameworks={frameworks}
      regions={regions}
    />
  );
}
