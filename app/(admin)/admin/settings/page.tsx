import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { PlatformSettingsPage } from "@/modules/admin/platform-settings";

// Platform-level screen — super_admin only (narrower than the /admin shell,
// which also admits customer_admin).
const ALLOWED_ROLES = new Set(["super_admin"]);

export const metadata = {
  title: "Platform Settings — Pharma Glimmora",
};

export default async function Page() {
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "admin",
    recordId: "platform-settings",
    recordTitle: "/admin/settings",
    extra: { path: "/admin/settings" },
  });

  return <PlatformSettingsPage />;
}
