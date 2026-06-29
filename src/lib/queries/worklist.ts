import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCAPAReadiness, type ReadinessCondition } from "@/lib/capa-readiness";

/**
 * Phase 5 — the Worklist data loader (read-only). Returns the action items
 * assigned to the user PLUS the CAPAs they drive (ownerId), so a driver with
 * no personally-assigned items still sees their CAPA group. All writes happen
 * through the existing Phase-3/4/5 owner/driver server paths; this only reads.
 *
 * Serialised (Dates → ISO) so it can cross the server→client boundary directly.
 */

export interface WorklistItem {
  id: string;
  capaId: string;
  sequence: number;
  description: string;
  owner: string;
  ownerId: string | null;
  dueDate: string;
  status: string;
  completionNotes: string | null;
  reworkReason: string | null;
  reworkRequestedAt: string | null;
}

export interface WorklistEvidenceCategory {
  id: string;
  category: string;
  status: string;
  /** QA rejection reason (when status === "REJECTED"). */
  rejectionReason: string | null;
}

export interface WorklistGroup {
  capa: {
    id: string;
    reference: string | null;
    title: string;
    status: string;
    dueDate: string | null;
    risk: string;
    isDriver: boolean;
  };
  items: WorklistItem[];
  /** Driver-only: readiness summary (consumes the shared getCAPAReadiness). */
  readiness: { metCount: number; total: number; allMet: boolean; conditions: ReadinessCondition[] } | null;
  /** Driver-only: unanswered evidence categories (PENDING / IN_PROGRESS). */
  unansweredEvidence: WorklistEvidenceCategory[] | null;
  /** Driver-only: true when no evidence rows exist yet (needs init). */
  evidenceNeedsInit: boolean;
}

/** Stage 5 — a serialised document row for the worker's task panel (deviation
 *  docs shown read-only; task docs removable). Download via /api/documents/{id}. */
