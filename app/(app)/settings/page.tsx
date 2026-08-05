import { SettingsPage } from "@/modules/settings/SettingsPage";
import { ErrorBoundary } from "@/components/errors";
import { requireAuth } from "@/lib/auth";
import { getSites, getUsers } from "@/lib/queries";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireAuth();
  const { tab } = await searchParams;

  const [sites, users] = await Promise.all([
    getSites(session.user.tenantId),
    getUsers(session.user.tenantId),
  ]);

  return (
    <ErrorBoundary moduleName="Settings">
      <SettingsPage
        sites={sites}
        users={users}
        initialTab={tab}
      />
    </ErrorBoundary>
  );
}
