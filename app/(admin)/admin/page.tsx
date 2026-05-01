import { requireAuth } from "@/lib/auth";
import { getTenants } from "@/lib/queries/tenants";
import { CustomerAccountsPage } from "@/modules/admin/CustomerAccountsPage";

export default async function Page() {
  const session = await requireAuth();

  // Role gate (super_admin OR customer_admin) is now enforced by middleware.ts.

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