export interface WorklistDoc {
  id: string;
  fileName: string;
  fileType: string | null;
  fileExtension: string | null;
  fileSize: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

/** Stage 5 — one flat, append-only QA↔worker message (no threading/concern). */
export interface WorklistTaskMessage {
  id: string;
  authorId: string | null;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

/** Stage 4 (deviation redesign) — a low-priority DeviationTask assigned to the
 *  user. Rendered as its own worklist section, additively (the CAPA groups are
 *  untouched). The "close" outcome is the SIGNED closeDeviation, not here.
 *  Stage 5 enriches it with full deviation context, the assigner, both document
 *  sets, and the simple QA↔worker conversation. */
export interface WorklistDeviationTask {
  id: string;
  deviationId: string;
  deviationReference: string | null;
  deviationTitle: string;
  message: string;
  dueDate: string | null;
  status: string;
  completionNotes: string | null;
  reworkReason: string | null;
  // Stage 5 — who assigned it + when (resolve name/role client-side from createdById).
  assignerId: string | null;
  assignedAt: string;
  // Stage 5 — the parent deviation's context (what the worker needs to act).
  context: {
    description: string;
    severity: string;
    priority: string | null;
    area: string;
    siteId: string | null;
    detectedBy: string;
    detectedDate: string | null;
    immediateAction: string;
    patientSafetyImpact: string | null;
    productQualityImpact: string | null;
    regulatoryImpact: string | null;
  };
  deviationDocs: WorklistDoc[];   // parent deviation docs — read-only
  taskDocs: WorklistDoc[];        // worker's own task docs — removable
  messages: WorklistTaskMessage[];
}

export interface Worklist {
  groups: WorklistGroup[];
  /** Stage 4 — low-priority deviation tasks assigned to the user (UNION source
   *  alongside the CAPA groups above). */
  deviationTasks: WorklistDeviationTask[];
  openCount: number;
  reworkCount: number;
  nextDue: string | null;
}

const ACTIVE_STATUSES = ["open", "in_progress", "pending_qa_review", "pending_verification"];
const OPEN_ITEM_STATUSES = new Set(["pending", "in_progress", "rework"]);
// Stage 4 — DeviationTask statuses that still need worklist attention.
const DEV_TASK_ACTIVE_STATUSES = ["pending", "in_progress", "submitted", "rework"];

export const getWorklist = cache(async (userId: string, tenantId: string): Promise<Worklist> => {
  const [items, drivenCapas, devTasks] = await Promise.all([
    prisma.cAPAActionItem.findMany({
      // Exclude soft-deleted items and items whose parent CAPA was soft-deleted.
      where: { ownerId: userId, tenantId, deletedAt: null, capa: { deletedAt: null } },
      orderBy: { dueDate: "asc" },
      include: {
        capa: {
          select: {
            id: true, reference: true, description: true, status: true,
            dueDate: true, risk: true, ownerId: true,
          },
        },
      },
    }),
    prisma.cAPA.findMany({
      where: { tenantId, ownerId: userId, status: { in: ACTIVE_STATUSES }, deletedAt: null },
      select: { id: true, reference: true, description: true, status: true, dueDate: true, risk: true, ownerId: true },
    }),
    // Stage 4 — low-priority DeviationTasks assigned to this user (the UNION
    // source). Excludes soft-deleted tasks and tasks on resolved deviations.
    prisma.deviationTask.findMany({
      where: {
        assigneeId: userId, tenantId, deletedAt: null,
        status: { in: DEV_TASK_ACTIVE_STATUSES },
        deviation: { is: { status: { notIn: ["closed", "rejected"] }, deletedAt: null } },
      },
      orderBy: { dueDate: "asc" },
      include: {
        // Stage 5 — full deviation context for the worker panel.
        deviation: { select: {
          id: true, reference: true, title: true, description: true, severity: true,
          priority: true, area: true, siteId: true, detectedBy: true, detectedDate: true,
          immediateAction: true, patientSafetyImpact: true, productQualityImpact: true, regulatoryImpact: true,
        } },
        // Stage 5 — flat append-only QA↔worker conversation (oldest first).
        messages: { orderBy: { createdAt: "asc" }, select: { id: true, authorId: true, authorName: true, authorRole: true, body: true, createdAt: true } },
      },
    }),
  ]);

  // Build the group set: every CAPA the user has items in, plus every CAPA the
  // user drives (even with zero assigned items).
  const groupCapas = new Map<string, (typeof items)[number]["capa"]>();
  for (const it of items) groupCapas.set(it.capa.id, it.capa);
  for (const c of drivenCapas) if (!groupCapas.has(c.id)) groupCapas.set(c.id, c);

  const itemsByCapa = new Map<string, typeof items>();
  for (const it of items) {
    const arr = itemsByCapa.get(it.capaId) ?? [];
    arr.push(it);
    itemsByCapa.set(it.capaId, arr);
  }

  const groups: WorklistGroup[] = [];
  for (const [capaId, capa] of groupCapas) {
    const isDriver = capa.ownerId === userId;
    const groupItems: WorklistItem[] = (itemsByCapa.get(capaId) ?? []).map((it) => ({
      id: it.id,
      capaId: it.capaId,
      sequence: it.sequence,
      description: it.description,
      owner: it.owner,
      ownerId: it.ownerId,
      dueDate: it.dueDate.toISOString(),
      status: it.status,
      completionNotes: it.completionNotes,
      reworkReason: it.reworkReason,
      reworkRequestedAt: it.reworkRequestedAt ? it.reworkRequestedAt.toISOString() : null,
    }));

    let readiness: WorklistGroup["readiness"] = null;
    let unansweredEvidence: WorklistEvidenceCategory[] | null = null;
    let evidenceNeedsInit = false;

    if (isDriver) {
      const [allActions, evidence, criteria, capaRow] = await Promise.all([
        prisma.cAPAActionItem.findMany({ where: { capaId, tenantId, deletedAt: null }, select: { status: true } }),
        prisma.evidenceItem.findMany({ where: { capaId }, select: { id: true, category: true, status: true, rejectionReason: true } }),
        prisma.cAPAEffectivenessCriterion.findMany({ where: { capaId, deletedAt: null }, select: { id: true } }),
        prisma.cAPA.findUnique({
          where: { id: capaId },
          select: { rcaApproved: true, alignmentStatus: true, alignmentOverrideReason: true, diGate: true, diGateStatus: true },
        }),
      ]);
      const r = getCAPAReadiness(capaRow!, allActions, evidence, criteria);
      readiness = {
        metCount: r.conditions.filter((c) => c.met).length,
        total: r.conditions.length,
        allMet: r.allMet,
        conditions: r.conditions,
      };
      evidenceNeedsInit = evidence.length === 0;
      // Surface categories that still need the driver's attention: not-yet-
      // answered (PENDING/IN_PROGRESS) PLUS QA-rejected ones (need re-work).
      unansweredEvidence = evidence
        .filter((e) => e.status === "PENDING" || e.status === "IN_PROGRESS" || e.status === "REJECTED")
        .map((e) => ({ id: e.id, category: e.category, status: e.status, rejectionReason: e.rejectionReason }));
    }

    groups.push({
      capa: {
        id: capa.id,
        reference: capa.reference,
        title: capa.description,
        status: capa.status,
        dueDate: capa.dueDate ? capa.dueDate.toISOString() : null,
        risk: capa.risk,
        isDriver,
      },
      items: groupItems,
      readiness,
      unansweredEvidence,
      evidenceNeedsInit,
    });
  }

  // Driver groups first, then groups with the soonest item due date.
  groups.sort((a, b) => {
    if (a.capa.isDriver !== b.capa.isDriver) return a.capa.isDriver ? -1 : 1;
    const ad = a.items[0]?.dueDate ?? a.capa.dueDate ?? "";
    const bd = b.items[0]?.dueDate ?? b.capa.dueDate ?? "";
    return ad.localeCompare(bd);
  });

  // Stage 5 — both document sets for the worker panel in ONE tenant-scoped
  // query (mirrors the batch pattern in queries/deviations.ts): the parent
  // deviation's docs (read-only) + the worker's own task docs (removable).
  const devTaskIds = devTasks.map((t) => t.id);
  const devTaskDevIds = [...new Set(devTasks.map((t) => t.deviationId))];
  const taskRelatedDocs = devTaskIds.length > 0
    ? await prisma.document.findMany({
        where: {
          tenantId, deletedAt: null,
          OR: [
            { linkedModule: "Deviation Management", linkedRecordId: { in: devTaskDevIds } },
            { linkedModule: "Deviation Task", linkedRecordId: { in: devTaskIds } },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, fileName: true, originalFileName: true, fileType: true, fileExtension: true,
          fileSize: true, uploadedBy: true, uploadedAt: true, createdAt: true, linkedModule: true, linkedRecordId: true,
        },
      })
    : [];
  const devDocsByDev = new Map<string, WorklistDoc[]>();
  const taskDocsByTask = new Map<string, WorklistDoc[]>();
  for (const d of taskRelatedDocs) {
    if (!d.linkedRecordId) continue;
    const row: WorklistDoc = {
      id: d.id,
      fileName: d.originalFileName ?? d.fileName,
      fileType: d.fileType,
      fileExtension: d.fileExtension,
      fileSize: d.fileSize,
      uploadedBy: d.uploadedBy,
      uploadedAt: (d.uploadedAt ?? d.createdAt).toISOString(),
    };
    const bucket = d.linkedModule === "Deviation Task" ? taskDocsByTask : devDocsByDev;
    const arr = bucket.get(d.linkedRecordId) ?? [];
    arr.push(row);
    bucket.set(d.linkedRecordId, arr);
  }

  // Stage 4/5 — serialise the deviation-task union (additive; the CAPA groups
  // above are untouched), now with full context + docs + conversation.
  const deviationTasks: WorklistDeviationTask[] = devTasks.map((t) => ({
    id: t.id,
    deviationId: t.deviationId,
    deviationReference: t.deviation.reference,
    deviationTitle: t.deviation.title,
    message: t.message,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    status: t.status,
    completionNotes: t.completionNotes,
    reworkReason: t.reworkReason,
    assignerId: t.createdById,
    assignedAt: t.createdAt.toISOString(),
    context: {
      description: t.deviation.description,
      severity: t.deviation.severity,
      priority: t.deviation.priority,
      area: t.deviation.area,
      siteId: t.deviation.siteId,
      detectedBy: t.deviation.detectedBy,
      detectedDate: t.deviation.detectedDate ? t.deviation.detectedDate.toISOString() : null,
      immediateAction: t.deviation.immediateAction ?? "",
      patientSafetyImpact: t.deviation.patientSafetyImpact,
      productQualityImpact: t.deviation.productQualityImpact,
      regulatoryImpact: t.deviation.regulatoryImpact,
    },
    deviationDocs: devDocsByDev.get(t.deviationId) ?? [],
    taskDocs: taskDocsByTask.get(t.id) ?? [],
    messages: t.messages.map((m) => ({
      id: m.id, authorId: m.authorId, authorName: m.authorName, authorRole: m.authorRole,
      body: m.body, createdAt: m.createdAt.toISOString(),
    })),
  }));

  const openItems = items.filter((i) => OPEN_ITEM_STATUSES.has(i.status));
  // Open deviation tasks count toward the worklist totals (submitted ones are
  // awaiting QA, so they're excluded from "open" like complete CAPA items).
  const openDevTasks = deviationTasks.filter((t) => OPEN_ITEM_STATUSES.has(t.status));
  const reworkCount =
    items.filter((i) => i.status === "rework").length +
    deviationTasks.filter((t) => t.status === "rework").length;
  const dueCandidates = [
    ...openItems.map((i) => i.dueDate.toISOString()),
    ...openDevTasks.map((t) => t.dueDate).filter((d): d is string => d !== null),
  ].sort((a, b) => a.localeCompare(b));
  const nextDue = dueCandidates.length > 0 ? dueCandidates[0] : null;

  return {
    groups,
    deviationTasks,
    openCount: openItems.length + openDevTasks.length,
    reworkCount,
    nextDue,
  };
});
