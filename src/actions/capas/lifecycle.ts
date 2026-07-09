"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES, ADMIN_DELETE_ROLES } from "@/lib/auth";
import { CAPA_DI_GATE_ROLES, CAPA_REJECT_ROLES, CAPA_REOPEN_ROLES, CAPA_CREATE_ROLES, DEVIATION_QA_ROLES, isAssignedToTask } from "@/lib/permissions/roleSets";
import { getCAPAReadiness } from "@/lib/capa-readiness";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { EVIDENCE_CATEGORIES } from "@/lib/queries/evidence";
import {
  lockCAPAArtifacts,
  unlockCAPAArtifacts,
  LOCKED_CAPA_STATUSES,
} from "@/lib/evidence-lock";
import { buildReferencePrefix, generateReference, isReferenceConflict } from "@/lib/reference";
import type { ActionResult } from "./_types";
import { sanitizeServerError } from "@/lib/errors";
import { notify, notifyMany } from "@/lib/notify";

/* â”€â”€ CAPA lifecycle actions â”€â”€
 *
 * Create / update / clearDIGate / submitForReview / rejectCAPA /
 * deleteCAPA. Closure (signAndCloseCAPA) lives in closure.ts because
 * it carries the CC-dependency gate; alignment + approvals are split
 * out into their own files. Each file has its own "use server" so they
 * can be tree-shaken independently.
 */

// â”€â”€ Schemas â”€â”€

