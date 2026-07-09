"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, type AuthSession } from "@/lib/auth";
import { notify, notifyMany } from "@/lib/notify";
import {
  generateReference,
  isReferenceConflict,
} from "@/lib/reference";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  computeSlaDueAt,
  canTransition,
  AUTO_CLOSE_DAYS,
  RESOLUTION_CATEGORIES,
  SUPPORT_AUDIT_MODULE,
  type TicketStatus,
  type TicketPriority,
  type TicketActivityType,
} from "@/lib/support/constants";
import {
  canViewTicket,
  canEditTicket,
  isRequester,
  canHandleFirstLine,
  canHandleTicket,
  isTicketRoutedToRole,
} from "@/lib/support/permissions";
import { getTickets, toQueueRow, type TicketQueueRow } from "@/lib/queries/support";
import type { ServerQuery } from "@/components/table/DataTable";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/** Defined system actor for unattended writes (auto-close) — never null/blank,
 *  so activity + audit rows always carry a recognisable identity. */
function systemSession(tenantId: string): AuthSession {
  return {
    user: {
      id: "system",
      name: "System / Auto-close",
      email: "system@glimmora",
      role: "system",
      tenantId,
      gxpSignatory: false,
    },
  };
}

/* ── Internal helpers ───────────────────────────────────────────────── */

/** Best-effort request context for auto-capture (never throws). */
async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    const ip = (xff ? xff.split(",")[0]?.trim() : null) || h.get("x-real-ip") || null;
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

type TicketRow = Prisma.TicketGetPayload<object>;

/** Load a ticket and authorize VIEW for the session (null = not found/forbidden). */
async function loadTicketForView(session: AuthSession, id: string): Promise<TicketRow | null> {
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (!t || !canViewTicket(session, t)) return null;
  return t;
}

/** Append a per-ticket activity row (timeline). Runs in the given client/tx. */
async function addActivity(
  client: Prisma.TransactionClient | typeof prisma,
  ticket: { id: string; tenantId: string },
  session: AuthSession,
  type: TicketActivityType,
  summary: string,
  fromValue?: string | null,
  toValue?: string | null,
): Promise<void> {
  await client.ticketActivity.create({
    data: {
      ticketId: ticket.id,
      tenantId: ticket.tenantId,
      type,
      actorId: session.user.id,
      actorName: session.user.name,
      actorRole: session.user.role,
      summary,
      fromValue: fromValue ?? null,
      toValue: toValue ?? null,
    },
  });
}

/** Write the central AuditLog row scoped to the TICKET's tenant (so super_admin
 *  cross-tenant actions land in the correct tenant's trail). */
async function writeAudit(
  client: Prisma.TransactionClient | typeof prisma,
  ticket: { id: string; tenantId: string; reference: string | null },
  session: AuthSession,
  action: string,
  newValue?: Record<string, unknown>,
): Promise<void> {
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  await client.auditLog.create({
    data: {
      tenantId: ticket.tenantId,
      userId: actor.userId,
      userName: session.user.name,
      userRole: session.user.role,
      module: SUPPORT_AUDIT_MODULE,
      action,
      recordId: ticket.id,
      recordTitle: ticket.reference,
      newValue: newValue ? JSON.stringify(newValue) : null,
    },
  });
}

function revalidateSupport(id?: string) {
  revalidatePath("/support");
  revalidatePath("/admin/support");
  if (id) {
    revalidatePath(`/support/${id}`);
    revalidatePath(`/admin/support/${id}`);
  }
}

/* ── loadSupportTickets — server-mode fetcher for the <DataTable> queues ──
   Wraps getTickets so the client queue can page/search/filter on the SERVER
   (Support is server-paginated). Scoping is enforced inside getTickets /
   ticketScopeWhere (super_admin = all tenants; CA = own tenant; requester = own
   tickets) — the `routedToMe` filter narrows to the caller's tier. */
export async function loadSupportTickets(q: ServerQuery): Promise<{ rows: TicketQueueRow[]; total: number }> {
  const session = await requireAuth();
  const f = q.filters ?? {};
  const res = await getTickets(session, {
    page: q.page,
    pageSize: q.pageSize,
    filters: {
      status: f.status || undefined,
      priority: f.priority || undefined,
      category: f.category || undefined,
      tenantId: f.tenantId || undefined,
      routedToMe: f.routedToMe === "1" || undefined,
      search: q.search || undefined,
    },
  });
  return { rows: res.rows.map(toQueueRow), total: res.total };
}

