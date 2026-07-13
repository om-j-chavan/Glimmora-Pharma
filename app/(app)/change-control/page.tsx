import { ErrorBoundary } from "@/components/errors";
import { ChangeControlListPage } from "@/modules/change-control/ChangeControlListPage";
import { requireAuth } from "@/lib/auth";
import { getChangeControls } from "@/lib/queries";

export const metadata = {
  title: "Change Control — Pharma Glimmora",
};

export default async function ChangeControlPageRoute() {
  const session = await requireAuth();
  const items = await getChangeControls(session.user.tenantId);

  return (
    <ErrorBoundary moduleName="Change Control">
      <ChangeControlListPage initial={items} />
    </ErrorBoundary>
  );
}
