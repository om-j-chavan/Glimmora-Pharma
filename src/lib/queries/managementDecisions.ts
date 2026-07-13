import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthSession } from "@/lib/auth";
import { canSeeAllRecords, resolveVisibilityUid } from "@/lib/permissions/recordVisibility";
import { DECISION_SOURCE_MODULE } from "@/constants/managementDecision";
import type { WorklistDoc } from "@/lib/queries/worklist";

/**
 * Management-decision record-visibility — the COMPOSE template (the same shape as
 * `deviationVisibilityWhere`, which composes Deviation with its DeviationTask
 * children).
 *
 * A meeting has no single "assignee", so the axes are:
 *   • see-all role (customer_admin / qa_head / super_admin) → `{}`, no narrowing.
 *   • creator                → `{ createdById: uid }`            (flat column)
 *   • owner of ANY of its
 *     decision / action items → `{ items: { some: { ownerId: uid } } }` (relation)
 *
 * The relation branch is a deliberate choice, not an accident: an action item
 * assigned to you on a meeting you cannot open is a broken assignment. It is the
 * same reasoning that puts task-assignees on the deviation rule.
 *
 * ONE fail-closed `uid` (from `resolveVisibilityUid`) drives both branches, so an
 * unresolvable actor id matches nothing and scope can only ever NARROW.
 *
 * Applied from day one to BOTH the list and the by-id read, so the detail route
 * is IDOR-safe: a seat user who is neither creator nor an item owner gets `null`
 * for a valid id.
 */
export function managementDecisionVisibilityWhere(session: AuthSession): Prisma.ManagementDecisionWhereInput {
  if (canSeeAllRecords(session.user.role)) return {}; // see-all → no narrowing
  const uid = resolveVisibilityUid(session);          // shared fail-closed uid
  return {
    OR: [
      { createdById: uid },                     // creator (flat)
      { items: { some: { ownerId: uid } } },    // action-item owner (relation)
    ],
  };
}

/* ── Row shapes (plain / serializable) ───────────────────────────────────── */

export interface DecisionItemRow {
  id: string;
  text: string;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  status: string;
  position: number;
}

export interface ManagementDecisionRow {
  id: string;
  reference: string | null;
  topic: string;
  meetingDate: string;
  attendees: string;
  chairedById: string | null;
  chairedByName: string | null;
  createdById: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: DecisionItemRow[];
  /** Convenience for the list column — items.length. */
  itemCount: number;
}

const DECISION_SELECT = {
  id: true,
  reference: true,
  topic: true,
  meetingDate: true,
  attendees: true,
  chairedById: true,
  createdById: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  chairedBy: { select: { name: true } },
  items: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, text: true, ownerId: true, dueDate: true, status: true, position: true,
      owner: { select: { name: true } },
    },
  },
} satisfies Prisma.ManagementDecisionSelect;

type DecisionPayload = Prisma.ManagementDecisionGetPayload<{ select: typeof DECISION_SELECT }>;

function toRow(d: DecisionPayload): ManagementDecisionRow {
  const items = d.items.map((i) => ({
    id: i.id,
    text: i.text,
    ownerId: i.ownerId,
    ownerName: i.owner?.name ?? null,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    status: i.status,
    position: i.position,
  }));
  return {
    id: d.id,
    reference: d.reference,
    topic: d.topic,
    meetingDate: d.meetingDate.toISOString(),
    attendees: d.attendees,
    chairedById: d.chairedById,
    chairedByName: d.chairedBy?.name ?? null,
    createdById: d.createdById,
    createdBy: d.createdBy,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    items,
    itemCount: items.length,
  };
}

/* ── Reads ───────────────────────────────────────────────────────────────── */

/**
 * Every meeting the CALLER may see, most recent meeting first. Visibility is an
 * additional AND on top of tenant + soft-delete scope — it only narrows.
 */
export const getManagementDecisions = cache(async (session: AuthSession): Promise<ManagementDecisionRow[]> => {
  const rows = await prisma.managementDecision.findMany({
    where: {
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...managementDecisionVisibilityWhere(session),
    },
    select: DECISION_SELECT,
    orderBy: { meetingDate: "desc" },
  });
  return rows.map(toRow);
});

/**
 * A single meeting by id. Visibility enforced IN THE QUERY (no IDOR): a seat user
 * who is neither creator nor an item owner gets `null`, and the detail route 404s
 * — indistinguishable from a meeting that does not exist.
 */
export const getManagementDecision = cache(
  async (id: string, session: AuthSession): Promise<ManagementDecisionRow | null> => {
    const row = await prisma.managementDecision.findFirst({
      where: {
        id,
        tenantId: session.user.tenantId,
        deletedAt: null,
        ...managementDecisionVisibilityWhere(session),
      },
      select: DECISION_SELECT,
    });
    return row ? toRow(row) : null;
  },
);

/**
 * A meeting's supporting documents, on the shared polymorphic `Document` model.
 * GATED: re-runs the visibility check and returns `[]` when the caller cannot see
 * the parent meeting, so a guessed id cannot leak its attachments.
 *
 * Returned as `WorklistDoc[]` so the shared <CategorizedDocUploader> /
 * <DocumentCard> render them with no bespoke adapter.
 */
export const getManagementDecisionDocuments = cache(
  async (decisionId: string, session: AuthSession): Promise<WorklistDoc[]> => {
    const decision = await getManagementDecision(decisionId, session);
    if (!decision) return []; // not visible → no documents, ever.

    const docs = await prisma.document.findMany({
      where: {
        tenantId: session.user.tenantId,
        deletedAt: null,
        sourceModule: DECISION_SOURCE_MODULE,
        sourceId: decisionId,
      },
      select: {
        id: true, fileName: true, fileType: true, fileExtension: true, fileSize: true,
        uploadedBy: true, uploadedById: true, uploadedAt: true, createdAt: true, category: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return docs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      fileType: d.fileType,
      fileExtension: d.fileExtension,
      fileSize: d.fileSize,
      uploadedBy: d.uploadedBy,
      uploadedById: d.uploadedById,
      uploadedAt: (d.uploadedAt ?? d.createdAt).toISOString(),
      category: d.category,
    }));
  },
);

/**
 * The meeting's audit trail (the clock modal). Same visibility gate as the record.
 * This is the "complete history for future reference": creation, every amendment,
 * every item added/removed, and the archive — all durable AuditLog rows.
 */
export const getManagementDecisionAuditTrail = cache(async (decisionId: string, session: AuthSession) => {
  const decision = await getManagementDecision(decisionId, session);
  if (!decision) return [];

  const rows = await prisma.auditLog.findMany({
    where: { tenantId: session.user.tenantId, module: "Governance", recordId: decisionId },
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true, userName: true, userRole: true, oldValue: true, newValue: true, createdAt: true },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
});

/** Assignable action-item owners + meeting chairs: active tenant users, no viewers. */
export async function getDecisionParticipants(session: AuthSession): Promise<{ id: string; name: string; role: string }[]> {
  return prisma.user.findMany({
    where: { tenantId: session.user.tenantId, isActive: true, role: { not: "viewer" } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}