/* ── createTicket — single reusable entry point ─────────────────────────
   Used by the Raise Ticket modal AND the Help Assistant "create a ticket"
   handoff (pass opts.transcript to seed the first message). SMART ROUTING
   SEAM: a future suggestTriage() may PRE-FILL priority/assignee in the modal,
   but creation always lands Unassigned — never auto-assign here. */

const CreateTicketSchema = z.object({
  subject: z.string().min(3, "Subject is required"),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  description: z.string().min(5, "Description is required"),
  relatedModule: z.string().optional(),
  relatedRecordId: z.string().optional(),
  relatedRecordRef: z.string().optional(),
  // Optional evidence URL. Accept "" too so the field can be submitted cleared.
  evidenceLink: z.string().url().optional().or(z.literal("")),
  // Site the ticket is raised for. REQUIRED for a customer_admin (they raise on
  // behalf of a site — enforced in the action against the caller's role, which
  // the schema can't see); every other role derives it server-side from their
  // own User row and may omit it here.
  siteId: z.string().optional(),
  // Auto-captured client context (hidden inputs, not user-facing fields).
  originUrl: z.string().optional(),
  appVersion: z.string().optional(),
});

export async function createTicket(
  input: z.input<typeof CreateTicketSchema>,
  opts?: { transcript?: string },
): Promise<ActionResult<{ id: string; reference: string | null }>> {
  const session = await requireAuth();
  const parsed = CreateTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (session.user.role === "viewer") {
    // Viewers can raise tickets too — they're customers. (No gate here; kept as
    // a note. Tighten via a SUPPORT_RAISE_ROLES set if that ever changes.)
  }
  const data = parsed.data;

  // Site attribution. A customer_admin raises ON BEHALF OF a site and MUST pick
  // one (spec: CA-only site requirement); the chosen site is re-checked against
  // the caller's tenant so it can't be spoofed. Every other role derives its
  // site from its own User row server-side — never from client input.
  let siteId: string | null = null;
  if (session.user.role === "customer_admin") {
    if (!data.siteId) {
      return { success: false, error: "Validation failed", fieldErrors: { siteId: ["Select a site."] } };
    }
    const site = await prisma.site.findFirst({
      where: { id: data.siteId, tenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!site) {
      return { success: false, error: "Validation failed", fieldErrors: { siteId: ["Unknown site."] } };
    }
    siteId = site.id;
  } else {
    const u = await prisma.user.findFirst({
      where: { id: session.user.id, tenantId: session.user.tenantId },
      select: { siteId: true },
    });
    siteId = u?.siteId ?? null;
  }

  const { ip, userAgent } = await requestContext();

  // Support tickets are global (not routed by region), so the reference is a
  // flat TKT-<year>-<NNNNN> — no tenant/region code. Sequence is 5 digits.
  const prefix = "TKT";
  const slaDueAt = computeSlaDueAt(data.priority);

  // Default routing (Phase B): a new ticket lands with the tenant's FIRST-LINE
  // tier, the Customer Admin. EDGE (Q4): a requester who is themselves a
  // first-line handler (customer_admin — or super_admin) can't be their own
  // first-liner, so their ticket skips straight to the SA tier. Based on the
  // requester's role at creation.
  const currentHandler = canHandleFirstLine(session.user.role) ? "super_admin" : "customer_admin";

  try {
    let created: { id: string; reference: string | null; tenantId: string } | null = null;
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          const reference = await generateReference(prefix, new Date(), async (p, year) => {
            const row = await tx.ticket.findFirst({
              where: { reference: { startsWith: `${p}-${year}-` } },
              orderBy: { reference: "desc" },
              select: { reference: true },
            });
            return row?.reference ?? null;
          }, 5);
          const t = await tx.ticket.create({
            data: {
              reference,
              tenantId: session.user.tenantId,
              siteId,
              subject: data.subject,
              category: data.category,
              priority: data.priority,
              status: "New",
              currentHandler,
              description: data.description,
              evidenceLink: data.evidenceLink || null,
              requesterId: session.user.id,
              requesterName: session.user.name,
              requesterRole: session.user.role,
              relatedModule: data.relatedModule || null,
              relatedRecordId: data.relatedRecordId || null,
              relatedRecordRef: data.relatedRecordRef || null,
              slaDueAt,
              originUrl: data.originUrl || null,
              appVersion: data.appVersion || null,
              userAgent,
            },
            select: { id: true, reference: true, tenantId: true },
          });
          await addActivity(tx, t, session, "CREATED", `Ticket raised (${data.priority} priority)`);
          // Help Assistant handoff — seed the conversation with the transcript.
          if (opts?.transcript?.trim()) {
            await tx.ticketMessage.create({
              data: {
                ticketId: t.id,
                tenantId: t.tenantId,
                authorId: session.user.id,
                authorName: session.user.name,
                authorRole: session.user.role,
                body: `Transcript from Help Assistant:\n\n${opts.transcript.trim()}`,
                isInternal: false,
              },
            });
          }
          await writeAudit(tx, t, session, "TICKET_CREATED", {
            category: data.category,
            priority: data.priority,
            relatedRecordRef: data.relatedRecordRef ?? null,
            ip,
          });
          return t;
        });
        break;
      } catch (err) {
        if (!isReferenceConflict(err)) throw err;
      }
    }
    if (!created) return { success: false, error: "Could not allocate a ticket reference. Please retry." };
    revalidateSupport(created.id);
    return { success: true, data: { id: created.id, reference: created.reference } };
  } catch (err) {
    console.error("[action] createTicket failed:", err);
    return { success: false, error: "Failed to create ticket" };
  }
}

