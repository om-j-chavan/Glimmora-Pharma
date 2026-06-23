import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getTicket, getTicketAttachments, getSupportAssigneeOptions } from "@/lib/queries";
import { canManageSupport } from "@/lib/support/permissions";
import { TicketDetailView } from "@/modules/support/TicketDetailView";

const ALLOWED_ROLES = new Set(["super_admin"]);

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireAuth();
  await requireRoleOrDeny(session, ALLOWED_ROLES, { module: "support", recordId: id, recordTitle: "/admin/support/[id]" });

  // Cross-tenant view is allowed for super_admin inside getTicket; internal
  // notes are returned only because canManageSupport is true (data-layer).
  const detail = await getTicket(session, id);
  if (!detail) notFound();
  const [attachments, assigneeOptions] = await Promise.all([
    getTicketAttachments(session, id),
    getSupportAssigneeOptions(session),
  ]);

  return (
    <TicketDetailView
      detail={detail}
      attachments={attachments}
      manage={canManageSupport(session.user.role)}
      currentUserId={session.user.id}
      assigneeOptions={assigneeOptions}
    />
  );
}
