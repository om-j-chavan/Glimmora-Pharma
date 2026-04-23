import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getTenants } from "@/lib/queries/tenants";
import { CustomerAccountsPage } from "@/modules/admin/CustomerAccountsPage";

export default async function Page() {
  const session = await requireAuth();

  if (session.user.role !== "super_admin" && session.user.role !== "customer_admin") {
    redirect("/");
  }

  const initialTenants = await getTenants();

  return <CustomerAccountsPage initialTenants={initialTenants} />;
}