const CreateCAPASchema = z.object({
  // Phase A — short human title (flows into create via ...rest).
  title: z.string().min(1, "Title is required").max(120, "Title must be 120 characters or fewer"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  source: z.enum([
    "Gap Assessment",
    "Deviation",
    "FDA 483",
    "Internal Audit",
    "External Audit",
    "Customer Complaint",
    "CSV/CSA",
    "Other",
  ]),
  risk: z.enum(["Critical", "High", "Medium", "Low"]),
  owner: z.string().optional(),
  dueDate: z.string().min(1, "Due date is required"),
  siteId: z.string().optional(),
  linkedFindingId: z.string().optional(),
  linkedDeviationId: z.string().optional(),
  // RUNG 2 — optional GxP system this CAPA is raised against (CSV/CSA).
  // Flows through `...rest` into the create; persisted as CAPA.systemId.
  systemId: z.string().optional(),
  diGateRequired: z.boolean().optional(),
  // FDA 483 raise carries the RCA captured at the observation. Additive —
  // these columns already exist on CAPA (the old FDA 483 direct create wrote
  // them, and updateCAPA edits them); they flow into the create via `...rest`.
  rca: z.string().optional(),
  rcaMethod: z.string().optional(),
  // Batch 2 — optional structured RCA at creation (flows in via ...rest).
  rcaDetail: z.string().optional(),
  // Batch 2b — DI detail accepted on create too (the New CAPA modal collects
  // only the toggle today; create maps diGateRequired → diGate + status
  // "pending". These flow via ...rest if a caller supplies them).
  diGateStatus: z.enum(["open", "cleared", "pending"]).optional(),
  diGateReviewedBy: z.string().optional(),
  diGateNotes: z.string().optional(),
});

const UpdateCAPASchema = z.object({
  // Phase A — editable short title (written via ...parsed.data spread).
  // Required + trimmed: a blank/whitespace title is rejected server-side with
  // a clear message (the Edit form marks it required; enforce it here too).
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be 120 characters or fewer"),
  description: z.string().min(10).optional(),
  source: z.string().optional(),
  risk: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  owner: z.string().optional(),
  dueDate: z.string().optional(),
  // RUNG 3D-CAPA — status intentionally removed (was the Part 11 lifecycle
  // bypass, Finding #1). Transitions go through dedicated guarded actions.
  // Phase E-REVERT — rca / rcaMethod restored: the Edit modal is the RCA
  // authoring surface for Gap-Assessment + manual CAPAs (the Worklist B4 task
  // doesn't cover those). Method must be one of the four RCAMethod values.
  rca: z.string().optional(),
  rcaMethod: z.string().optional(),
  // Batch 2 — structured RCA JSON (the readable mirror still lands in `rca`).
  rcaDetail: z.string().optional(),
  // SME Section 1, Stage 4 (FULL) â€” correctiveActions is now managed
  // via the structured CAPAActionItem rows (addActionItem /
  // updateActionItem / deleteActionItem / reorderActionItems). The
  // field stays on the CAPA model as a denormalised cache rebuilt by
  // syncCorrectiveActions, but direct writes are blocked here so the
  // structured surface is the only path. updateCAPA refuses payloads
  // that include it; see the guard below.
  correctiveActions: z.string().optional(),
  // Batch 2b — DI gate detail (persisted from the Edit modal). diGateReviewDate
  // is NOT accepted from the client — the server stamps it (see write below).
  diGate: z.boolean().optional(),
  diGateStatus: z.enum(["open", "cleared", "pending"]).optional(),
  diGateReviewedBy: z.string().optional(),
  diGateNotes: z.string().optional(),
});

const ClearDIGateSchema = z.object({
  notes: z.string().optional(),
});

const RejectSchema = z.object({
  reason: z.string().min(5, "Rejection reason must be at least 5 characters"),
  // Phase 4 — targeted reject. Optional list of action-item ids to bounce back
  // for rework; each gets status "rework" + the reason recorded. Omitting it
  // bounces the whole CAPA to in_progress without flagging specific items.
  reworkItems: z.array(z.string().min(1)).optional(),
  // Per-evidence disposition — optional list of EvidenceItem ids to reject;
  // each gets status "REJECTED" + the reason + reviewer, in the same bounce.
  rejectedEvidenceItems: z.array(z.string().min(1)).optional(),
});

// RUNG 3D-CAPA — reopening a closed/rejected CAPA is a senior corrective act;
// a substantive reason (≥10 chars) is required and audited.
const ReopenCAPASchema = z.object({
  reason: z.string().min(10, "A reason of at least 10 characters is required to reopen").max(2000),
});

// â”€â”€ Actions â”€â”€

// Roles permitted to create a CAPA (server-side authz; mirrors the Rung 3A
// SYSTEM_WRITE_ROLES pattern). Every module's "raise CAPA" path funnels
// through createCAPA, so this single gate covers Gap / Deviation / CSV/CSA /
// FDA 483 / manual / AI at once. regulatory_affairs is included because FDA
// 483 + CAPA work is their domain. Raw session role (not resolveUserFk).
// Rung 3A-bis — consolidated onto the canonical COMPLIANCE_AUTHOR_ROLES
// (@/lib/auth); identical values, single source of truth.
const CAPA_WRITE_ROLES = COMPLIANCE_AUTHOR_ROLES;

/**
 * Phase 3 — resolve the CAPA `owner` string to a real User.id (the
 * authoritative driver FK). The owner dropdown stores a userId, so an exact
 * id match wins; otherwise fall back to a same-tenant UNIQUE display-name match
 * (legacy/AI/FDA paths that may pass a name). Returns null when owner is empty,
 * is not a current User, or is an ambiguous name — the driver simply stays
 * unresolved rather than pointing at the wrong person. Mirrors the migration
 * backfill logic exactly.
 */
async function resolveOwnerUserId(
  tenantId: string,
  owner: string | undefined | null,
): Promise<string | null> {
  if (!owner) return null;
  const byId = await prisma.user.findFirst({
    where: { id: owner, tenantId },
    select: { id: true },
  });
  if (byId) return byId.id;
  const byName = await prisma.user.findMany({
    where: { name: owner, tenantId },
    select: { id: true },
    take: 2,
  });
  return byName.length === 1 ? byName[0].id : null;
}

/** Deviation→CAPA carryover (req 2) — a contextual CAPA description built from
 *  the originating deviation (richer than "<title> (from <id>)"). Plain text
 *  only; the structured RCA method/JSON is intentionally not carried. */
function buildDeviationCarryDescription(dev: {
  id: string; reference: string | null; title: string; description: string;
  severity: string; area: string; immediateAction: string | null;
}): string {
  const parts = [
    `Raised from deviation ${dev.reference ?? dev.id} — ${dev.title}.`,
    `\n\nDeviation summary: ${dev.description}`,
    `\n\nSeverity: ${dev.severity} · Area: ${dev.area}`,
  ];
  if (dev.immediateAction) parts.push(`\nImmediate action taken: ${dev.immediateAction}`);
  return parts.join("").slice(0, 4000);
}

/** Carryover helper — convert CATEGORIZED source documents into real CAPA
 *  EvidenceFiles under the matching GxP category, on raise-CAPA. POST-tx + fully
 *  fault-isolated: a failure for one doc (or the whole pass) logs and is swallowed
 *  so it can NEVER fail CAPA creation. Reuses addEvidenceFileToCategory's
 *  idempotent (capaId, category) upsert + the addEvidenceFile create shape.
 *
 *  SOURCE-AGNOSTIC: the caller passes the linkedModule + the linked record ids
 *  (a deviation's task ids, or a finding id) + the audit source labels — so it
 *  serves BOTH the deviation→CAPA and finding→CAPA carryovers identically. The
 *  deviation caller resolves its task ids and passes ("Deviation Task", taskIds,
 *  …, source "deviation_task_carryover" / key "deviationId"), reproducing the
 *  previous behavior exactly.
 *  Guards: only docs with a storageKey AND a category in EVIDENCE_CATEGORIES;
 *  uncategorized / null-storage docs stay as reference links. */
async function convertCategorizedDocsToEvidence(
  capaId: string,
  tenantId: string,
  linkedModule: string,
  linkedRecordIds: string[],
  createdByName: string,
  audit: { userId: string | null; userName: string; userRole: string },
  auditSource: { source: string; key: string; value: string },
): Promise<number> {
  let converted = 0;
  try {
    if (linkedRecordIds.length === 0) return 0;

    const docs = await prisma.document.findMany({
      where: {
        tenantId,
        linkedModule,
        linkedRecordId: { in: linkedRecordIds },
        deletedAt: null,
        storageKey: { not: null },
        category: { in: [...EVIDENCE_CATEGORIES] },
      },
      select: {
        id: true, fileName: true, originalFileName: true, fileType: true,
        fileExtension: true, fileSize: true, storageKey: true, category: true, uploadedBy: true,
      },
    });

    for (const doc of docs) {
      // Fault-isolate EACH doc — one bad read/save/create logs + continues; it
      // must never block the other docs or the (already-committed) CAPA.
      try {
        if (!doc.storageKey || !doc.category) continue;
        const category = doc.category;

        // Reuse the idempotent (capaId, category) upsert (addEvidenceFileToCategory).
        const item = await prisma.evidenceItem.upsert({
          where: { capaId_category: { capaId, category } },
          update: {},
          create: { capaId, category, status: "PENDING", createdBy: createdByName },
          select: { id: true },
        });

        // Re-read the stored bytes and RECOMPUTE the hash (verifies the copy —
        // don't trust the stored Document.sha256 blindly).
        const buffer = await fileStorage.read(doc.storageKey);
        const contentHashSha256 = createHash("sha256").update(buffer).digest("hex");
        const sanitized = sanitizeFilename(doc.originalFileName ?? doc.fileName);
        const ext = doc.fileExtension ?? (() => {
          const i = sanitized.lastIndexOf(".");
          return i > 0 ? sanitized.slice(i).toLowerCase() : "";
        })();
        const fileType = doc.fileType ?? "application/octet-stream";

        // Fresh evidence key (mirrors addEvidenceFile) — bytes re-copied so the
        // EvidenceFile is self-contained, independent of the Document's lifecycle.
        const storageKey = `evidence/${capaId}/${item.id}/${contentHashSha256}-${sanitized}`;
        const { url } = await fileStorage.save(storageKey, buffer, fileType);

        const retainUntil = new Date();
        retainUntil.setFullYear(retainUntil.getFullYear() + 7);

        const created = await prisma.evidenceFile.create({
          data: {
            evidenceItemId: item.id,
            fileName: sanitized,
            originalFileName: doc.originalFileName ?? doc.fileName,
            fileSize: Number.parseInt(doc.fileSize ?? "0", 10) || 0,
            fileType,
            fileExtension: ext,
            fileUrl: url,
            contentHashSha256,
            retainUntil,
            uploadedBy: doc.uploadedBy,
            uploadedById: null,
            actionItemId: null,
          },
        });

        await prisma.auditLog.create({
          data: {
            tenantId,
            userId: audit.userId,
            userName: audit.userName,
            userRole: audit.userRole,
            module: "CAPA / Evidence",
            action: "EVIDENCE_FILE_UPLOADED",
            recordId: created.id,
            newValue: JSON.stringify({
              fileName: sanitized,
              fileSize: created.fileSize,
              contentHashSha256,
              category,
              source: auditSource.source,
              sourceDocumentId: doc.id,
              [auditSource.key]: auditSource.value,
            }),
          },
        });
        converted += 1;
      } catch (err) {
        console.error(`[carryover] failed to convert doc ${doc.id} -> evidence:`, err);
      }
    }
  } catch (err) {
    console.error("[carryover] convertCategorizedDocsToEvidence failed:", err);
  }
  return converted;
}

/** Finding→CAPA carryover — copy the finding's conversation (the FindingMessage
 *  thread) into the CAPA as CAPA-level CAPAComments so it's visible to CAPA
 *  reviewers in the Discussion section. REAL records (mirrors how categorized docs
 *  become real EvidenceFiles + RCA text becomes CAPA.rca), attributed to the
 *  ORIGINAL authors with the original timestamps preserved (thread chronology),
 *  each tagged with the source finding. POST-tx + fault-isolated: never throws, so
 *  a copy failure can't fail the CAPA. Returns the count carried.
 *  NOTE: finding-only by design — the deviation carryover deliberately does NOT
 *  carry its task conversation (it stays on the deviation, reachable via the link). */
async function convertFindingMessagesToComments(
  capaId: string,
  tenantId: string,
  findingId: string,
  findingRef: string,
  audit: { userId: string | null; userName: string; userRole: string },
): Promise<number> {
  try {
    const messages = await prisma.findingMessage.findMany({
      where: { findingId, tenantId },
      orderBy: { createdAt: "asc" },
      select: { id: true, authorId: true, authorName: true, authorRole: true, body: true, createdAt: true },
    });
    if (messages.length === 0) return 0;
    await prisma.cAPAComment.createMany({
      data: messages.map((m) => ({
        tenantId,
        capaId,
        parentId: null,
        actionItemId: null,
        // Provenance tag so reviewers see these are carried from the finding.
        body: `(from finding ${findingRef}) ${m.body}`,
        isConcern: false,
        // CAPAComment.authorId is non-null (and NOT a User FK) — keep the original
        // author id when present, else empty. Display attribution is preserved via
        // authorName/authorRole regardless.
        authorId: m.authorId ?? "",
        authorName: m.authorName,
        authorRole: m.authorRole,
        // Preserve the original time so the carried thread keeps its chronology.
        createdAt: m.createdAt,
      })),
    });
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: audit.userId, userName: audit.userName, userRole: audit.userRole,
        module: "CAPA",
        action: "CAPA_COMMENTS_CARRIED_FROM_FINDING",
        recordId: capaId,
        recordTitle: findingRef,
        newValue: JSON.stringify({ findingId, carriedCount: messages.length }),
      },
    });
    return messages.length;
  } catch (err) {
    console.error("[carryover] convertFindingMessagesToComments failed:", err);
    return 0;
  }
}

