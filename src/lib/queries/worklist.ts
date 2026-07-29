import { cache } from "react";
import { prisma } from "@/lib/prisma";

/**
 * Phase 5 — the Worklist data loader (read-only). Aggregates everything assigned
 * to the user across modules: CAPA action items (CAPAActionItem.ownerId),
 * low-priority deviation tasks and CSV/CSA stage tasks (assigneeId), and gap
 * findings still owned by the user (Finding.owner) that have NOT yet moved to a
 * CAPA. It does NOT query whole CAPAs by CAPA.ownerId — a CAPA reaches the
 * Worklist ONLY via its assigned action items. All writes happen through the
 * existing owner/driver server paths; this only reads.
 *
 * Serialised (Dates → ISO) so it can cross the server→client boundary directly.
 */

/**
 * A CAPA ACTION ITEM assigned to the user (CAPAActionItem.ownerId == userId) —
 * the unit of "my CAPA work" in the rebuilt worklist. Rendered as a Finding-style
 * work card (source = "CAPA"), NOT the old whole-CAPA readiness cockpit. Carries
 * the parent-CAPA reference/link (KEEP), the action's own evidence files, and the
 * CAPA's evidence categories (for category→item upload mapping).
 */
export interface WorklistActionItem {
  id: string;
  /** Parent CAPA link — KEEP (capaId + reference drive the source chip/link). */
  capaId: string;
  capaReference: string | null;
  capaTitle: string;
  capaRisk: string;
  /** open/in_progress → editable; anything else locks the work surface. */
  capaEditable: boolean;
  /** Raw parent-CAPA status. Phase 7 — drives the worklist "accepted & the CAPA
   *  is closed" closed-state message (capaStatus === "closed"). */
  capaStatus: string;
  description: string;
  assigneeName: string;
  dueDate: string;
  status: string;
  completionNotes: string | null;
  reworkReason: string | null;
  /** This action's evidence files (EvidenceFile), as WorklistDocs served from
   *  /api/evidence/files/{id}. */
  docs: WorklistDoc[];
  /** Item 6 — the SOURCE-module docs (gap finding / deviation that spawned the
   *  parent CAPA), read-only, served from /api/documents/{id}. Shown in the
   *  worklist detail's "Related documents" section (View + Download). */
  relatedDocs: WorklistDoc[];
  /** The parent CAPA's evidence categories (id + category) so the work modal can
   *  map a chosen upload category → its EvidenceItem. */
  evidenceItems: { id: string; category: string }[];
  messages: WorklistTaskMessage[];
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
  /** Uploader's User id (Document.uploadedById) — lets a consumer split doc origin
   *  (e.g. Gap detail: worker-uploaded vs gap-native). Optional; not all loaders set it. */
  uploadedById?: string | null;
  uploadedAt: string;
  /** Optional download/view route override. Defaults to /api/documents/{id}
   *  (Document rows). CAPA-action evidence is an EvidenceFile row, downloaded via
   *  /api/evidence/files/{id}, so those docs set this explicitly. */
  href?: string;
  /** Piece 1 — GxP category (one of EVIDENCE_CATEGORIES) for task docs; null for
   *  parent deviation docs and legacy/uncategorized task docs. */
  category: string | null;
  /** Gap-doc bucket stamped at upload: "create" | "work". Null on legacy rows
   *  until the backfill runs. Drives the gap detail's stable doc split. */
  uploadSource?: string | null;
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
  /** Parent deviation status (open/under_investigation/closed/rejected/…) so the
   *  worklist item REFLECTS the source record's resolution. */
  deviationStatus: string;
  /** Deviation.closureNotes — the Close Message, shown on the worklist detail
   *  when the deviation is closed (mirrors the Deviation module). */
  closureMessage: string | null;
  closedDate: string | null;
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
  };
  deviationDocs: WorklistDoc[];   // parent deviation docs — read-only
  taskDocs: WorklistDoc[];        // worker's own task docs — removable
  messages: WorklistTaskMessage[];
}

