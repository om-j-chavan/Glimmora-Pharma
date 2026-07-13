import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { CustomerDetailPage } from "@/modules/admin/customer-detail";

const ALLOWED_ROLES = new Set(["super_admin", "customer_admin"]);

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
    extra: { path: `/admin/customer/${id}` },
  });

  return <CustomerDetailPage />;
}
