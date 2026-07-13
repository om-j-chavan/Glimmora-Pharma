import { redirect } from "next/navigation";
import { ErrorBoundary } from "@/components/errors";
import { ChangeControlListPage } from "@/modules/change-control/ChangeControlListPage";
import { requireAuth } from "@/lib/auth";
import { getChangeControls } from "@/lib/queries";
import { CHANGE_CONTROL_ENABLED } from "@/lib/change-control-constants";

export const metadata = {
  title: "Change Control — Pharma Glimmora",
};

export default async function ChangeControlPageRoute() {
  // Phase 2 UI mothball — the module is fully built but hidden. The route is
  // kept (not deleted) so stale bookmarks/links resolve to a clean redirect
  // instead of a 404/error page. Flip CHANGE_CONTROL_ENABLED to re-expose it.
  if (!CHANGE_CONTROL_ENABLED) redirect("/");

  const session = await requireAuth();
  const items = await getChangeControls(session.user.tenantId);

  return (
    <ErrorBoundary moduleName="Change Control">
      <ChangeControlListPage initial={items} />
    </ErrorBoundary>
  );
}