/** Finding→CAPA carryover (Step 5) — a contextual CAPA description from the
 *  originating finding (mirrors buildDeviationCarryDescription). Plain text only;
 *  the structured RCA method/JSON is intentionally left for the CAPA author. */
function buildFindingCarryDescription(f: {
  id: string; reference: string | null; requirement: string; framework: string | null;
}): string {
  const parts = [
    `Raised from gap finding ${f.reference ?? f.id} — ${f.requirement}.`,
  ];
  if (f.framework) parts.push(`\n\nFramework: ${f.framework}`);
  return parts.join("").slice(0, 4000);
}

export async function createCAPA(
  input: z.input<typeof CreateCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  // Responsibility map - a CAPA is raised ONLY by QA (CAPA_CREATE_ROLES = qa_head;
  // super_admin is blocked below by requireGxPAuthor). This is stricter than the
  // general CAPA_WRITE_ROLES used for edit/start; functional/admin roles reach
  // their CAPA work through the Worklist, not by creating CAPAs.
  if (!CAPA_CREATE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can create a CAPA." };
  }
  const parsed = CreateCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Part A access-control fix — raising a CAPA FROM a deviation is a QA
  // authority action (mirrors the deviation close/reject gate). Non-QA authors
  // may still create standalone CAPAs; only the deviation-sourced raise is
  // QA-gated. The deviation UI hides Raise CAPA for non-QA in lockstep.
  if (parsed.data.linkedDeviationId && !DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can raise a CAPA from a deviation." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const {
      linkedFindingId,
      linkedDeviationId,
      diGateRequired,
      dueDate,
      ...rest
    } = parsed.data;

    // Step 3 — ONE assigned worker in CAPA.ownerId (the "driver" concept is
    // gone). Manual CAPA: the QA-picked owner. Deviation-raised: the deviation
    // WORKER (activeTask.assigneeId) when an active task existed, else the
    // raising QA. The worker-vs-QA branch needs activeTask, which is read inside
    // the tx — so the final ownerId/ownerName are computed there (below). This
    // resolves only the manual-owner input (a User read; safe before the tx).
    const ownerIdInput = await resolveOwnerUserId(session.user.tenantId, rest.owner);

    // Race-safe sequence allocation. Two server actions creating CAPAs at
    // the same instant can both read count=N inside their respective
    // transactions, both compute reference=N+1, and the second commit
    // hits CAPA_reference_key uniqueness. Retry on that specific
    // collision; bubble any other error.
    const MAX_RETRIES = 5;
    type CapaTxResult = {
      created: Awaited<ReturnType<typeof prisma.cAPA.create>>;
      activeTaskId: string | null;
      rcaCarried: boolean;
      actionItemInfo: { id: string; assignee: string } | null;
      // For the post-tx comment carryover's provenance tag (finding→CAPA).
      findingRef: string | null;
    };
    let capa: CapaTxResult | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        capa = await prisma.$transaction(async (tx): Promise<CapaTxResult> => {
          // Deviation→CAPA carryover — read the originating deviation + its active
          // worker task UP FRONT (server-authoritative; not trusting client copies)
          // so we can carry the root-cause text, build a contextual description,
          // and seed an action item from the in-flight task.
          const sourceDev = linkedDeviationId
            ? await tx.deviation.findFirst({
                where: { id: linkedDeviationId, tenantId: session.user.tenantId },
                select: { id: true, reference: true, title: true, description: true, severity: true, area: true, rootCause: true, immediateAction: true },
              })
            : null;
          const activeTask = linkedDeviationId
            ? await tx.deviationTask.findFirst({
                where: { deviationId: linkedDeviationId, tenantId: session.user.tenantId, deletedAt: null, status: { in: ["pending", "in_progress", "submitted", "rework"] } },
                orderBy: { createdAt: "desc" },
                // Step 3 — only the worker identity is needed now (the carryover
                // action item that consumed notes/messages/dueDate is dropped).
                select: { id: true, assignee: true, assigneeId: true },
              })
            : null;
          // Step 5 — read the originating finding UP FRONT (mirrors sourceDev) so
          // we can carry its owner, root-cause text, and a contextual description.
          const sourceFinding = linkedFindingId
            ? await tx.finding.findFirst({
                where: { id: linkedFindingId, tenantId: session.user.tenantId },
                select: { id: true, reference: true, requirement: true, framework: true, owner: true, rootCause: true },
              })
            : null;
          // Resolve the finding owner to a REAL User. finding.owner is a raw
          // userId string (Step 1) that may NOT correspond to a User row (e.g. a
          // finding created by an admin whose session id has no User record), so
          // it must NOT be written straight into CAPA.ownerId (a User FK) — that
          // throws P2003 "foreign key constraint failed". We use the RESOLVED
          // User's id (guaranteed valid), else fall back to the raising QA.
          const findingOwnerUser = sourceFinding?.owner
            ? await tx.user.findFirst({ where: { id: sourceFinding.owner, tenantId: session.user.tenantId }, select: { id: true, name: true } })
            : null;

          // Step 3/5 — the single assigned worker for CAPA.ownerId. Deviation-
          // raised: the deviation WORKER (activeTask.assigneeId). Finding-raised:
          // the finding's OWNER (the assigned worker). Else (manual): the
          // QA-picked owner input. Each falls back to the raising QA.
          const ownerId = linkedDeviationId
            ? (activeTask?.assigneeId ?? actor.userId)
            : linkedFindingId
              ? (findingOwnerUser?.id ?? actor.userId)
              : ownerIdInput;
          const ownerName = linkedDeviationId
            ? (activeTask?.assignee ?? actor.displayName)
            : linkedFindingId
              ? (findingOwnerUser?.name ?? actor.displayName)
              : (rest.owner ?? "");

          // SME Section 1 (last rung) â€” site-scoped reference prefix.
          // Format is now "CAPA-{siteCode}-{year}-{NNN}". Site code is
          // resolved per call; the startsWith filter the helper feeds
          // back into findLatestForYear scopes naturally to that site's
          // bucket. Falls back to legacy "CAPA-{year}-{NNN}" when the
          // CAPA has no site (siteId optional on the schema) or when
          // the site has no code yet (backfill window).
          let siteCode: string | null = null;
          if (parsed.data.siteId) {
            const site = await tx.site.findUnique({
              where: { id: parsed.data.siteId },
              select: { code: true },
            });
            siteCode = site?.code ?? null;
          }
          const referencePrefix = buildReferencePrefix("CAPA", siteCode);
          // Reference lookup is intentionally GLOBAL (no tenantId filter).
          // CAPA.reference has a global @unique index, not @@unique on
          // [tenantId, reference] â€” so two tenants each computing their
          // per-tenant max would both produce "CAPA-CHN-2026-001" and the
          // second insert would hit P2002 every retry. Reading the
          // global max for the prefix-year guarantees strictly greater.
          // Tenants may see gaps when two tenants share a site code AND
          // collide on sequence â€” documented trade-off of the global
          // unique design.
          const reference = await generateReference(
            referencePrefix,
            new Date(),
            async (prefix, year) => {
              const row = await tx.cAPA.findFirst({
                where: {
                  reference: { startsWith: `${prefix}-${year}-` },
                },
                orderBy: { reference: "desc" },
                select: { reference: true },
              });
              return row?.reference ?? null;
            },
          );
          const created = await tx.cAPA.create({
            data: {
              ...rest,
              // owner is now zod-optional; the Prisma column is still non-null.
              // Step 3 — the single assigned worker (resolved as ownerName above).
              owner: ownerName,
              // Authoritative assignee FK (null when unresolvable).
              ownerId,
              // Deviation→CAPA carryover (req 2): carry the deviation's root-cause
              // TEXT into rca + a contextual description. Structured RCA method/
              // detail are NOT copied (deviation rcaData JSON ≠ CAPA rcaDetail).
              ...(sourceDev
                ? { rca: sourceDev.rootCause ?? rest.rca ?? null, description: buildDeviationCarryDescription(sourceDev) }
                : sourceFinding
                  ? { rca: sourceFinding.rootCause ?? rest.rca ?? null, description: buildFindingCarryDescription(sourceFinding) }
                  : {}),
              reference,
              tenantId: session.user.tenantId,
              status: "open",
              createdBy: session.user.name,
              // Authoritative creator FK for SoD guards. Null for admin
              // actors with no User row (resolveUserFk returns null); those
              // fall back to name comparison in the review/approve/verify gates.
              createdById: actor.userId,
              dueDate: new Date(dueDate),
              findingId: linkedFindingId ?? null,
              // SME Section 1, Stage 2 (FULL) â€” write the new bidirectional
              // FK on the CAPA row at creation time. Keeps both sides
              // (CAPA.deviationId + Deviation.linkedCAPAId) atomic via the
              // surrounding $transaction below.
              deviationId: linkedDeviationId ?? null,
              diGate: diGateRequired ?? false,
              diGateStatus: diGateRequired ? "pending" : null,
            },
          });
          // Link-side updates moved INSIDE the transaction (SME Stage 2
          // FULL): the previous post-create updates ran outside the
          // transaction, so a Deviation.update failure left the CAPA
          // created without its back-link. Now both sides commit or
          // neither does. The Finding update also goes here for symmetry.
          if (linkedFindingId) {
            await tx.finding.update({
              where: { id: linkedFindingId, tenantId: session.user.tenantId },
              // Canonical Title Case to match FindingStatus + the close path
              // (findings.ts) — was "in_progress" (snake), which rendered raw.
              data: { status: "In Progress", linkedCAPAId: created.id },
            });
          }
          if (linkedDeviationId) {
            await tx.deviation.update({
              where: { id: linkedDeviationId, tenantId: session.user.tenantId },
              // Stage 3 (deviation redesign) — raising a CAPA from a deviation
              // parks it in "capa_pending": it stays OPEN + linked until the CAPA
              // closes (which UNBLOCKS it → pending_qa_review; QA then SIGN-closes
              // via closeDeviation). NO auto-close anywhere.
              data: { linkedCAPAId: created.id, status: "capa_pending" },
            });
            // Stage 4 (deviation redesign) — escalation: raising a CAPA
            // SUPERSEDES any in-flight low-priority task. Cancel open
            // DeviationTasks so the CAPA owns the work going forward.
            await tx.deviationTask.updateMany({
              where: { deviationId: linkedDeviationId, tenantId: session.user.tenantId, deletedAt: null, status: { notIn: ["closed", "cancelled"] } },
              data: { status: "cancelled" },
            });
          }
          // Step 3 — the deviation worker is now the CAPA's single assignee
          // (CAPA.ownerId, set above), so the old evidence-carrier action item
          // is no longer created: the worker reaches this CAPA via the worklist
          // and does the evidence there. The originating deviation (linked via
          // CAPA.deviationId) retains the task's notes + conversation; corrective
          // action items, when needed, are added manually by QA.
          const actionItemInfo: { id: string; assignee: string } | null = null;
          return {
            created,
            activeTaskId: activeTask?.id ?? null,
            rcaCarried: !!(sourceDev?.rootCause || sourceFinding?.rootCause),
            actionItemInfo,
            // For the post-tx comment carryover's provenance tag.
            findingRef: sourceFinding?.reference ?? null,
          };
        });
        break;
      } catch (err) {
        lastErr = err;
        if (!isReferenceConflict(err)) throw err;
      }
    }
    if (!capa) {
      console.error("[action] createCAPA exhausted reference retries:", lastErr);
      return { success: false, error: sanitizeServerError(lastErr, "Failed to allocate CAPA reference") };
    }

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_CREATED",
        recordId: capa.created.id,
        // Use the STORED description (enriched on the deviation path) so the
        // audit trail matches the CAPA record, not the basic client input.
        recordTitle: capa.created.reference
          ? `${capa.created.reference} — ${capa.created.description.slice(0, 60)}`
          : capa.created.description.slice(0, 80),
        newValue: parsed.data.risk,
      },
    });

    revalidatePath("/capa");
    revalidatePath("/gap-assessment");
    revalidatePath("/deviation");

    // Deviation→CAPA carryover (req 4 + 5): the deviation's docs and the worker
    // task's docs are NOT copied into evidence categories — they stay Documents
    // linked to their originating records (the CAPA links via CAPA.deviationId,
    // and the cancelled task keeps its docs). Count them so the next step (a
    // confirmation modal + the CAPA "raised from deviation X" reference block)
    // can surface them as links. NOTE: surfacing in the CAPA detail needs a
    // small NEW display element — flagged for the UI step.
    if (linkedDeviationId) {
      // Piece 2 — convert the deviation's CATEGORIZED task docs into real CAPA
      // EvidenceFiles under their matching category. POST-tx + fault-isolated:
      // the helper never throws, so a copy failure can't fail the CAPA. The
      // converted docs are then excluded from the reference block by
      // getCAPADeviationDocs (no double-listing).
      // The helper is now source-agnostic — resolve the deviation's task ids here
      // and convert their "Deviation Task" docs (identical result to before).
      const taskIds = (await prisma.deviationTask.findMany({
        where: { deviationId: linkedDeviationId, tenantId: session.user.tenantId },
        select: { id: true },
      })).map((t) => t.id);
      const convertedEvidenceCount = await convertCategorizedDocsToEvidence(
        capa.created.id,
        session.user.tenantId,
        "Deviation Task",
        taskIds,
        session.user.name,
        { userId: actor.userId, userName: actor.displayName, userRole: actor.role },
        { source: "deviation_task_carryover", key: "deviationId", value: linkedDeviationId },
      );

      const [deviationDocCount, taskDocCount] = await Promise.all([
        prisma.document.count({ where: { tenantId: session.user.tenantId, linkedModule: "Deviation Management", linkedRecordId: linkedDeviationId, deletedAt: null } }),
        capa.activeTaskId
          ? prisma.document.count({ where: { tenantId: session.user.tenantId, linkedModule: "Deviation Task", linkedRecordId: capa.activeTaskId, deletedAt: null } })
          : Promise.resolve(0),
      ]);
      if (convertedEvidenceCount > 0) {
        revalidatePath(`/capa/${capa.created.id}`);
      }
      return {
        success: true,
        data: {
          ...capa.created,
          deviationCarryover: {
            fromDeviationId: linkedDeviationId,
            fromTaskId: capa.activeTaskId,
            rcaCarried: capa.rcaCarried,
            actionItem: capa.actionItemInfo,
            deviationDocCount,
            taskDocCount,
            convertedEvidenceCount,
          },
        },
      };
    }
    if (linkedFindingId) {
      // Step 5 — convert the finding's CATEGORIZED docs ("Gap Assessment",
      // linkedRecordId = findingId) into real CAPA EvidenceFiles via the SAME
      // shared helper + fault-isolation as the deviation path. No reference-block
      // dedup needed: the CAPA UI has no "raised from finding" doc list, so a
      // converted doc only appears once (as evidence).
      const convertedEvidenceCount = await convertCategorizedDocsToEvidence(
        capa.created.id,
        session.user.tenantId,
        "Gap Assessment",
        [linkedFindingId],
        session.user.name,
        { userId: actor.userId, userName: actor.displayName, userRole: actor.role },
        { source: "gap_finding_carryover", key: "findingId", value: linkedFindingId },
      );
      // Carry the finding's conversation (FindingMessage thread) into the CAPA as
      // CAPA-level comments. Same POST-tx + fault-isolated shape as the doc→evidence
      // conversion above — never fails the CAPA.
      const carriedCommentCount = await convertFindingMessagesToComments(
        capa.created.id,
        session.user.tenantId,
        linkedFindingId,
        capa.findingRef ?? linkedFindingId.slice(0, 8),
        { userId: actor.userId, userName: actor.displayName, userRole: actor.role },
      );
      if (convertedEvidenceCount > 0 || carriedCommentCount > 0) {
        revalidatePath(`/capa/${capa.created.id}`);
      }
      return {
        success: true,
        data: {
          ...capa.created,
          findingCarryover: {
            fromFindingId: linkedFindingId,
            rcaCarried: capa.rcaCarried,
            ownerId: capa.created.ownerId,
            convertedEvidenceCount,
            carriedCommentCount,
          },
        },
      };
    }
    return { success: true, data: capa.created };
  } catch (err) {
    // Surface the Prisma code + meta (WHICH field/relation) so a DB-constraint
    // failure is diagnosable from BOTH the server log AND the UI — e.g.
    // P2003 + the FK relation that was violated — instead of the opaque
    // "This action conflicts with related records".
    const code = (err as { code?: string })?.code;
    const meta = (err as { meta?: { field_name?: string; target?: string[]; modelName?: string } })?.meta;
    console.error(`[action] createCAPA failed${code ? ` (${code} ${JSON.stringify(meta)})` : ""}:`, err);
    // For the known constraint codes, append the code + offending field/relation
    // to the user-facing error so a future failure names the exact constraint.
    if (code === "P2002" || code === "P2003" || code === "P2014" || code === "P2025") {
      const where = meta?.field_name ?? meta?.target?.join(", ") ?? meta?.modelName ?? "";
      return { success: false, error: `${sanitizeServerError(err, "Failed to create CAPA")} [${code}${where ? ` · ${where}` : ""}]` };
    }
    return { success: false, error: sanitizeServerError(err, "Failed to create CAPA") };
  }
}

