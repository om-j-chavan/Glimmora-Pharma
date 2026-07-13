import { SettingsPage } from "@/modules/settings/SettingsPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getSites, getUsers } from "@/lib/queries";

export default async function Page() {
  const session = await requireAuth();
  const [sites, users] = await Promise.all([
    getSites(session.user.tenantId),
    getUsers(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Settings">
      {/* @ts-expect-error: module page still reads from Redux; props consumed in next phase. */}
      <SettingsPage sites={sites} users={users} />
    </ErrorBoundary>
  );
}
