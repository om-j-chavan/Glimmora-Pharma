import { requireAuth } from "@/lib/auth";
import { DataTableServerDemo } from "@/modules/demo/DataTableServerDemo";

// Verification-only route (unlinked) proving <DataTable mode="server">.
export const metadata = { title: "DataTable server demo" };

export default async function Page() {
  await requireAuth();
  return <DataTableServerDemo />;
}
