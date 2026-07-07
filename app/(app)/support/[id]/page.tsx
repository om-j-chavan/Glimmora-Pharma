import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getTicket, getTicketAttachments } from "@/lib/queries";
import { canManageSupport, canHandleTicket, canHandleFirstLine, isTicketRoutedToRole } from "@/lib/support/permissions";
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
  const t = detail.ticket;

  return (
    <ErrorBoundary moduleName="Support">
      <TicketDetailView
        detail={detail}
        attachments={attachments}
        // canHandleTicket: CA gets handler controls only on a CA-routed ticket in
        // their tenant; a requester gets none. Assign stays SA-only; Escalate is
        // the CA→SA hop. The server enforces all three — the UI mirrors so no
        // dead/forbidden button ever renders.
        manage={canHandleTicket(session, t)}
        canAssign={canManageSupport(session.user.role)}
        // Escalate is the CA→SA hop only: a first-line handler whose OWN tier
        // (customer_admin) currently holds the ticket. SA (tier super_admin) is
        // terminal — this stays false for them, matching escalateTicket's gate.
        canEscalate={canHandleFirstLine(session.user.role) && isTicketRoutedToRole(session.user.role, t) && t.currentHandler === "customer_admin"}
        viewerRole={session.user.role}
        currentUserId={session.user.id}
        assigneeOptions={[]}
      />
    </ErrorBoundary>
  );
}
