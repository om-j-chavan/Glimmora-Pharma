import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { requireRoleOrDeny } from "@/lib/authz";
import { getTicket, getTicketAttachments, getSupportAssigneeOptions } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { canManageSupport, canHandleTicket, canHandleFirstLine, isTicketRoutedToRole } from "@/lib/support/permissions";
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
  const t = detail.ticket;
  const [attachments, assigneeOptions, tenant] = await Promise.all([
    getTicketAttachments(session, id),
    getSupportAssigneeOptions(session),
    prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { name: true } }),
  ]);

  return (
    <TicketDetailView
      detail={detail}
      attachments={attachments}
      // super_admin: full handler controls + Assign; never Escalate (SA is terminal).
      manage={canHandleTicket(session, t)}
      canAssign={canManageSupport(session.user.role)}
      // SA is terminal — never Escalate (only the CA→SA hop escalates; matches
      // escalateTicket's server gate which requires currentHandler=customer_admin).
      canEscalate={canHandleFirstLine(session.user.role) && isTicketRoutedToRole(session.user.role, t) && t.currentHandler === "customer_admin"}
      viewerRole={session.user.role}
      tenantLabel={tenant?.name}
      currentUserId={session.user.id}
      assigneeOptions={assigneeOptions}
    />
  );
}