// NOTE: status field intentionally NOT accepted (Rung 3D-CAPA). Status
// changes route through dedicated guarded transitions:
//   open → in_progress:        startCAPAProgress
//   in_progress → pending_qa_review: submitForReview
//   pending_qa_review → pending_verification: approveCAPA
//   pending_verification → closed: signAndCloseCAPA
//   any → rejected:            rejectCAPA
//   closed/rejected → open:    reopenCAPA (carries the evidence unlock)
// See AUDIT-GLOBAL-PATTERNS.md Finding #1.
export async function updateCAPA(
  id: string,
  input: z.input<typeof UpdateCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateCAPASchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  if (!CAPA_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }

  // SME Section 1, Stage 4 (FULL) â€” block direct writes to correctiveActions.
  // The field stays on the CAPA row as a denormalised cache rebuilt by
  // syncCorrectiveActions inside the action-items mutation paths, but the
  // only path to mutate it is now addActionItem / updateActionItem / etc.
  // Audit the blocked attempt so legacy clients can be traced.
  if (parsed.data.correctiveActions !== undefined) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "CAPA",
          action: "CAPA_UPDATE_BLOCKED_CORRECTIVE_ACTIONS_DEPRECATED",
          recordId: id,
          newValue: JSON.stringify({
            attemptedBy: session.user.id,
            payloadLength: parsed.data.correctiveActions.length,
          }),
        },
      });
    } catch (err) {
      console.error("[action] failed to write CAPA_UPDATE_BLOCKED_CORRECTIVE_ACTIONS_DEPRECATED audit:", err);
    }
    return {
      success: false,
      error:
        "Direct writes to correctiveActions are deprecated. Use the structured Action Items API (addActionItem / updateActionItem / deleteActionItem / reorderActionItems) on the Actions tab instead.",
    };
  }

  try {
    // Pre-fetch the current row so we can detect a status transition and
    // lock / unlock evidence accordingly. This is the path the reopen flow
    // travels through (status: "closed" / "pending_qa_review" / "rejected"
    // â†’ "open" / "in_progress"). Tenant-scoped via the same where clause.
    const before = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: {
        status: true,
        reference: true,
        rca: true,
        rcaMethod: true,
        rcaApproved: true,
        ownerId: true,
      },
    });
    if (!before) return { success: false, error: "CAPA not found" };

    // SME Section 1, Stage 3 (partial) — RCA field-lock.
    // Once a CAPA enters QA review (and through closure/rejection), the
    // rca and rcaMethod fields become the regulatory record. Editing them
    // mid-review undermines the review's integrity, so block edits once the
    // status is locked. Strict: even re-posting the same value is a write
    // attempt; `!== undefined` (not falsy) so clearing to "" is blocked too.
    if (
      (parsed.data.rca !== undefined || parsed.data.rcaMethod !== undefined || parsed.data.rcaDetail !== undefined) &&
      LOCKED_CAPA_STATUSES.has(before.status)
    ) {
      const attemptedFields = [
        parsed.data.rca !== undefined ? "rca" : null,
        parsed.data.rcaMethod !== undefined ? "rcaMethod" : null,
      ].filter((v): v is string => v !== null);
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "CAPA",
            action: "CAPA_UPDATE_BLOCKED_RCA_LOCKED",
            recordId: id,
            recordTitle: (before.reference ?? id).slice(0, 80),
            newValue: JSON.stringify({
              currentStatus: before.status,
              attemptedFields,
            }),
          },
        });
      } catch (err) {
        console.error("[action] failed to write CAPA_UPDATE_BLOCKED_RCA_LOCKED audit:", err);
      }
      return {
        success: false,
        error: "Root cause analysis is locked once the CAPA enters QA review.",
      };
    }

    // SME Section 1, Stage 3 (FULL) — auto-invalidate the RCA review when the
    // underlying rca / rcaMethod changes after approval. During "in_progress"
    // the RCA is editable AND may already be approved by QA; editing it would
    // mean QA's verdict applies to text the reviewer never saw. So detect the
    // change and, if approved, clear the verdict + audit so QA re-reviews.
    const rcaChanged =
      parsed.data.rca !== undefined && parsed.data.rca !== before.rca;
    const rcaMethodChanged =
      parsed.data.rcaMethod !== undefined && parsed.data.rcaMethod !== before.rcaMethod;
    const shouldInvalidateRcaReview =
      (rcaChanged || rcaMethodChanged) && before.rcaApproved === true;
    const rcaInvalidateData = shouldInvalidateRcaReview
      ? {
          rcaApproved: null,
          rcaReviewedBy: null,
          rcaReviewedById: null,
          rcaReviewedAt: null,
          rcaReviewNotes: null,
          rcaOverrideBy: null,
          rcaOverrideById: null,
          rcaOverrideAt: null,
          rcaOverrideReason: null,
        }
      : {};

    // Phase 3 — keep the driver FK in step with the owner string whenever
    // owner is part of this update (resolved/cleared accordingly).
    const ownerIdUpdate =
      parsed.data.owner !== undefined
        ? await resolveOwnerUserId(session.user.tenantId, parsed.data.owner)
        : undefined;

    // Batch 2b — DI gate persistence. The server stamps diGateReviewDate (never
    // trusts a client value); turning the gate OFF clears the detail. Spread
    // AFTER ...parsed.data so these overrides win. The readiness gate still
    // reads capa.diGate as before — unchanged.
    const diGateData =
      parsed.data.diGate === undefined
        ? {}
        : parsed.data.diGate
          ? { diGateReviewDate: new Date() }
          : { diGateStatus: null, diGateReviewedBy: null, diGateNotes: null, diGateReviewDate: null };

    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...parsed.data,
        ...(parsed.data.dueDate ? { dueDate: new Date(parsed.data.dueDate) } : {}),
        ...(parsed.data.owner !== undefined ? { ownerId: ownerIdUpdate } : {}),
        ...rcaInvalidateData,
        ...diGateData,
      },
    });

    if (shouldInvalidateRcaReview) {
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "CAPA / RCA Review",
            action: "CAPA_RCA_REVIEW_INVALIDATED_BY_EDIT",
            recordId: id,
            recordTitle: (before.reference ?? id).slice(0, 80),
            newValue: JSON.stringify({
              changedFields: [
                rcaChanged ? "rca" : null,
                rcaMethodChanged ? "rcaMethod" : null,
              ].filter((v): v is string => v !== null),
            }),
          },
        });
      } catch (err) {
        console.error("[action] failed to write CAPA_RCA_REVIEW_INVALIDATED_BY_EDIT audit:", err);
      }
    }

    // RUNG 3D-CAPA — the status-transition lock/unlock side-effect moved out
    // of updateCAPA (status is no longer accepted here). Forward locks happen
    // in submitForReview / rejectCAPA / signAndCloseCAPA; the unlock-on-reopen
    // happens in reopenCAPA.

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_UPDATED",
        recordId: id,
      },
    });

    // Notify the NEW assignee when ownership actually changed (fault-isolated;
    // notify() skips the actor + null FKs).
    if (parsed.data.owner !== undefined && ownerIdUpdate && ownerIdUpdate !== before.ownerId) {
      await notify({
        tenantId: session.user.tenantId,
        recipientUserId: ownerIdUpdate,
        actorUserId: actor.userId,
        type: "CAPA_ASSIGNED",
        title: `You are now assigned to CAPA ${before.reference ?? id}`,
        body: capa.description?.slice(0, 200) ?? null,
        linkPath: `/capa/${id}`,
        entityType: "CAPA",
        entityId: id,
      });
    }

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] updateCAPA failed:", err);
    return { success: false, error: "Failed to update CAPA" };
  }
}

