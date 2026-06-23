import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getTicket, getTicketAttachments } from "@/lib/queries";
import { canManageSupport } from "@/lib/support/permissions";
import { TicketDetailView } from "@/modules/support/TicketDetailView";
import { ErrorBoundary } from "@/components/errors";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  // getTicket enforces tenant isolation + canViewTicket and strips internal
  // notes for non-managers at the DATA layer (no separate unscoped fetch).
  const detail = await getTicket(session, id);
  if (!detail) notFound();
  const attachments = await getTicketAttachments(session, id);

  return (
    <ErrorBoundary moduleName="Support">
      <TicketDetailView
        detail={detail}
        attachments={attachments}
        manage={canManageSupport(session.user.role)}
        currentUserId={session.user.id}
        assigneeOptions={[]}
      />
    </ErrorBoundary>
  );
}
