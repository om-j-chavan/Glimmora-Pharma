import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { PlatformSettingsPage } from "@/modules/admin/platform-settings";

// Platform-level screen — super_admin only. (The whole /admin console is now
// super_admin-only after the H1 fix; customer_admin no longer reaches it.)
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
