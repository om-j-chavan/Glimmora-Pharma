import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { CustomerDetailPage } from "@/modules/admin/customer-detail";

// H1 fix — cross-tenant customer detail is super_admin ONLY (customer_admin is
// redirected to the dashboard; proxy.ts enforces the same at the edge).
const ALLOWED_ROLES = new Set(["super_admin"]);

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, {
    module: "admin",
    recordId: id,
    recordTitle: `customer/${id}`,
    redirectTo: "/",
    extra: { path: `/admin/customer/${id}` },
  });

  return <CustomerDetailPage />;
}