export async function clearDIGate(
  id: string,
  input: z.input<typeof ClearDIGateSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();

  if (!CAPA_DI_GATE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can clear the Data Integrity gate" };
  }

  const parsed = ClearDIGateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        diGateStatus: "cleared",
        diGateReviewedBy: session.user.name,
        diGateReviewDate: new Date(),
        diGateNotes: parsed.data.notes ?? null,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_DI_GATE_CLEARED",
        recordId: id,
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] clearDIGate failed:", err);
    return { success: false, error: "Failed to clear DI gate" };
  }
}

export async function submitForReview(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });

    if (!existing) {
      return { success: false, error: "CAPA not found" };
    }

    // Phase 5 — authorization: author-role OR the CAPA's DRIVER (ownerId).
    // Submitting is the readiness attestation/handoff to QA; that attestation
    // belongs to the driver, so a driver may submit even without an author
    // role. requireGxPAuthor (platform-admin block) and the viewer hard-stop
    // baked into isAssignedToTask both precede this.
    const isAuthorRole = CAPA_WRITE_ROLES.includes(session.user.role);
    const isDriver = isAssignedToTask(session, { ownerId: existing.ownerId });
    if (!isAuthorRole && !isDriver) {
      return { success: false, error: "Your role does not permit this action." };
    }
    const submitBasis: "authorRole" | "capaDriver" = isAuthorRole ? "authorRole" : "capaDriver";

    // FIX 2 â€” status invariant. Only a CAPA still under investigation
    // (in_progress) may be submitted for QA review. Without this a direct
    // API call could "submit" a CAPA already in review / verification /
    // closed / rejected. Enforced again optimistically on the write below.
    if (existing.status !== "in_progress") {
      return {
        success: false,
        error: "Only a CAPA under investigation (in progress) can be submitted for QA review.",
      };
    }

    // Phase 4 â€” ONE readiness gate, shared verbatim with the client checklist
    // (src/lib/capa-readiness.ts). Loads the same inputs the UI shows: action
    // items, the 7 evidence categories, and effectiveness criteria. a-c (RCA /
    // alignment / DI) were the old server set; d-f (actions complete / evidence
    // resolved / >=1 criterion) are now REAL conditions too â€” a deliberate
    // tightening of submit so client and server can never disagree.
    const [actionItems, evidenceItems, criteria] = await Promise.all([
      prisma.cAPAActionItem.findMany({
        where: { capaId: id, tenantId: session.user.tenantId, deletedAt: null },
        select: { status: true },
      }),
      prisma.evidenceItem.findMany({
        where: { capaId: id },
        select: { status: true },
      }),
      prisma.cAPAEffectivenessCriterion.findMany({
        where: { capaId: id, deletedAt: null },
        select: { id: true },
      }),
    ]);

    const readiness = getCAPAReadiness(existing, actionItems, evidenceItems, criteria);
    if (!readiness.allMet) {
      try {
        await prisma.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "CAPA",
            action: "CAPA_SUBMIT_BLOCKED_NOT_READY",
            recordId: id,
            newValue: JSON.stringify({ unmet: readiness.unmet.map((u) => u.key) }),
          },
        });
      } catch (err) {
        console.error("[action] failed to write CAPA_SUBMIT_BLOCKED_NOT_READY audit:", err);
      }
      return {
        success: false,
        error:
          "CAPA is not ready for review. Outstanding: " +
          readiness.unmet.map((u) => u.label).join("; ") +
          ".",
      };
    }

    // Lock evidence + effectiveness criteria FIRST so the CAPA never sits in
    // pending_qa_review with editable artifacts. Both helpers inside
    // lockCAPAArtifacts are idempotent â€” re-runs are safe.
    await lockCAPAArtifacts(id, session.user.tenantId, {
      userId: actor.userId,
      name: actor.displayName,
      role: actor.role,
    });

    // Optimistic lock â€” re-assert status="in_progress" in the WHERE so a
    // concurrent transition can't double-fire. count===0 means the status
    // moved between the read above and this write.
    const updated = await prisma.cAPA.updateMany({
      where: { id, tenantId: session.user.tenantId, status: "in_progress" },
      data: { status: "pending_qa_review" },
    });
    if (updated.count === 0) {
      return {
        success: false,
        error: "Only a CAPA under investigation (in progress) can be submitted for QA review.",
      };
    }
    const capa = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_SUBMITTED_FOR_REVIEW",
        recordId: id,
        newValue: JSON.stringify({ accessBasis: submitBasis }),
      },
    });

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    revalidatePath("/worklist");
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] submitForReview failed:", err);
    return { success: false, error: "Failed to submit for review" };
  }
}

