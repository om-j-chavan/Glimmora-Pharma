import { prisma } from "@/lib/prisma";

/**
 * In-app notification types (Phase 2). Each maps to a GxP lifecycle event.
 * DUE_SOON / OVERDUE are reserved for a future scheduler (no cron exists yet —
 * see the feature report); the union carries them so the schema + UI are ready
 * when one lands.
 */
export type NotificationType =
  | "CAPA_REJECTED"
  | "EVIDENCE_REJECTED"
  | "CAPA_ASSIGNED"
  | "ACTION_ASSIGNED"
  | "CAPA_APPROVED"
  | "CAPA_VERIFIED"
  | "CAPA_CLOSED"
  | "REWORK_ASSIGNED"
  | "DUE_SOON"
  | "OVERDUE"
  // Support desk (in-app only for now; email is a future channel behind the
  // same notify() entry point — add a transport here, no call-site changes).
  | "TICKET_ASSIGNED"
  | "TICKET_REPLY"
  | "TICKET_STATUS_CHANGED"
  | "TICKET_RESOLVED";

export interface NotifyInput {
  tenantId: string;
  /** The AFFECTED party (a real User.id). Null/undefined → no-op (e.g. an admin FK). */
  recipientUserId: string | null | undefined;
  /** The user performing the action — never notify the actor about their own act. */
  actorUserId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/**
 * Emit one in-app notification. FAULT-ISOLATED: any failure here is swallowed
 * (logged) and NEVER propagates — notifications are a side effect and must not
 * block or roll back the triggering GxP action. Always call AFTER the action's
 * own writes have committed.
 *
 * Scoping rules are enforced here so every call site is safe by default:
 *  - skip when there is no real recipient (null/empty FK — e.g. super_admin or a
 *    customer_admin authoring with a null User FK; super_admin is never a GxP
 *    recipient because it has no User row);
 *  - never notify the actor (recipient === actorUserId).
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const recipient = input.recipientUserId;
    if (!recipient) return;
    if (input.actorUserId && recipient === input.actorUserId) return;

    await prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        recipientUserId: recipient,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        linkPath: input.linkPath ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  } catch (err) {
    // Side effect only — log and continue; the triggering action already
    // committed and must remain unaffected.
    console.error(
      `[notify] failed to emit ${input.type} to ${input.recipientUserId ?? "?"} (action unaffected):`,
      err,
    );
  }
}

/**
 * Emit several notifications, each independently fault-isolated. Used when one
 * event affects multiple parties (e.g. evidence rejected → each fixer). Never
 * throws: a single bad emit cannot sink the others or the caller.
 */
export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  await Promise.allSettled(inputs.map((i) => notify(i)));
}
