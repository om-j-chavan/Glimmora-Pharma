import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getTenants } from "@/lib/queries/tenants";
import { CustomerAccountsPage } from "@/modules/admin/customer-accounts";

const ALLOWED_ROLES = new Set(["super_admin", "customer_admin"]);

export default async function Page() {
  const session = await requireAuth();
  // Role gate enforced by proxy.ts AND this server-side check (defense-in-depth).
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "admin",
    recordId: "admin-index",
    recordTitle: "/admin",
    extra: { path: "/admin" },
  });

  const initialTenants = await getTenants();
  // Pass isSuperAdmin so the MFA column renders consistently between SSR
  // and the client. Reading from Redux on the client returns false during
  // SSR (auth.user is null until AdminShell's hydration effect fires),
  // which caused a hydration mismatch on the <th>.
  const isSuperAdmin = session.user.role === "super_admin";

  return (
    <CustomerAccountsPage initialTenants={initialTenants} isSuperAdmin={isSuperAdmin} />
  );
}