export async function rejectCAPA(
  id: string,
  input: z.input<typeof RejectSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();

  if (!CAPA_REJECT_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can reject CAPAs" };
  }

  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    // Status invariant — reject only from pending_qa_review (the QA reviewer's
    // verdict stage). Post-approval inadequacy uses revokeCAPAApproval; legacy
    // closed/rejected rows use reopenCAPA.
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { status: true },
    });
    if (!existing) {
      return { success: false, error: "CAPA not found" };
    }
    if (existing.status !== "pending_qa_review") {
      return {
        success: false,
        error: "Only a CAPA awaiting QA review (pending QA review) can be rejected.",
      };
    }

    // Phase 4 — validate any targeted rework items belong to THIS CAPA before
    // we touch anything (avoids a partial write on a bad id).
    const reworkIds = parsed.data.reworkItems ?? [];
    if (reworkIds.length > 0) {
      const owned = await prisma.cAPAActionItem.findMany({
        where: { id: { in: reworkIds }, capaId: id, tenantId: session.user.tenantId },
        select: { id: true },
      });
      if (owned.length !== reworkIds.length) {
        return { success: false, error: "One or more rework items do not belong to this CAPA." };
      }
    }

    // Per-evidence reject — validate the evidence items belong to THIS CAPA.
    const rejectedEvidenceIds = parsed.data.rejectedEvidenceItems ?? [];
    if (rejectedEvidenceIds.length > 0) {
      const ownedEv = await prisma.evidenceItem.findMany({
        where: { id: { in: rejectedEvidenceIds }, capaId: id, capa: { tenantId: session.user.tenantId } },
        select: { id: true },
      });
      if (ownedEv.length !== rejectedEvidenceIds.length) {
        return { success: false, error: "One or more rejected evidence items do not belong to this CAPA." };
      }
    }

    const now = new Date();
    // Phase 4 — a TARGETED reject is a BOUNCE, not a dead end: the CAPA returns
    // to in_progress (workable again) rather than the terminal "rejected".
    // Rejection metadata goes to first-class columns (no longer crammed into
    // diGateNotes), and each targeted item is flagged "rework" with the reason.
    // Evidence/criteria are UNLOCKED (they were locked at submit) so the team
    // can actually fix things. Optimistic-locked on pending_qa_review.
    const result = await prisma.$transaction(async (tx) => {
      const bounced = await tx.cAPA.updateMany({
        where: { id, tenantId: session.user.tenantId, status: "pending_qa_review" },
        data: {
          status: "in_progress",
          rejectionReason: parsed.data.reason,
          rejectedById: actor.userId,
          rejectedAt: now,
        },
      });
      if (bounced.count === 0) return { bounced: 0 } as const;

      if (reworkIds.length > 0) {
        await tx.cAPAActionItem.updateMany({
          where: { id: { in: reworkIds }, capaId: id, tenantId: session.user.tenantId },
          data: {
            status: "rework",
            reworkReason: parsed.data.reason,
            reworkRequestedById: actor.userId,
            reworkRequestedAt: now,
          },
        });
      }
      // Per-evidence reject — flag each as REJECTED (un-resolves its category,
      // since REJECTED isn't in the readiness RESOLVED set) with who/when/why.
      if (rejectedEvidenceIds.length > 0) {
        await tx.evidenceItem.updateMany({
          where: { id: { in: rejectedEvidenceIds }, capaId: id },
          data: {
            status: "REJECTED",
            rejectionReason: parsed.data.reason,
            reviewedById: actor.userId,
            reviewedAt: now,
          },
        });
      }
      return { bounced: 1 } as const;
    });

    if (result.bounced === 0) {
      return {
        success: false,
        error: "Only a CAPA awaiting QA review (pending QA review) can be rejected.",
      };
    }

    // Unlock evidence + criteria — in_progress means workable again. (No lock
    // on reject, unlike the old dead-end flow.)
    await unlockCAPAArtifacts(id, session.user.tenantId, {
      userId: actor.userId,
      name: actor.displayName,
      role: actor.role,
    });

    const capa = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_REJECTED",
        recordId: id,
        oldValue: "pending_qa_review",
        newValue: JSON.stringify({
          to: "in_progress",
          reason: parsed.data.reason.slice(0, 200),
          reworkItems: reworkIds,
          rejectedEvidenceItems: rejectedEvidenceIds,
        }),
      },
    });

    // Per-item EVIDENCE_REJECTED audit entries (reuse the evidence.ts pattern),
    // so each rejected evidence item carries its own append-only record.
    if (rejectedEvidenceIds.length > 0) {
      await prisma.auditLog.createMany({
        data: rejectedEvidenceIds.map((evId) => ({
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "CAPA / Evidence",
          action: "EVIDENCE_REJECTED",
          recordId: evId,
          oldValue: null,
          newValue: JSON.stringify({ capaId: id, reason: parsed.data.reason.slice(0, 200) }),
        })),
      });
    }

    // Phase 2 notifications — fault-isolated side effect (notify()/notifyMany()
    // never throw). Affected parties only; the actor (QA) is never notified of
    // their own act. A notify failure cannot affect the reject that just
    // committed above.
    const capaRef = capa?.reference ?? id;
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: capa?.ownerId,
      actorUserId: actor.userId,
      type: "CAPA_REJECTED",
      title: `CAPA ${capaRef} was rejected`,
      body: parsed.data.reason.slice(0, 200),
      linkPath: `/capa/${id}`,
      entityType: "CAPA",
      entityId: id,
    });
    if (reworkIds.length > 0) {
      const reworkOwners = await prisma.cAPAActionItem.findMany({
        where: { id: { in: reworkIds }, capaId: id, tenantId: session.user.tenantId },
        select: { id: true, ownerId: true, description: true },
      });
      await notifyMany(
        reworkOwners.map((it) => ({
          tenantId: session.user.tenantId,
          recipientUserId: it.ownerId,
          actorUserId: actor.userId,
          type: "REWORK_ASSIGNED" as const,
          title: `Action item needs rework (CAPA ${capaRef})`,
          body: it.description.slice(0, 200),
          linkPath: "/worklist",
          entityType: "CAPAActionItem",
          entityId: it.id,
        })),
      );
    }
    if (rejectedEvidenceIds.length > 0) {
      const fixerFiles = await prisma.evidenceFile.findMany({
        where: { evidenceItemId: { in: rejectedEvidenceIds } },
        select: { uploadedById: true },
      });
      const fixerIds = Array.from(
        new Set(fixerFiles.map((f) => f.uploadedById).filter((v): v is string => !!v)),
      );
      await notifyMany(
        fixerIds.map((uid) => ({
          tenantId: session.user.tenantId,
          recipientUserId: uid,
          actorUserId: actor.userId,
          type: "EVIDENCE_REJECTED" as const,
          title: `Evidence rejected (CAPA ${capaRef})`,
          body: parsed.data.reason.slice(0, 200),
          linkPath: `/capa/${id}`,
          entityType: "CAPA",
          entityId: id,
        })),
      );
    }

    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] rejectCAPA failed:", err);
    return { success: false, error: "Failed to reject CAPA" };
  }
}