/** CSV/CSA stage rework task assigned to the user (UNION source alongside the
 *  CAPA groups and deviation tasks). Surfaces the Validation Lead's delegated
 *  fix-item; the worker acts on it here or on the system's Execute tab. */
export interface WorklistStageTask {
  id: string;
  systemId: string;
  systemName: string;
  systemReference: string | null;
  stageName: string;
  message: string;
  findingRef: string | null;
  status: string;
  completionNotes: string | null;
  reworkReason: string | null;
  dueDate: string | null;
  assignedAt: string;
}

/** A gap-assessment Finding assigned to the user (Finding.owner == userId). UNION
 *  source alongside the CAPA groups + deviation tasks. */
export interface WorklistFinding {
  id: string;
  reference: string | null;
  requirement: string;
  framework: string | null;
  area: string;
  severity: string;
  status: string;
  targetDate: string | null;
  /** Gap Step 3 — the assignee's work/completion notes. */
  completionNotes: string | null;
  /** Gap Step 3 — the finding's evidence docs (Document, linkedModule
   *  "Gap Assessment"), grouped by GxP category in the panel. */
  docs: WorklistDoc[];
  /** Gap Step 4 — QA's current rework "ask" (banner); history is in messages. */
  reworkReason: string | null;
  /** Gap Step 4 — the flat QA↔assignee conversation. */
  messages: WorklistTaskMessage[];
}

export interface Worklist {
  /** Assigned CAPA action items (CAPAActionItem.ownerId == userId), rendered as
   *  Finding-style cards. Replaces the old per-CAPA readiness `groups`. */
  assignedActions: WorklistActionItem[];
  /** Stage 4 — low-priority deviation tasks assigned to the user (UNION source). */
  deviationTasks: WorklistDeviationTask[];
  /** CSV/CSA stage rework tasks assigned to the user (UNION source). */
  stageTasks: WorklistStageTask[];
  /** Gap Step 2 — gap-assessment findings assigned to the user (owner == userId). */
  assignedFindings: WorklistFinding[];
  openCount: number;
  reworkCount: number;
}

const OPEN_ITEM_STATUSES = new Set(["pending", "in_progress", "rework"]);
// Stage 4 — DeviationTask statuses that still need worklist attention.
const DEV_TASK_ACTIVE_STATUSES = ["pending", "in_progress", "submitted", "rework"];
// Gap Step 2/4 — Finding statuses that still need worklist attention (includes
// the Step-4 loop states; "Submitted" stays visible while it awaits QA review).
const FINDING_ACTIVE_STATUSES = ["Open", "In Progress", "Submitted", "Rework"];

