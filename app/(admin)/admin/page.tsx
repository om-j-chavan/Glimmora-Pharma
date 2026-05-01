import { requireAuth } from "@/lib/auth";
import { getTenants } from "@/lib/queries/tenants";
import { CustomerAccountsPage } from "@/modules/admin/CustomerAccountsPage";

export default async function Page() {
  await requireAuth();

  // Role gate (super_admin OR customer_admin) is now enforced by middleware.ts.

  const initialTenants = await getTenants();

  return <CustomerAccountsPage initialTenants={initialTenants} />;
}