/**
 * RUNG 3D-CAPA — guarded open → in_progress transition. Was the UI autoAdvance
 * via updateCAPA (status bypass). Optimistic-locked on status="open" so a
 * concurrent transition can't double-fire. No precondition beyond "open" —
 * matches the prior behaviour (the UI advanced once RCA text was entered;
 * full RCA approval is gated later, at submitForReview).
 */
export async function startCAPAProgress(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!CAPA_WRITE_ROLES.includes(session.user.role)) {
    return { success: false, error: "You do not have permission to advance this CAPA." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const updated = await prisma.cAPA.updateMany({
    where: { id, tenantId: session.user.tenantId, status: "open" },
    data: { status: "in_progress" },
  });
  if (updated.count === 0) {
    return { success: false, error: "CAPA cannot start progress — it is not in the open state." };
  }
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      module: "CAPA",
      action: "CAPA_PROGRESS_STARTED",
      recordId: id,
      oldValue: "open",
      newValue: "in_progress",
    },
  });
  revalidatePath("/capa");
  revalidatePath(`/capa/${id}`);
  return { success: true, data: null };
}

/**
 * RUNG 3D-CAPA — guarded closed/rejected → open transition (reopen). Senior
 * action (QA Head / admins only). Requires a reason. Carries the evidence +
 * criteria unlock side-effect that previously lived in updateCAPA's status
 * boundary detection (now the only place it fires).
 */