/* ── suggestTriage — Smart Triage (suggestion-only, never auto-fills) ────
   Calls the FastAPI AI backend to recommend a category + priority for a new
   ticket. Server-to-server (same BACKEND_URL the ai-proxy uses) so the modal
   never needs an AI access token. Auth-gated. On any failure returns an error
   ActionResult — the UI simply shows nothing rather than blocking ticket
   creation. This realises the "suggestTriage()" SMART ROUTING seam noted on
   createTicket: it only SUGGESTS; creation still lands Unassigned and the user
   may override every field. */

const TriageInputSchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
});

export interface TriageSuggestion {
  category: TicketCategory;
  priority: TicketPriority;
  rationale: string;
  confidence: number;
}

type TicketCategory = (typeof TICKET_CATEGORIES)[number];

/** Resolve the AI backend base URL — mirrors app/api/ai-proxy resolution. */
function aiBackendBase(): string {
  return (
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, "") ??
    "http://localhost:8000"
  );
}

export async function suggestTriage(
  input: z.input<typeof TriageInputSchema>,
): Promise<ActionResult<TriageSuggestion>> {
  await requireAuth();
  const parsed = TriageInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };
  const { subject = "", description = "" } = parsed.data;
  if (!subject.trim() && !description.trim()) {
    return { success: false, error: "Nothing to analyse yet." };
  }
  try {
    const res = await fetch(`${aiBackendBase()}/api/v1/support-triage/classify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, description }),
      // Triage must never hang the modal — bail fast and let the user pick.
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return { success: false, error: `Triage unavailable (${res.status})` };
    }
    // Backend contract (support_triage_router): { category, priority, rationale,
    // confidence: 0-100, source }. Confidence is normalised to a 0-1 fraction here.
    const data = (await res.json()) as Record<string, unknown>;
    // Defensive: only accept values that match our unions; the backend already
    // constrains these, but never trust a remote shape blindly.
    const rawCategory = typeof data.category === "string" ? data.category : "";
    const rawPriority = typeof data.priority === "string" ? data.priority : "";
    const category = (TICKET_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as TicketCategory)
      : "Other";
    const priority = (TICKET_PRIORITIES as readonly string[]).includes(rawPriority)
      ? (rawPriority as TicketPriority)
      : "Medium";
    const rawConfidence = typeof data.confidence === "number" ? data.confidence : 0;
    return {
      success: true,
      data: {
        category,
        priority,
        rationale: typeof data.rationale === "string" ? data.rationale : "",
        // Backend sends 0-100; the UI renders a 0-1 fraction (× 100).
        confidence: Math.max(0, Math.min(1, rawConfidence / 100)),
      },
    };
  } catch (err) {
    console.error("[action] suggestTriage failed:", err);
    return { success: false, error: "Could not reach the triage service." };
  }
}

/* ── addTicketMessage — public reply or admin internal note ──────────── */

const MessageSchema = z.object({
  body: z.string().min(1, "Message cannot be empty"),
  isInternal: z.boolean().optional(),
});

export async function addTicketMessage(
  ticketId: string,
  input: z.input<typeof MessageSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = MessageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const ticket = await loadTicketForView(session, ticketId);
  if (!ticket) return { success: false, error: "Ticket not found" };

  // "Handler" = whoever is acting as support on THIS ticket: a super_admin
  // (cross-tenant) OR the tenant's first-line Customer Admin when the ticket is
  // routed to them (Phase B). Internal notes + the support-side reply transition
  // are handler-only; a requester reply is the user side.
  const isHandler = canHandleTicket(session, ticket);
  const isInternal = !!parsed.data.isInternal;
  if (isInternal && !isHandler) {
    return { success: false, error: "Only support can add internal notes." };
  }

  // Status transitions on reply (spec): handler reply on New/Open → In Progress;
  // user reply on Awaiting User → In Progress. Internal notes never transition.
  let nextStatus: TicketStatus | null = null;
  const status = ticket.status as TicketStatus;
  if (!isInternal) {
    if (isHandler && (status === "New" || status === "Open")) nextStatus = "In Progress";
    else if (!isHandler && status === "Awaiting User") nextStatus = "In Progress";
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          tenantId: ticket.tenantId,
          authorId: session.user.id,
          authorName: session.user.name,
          authorRole: session.user.role,
          body: parsed.data.body,
          isInternal,
        },
      });
      await addActivity(
        tx,
        ticket,
        session,
        isInternal ? "INTERNAL_NOTE" : "REPLY",
        isInternal ? "Internal note added" : "Reply posted",
      );
      if (nextStatus) {
        await tx.ticket.update({ where: { id: ticket.id }, data: { status: nextStatus } });
        await addActivity(tx, ticket, session, "STATUS_CHANGED", `Status: ${status} → ${nextStatus}`, status, nextStatus);
      }
      await writeAudit(tx, ticket, session, isInternal ? "TICKET_INTERNAL_NOTE" : "TICKET_REPLY", {
        ...(nextStatus ? { statusFrom: status, statusTo: nextStatus } : {}),
      });
    });

    // Notify the OTHER party of a public reply (internal notes notify no one).
    if (!isInternal) {
      if (isHandler) {
        // Handler replied → notify the requester.
        await notify({
          tenantId: ticket.tenantId,
          recipientUserId: ticket.requesterId,
          actorUserId: session.user.id,
          type: "TICKET_REPLY",
          title: `New reply on ${ticket.reference ?? "your ticket"}`,
          body: ticket.subject,
          linkPath: `/support/${ticket.id}`,
          entityType: "Ticket",
          entityId: ticket.id,
        });
      } else {
        // Requester replied → notify the CURRENT HANDLER TIER (gap fix): the CA
        // tier for a CA-routed ticket, the SA tier once escalated — not the null
        // assigneeId a tier-routed ticket carries.
        const recips = (await handlerRecipients(ticket)).filter((r) => r !== session.user.id);
        await notifyMany(recips.map((rid) => ({
          tenantId: ticket.tenantId,
          recipientUserId: rid,
          actorUserId: session.user.id,
          type: "TICKET_REPLY" as const,
          title: `New reply on ${ticket.reference ?? "a ticket"}`,
          body: ticket.subject,
          linkPath: `/support/${ticket.id}`,
          entityType: "Ticket",
          entityId: ticket.id,
        })));
      }
    }
    revalidateSupport(ticket.id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] addTicketMessage failed:", err);
    return { success: false, error: "Failed to post message" };
  }
}

/* ── editTicket (requester or handler; only while New / Open) ──────────
   Content edits are allowed EARLY only — once support begins work (In Progress
   or beyond) or the ticket is terminal, it's frozen. canEditTicket enforces the
   status window + actor; the server is authoritative. Stamps lastEdited* and
   writes a paired TICKET_EDITED activity + AuditLog in one $transaction. */

const EditTicketSchema = z.object({
  subject: z.string().min(3, "Subject is required"),
  description: z.string().min(5, "Description is required"),
  priority: z.enum(TICKET_PRIORITIES),
  category: z.enum(TICKET_CATEGORIES),
});

export async function editTicket(
  ticketId: string,
  input: z.input<typeof EditTicketSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = EditTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const ticket = await loadTicketForView(session, ticketId);
  if (!ticket) return { success: false, error: "Ticket not found" };
  if (!canEditTicket(session, ticket)) {
    return { success: false, error: "This ticket can no longer be edited (only New or Open tickets are editable)." };
  }

  // Only the field NAMES land in the audit/activity trail (not full bodies) —
  // enough to prove what was touched without duplicating content into the log.
  const changedFields: string[] = [];
  if (parsed.data.subject !== ticket.subject) changedFields.push("subject");
  if (parsed.data.description !== ticket.description) changedFields.push("description");
  if (parsed.data.priority !== ticket.priority) changedFields.push("priority");
  if (parsed.data.category !== ticket.category) changedFields.push("category");
  if (changedFields.length === 0) return { success: true, data: null };

  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          subject: parsed.data.subject,
          description: parsed.data.description,
          priority: parsed.data.priority,
          category: parsed.data.category,
          lastEditedAt: now,
          lastEditedById: session.user.id,
          lastEditedByName: session.user.name,
        },
      });
      await addActivity(tx, ticket, session, "EDITED", `Ticket edited — ${changedFields.join(", ")}`);
      await writeAudit(tx, ticket, session, "TICKET_EDITED", { fields: changedFields });
    });
    revalidateSupport(ticket.id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] editTicket failed:", err);
    return { success: false, error: "Failed to edit ticket" };
  }
}

/* ── escalateTicket — first-line CA → SA (routing, NOT lifecycle) ─────────
   The two-hop escalation (Phase B). ONLY a first-line handler (customer_admin)
   whose OWN tier currently holds the ticket, in their own tenant, can escalate:
   a super_admin has nothing to escalate to (SA is terminal) and a requester
   can't escalate. Moves currentHandler CA → SA and stamps the escalation trail;
   STATUS IS UNCHANGED. Emits an ESCALATED activity + a TICKET_ESCALATED audit in
   ONE $transaction, then notifies the SA tier. The escalation note is OPTIONAL —
   when supplied it's stored as an INTERNAL message (handler-to-handler context
   for SA), created inside the same tx so the whole escalation stays atomic. */

const EscalateSchema = z.object({
  reason: z.string().min(5, "A reason (min 5 characters) is required to escalate."),
});

export async function escalateTicket(
  ticketId: string,
  input: z.input<typeof EscalateSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = EscalateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const ticket = await loadTicketForView(session, ticketId);
  if (!ticket) return { success: false, error: "Ticket not found" };

  // Gate: a first-line handler (CA) whose own tier currently holds the ticket.
  // isTicketRoutedToRole pins to the caller's tier — for a CA that's
  // "customer_admin"; a super_admin (tier "super_admin") can't escalate, and a
  // requester (canHandleFirstLine=false) can't either. In-tenant is enforced by
  // loadTicketForView (canViewTicket tenant-pins a CA).
  if (!(canHandleFirstLine(session.user.role) && isTicketRoutedToRole(session.user.role, ticket))) {
    return { success: false, error: "You do not have permission to escalate this ticket." };
  }
  if (ticket.currentHandler !== "customer_admin") {
    return { success: false, error: "This ticket is already with the platform support team." };
  }

  const reason = parsed.data.reason.trim();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          currentHandler: "super_admin",
          escalatedAt: new Date(),
          escalatedById: session.user.id,
          escalatedByName: session.user.name,
          // status intentionally untouched — routing is a separate axis.
        },
      });
      // The mandatory reason is ALSO stored as an internal (handler-to-handler)
      // message so the SA tier reads the context in the thread; the requester
      // never sees it (isInternal). The reason itself lives on the activity
      // summary below (spec).
      await tx.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          tenantId: ticket.tenantId,
          authorId: session.user.id,
          authorName: session.user.name,
          authorRole: session.user.role,
          body: reason,
          isInternal: true,
        },
      });
      await addActivity(
        tx, ticket, session, "ESCALATED",
        `Escalated to platform support — ${reason}`,
        "customer_admin", "super_admin",
      );
      await writeAudit(tx, ticket, session, "TICKET_ESCALATED", {
        from: "customer_admin",
        to: "super_admin",
        reason: reason.slice(0, 200),
      });
    });

    // Notify the SA tier (all platform admins), never the actor.
    const superAdmins = await prisma.tenant.findMany({ where: { role: "super_admin" }, select: { id: true } });
    await Promise.allSettled(
      superAdmins
        .filter((sa) => sa.id !== session.user.id)
        .map((sa) =>
          notify({
            tenantId: ticket.tenantId,
            recipientUserId: sa.id,
            actorUserId: session.user.id,
            type: "TICKET_ESCALATED",
            title: `Ticket ${ticket.reference ?? ""} escalated to platform support`,
            body: ticket.subject,
            linkPath: `/admin/support/${ticket.id}`,
            entityType: "Ticket",
            entityId: ticket.id,
          }),
        ),
    );
    revalidateSupport(ticket.id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] escalateTicket failed:", err);
    return { success: false, error: "Failed to escalate ticket" };
  }
}

/* ── updateTicketStatus (manage; non-terminal transitions only) ─────── */

const StatusSchema = z.object({ status: z.enum(["Open", "In Progress", "Awaiting User"]) });

export async function updateTicketStatus(
  ticketId: string,
  input: z.input<typeof StatusSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid status" };
  const ticket = await loadTicketForView(session, ticketId);
  if (!ticket) return { success: false, error: "Ticket not found" };
  // Handler-gated (Phase B): super_admin OR the first-line CA when the ticket is
  // routed to them + in their tenant. A ticket escalated to SA is no longer
  // handleable by the CA (canHandleTicket returns false once currentHandler=SA).
  if (!canHandleTicket(session, ticket)) {
    return { success: false, error: "You do not have permission to change ticket status." };
  }

  const from = ticket.status as TicketStatus;
  const to = parsed.data.status as TicketStatus;
  if (from === to) return { success: true, data: null };
  if (!canTransition(from, to)) {
    return { success: false, error: `Cannot move a ${from} ticket to ${to}.` };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({ where: { id: ticket.id }, data: { status: to } });
      await addActivity(tx, ticket, session, "STATUS_CHANGED", `Status: ${from} → ${to}`, from, to);
      await writeAudit(tx, ticket, session, "TICKET_STATUS_CHANGED", { from, to });
    });
    await notifyParties(ticket, session, "TICKET_STATUS_CHANGED", `Ticket ${ticket.reference ?? ""} is now ${to}`);
    revalidateSupport(ticket.id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] updateTicketStatus failed:", err);
    return { success: false, error: "Failed to update status" };
  }
}

/* ── resolveTicket (manage; requires summary + category) ────────────── */

const ResolveSchema = z.object({
  resolutionSummary: z.string().min(5, "Resolution summary is required"),
  resolutionCategory: z.enum(RESOLUTION_CATEGORIES),
});

export async function resolveTicket(
  ticketId: string,
  input: z.input<typeof ResolveSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ResolveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const ticket = await loadTicketForView(session, ticketId);
  if (!ticket) return { success: false, error: "Ticket not found" };
  // Handler-gated (Phase B): super_admin OR the first-line CA on a ticket routed
  // to them. Close-with-message (option a) flows through here: the closing
  // message is passed as `resolutionSummary`; category stays required.
  if (!canHandleTicket(session, ticket)) {
    return { success: false, error: "You do not have permission to resolve tickets." };
  }
  const from = ticket.status as TicketStatus;
  if (!canTransition(from, "Resolved")) {
    return { success: false, error: `Cannot resolve a ${from} ticket.` };
  }
  const now = new Date();
  const autoCloseAfter = new Date(now.getTime() + AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "Resolved",
          resolutionSummary: parsed.data.resolutionSummary,
          resolutionCategory: parsed.data.resolutionCategory,
          resolvedAt: now,
          resolvedById: session.user.id,
          autoCloseAfter,
        },
      });
      await addActivity(tx, ticket, session, "RESOLVED", `Resolved (${parsed.data.resolutionCategory})`, from, "Resolved");
      await writeAudit(tx, ticket, session, "TICKET_RESOLVED", { resolutionCategory: parsed.data.resolutionCategory });
    });
    await notify({
      tenantId: ticket.tenantId,
      recipientUserId: ticket.requesterId,
      actorUserId: session.user.id,
      type: "TICKET_RESOLVED",
      title: `Ticket ${ticket.reference ?? ""} resolved`,
      body: `Please confirm the resolution or it will auto-close in ${AUTO_CLOSE_DAYS} days.`,
      linkPath: `/support/${ticket.id}`,
      entityType: "Ticket",
      entityId: ticket.id,
    });
    revalidateSupport(ticket.id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] resolveTicket failed:", err);
    return { success: false, error: "Failed to resolve ticket" };
  }
}

/* ── confirmResolution (requester or manager): Resolved → Closed ────── */

export async function confirmResolution(ticketId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const ticket = await loadTicketForView(session, ticketId);
  if (!ticket) return { success: false, error: "Ticket not found" };
  if (!(isRequester(session, ticket) || canHandleTicket(session, ticket))) {
    return { success: false, error: "Only the requester or support can close this ticket." };
  }
  const from = ticket.status as TicketStatus;
  if (from !== "Resolved") return { success: false, error: "Only a resolved ticket can be closed." };
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: "Closed", closedAt: new Date(), closedById: session.user.id, autoCloseAfter: null },
      });
      await addActivity(tx, ticket, session, "CLOSED", "Resolution confirmed — ticket closed", "Resolved", "Closed");
      await writeAudit(tx, ticket, session, "TICKET_CLOSED", { via: "confirm" });
    });
    await notifyParties(ticket, session, "TICKET_STATUS_CHANGED", `Ticket ${ticket.reference ?? ""} closed`);
    revalidateSupport(ticket.id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] confirmResolution failed:", err);
    return { success: false, error: "Failed to close ticket" };
  }
}

/* ── reopenTicket (requester or manager; requires reason) ───────────── */

const ReopenSchema = z.object({ reason: z.string().min(5, "A reason (min 5 characters) is required to reopen.") });

export async function reopenTicket(
  ticketId: string,
  input: z.input<typeof ReopenSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ReopenSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "A reason is required to reopen." };
  const ticket = await loadTicketForView(session, ticketId);
  if (!ticket) return { success: false, error: "Ticket not found" };
  if (!(isRequester(session, ticket) || canHandleTicket(session, ticket))) {
    return { success: false, error: "Only the requester or support can reopen this ticket." };
  }
  const from = ticket.status as TicketStatus;
  if (!canTransition(from, "In Progress") || (from !== "Resolved" && from !== "Closed")) {
    return { success: false, error: "Only a resolved or closed ticket can be reopened." };
  }
  // Start a NEW SLA window from the reopen moment — never carry a stale/breached
  // due date forward. Any prior breach lives in the activity timeline (the old
  // resolve/close entries + timestamps), not the live slaDueAt field.
  const newSla = computeSlaDueAt(ticket.priority as TicketPriority);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: {
          status: "In Progress",
          reopenReason: parsed.data.reason,
          closedAt: null,
          autoCloseAfter: null,
          slaDueAt: newSla,
        },
      });
      await addActivity(tx, ticket, session, "REOPENED", `Reopened (new SLA window started): ${parsed.data.reason}`, from, "In Progress");
      await writeAudit(tx, ticket, session, "TICKET_REOPENED", { reason: parsed.data.reason.slice(0, 200), newSlaDueAt: newSla.toISOString() });
    });
    await notifyParties(ticket, session, "TICKET_STATUS_CHANGED", `Ticket ${ticket.reference ?? ""} reopened`);
    revalidateSupport(ticket.id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] reopenTicket failed:", err);
    return { success: false, error: "Failed to reopen ticket" };
  }
}

/* ── cancelTicket (requester or manager; terminal) ──────────────────── */

const CancelSchema = z.object({ reason: z.string().min(5, "A reason (min 5 characters) is required to cancel.") });

export async function cancelTicket(
  ticketId: string,
  input: z.input<typeof CancelSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "A reason is required to cancel." };
  const ticket = await loadTicketForView(session, ticketId);
  if (!ticket) return { success: false, error: "Ticket not found" };
  if (!(isRequester(session, ticket) || canHandleTicket(session, ticket))) {
    return { success: false, error: "Only the requester or support can cancel this ticket." };
  }
  const from = ticket.status as TicketStatus;
  if (!canTransition(from, "Cancelled")) {
    return { success: false, error: `A ${from} ticket cannot be cancelled.` };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: "Cancelled", cancelledAt: new Date(), cancelReason: parsed.data.reason },
      });
      await addActivity(tx, ticket, session, "CANCELLED", `Cancelled: ${parsed.data.reason}`, from, "Cancelled");
      await writeAudit(tx, ticket, session, "TICKET_CANCELLED", { reason: parsed.data.reason.slice(0, 200) });
    });
    await notifyParties(ticket, session, "TICKET_STATUS_CHANGED", `Ticket ${ticket.reference ?? ""} cancelled`);
    revalidateSupport(ticket.id);
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] cancelTicket failed:", err);
    return { success: false, error: "Failed to cancel ticket" };
  }
}

/* ── Auto-close (future cron seam) ──────────────────────────────────────
   No scheduler exists yet (same as DUE_SOON/OVERDUE). Exposed as a super-admin
   maintenance action; a cron variant would call the same core with a system
   actor. Closes Resolved tickets whose autoCloseAfter has passed. */
export async function autoCloseStaleResolvedTickets(): Promise<ActionResult<{ closed: number }>> {
  const session = await requireAuth();
  if (session.user.role !== "super_admin") {
    return { success: false, error: "Only a platform admin can run auto-close." };
  }
  const now = new Date();
  const stale = await prisma.ticket.findMany({
    where: { status: "Resolved", autoCloseAfter: { not: null, lte: now } },
    select: { id: true, tenantId: true, reference: true },
  });
  let closed = 0;
  for (const t of stale) {
    // Attribute the unattended close to a defined system actor — NOT the admin
    // who happened to trigger the sweep (and never a null/blank actor).
    const sys = systemSession(t.tenantId);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.ticket.update({ where: { id: t.id }, data: { status: "Closed", closedAt: now, autoCloseAfter: null } });
        await addActivity(tx, t, sys, "CLOSED", `Auto-closed after ${AUTO_CLOSE_DAYS} days with no response`, "Resolved", "Closed");
        await writeAudit(tx, t, sys, "TICKET_AUTO_CLOSED", { afterDays: AUTO_CLOSE_DAYS });
      });
      closed++;
    } catch (err) {
      console.error("[action] autoClose failed for", t.id, err);
    }
  }
  revalidateSupport();
  return { success: true, data: { closed } };
}

/**
 * Resolve the CURRENT HANDLER of a ticket to notification recipient id(s).
 * Ticket-row admins authenticate via the Tenant table, so their session.user.id
 * IS a Tenant.id; the notification read path matches on session.user.id, so we
 * address tiers by Tenant.id:
 *   - tier=customer_admin → that tenant's CA = the Tenant row (id = tenantId);
 *   - tier=super_admin    → every super_admin Tenant row (the SA tier).
 * (Direct assignment was removed — routing is purely CA↔SA by tier now.)
 */
async function handlerRecipients(ticket: { tenantId: string; currentHandler: string }): Promise<string[]> {
  if (ticket.currentHandler === "super_admin") {
    const sas = await prisma.tenant.findMany({ where: { role: "super_admin" }, select: { id: true } });
    return sas.map((s) => s.id);
  }
  // customer_admin tier — the tenant's CA is the Tenant row itself (id = tenantId).
  return [ticket.tenantId];
}

/* ── shared notify helper ── */
async function notifyParties(
  ticket: TicketRow,
  session: AuthSession,
  type: "TICKET_STATUS_CHANGED",
  title: string,
): Promise<void> {
  const recipients = new Set<string>();
  if (ticket.requesterId) recipients.add(ticket.requesterId);
  // The current handler tier (not just assigneeId — which is null for tier-routed
  // tickets, the gap this closes).
  for (const rid of await handlerRecipients(ticket)) recipients.add(rid);
  recipients.delete(session.user.id); // never self-notify
  await notifyMany(
    [...recipients].map((rid) => ({
      tenantId: ticket.tenantId,
      recipientUserId: rid,
      actorUserId: session.user.id,
      type,
      title,
      body: ticket.subject,
      linkPath: `/support/${ticket.id}`,
      entityType: "Ticket",
      entityId: ticket.id,
    })),
  );
}