export const getWorklist = cache(async (userId: string, tenantId: string): Promise<Worklist> => {
  const [items, devTasks, stageTaskRows, assignedFindingRows] = await Promise.all([
    prisma.cAPAActionItem.findMany({
      // Exclude soft-deleted items and items whose parent CAPA was soft-deleted.
      where: { ownerId: userId, tenantId, deletedAt: null, capa: { deletedAt: null } },
      orderBy: { dueDate: "asc" },
      include: {
        capa: {
          select: {
            id: true, reference: true, description: true, status: true,
            dueDate: true, risk: true, ownerId: true,
            // Item 6 — source links so the worker can see the originating
            // gap-finding / deviation docs on the action item (read-only).
            findingId: true, deviationId: true, source: true,
          },
        },
      },
    }),
    // Stage 4 — low-priority DeviationTasks assigned to this user (the UNION
    // source). Excludes soft-deleted tasks and tasks on resolved deviations.
    prisma.deviationTask.findMany({
      where: {
        assigneeId: userId, tenantId, deletedAt: null,
        // Include "closed" tasks (closeDeviation sets the linked task to "closed")
        // and drop the deviation-status exclusion, so a CLOSED deviation's task
        // REFLECTS CLOSED here instead of vanishing — the status syncs from the
        // source record. deletedAt is still excluded.
        status: { in: [...DEV_TASK_ACTIVE_STATUSES, "closed"] },
        deviation: { is: { deletedAt: null } },
      },
      orderBy: { dueDate: "asc" },
      include: {
        // Stage 5 — full deviation context for the worker panel; plus the parent
        // deviation's status + closure message (Deviation.closureNotes) so the
        // worklist detail reflects Closed and shows the Close Message.
        deviation: { select: {
          id: true, reference: true, title: true, description: true, severity: true,
          priority: true, area: true, siteId: true, detectedBy: true, detectedDate: true,
          immediateAction: true,
          status: true, closureNotes: true, closedDate: true,
        } },
        // Stage 5 — flat append-only QA↔worker conversation (oldest first).
        messages: { orderBy: { createdAt: "asc" }, select: { id: true, authorId: true, authorName: true, authorRole: true, body: true, createdAt: true } },
      },
    }),
    // CSV/CSA stage rework tasks assigned to this user (UNION source). Excludes
    // soft-deleted/cancelled tasks; closed ones drop off the worklist.
    prisma.validationStageTask.findMany({
      where: {
        assigneeId: userId, tenantId, deletedAt: null,
        status: { in: DEV_TASK_ACTIVE_STATUSES },
      },
      orderBy: { dueDate: "asc" },
      include: {
        validationStage: { select: { stageName: true, system: { select: { name: true, reference: true } } } },
      },
    }),
    // Gap findings assigned to this user (Finding.owner holds a userId). UNION
    // source; mirrors the deviation-task block above. Active statuses only
    // (FINDING_ACTIVE_STATUSES); "Closed" drops off.
    prisma.finding.findMany({
      // linkedCAPAId: null — once a CAPA is raised from a finding, remediation
      // moves to the CAPA lifecycle, so the finding drops off the owner's
      // Worklist (it still renders In Progress + linked in Gap Assessment).
      where: { owner: userId, tenantId, deletedAt: null, linkedCAPAId: null, status: { in: FINDING_ACTIVE_STATUSES } },
      orderBy: { targetDate: "asc" },
      select: {
        id: true, reference: true, requirement: true, framework: true, area: true, severity: true,
        status: true, targetDate: true, completionNotes: true, reworkReason: true,
        messages: { orderBy: { createdAt: "asc" }, select: { id: true, authorId: true, authorName: true, authorRole: true, body: true, createdAt: true } },
      },
    }),
  ]);

  // ── Assigned CAPA ACTION ITEMS → Finding-style work cards (replaces the old
  //    per-CAPA readiness "groups" + getCAPAReadiness computation, which now
  //    lives ONLY on the CAPA detail page). Batch-load per-action evidence files
  //    (EvidenceFile, served from /api/evidence/files/{id}), the QA↔worker
  //    comment thread (CAPAComment.actionItemId), and the parent CAPA's evidence
  //    categories (id + category) so the work modal can map an upload category to
  //    its EvidenceItem. All tenant-scoped. ──
  const actionIds = items.map((it) => it.id);
  const actionCapaIds = [...new Set(items.map((it) => it.capaId))];
  const [actionEvidenceFiles, actionComments, capaEvidenceItems] = await Promise.all([
    actionIds.length
      ? prisma.evidenceFile.findMany({
          where: { actionItemId: { in: actionIds }, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, fileName: true, fileType: true, fileSize: true, uploadedBy: true, createdAt: true, actionItemId: true, evidenceItem: { select: { category: true } } },
        })
      : Promise.resolve([]),
    actionIds.length
      ? prisma.cAPAComment.findMany({
          where: { actionItemId: { in: actionIds }, tenantId, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, actionItemId: true, authorId: true, authorName: true, authorRole: true, body: true, createdAt: true },
        })
      : Promise.resolve([]),
    actionCapaIds.length
      ? prisma.evidenceItem.findMany({ where: { capaId: { in: actionCapaIds } }, select: { id: true, capaId: true, category: true } })
      : Promise.resolve([]),
  ]);

  const evByAction = new Map<string, WorklistDoc[]>();
  for (const f of actionEvidenceFiles) {
    if (!f.actionItemId) continue;
    const arr = evByAction.get(f.actionItemId) ?? [];
    arr.push({
      id: f.id,
      fileName: f.fileName,
      fileType: f.fileType,
      fileExtension: null,
      fileSize: String(f.fileSize),
      uploadedBy: f.uploadedBy,
      uploadedAt: f.createdAt.toISOString(),
      href: `/api/evidence/files/${f.id}`,
      category: f.evidenceItem?.category ?? null,
    });
    evByAction.set(f.actionItemId, arr);
  }
  const commentsByAction = new Map<string, WorklistTaskMessage[]>();
  for (const c of actionComments) {
    if (!c.actionItemId) continue;
    const arr = commentsByAction.get(c.actionItemId) ?? [];
    arr.push({ id: c.id, authorId: c.authorId, authorName: c.authorName, authorRole: c.authorRole, body: c.body, createdAt: c.createdAt.toISOString() });
    commentsByAction.set(c.actionItemId, arr);
  }
  const evItemsByCapa = new Map<string, { id: string; category: string }[]>();
  for (const e of capaEvidenceItems) {
    const arr = evItemsByCapa.get(e.capaId) ?? [];
    arr.push({ id: e.id, category: e.category });
    evItemsByCapa.set(e.capaId, arr);
  }

  // Item 6 — the SOURCE-module docs behind each assigned CAPA action item: the
  // gap finding (linkedModule "Gap Assessment") or the deviation (+ its tasks)
  // that spawned the parent CAPA. ONE tenant-scoped query (mirrors the deviation-
  // task + finding branches below), grouped per source, then attached to each
  // action via its parent CAPA. Read-only, served from /api/documents/{id}.
  const srcFindingIds = [...new Set(items.map((it) => it.capa.findingId).filter((v): v is string => !!v))];
  const srcDeviationIds = [...new Set(items.map((it) => it.capa.deviationId).filter((v): v is string => !!v))];
  const srcDevTasks = srcDeviationIds.length
    ? await prisma.deviationTask.findMany({ where: { deviationId: { in: srcDeviationIds }, tenantId }, select: { id: true, deviationId: true } })
    : [];
  const taskIdToDev = new Map(srcDevTasks.map((t) => [t.id, t.deviationId]));
  const srcTaskIds = srcDevTasks.map((t) => t.id);
  const srcDocs = (srcFindingIds.length || srcDeviationIds.length)
    ? await prisma.document.findMany({
        where: {
          tenantId, deletedAt: null,
          OR: [
            ...(srcFindingIds.length ? [{ linkedModule: "Gap Assessment", linkedRecordId: { in: srcFindingIds } }] : []),
            ...(srcDeviationIds.length ? [{ linkedModule: "Deviation Management", linkedRecordId: { in: srcDeviationIds } }] : []),
            ...(srcTaskIds.length ? [{ linkedModule: "Deviation Task", linkedRecordId: { in: srcTaskIds } }] : []),
          ],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, fileName: true, originalFileName: true, fileType: true, fileExtension: true,
          fileSize: true, uploadedBy: true, uploadedAt: true, createdAt: true, category: true,
          linkedModule: true, linkedRecordId: true,
        },
      })
    : [];
  const srcDocsByFinding = new Map<string, WorklistDoc[]>();
  const srcDocsByDeviation = new Map<string, WorklistDoc[]>();
  for (const d of srcDocs) {
    if (!d.linkedRecordId) continue;
    const row: WorklistDoc = {
      id: d.id,
      fileName: d.originalFileName ?? d.fileName,
      fileType: d.fileType,
      fileExtension: d.fileExtension,
      fileSize: d.fileSize,
      uploadedBy: d.uploadedBy,
      uploadedAt: (d.uploadedAt ?? d.createdAt).toISOString(),
      category: d.category,
    };
    if (d.linkedModule === "Gap Assessment") {
      const arr = srcDocsByFinding.get(d.linkedRecordId) ?? []; arr.push(row); srcDocsByFinding.set(d.linkedRecordId, arr);
    } else if (d.linkedModule === "Deviation Management") {
      const arr = srcDocsByDeviation.get(d.linkedRecordId) ?? []; arr.push(row); srcDocsByDeviation.set(d.linkedRecordId, arr);
    } else if (d.linkedModule === "Deviation Task") {
      const devId = taskIdToDev.get(d.linkedRecordId);
      if (!devId) continue;
      const arr = srcDocsByDeviation.get(devId) ?? []; arr.push(row); srcDocsByDeviation.set(devId, arr);
    }
  }
  const relatedDocsForCapa = (findingId: string | null, deviationId: string | null): WorklistDoc[] => [
    ...(findingId ? srcDocsByFinding.get(findingId) ?? [] : []),
    ...(deviationId ? srcDocsByDeviation.get(deviationId) ?? [] : []),
  ];

  const EDITABLE_CAPA_STATUSES = new Set(["open", "in_progress"]);
  const assignedActions: WorklistActionItem[] = items.map((it) => ({
    id: it.id,
    capaId: it.capaId,
    capaReference: it.capa.reference,
    capaTitle: it.capa.description,
    capaRisk: it.capa.risk,
    // Phase 5 — a rework item stays workable even while its parent CAPA is under
    // QA review: sendWorkBack returns ONE person's items to rework without
    // reopening the whole CAPA, and the server permits the owner's rework→complete
    // when locked (action-items.ts:382-389). Without this the worklist shows the
    // "Returned by QA" reason but the work surface is read-only — the button that
    // does nothing.
    capaEditable: EDITABLE_CAPA_STATUSES.has(it.capa.status) || it.status === "rework",
    capaStatus: it.capa.status,
    description: it.description,
    assigneeName: it.owner,
    dueDate: it.dueDate.toISOString(),
    status: it.status,
    completionNotes: it.completionNotes,
    reworkReason: it.reworkReason,
    docs: evByAction.get(it.id) ?? [],
    relatedDocs: relatedDocsForCapa(it.capa.findingId, it.capa.deviationId),
    evidenceItems: evItemsByCapa.get(it.capaId) ?? [],
    messages: commentsByAction.get(it.id) ?? [],
  }));

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
          category: true,
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
      category: d.category,
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
    deviationStatus: t.deviation.status,
    closureMessage: t.deviation.closureNotes,
    closedDate: t.deviation.closedDate ? t.deviation.closedDate.toISOString() : null,
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
    },
    deviationDocs: devDocsByDev.get(t.deviationId) ?? [],
    taskDocs: taskDocsByTask.get(t.id) ?? [],
    messages: t.messages.map((m) => ({
      id: m.id, authorId: m.authorId, authorName: m.authorName, authorRole: m.authorRole,
      body: m.body, createdAt: m.createdAt.toISOString(),
    })),
  }));

  // CSV/CSA stage rework tasks → serialise (additive UNION source).
  const stageTasks: WorklistStageTask[] = stageTaskRows.map((t) => ({
    id: t.id,
    systemId: t.systemId,
    systemName: t.validationStage.system.name,
    systemReference: t.validationStage.system.reference,
    stageName: t.validationStage.stageName,
    message: t.message,
    findingRef: t.findingRef,
    status: t.status,
    completionNotes: t.completionNotes,
    reworkReason: t.reworkReason,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    assignedAt: t.createdAt.toISOString(),
  }));

  // Gap Step 2 — serialise the findings union (Dates → ISO). Every returned
  // finding is active ("Open" / "In Progress"), so all of them are open work.
  // Gap Step 3 — each assigned finding's own evidence documents (linkedModule
  // "Gap Assessment"), with category, so the panel shows them grouped (reusing
  // GroupedTaskDocs). ONE tenant-scoped query; serialised to the WorklistDoc shape.
  const findingIds = assignedFindingRows.map((f) => f.id);
  const findingDocsByFinding = new Map<string, WorklistDoc[]>();
  if (findingIds.length > 0) {
    const findingDocs = await prisma.document.findMany({
      where: { tenantId, linkedModule: "Gap Assessment", linkedRecordId: { in: findingIds }, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, fileName: true, originalFileName: true, fileType: true, fileExtension: true,
        fileSize: true, uploadedBy: true, uploadedAt: true, createdAt: true, category: true, linkedRecordId: true,
        // The stable upload bucket, so the work item can split the worker's OWN
        // uploads ("work") from the gap's creation documents ("create"). Without
        // it every consumer sees `undefined` and mis-buckets EVERY gap doc.
        uploadSource: true,
      },
    });
    for (const d of findingDocs) {
      if (!d.linkedRecordId) continue;
      const row: WorklistDoc = {
        id: d.id,
        fileName: d.originalFileName ?? d.fileName,
        fileType: d.fileType,
        fileExtension: d.fileExtension,
        fileSize: d.fileSize,
        uploadedBy: d.uploadedBy,
        uploadedAt: (d.uploadedAt ?? d.createdAt).toISOString(),
        category: d.category,
        uploadSource: d.uploadSource,
      };
      const arr = findingDocsByFinding.get(d.linkedRecordId) ?? [];
      arr.push(row);
      findingDocsByFinding.set(d.linkedRecordId, arr);
    }
  }

  const assignedFindings: WorklistFinding[] = assignedFindingRows.map((f) => ({
    id: f.id,
    reference: f.reference,
    requirement: f.requirement,
    framework: f.framework,
    area: f.area,
    severity: f.severity,
    status: f.status,
    targetDate: f.targetDate ? f.targetDate.toISOString() : null,
    completionNotes: f.completionNotes,
    docs: findingDocsByFinding.get(f.id) ?? [],
    reworkReason: f.reworkReason,
    messages: f.messages.map((m) => ({
      id: m.id, authorId: m.authorId, authorName: m.authorName, authorRole: m.authorRole,
      body: m.body, createdAt: m.createdAt.toISOString(),
    })),
  }));

  const openItems = items.filter((i) => OPEN_ITEM_STATUSES.has(i.status));
  // Open deviation tasks count toward the worklist totals (submitted ones are
  // awaiting QA, so they're excluded from "open" like complete CAPA items).
  const openDevTasks = deviationTasks.filter((t) => OPEN_ITEM_STATUSES.has(t.status));
  const openStageTasks = stageTasks.filter((t) => OPEN_ITEM_STATUSES.has(t.status));
  // Gap Step 4 — open finding work = Open / In Progress / Rework. "Submitted" is
  // awaiting QA (excluded from "open", like a submitted deviation task).
  const openFindings = assignedFindings.filter((f) => f.status !== "Submitted" && f.status !== "Closed");
  const reworkCount =
    items.filter((i) => i.status === "rework").length +
    deviationTasks.filter((t) => t.status === "rework").length +
    stageTasks.filter((t) => t.status === "rework").length +
    assignedFindings.filter((f) => f.status === "Rework").length;

  return {
    assignedActions,
    deviationTasks,
    stageTasks,
    assignedFindings,
    openCount: openItems.length + openDevTasks.length + openStageTasks.length + openFindings.length,
    reworkCount,
  };
});