export async function reopenCAPA(
  id: string,
  input: z.input<typeof ReopenCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!CAPA_REOPEN_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only a QA Head or an admin can reopen a CAPA." };
  }
  const parsed = ReopenCAPASchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const before = await prisma.cAPA.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { status: true, reference: true },
  });
  if (!before) return { success: false, error: "CAPA not found" };
  if (before.status !== "closed" && before.status !== "rejected") {
    return { success: false, error: "Only a closed or rejected CAPA can be reopened." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const capa = await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status: "open" },
    });
    // Unlock evidence + effectiveness criteria (moved here from updateCAPA).
    await unlockCAPAArtifacts(id, session.user.tenantId, {
      userId: actor.userId,
      name: actor.displayName,
      role: actor.role,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_REOPENED",
        recordId: id,
        recordTitle: (before.reference ?? id).slice(0, 80),
        oldValue: before.status,
        newValue: JSON.stringify({ status: "open", reason: parsed.data.reason }),
      },
    });
    revalidatePath("/capa");
    revalidatePath(`/capa/${id}`);
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] reopenCAPA failed:", err);
    return { success: false, error: "Failed to reopen CAPA" };
  }
}

export async function deleteCAPA(id: string, reason?: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Rung 3J.1 — destructive delete is admin-tier (mirrors SYSTEM_DELETE_ROLES),
  // narrower than the CAPA_WRITE_ROLES that gate create/update.
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can delete a CAPA." };
  }

  try {
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return { success: false, error: "CAPA not found" };
    }

    // Soft-delete (Part 11 retention) — the row is retained; list/count queries
    // filter deletedAt IS NULL so it disappears from tracker/worklist/dashboards.
    await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        deletedAt: new Date(),
        deletedById: actor.userId,
        deletedByName: actor.displayName,
        deletionReason: reason ? reason.slice(0, 200) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_DELETED",
        recordId: id,
        newValue: reason ? reason.slice(0, 200) : null,
      },
    });

    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteCAPA failed:", err);
    return { success: false, error: "Failed to delete CAPA" };
  }
}

export async function restoreCAPA(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can restore a CAPA." };
  }
  try {
    const existing = await prisma.cAPA.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true, deletedAt: true },
    });
    if (!existing) return { success: false, error: "CAPA not found" };
    if (!existing.deletedAt) return { success: false, error: "CAPA is not deleted." };
    await prisma.cAPA.update({
      where: { id, tenantId: session.user.tenantId },
      data: { deletedAt: null, deletedById: null, deletedByName: null, deletionReason: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CAPA",
        action: "CAPA_RESTORED",
        recordId: id,
      },
    });
    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] restoreCAPA failed:", err);
    return { success: false, error: "Failed to restore CAPA" };
  }
}
