"use server";

/**
 * Server Actions for Gap Assessment findings.
 *
 * Reference implementation â€” shows the pattern for
 * migrating from Redux dispatch + API routes to
 * Server Actions + revalidatePath.
 *
 * Each action:
 *  1. Checks auth via requireAuth()
 *  2. Validates input with Zod
 *  3. Mutates via Prisma
 *  4. Creates audit log entry
 *  5. Revalidates the page cache
 *  6. Returns result (no throw â€” return errors)
 */

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveCreateSiteId, resolveUserFk, requireGxPAuthor, COMPLIANCE_AUTHOR_ROLES, ADMIN_DELETE_ROLES } from "@/lib/auth";
import { DEVIATION_QA_ROLES, GAP_CREATE_ROLES, QA_AUTHORITY_ROLES, isAssignedToTask, canEditFindingRecord, canWriteFindingRCA } from "@/lib/permissions/roleSets";
import { FINDING_EDIT_REASON_MIN } from "@/constants/capaValidation";
// Item 17 — the ONE close gate; the client renders the same blockers.
import { findingCloseBlockers } from "@/lib/finding-close";
import { findingVisibilityWhere, getFindingAuditTrail } from "@/lib/queries/findings";
import { EVIDENCE_CATEGORIES } from "@/lib/queries/evidence";
import { notify } from "@/lib/notify";
import { fileStorage } from "@/lib/fileStorage";
import { sanitizeFilename } from "@/lib/sanitize";
import { buildReferencePrefix, generateReference, isReferenceConflict } from "@/lib/reference";
import { sanitizeServerError } from "@/lib/errors";
import { CAPA_RCA_METHODS } from "@/constants/rcaMethods";
import { FINDING_STATUS_USER_EDITABLE } from "@/constants/statusTaxonomy";

// Shared with the create form (AddFindingModal) — keep this the single source
// of truth for the minimum requirement length so client and server never
// disagree (a mismatch made short edits fail silently).
const MIN_REQUIREMENT = 10;

// â”€â”€ Schemas â”€â”€

const CreateFindingSchema = z.object({
  requirement: z.string().min(MIN_REQUIREMENT, `Requirement must be at least ${MIN_REQUIREMENT} characters`),
  purpose: z.string().optional(),
  area: z.string().min(1, "Area is required"),
  framework: z.string().optional(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]),
  // Owner is server-stamped to the creator (session) — accepted but ignored if
  // sent, so it can't be spoofed from the client. Optional for that reason.
  owner: z.string().optional(),
  // Block past dates server-side too (mirrors the client DatePicker min).
  targetDate: z.string().min(1, "Target date is required").refine((v) => v >= new Date().toISOString().slice(0, 10), "Target date can't be in the past"),
  siteId: z.string().optional(),
  evidenceLink: z.string().optional(),
  // Gap RCA (Batch B) — structured method + JSON detail; rootCause is the
  // readable mirror serialized by the modal (rcaDetailToText).
  rootCause: z.string().optional(),
  rcaMethod: z.enum(CAPA_RCA_METHODS).optional(),
  rcaDetail: z.string().optional(),
  // SME Section 1, Stage 6 (FULL) â€” optional recurrence link, same
  // semantic as Deviation.previousCAPAId.
  previousCAPAId: z.string().optional(),
});

const UpdateFindingSchema = z.object({
  requirement: z.string().min(MIN_REQUIREMENT).optional(),
  purpose: z.string().optional(),
  area: z.string().min(1).optional(),
  severity: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
  // The USER-EDITABLE subset (3 of the 5 finding statuses), derived from the
  // canonical vocabulary in @/constants/statusTaxonomy. "Submitted"/"Rework"
  // are deliberately excluded: they are set only by submitFinding/reworkFinding
  // below, which carry the assignee check, source-status precondition, audit row
  // and (rework) required reason + notification that this edit form must not
  // bypass. Do NOT widen this to FINDING_STATUS_VALUES.
  status: z.enum(FINDING_STATUS_USER_EDITABLE).optional(),
  // Item 18 — `owner` is deliberately NOT editable here. assignFinding is the ONLY
  // door to changing it, so that every owner change carries its actor + timestamp
  // (Finding.assignedAt/assignedById) and emits FINDING_ASSIGNED. This action
  // accepted an owner change that emitted FINDING_UPDATED and no FINDING_ASSIGNED,
  // which made "owner changed ⇒ assigned" a coincidence rather than an invariant.
  // zod strips the key, so a stale client sending it is ignored, not rejected.
  targetDate: z.string().optional(),
  rootCause: z.string().optional(),
  // Gap RCA (Batch B) — structured method + JSON detail (rootCause = mirror).
  rcaMethod: z.enum(CAPA_RCA_METHODS).optional(),
  rcaDetail: z.string().optional(),
  evidenceLink: z.string().optional(),
  linkedCAPAId: z.string().optional(),
  // Item 16 — REQUIRED reason-for-change (ALCOA+). Not a column on Finding: it
  // lands in FindingEdit.reason AND in the FINDING_UPDATED audit row, because the
  // FindingEdit trail is PARTIAL (only updateFinding + assignFinding write it)
  // while the AuditLog is the complete one an inspector reads. Required on the
  // SERVER, not just the form — a reason the client can skip is not a reason.
  reason: z.string().min(FINDING_EDIT_REASON_MIN, `Reason for edit must be at least ${FINDING_EDIT_REASON_MIN} characters`).max(2000),
});

// â”€â”€ Return types â”€â”€

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

// â”€â”€ Actions â”€â”€

/** A gap raised to a CAPA is LOCKED: once Finding.linkedCAPAId points at a LIVE
 *  (non-closed) CAPA, all gap work moves to the CAPA — the finding stays readable
 *  but every mutating action refuses. Orphan link (CAPA gone) or a closed CAPA
 *  (the finding is then "Closed" anyway) do NOT lock. Mirrors closeFinding's guard. */
async function findingLockedByCapa(linkedCAPAId: string | null | undefined, tenantId: string): Promise<boolean> {
  if (!linkedCAPAId) return false;
  const capa = await prisma.cAPA.findFirst({ where: { id: linkedCAPAId, tenantId }, select: { status: true } });
  return !!capa && capa.status !== "closed";
}
const GAP_LOCKED_MESSAGE = "This gap is locked — a CAPA has been raised from it. Continue the work in the linked CAPA.";

export async function createFinding(input: z.input<typeof CreateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // SME Section 1, Stage 6 (FULL) â€” validate the optional recurrence
  // link before persisting. Same pattern as createDeviation.
  let priorCAPAStatus: string | null = null;
  if (parsed.data.previousCAPAId) {
    const prior = await prisma.cAPA.findFirst({
      where: { id: parsed.data.previousCAPAId, tenantId: session.user.tenantId },
      select: { id: true, status: true },
    });
    if (!prior) {
      return {
        success: false,
        error: "Cited recurrence CAPA not found in your tenant.",
      };
    }
    priorCAPAStatus = prior.status;
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // Responsibility map — a gap finding may be originated by any functional/seat
  // role or qa_head (GAP_CREATE_ROLES denylist); viewer + customer_admin are
  // rejected here, super_admin already blocked above by requireGxPAuthor.
  if (!GAP_CREATE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Your role cannot create a gap assessment." };
  }

  // Site-field rule (shared): super_admin / customer_admin pick a site
  // (required + tenant-validated); every other role is auto-scoped to their own
  // assigned site and the client siteId is ignored. See resolveCreateSiteId.
  const siteRes = await resolveCreateSiteId(session, parsed.data.siteId);
  if (!siteRes.ok) return { success: false, error: siteRes.error };
  const siteId = siteRes.siteId;

  // SME final rung â€” site-scoped reference allocation. Same retry-on-
  // P2002 shape as createDeviation / createCAPA.
  let siteCodeForRef: string | null = null;
  if (siteId) {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { code: true },
    });
    siteCodeForRef = site?.code ?? null;
  }
  const referencePrefix = buildReferencePrefix("FND", siteCodeForRef);

  const MAX_REF_RETRIES = 5;
  let finding: Awaited<ReturnType<typeof prisma.finding.create>> | null = null;
  let lastRefErr: unknown = null;
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    try {
      finding = await prisma.$transaction(async (tx) => {
        const reference = await generateReference(
          referencePrefix,
          new Date(),
          async (prefix, year) => {
            const row = await tx.finding.findFirst({
              where: { reference: { startsWith: `${prefix}-${year}-` } },
              orderBy: { reference: "desc" },
              select: { reference: true },
            });
            return row?.reference ?? null;
          },
        );
        const created = await tx.finding.create({
          data: {
            ...parsed.data,
            // Authoritative siteId from the site-field rule (client value is
            // only honored for super_admin / customer_admin; auto-set otherwise).
            siteId,
            reference,
            tenantId: session.user.tenantId,
            // Owner = the creator, stamped from the session (never the client
            // payload) so it can't be spoofed. Overrides any sent `owner`.
            owner: session.user.id,
            // RUNG 3H — canonical Title Case (matches the schema default, the
            // updateFinding enum, the FindingStatus type, and all read sites).
            status: "Open",
            createdBy: session.user.name,
            // Record-visibility (Phase 0) dual-write — authoritative creator
            // userId FK alongside the createdBy name. Null for a tenant-admin
            // creator with no User row (fail-closed; admins see-all anyway).
            createdById: actor.userId,
            targetDate: new Date(parsed.data.targetDate),
          },
        });
        // Audit is written INSIDE the same transaction as the create so a finding
        // can never exist without its paired FINDING_CREATED row (ALCOA+). A
        // reference-conflict retry rolls the whole tx back, so no double audit.
        await tx.auditLog.create({
          data: {
            tenantId: session.user.tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: "Gap Assessment",
            action: "FINDING_CREATED",
            recordId: created.id,
            recordTitle: created.reference
              ? `${created.reference} — ${parsed.data.requirement.slice(0, 60)}`
              : parsed.data.requirement.slice(0, 80),
            newValue: parsed.data.severity,
          },
        });
        if (parsed.data.previousCAPAId) {
          await tx.auditLog.create({
            data: {
              tenantId: session.user.tenantId,
              userId: actor.userId,
              userName: actor.displayName,
              userRole: actor.role,
              module: "Gap Assessment",
              action: "FINDING_LINKED_TO_PRIOR_CAPA_AS_RECURRENCE",
              recordId: created.id,
              recordTitle: parsed.data.requirement.slice(0, 80),
              newValue: JSON.stringify({
                previousCAPAId: parsed.data.previousCAPAId,
                priorCAPAStatus,
                atCreation: true,
              }),
            },
          });
        }
        return created;
      });
      break;
    } catch (err) {
      lastRefErr = err;
      if (!isReferenceConflict(err)) throw err;
    }
  }
  if (!finding) {
    console.error("[action] createFinding exhausted reference retries:", lastRefErr);
    return { success: false, error: sanitizeServerError(lastRefErr, "Failed to allocate finding reference") };
  }

  revalidatePath("/gap-assessment");
  return { success: true, data: finding };
}

// Human-readable labels + value formatting for the edit-history diff. Only
// the fields a user can actually change through the detail form are diffed.
// Owner is absent by design: updateFinding can no longer change it (Item 18), so
// the entry could never fire. Owner changes are still trailed — assignFinding
// writes its own FindingEdit with field "Owner" (:478-486).
const DIFF_FIELDS: { key: "requirement" | "purpose" | "targetDate" | "evidenceLink" | "status" | "rcaMethod" | "rootCause"; label: string }[] = [
  { key: "requirement", label: "Requirement" },
  { key: "purpose", label: "Purpose" },
  { key: "targetDate", label: "Target date" },
  { key: "evidenceLink", label: "Evidence link" },
  { key: "status", label: "Status" },
  // RCA — track the method + the readable rootCause mirror so edits to a
  // finding's root-cause analysis are captured in the edit-history diff.
  { key: "rcaMethod", label: "RCA method" },
  { key: "rootCause", label: "Root cause" },
];

function normalizeForDiff(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (key === "targetDate") {
    const d = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  return String(value);
}

export async function updateFinding(id: string, input: z.input<typeof UpdateFindingSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // NOTE — the role gate moved BELOW the record read (Item 16): raiser-ness is a
  // property of the finding, so it cannot be decided before reading it. Same shape
  // as updateActionItem's author-vs-assigned-owner split (action-items.ts:349-377).
  // requireGxPAuthor stays above: the platform-admin bright line is record-independent.
  try {
    // A soft-deleted finding is immutable — exclude it (mirrors every other
    // finding action; closeFinding now does the same).
    const before = await prisma.finding.findFirst({
      where: { id, tenantId: session.user.tenantId, deletedAt: null },
    });
    if (!before) return { success: false, error: "Finding not found" };

    // ── Item 16 — WHO may edit ────────────────────────────────────────────────
    // QA authority = the full editor. The RAISER = a limited one: they may correct
    // what they wrote, not re-judge the assessment.
    //
    // The rule lives in canEditFindingRecord (roleSets) so the client mirror and
    // this gate are the SAME function — the shape canEditRisk already uses. It also
    // carries the fail-closed null-actor guard: a bare `===` would make every admin
    // (null userId) the "raiser" of every finding whose createdById is null.
    const isQA = QA_AUTHORITY_ROLES.includes(session.user.role);
    if (!canEditFindingRecord(session.user.role, actor.userId, before)) {
      return { success: false, error: "Only QA Head or the person who raised this finding can edit it." };
    }
    if (!isQA) {
      // Severity drives the CAPA-vs-assign disposition; status can close the finding
      // outright (the Submitted guard below only blocks transitions OUT of
      // Submitted); linkedCAPAId is the escalation link. All three are QA judgment,
      // not authorship. Naming the field is the point — "your role does not permit
      // this action" would leave the raiser guessing which of seven fields did it.
      const QA_ONLY_LABELS: Record<string, string> = {
        severity: "severity",
        status: "status",
        linkedCAPAId: "the linked CAPA",
      };
      const attempted = Object.keys(QA_ONLY_LABELS).filter(
        (f) => (parsed.data as Record<string, unknown>)[f] !== undefined,
      );
      if (attempted.length > 0) {
        return {
          success: false,
          error: `You raised this finding, so you can correct its details — but ${attempted.map((f) => QA_ONLY_LABELS[f]).join(" and ")} ${attempted.length === 1 ? "is" : "are"} a QA judgment. Ask your QA Head to change ${attempted.length === 1 ? "it" : "them"}.`,
        };
      }
    }

    if (await findingLockedByCapa(before.linkedCAPAId, session.user.tenantId)) {
      return { success: false, error: GAP_LOCKED_MESSAGE };
    }

    // Fix 1 — status-transition guards for Edit. updateFinding is a general
    // editor; without these an Edit can bypass the dedicated actions' rules.
    // Runs ONLY when the edit changes status; non-status edits and the
    // QA-manages-directly Open/In-Progress→Closed direct close are unaffected.
    if (parsed.data.status !== undefined && parsed.data.status !== before.status) {
      // (a) Mirror closeFinding's guard: a gap escalated to a CAPA is closed BY
      // its CAPA. Block an Edit-driven close while the linked CAPA is still open.
      if (parsed.data.status === "Closed" && before.linkedCAPAId) {
        const linkedCapa = await prisma.cAPA.findFirst({
          where: { id: before.linkedCAPAId, tenantId: session.user.tenantId },
          select: { status: true },
        });
        if (linkedCapa && linkedCapa.status !== "closed") {
          return { success: false, error: "This finding is linked to an open CAPA. Close the CAPA to resolve the gap." };
        }
      }
      // (b) A Submitted finding is dispositioned ONLY through the SoD review loop
      // (reviewFinding → Closed / reworkFinding → Rework). Block ANY Edit-driven
      // status change out of Submitted — stops Submitted→Open (backward) and
      // Submitted→Closed (skipping independent review).
      if (before.status === "Submitted") {
        return { success: false, error: "A submitted finding is dispositioned through QA review (Accept or Send for rework), not by editing its status." };
      }
      // (c) Item 17 — RCA gate on the Edit-driven close. This is the quietest of the
      // three gated paths: no review moment, no dedicated action, just a status
      // dropdown. Gating it matters MORE here than elsewhere, not less — it is the
      // path someone would reach for to get around the other two.
      if (parsed.data.status === "Closed") {
        const editCloseBlockers = findingCloseBlockers(before, actor.userId);
        if (editCloseBlockers.length > 0) {
          return { success: false, error: editCloseBlockers[0].message };
        }
      }
    }

    const { reason, ...updates } = parsed.data;

    // Build the field-level diff for the append-only edit trail (pure — computed
    // from the pre-image + the incoming updates, before any write).
    const changes = DIFF_FIELDS.flatMap(({ key, label }) => {
      if (!(key in updates) || updates[key] === undefined) return [];
      const oldValue = normalizeForDiff(key, (before as Record<string, unknown>)[key]);
      const newValue = normalizeForDiff(key, (updates as Record<string, unknown>)[key]);
      if (oldValue === newValue) return [];
      return [{ field: label, oldValue, newValue }];
    });

    // Mutation + FindingEdit + AuditLog in ONE transaction so an edit can never
    // land without its paired append-only trail + audit row (ALCOA+).
    const finding = await prisma.$transaction(async (tx) => {
      const updated = await tx.finding.update({
        where: { id, tenantId: session.user.tenantId },
        data: {
          ...updates,
          ...(updates.targetDate ? { targetDate: new Date(updates.targetDate) } : {}),
        },
      });

      if (changes.length > 0) {
        await tx.findingEdit.create({
          data: {
            findingId: id,
            tenantId: session.user.tenantId,
            editedBy: session.user.id,
            editedByName: session.user.name,
            reason: reason?.trim() || null,
            changes: JSON.stringify(changes),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_UPDATED",
          recordId: id,
          recordTitle: before.reference ?? undefined,
          // Item 16 — the reason rides HERE, not only on FindingEdit.reason. The
          // FindingEdit trail is partial (update + assign only); the AuditLog is the
          // complete one, and a reason-for-change recorded solely on the partial
          // trail is invisible to anyone reading the record's actual history.
          // `changes` may be empty (a reason-only save changes no field) — the row
          // still carries the reason rather than an undefined newValue.
          newValue: JSON.stringify({
            reason: reason.trim(),
            changedFields: changes.map((c) => c.field),
            changes,
            accessBasis: isQA ? "qaAuthority" : "raiser",
          }),
        },
      });

      return updated;
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] updateFinding failed:", err);
    return { success: false, error: "Failed to update finding" };
  }
}

// Gap Step 1 — ASSIGN a finding to ONE person who will work it. Mirrors
// assignDeviationTask (deviation-tasks.ts): QA-gated dispatch, active-staff-only
// assignee, owner kept as a String userId (no FK migration), audit + edit-trail
// + notify. Worklist/docs/rework/CAPA-carryover are later steps.
const AssignFindingSchema = z.object({
  assigneeId: z.string().min(1, "Assignee is required"),
});

export async function assignFinding(
  findingId: string,
  input: z.input<typeof AssignFindingSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AssignFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Assignment is a QA dispatch — the same role set deviations use to assign
  // (qa_head + super_admin). Not a GxP authorship event, so no requireGxPAuthor.
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can assign findings." };
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, requirement: true, owner: true, status: true, linkedCAPAId: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (await findingLockedByCapa(finding.linkedCAPAId, session.user.tenantId)) {
    return { success: false, error: GAP_LOCKED_MESSAGE };
  }
  if (finding.status === "Closed") {
    return { success: false, error: "This finding is closed and can no longer be reassigned." };
  }

  // Assignee pool = any active tenant user, operational staff only (exclude
  // platform/admin + viewer). Mirrors assignDeviationTask + the useComplianceUsers
  // UI pool.
  const assignee = await prisma.user.findFirst({
    where: { id: parsed.data.assigneeId, tenantId: session.user.tenantId, isActive: true },
    select: { id: true, name: true, role: true, siteId: true },
  });
  if (!assignee) return { success: false, error: "Assignee must be an active user in your organisation." };
  if (["super_admin", "customer_admin", "viewer"].includes(assignee.role)) {
    return { success: false, error: "Findings can only be assigned to operational staff, not platform or admin roles." };
  }
  // No self-assignment — QA cannot assign a finding to themselves (mirrors the
  // dropdown, which omits the current user). Assigning to the RAISER is allowed
  // and NOT blocked here. Enforced server-side even if the client forces it.
  if (assignee.id === session.user.id) {
    return { success: false, error: "You cannot assign a finding to yourself." };
  }
  // SITE boundary (re-enforced server-side, mirrors getFindingAssignees): a
  // site-bound assigner may assign ONLY within their own site; a tenant-level
  // admin with no siteId assigns tenant-wide.
  const me = await prisma.user.findFirst({ where: { id: session.user.id, tenantId: session.user.tenantId }, select: { siteId: true } });
  const assignerSiteId = me?.siteId ?? null;
  if (assignerSiteId && assignee.siteId !== assignerSiteId) {
    return { success: false, error: "You can only assign findings to users at your own site." };
  }
  if (finding.owner === assignee.id) {
    return { success: false, error: "This finding is already assigned to that user." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    // Mutation + append-only edit trail + audit in ONE transaction (ALCOA+).
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.finding.update({
        where: { id: findingId, tenantId: session.user.tenantId },
        // Assigning a still-Open finding moves it into the work loop (In Progress).
        // A finding already past Open (In Progress/Submitted/Rework) keeps its
        // status on reassignment. NOTE: status is a CONSEQUENCE of assigning here,
        // never the record of it — a finding also reaches In Progress via createCAPA
        // (capas/lifecycle.ts:617) and via a status edit, having never been
        // assigned. assignedAt below is the fact; status is not a proxy for it.
        data: {
          owner: assignee.id,
          // Item 18 — the assignment EVENT: actor + timestamp, in the SAME write as
          // the owner change, so an assignment can never land without them.
          assignedAt: new Date(),
          assignedById: actor.userId,
          ...(finding.status === "Open" ? { status: "In Progress" } : {}),
        },
      });

      // Append-only edit trail (same as updateFinding tracks an owner change) so
      // the reassignment shows in the finding's own history, not just auditLog.
      await tx.findingEdit.create({
        data: {
          findingId,
          tenantId: session.user.tenantId,
          editedBy: session.user.id,
          editedByName: session.user.name,
          reason: "Assigned to a different owner",
          changes: JSON.stringify([{ field: "Owner", oldValue: finding.owner, newValue: assignee.id }]),
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_ASSIGNED",
          recordId: findingId,
          recordTitle: (finding.reference ?? finding.requirement).slice(0, 80),
          newValue: JSON.stringify({ assigneeId: assignee.id, previousOwner: finding.owner }),
        },
      });

      return result;
    });

    // Notification is an external side-effect — kept OUT of the transaction so a
    // slow/failed notify can't roll back (or hold open) the committed assignment.
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: assignee.id,
      actorUserId: actor.userId,
      type: "ACTION_ASSIGNED",
      title: `A gap finding was assigned to you (${finding.reference ?? findingId.slice(0, 8)})`,
      body: finding.requirement.slice(0, 200),
      linkPath: "/gap-assessment",
      entityType: "Finding",
      entityId: findingId,
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] assignFinding failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to assign finding") };
  }
}

export async function deleteFinding(id: string, reason?: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Rung 3J.1 — destructive delete is admin-tier (mirrors SYSTEM_DELETE_ROLES),
  // narrower than the COMPLIANCE_AUTHOR_ROLES that gate create/update/close.
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can delete a finding." };
  }

  try {
    const existing = await prisma.finding.findFirst({
      where: { id, tenantId: session.user.tenantId, deletedAt: null },
      select: { id: true, linkedCAPAId: true },
    });
    if (!existing) return { success: false, error: "Finding not found" };
    // Uniform lock — deleting a gap that has a LIVE linked CAPA would strand the
    // CAPA's provenance: getCAPAFindingDocs + the capa.finding relation filter
    // deletedAt:null, so the "Raised from finding" block silently vanishes while
    // CAPA.findingId still points here. Refuse (same helper as the 9 mutating
    // guards); a closed/orphan CAPA does NOT lock. Restore stays unguarded — it
    // RE-establishes provenance, so an accidental delete can be undone.
    if (await findingLockedByCapa(existing.linkedCAPAId, session.user.tenantId)) {
      return { success: false, error: "This gap is linked to an open CAPA and can't be deleted — its record is the CAPA's provenance. Close the CAPA first." };
    }
    // Soft-delete (Part 11 retention) — row retained; list queries filter deletedAt.
    // Fix 3 — mutation + audit in ONE transaction (matches every other finding action).
    await prisma.$transaction(async (tx) => {
      await tx.finding.update({
        where: { id, tenantId: session.user.tenantId },
        data: {
          deletedAt: new Date(),
          deletedById: actor.userId,
          deletedByName: actor.displayName,
          deletionReason: reason ? reason.slice(0, 200) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_DELETED",
          recordId: id,
          newValue: reason ? reason.slice(0, 200) : null,
        },
      });
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteFinding failed:", err);
    return { success: false, error: "Failed to delete finding" };
  }
}

export async function restoreFinding(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (!ADMIN_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only an administrator can restore a finding." };
  }
  try {
    const existing = await prisma.finding.findFirst({
      where: { id, tenantId: session.user.tenantId },
      select: { id: true, deletedAt: true },
    });
    if (!existing) return { success: false, error: "Finding not found" };
    if (!existing.deletedAt) return { success: false, error: "Finding is not deleted." };
    // Fix 3 — mutation + audit in ONE transaction (matches every other finding action).
    await prisma.$transaction(async (tx) => {
      await tx.finding.update({
        where: { id, tenantId: session.user.tenantId },
        data: { deletedAt: null, deletedById: null, deletedByName: null, deletionReason: null },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_RESTORED",
          recordId: id,
        },
      });
    });
    revalidatePath("/gap-assessment");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] restoreFinding failed:", err);
    return { success: false, error: "Failed to restore finding" };
  }
}

export async function closeFinding(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);

  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Responsibility map — CLOSE is a QA authority action (QA_AUTHORITY_ROLES = qa_head).
  if (!QA_AUTHORITY_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can close a gap finding." };
  }

  try {
    // Precondition: the finding must exist, not be soft-deleted, and not already
    // be Closed — closeFinding previously had NO status/deletedAt guard, so a
    // deleted or already-closed finding could be "closed" again (a no-op audit).
    const existing = await prisma.finding.findFirst({
      where: { id, tenantId: session.user.tenantId, deletedAt: null },
      select: { id: true, status: true, reference: true, linkedCAPAId: true, rootCause: true, rcaRecordedById: true },
    });
    if (!existing) return { success: false, error: "Finding not found" };
    if (existing.status === "Closed") return { success: false, error: "This finding is already closed." };

    // Item 17 — RCA gate. Shared with reviewFinding + updateFinding's status→Closed
    // and with the client, so all four say the same thing about the same refusal.
    // This is the DIRECT close path: no review moment at all, which is exactly why
    // the gate includes "the closer is not the RCA's author" and not merely "an RCA
    // exists" — otherwise QA writes it and closes on it in one sitting.
    const closeBlockers = findingCloseBlockers(existing, actor.userId);
    if (closeBlockers.length > 0) {
      return { success: false, error: closeBlockers[0].message };
    }

    // Fix 3 — a gap escalated to a CAPA is closed BY its CAPA (signAndCloseCAPA
    // cascades the finding to "Closed" atomically). Block a direct finding-close
    // while the linked CAPA is still live. Shared helper (same lock guard every
    // finding-mutating action now uses); keeps the close-specific message.
    if (await findingLockedByCapa(existing.linkedCAPAId, session.user.tenantId)) {
      return {
        success: false,
        error: "This finding is linked to an open CAPA. Close the CAPA to resolve the gap.",
      };
    }

    // Mutation + audit in ONE transaction (ALCOA+).
    const finding = await prisma.$transaction(async (tx) => {
      const updated = await tx.finding.update({
        where: { id, tenantId: session.user.tenantId },
        data: { status: "Closed" }, // RUNG 3H — canonical Title Case
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_CLOSED",
          recordId: id,
          recordTitle: existing.reference ?? undefined,
        },
      });
      return updated;
    });

    revalidatePath("/gap-assessment");
    return { success: true, data: finding };
  } catch (err) {
    console.error("[action] closeFinding failed:", err);
    return { success: false, error: "Failed to close finding" };
  }
}

// ── Evidence document upload ──

const EVIDENCE_MAX_FILE_MB = Number(process.env.EVIDENCE_MAX_FILE_MB ?? "10");
const EVIDENCE_MAX_BYTES = EVIDENCE_MAX_FILE_MB * 1024 * 1024;
const EVIDENCE_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

/**
 * Upload a document as evidence for a finding. Stores the bytes via the file
 * storage abstraction and records a Document row linked to the finding.
 * Mirrors addEvidenceFile in actions/evidence.ts.
 *
 * Does NOT touch Finding.evidenceLink. Evidence Link and Evidence Docs are two
 * SEPARATE fields: evidenceLink is a free-text reference the author supplies
 * (Add Finding modal / the detail's own field); the uploaded docs are Document
 * rows. This upload used to stamp evidenceLink with the stored file name, which
 * made an uploaded doc's FILENAME render as the finding's Evidence Link and let
 * each new upload silently overwrite whatever reference the author had entered.
 */
export async function uploadFindingEvidence(
  findingId: string,
  formData: FormData,
  // Gap Step 3 — optional GxP category (one of EVIDENCE_CATEGORIES). Stored on
  // Document.category so the finding's docs group like deviation task docs and
  // map 1:1 to a CAPA evidence category on a future carryover. Invalid/absent
  // leaves category null (Uncategorized). Mirrors attachDeviationTaskDocument.
  category?: string,
  // Gap-doc bucket (see Document.uploadSource in schema). Defaults to "create"
  // so any un-updated caller records the non-worker bucket; the worklist passes
  // "work" explicitly. Never re-derived from owner.
  uploadSource: "create" | "work" = "create",
): Promise<ActionResult<{ fileName: string }>> {
  const session = await requireAuth();

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided" };
  if (file.size === 0) return { success: false, error: "File is empty" };
  if (file.size > EVIDENCE_MAX_BYTES) {
    return { success: false, error: `File exceeds ${EVIDENCE_MAX_FILE_MB} MB limit` };
  }
  if (!EVIDENCE_ALLOWED_MIME.has(file.type)) {
    return { success: false, error: "File type not allowed" };
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId },
    select: { id: true, reference: true, requirement: true, owner: true, linkedCAPAId: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (await findingLockedByCapa(finding.linkedCAPAId, session.user.tenantId)) {
    return { success: false, error: GAP_LOCKED_MESSAGE };
  }

  // Authorization: an author role OR the finding's assignee (owner == userId).
  // Mirrors addEvidenceFile / attachDeviationTaskDocument. requireGxPAuthor
  // blocks the platform super_admin; the viewer hard-stop is in isAssignedToTask.
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: finding.owner });
  if (!isAuthorRole && !isAssignee) {
    return { success: false, error: "Your role does not permit this action." };
  }
  const cat = category && (EVIDENCE_CATEGORIES as readonly string[]).includes(category) ? category : null;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentHash = createHash("sha256").update(buffer).digest("hex");
    const sanitized = sanitizeFilename(file.name);
    const storageKey = `findings/${findingId}/${contentHash}-${sanitized}`;
    await fileStorage.save(storageKey, buffer, file.type);

    const sizeKb = Math.max(1, Math.round(file.size / 1024));

    await prisma.$transaction(async (tx) => {
      await tx.document.create({
        data: {
          tenantId: session.user.tenantId,
          fileName: sanitized,
          fileType: file.type,
          fileSize: `${sizeKb} KB`,
          version: "v1.0",
          status: "draft",
          uploadedBy: session.user.name,
          // The AUTHORITATIVE uploader FK (null for admin actors with no User
          // row); `uploadedBy` above is the denormalised name, for display only.
          // This path was the sole Document writer that never set it — every
          // sibling does (evidence.ts, documents.ts, risks.ts, systems.ts) — so
          // gap evidence was the only module whose attribution couldn't survive
          // a rename or a user deletion, despite the column being indexed
          // (@@index([tenantId, uploadedById])). ALCOA+ Attributable.
          uploadedById: actor.userId,
          description: `Evidence for ${finding.reference ?? findingId}`,
          linkedModule: "Gap Assessment",
          linkedRecordId: findingId,
          // Gap Step 3 — GxP category (validated above; null = Uncategorized).
          category: cat,
          // Stable upload bucket — create vs worker work (see the param note).
          uploadSource,
          // Persist the retrieval metadata so the Evidence Index can serve
          // the bytes back via GET /api/findings/[id]/evidence. Without
          // storageKey the uploaded file was written to disk but orphaned —
          // there was no way to read it back.
          sourceModule: "gap-assessment",
          sourceId: findingId,
          storageKey,
          sha256: contentHash,
          originalFileName: file.name,
          fileExtension: sanitized.includes(".") ? sanitized.slice(sanitized.lastIndexOf(".") + 1).toLowerCase() : null,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_EVIDENCE_UPLOADED",
          recordId: findingId,
          recordTitle: finding.reference ?? undefined,
          newValue: JSON.stringify({ fileName: sanitized, fileSize: file.size, contentHash }),
        },
      });
    });

    revalidatePath("/gap-assessment");
    revalidatePath("/evidence");
    return { success: true, data: { fileName: sanitized } };
  } catch (err) {
    console.error("[action] uploadFindingEvidence failed:", err);
    return { success: false, error: "Failed to upload evidence file" };
  }
}

/** Read-only loader for a finding's uploaded evidence documents (Document rows,
 *  linkedModule "Gap Assessment"), grouped/displayed in the detail+edit modal so
 *  existing docs are visible there (not just in the worklist). Tenant-scoped;
 *  oldest first; soft-deleted excluded. Shape matches WorklistDoc. */
export async function loadFindingDocuments(findingId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  const docs = await prisma.document.findMany({
    where: {
      tenantId: session.user.tenantId,
      linkedModule: "Gap Assessment", linkedRecordId: findingId,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    // Origin is split by the STABLE uploadSource stamped at upload, NOT by
    // comparing an uploader against the finding's (mutable) owner — that older
    // scheme is gone, and the uploadedById it selected for was never even
    // written here, so the split it described could never have worked.
    select: { id: true, fileName: true, category: true, uploadSource: true, uploadedBy: true, createdAt: true },
  });
  return {
    success: true,
    data: docs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      category: d.category,
      uploadSource: d.uploadSource,
      uploadedBy: d.uploadedBy,
      uploadedAt: d.createdAt.toISOString(),
    })),
  };
}

/** Soft-delete a finding's evidence document before it's submitted to QA — lets
 *  the assignee remove a wrong upload (mirrors removeDeviationTaskDocument). Auth:
 *  an author role OR the finding's assignee (owner), same as the upload. Only a
 *  Gap Assessment doc linked to THIS finding can be removed (never a doc from
 *  elsewhere). Soft-delete preserves the Part 11 trail. */
export async function removeFindingEvidence(
  findingId: string,
  documentId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, owner: true, status: true, linkedCAPAId: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (await findingLockedByCapa(finding.linkedCAPAId, session.user.tenantId)) {
    return { success: false, error: GAP_LOCKED_MESSAGE };
  }
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: finding.owner });
  if (!isAuthorRole && !isAssignee) {
    return { success: false, error: "Your role does not permit this action." };
  }
  if (finding.status === "Closed") {
    return { success: false, error: "This finding is closed; its documents can no longer be changed." };
  }
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId, tenantId: session.user.tenantId, deletedAt: null,
      linkedModule: "Gap Assessment", linkedRecordId: findingId,
    },
    select: { id: true, fileName: true },
  });
  if (!doc) return { success: false, error: "Document not found on this finding." };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    // Soft-delete + audit in ONE transaction.
    //
    // This used to also REPOINT finding.evidenceLink at the next-newest doc (or
    // clear it) when the link matched the removed file — a workaround for the
    // upload conflation, which stamped filenames into evidenceLink and so made
    // deleting a doc leave a dangling link. The upload no longer writes that
    // field and the filenames it wrote are cleared (backfill-finding-
    // evidencelink-conflation), so nothing links evidenceLink to a document's
    // lifecycle: the two are independent, and a doc deletion has no business
    // rewriting the author's reference. Evidence presence now comes from the
    // documents themselves (Finding.hasEvidenceDoc), not from this field.
    await prisma.$transaction(async (tx) => {
      await tx.document.update({
        where: { id: documentId, tenantId: session.user.tenantId },
        data: { deletedAt: new Date(), deletedBy: session.user.name, deletionReason: "Removed from gap finding" },
      });

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId, userName: actor.displayName, userRole: actor.role,
          module: "Gap Assessment", action: "FINDING_EVIDENCE_REMOVED",
          recordId: findingId, recordTitle: doc.fileName,
          newValue: JSON.stringify({ findingId, documentId }),
        },
      });
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    revalidatePath("/evidence");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeFindingEvidence failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to remove document") };
  }
}

// Gap Step 3 — the assignee's work/completion notes (mirrors the deviation task's
// completionNotes). Author OR the finding's assignee (owner) may set it.
const SaveFindingNotesSchema = z.object({
  notes: z.string().max(5000),
});

export async function saveFindingWorkNotes(
  findingId: string,
  input: z.input<typeof SaveFindingNotesSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SaveFindingNotesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, owner: true, linkedCAPAId: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (await findingLockedByCapa(finding.linkedCAPAId, session.user.tenantId)) {
    return { success: false, error: GAP_LOCKED_MESSAGE };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  const isAuthorRole = COMPLIANCE_AUTHOR_ROLES.includes(session.user.role);
  const isAssignee = isAssignedToTask(session, { ownerId: finding.owner });
  if (!isAuthorRole && !isAssignee) {
    return { success: false, error: "Your role does not permit this action." };
  }

  try {
    // Mutation + audit in ONE transaction (ALCOA+).
    await prisma.$transaction(async (tx) => {
      await tx.finding.update({
        where: { id: findingId, tenantId: session.user.tenantId },
        data: { completionNotes: parsed.data.notes.trim() || null },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          action: "FINDING_NOTES_SAVED",
          recordId: findingId,
          recordTitle: finding.reference ?? undefined,
        },
      });
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] saveFindingWorkNotes failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to save notes") };
  }
}

/* ── RCA — its own narrow activity action ─────────────────────────────────────
 *
 * Joins the family (saveFindingWorkNotes above, submitFinding, assignFinding,
 * reworkFinding): one action per real activity, each with its own rule. It does NOT
 * route through updateFinding, the general field editor, for one reason — the REASON
 * rule differs, and it differs for a principled reason rather than a convenience:
 *
 *   FIRST entry is AUTHORSHIP. The assessment is being performed, not altered.
 *   ALCOA+ reason-for-change governs ALTERING previously recorded data; there is
 *   nothing yet to explain a change to. This codebase already draws that exact line:
 *   saveFindingWorkNotes and updateActionItem's completion notes take no reason
 *   (authorship), while reworkFinding and deleteFinding require one (change/undo).
 *
 *   A SUBSEQUENT change IS an alteration, and needs one. Same floor as the editor
 *   (FINDING_EDIT_REASON_MIN) — imported, never re-declared.
 *
 * Routing through updateFinding would have forced a reason on first entry, training
 * everyone to type "adding RCA" — a mandatory-but-meaningless reason, which is the
 * "optional reason isn't an audit trail" problem inverted. updateFinding's mandatory
 * reason (Item 16.2) is UNTOUCHED: the RCA rule lives where RCA lives.
 *
 * Gate: canEditFindingRecord — the SAME pure function the client mirror calls. A
 * second inline check is exactly what left Item 16.1's raiser branch inert.
 */
const SaveFindingRCASchema = z.object({
  rcaMethod: z.enum(CAPA_RCA_METHODS),
  // The readable mirror the register/export/detail render; rcaDetail is the JSON
  // source. Both are serialized client-side by the shared rcaDetailToText, exactly
  // as CAPA's edit modal does.
  rootCause: z.string().min(1, "The analysis cannot be empty").max(4000),
  rcaDetail: z.string().max(8000).optional(),
  // Conditionally required — see below. Optional HERE because the schema cannot
  // know whether an RCA already exists; that needs the record.
  reason: z.string().max(2000).optional(),
});

export async function saveFindingRCA(
  findingId: string,
  input: z.input<typeof SaveFindingRCASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SaveFindingRCASchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    // assignedAt drives the write gate below — the raiser's window closes when the
    // finding is handed off.
    select: { id: true, reference: true, status: true, createdById: true, assignedAt: true, rootCause: true, rcaMethod: true, linkedCAPAId: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (await findingLockedByCapa(finding.linkedCAPAId, session.user.tenantId)) {
    return { success: false, error: GAP_LOCKED_MESSAGE };
  }
  // A closed finding's assessment is a closed record (mirrors removeFindingEvidence).
  if (finding.status === "Closed") {
    return { success: false, error: "This finding is closed; its root cause analysis can no longer be changed." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // canWriteFindingRCA, not canEditFindingRecord: the raiser may author the analysis
  // only until the finding is ASSIGNED. After the handoff the assignee is working
  // against it, so changing it is QA's call. The error names WHY, so a raiser who
  // could write yesterday isn't left guessing what changed.
  if (!canWriteFindingRCA(session.user.role, actor.userId, finding)) {
    return {
      success: false,
      error: finding.assignedAt
        ? "This finding is assigned, so only QA Head can change its root cause analysis."
        : "Only QA Head or the person who raised this finding can record its root cause analysis.",
    };
  }

  // "An RCA exists" is keyed on rootCause — the readable mirror is what the detail
  // renders and what a closure gate would read, so it is the honest test for
  // "has the assessment been performed?".
  const isRevision = !!finding.rootCause?.trim();
  if (isRevision && (parsed.data.reason ?? "").trim().length < FINDING_EDIT_REASON_MIN) {
    return {
      success: false,
      error: `This finding already has a root cause analysis. Revising it needs a reason of at least ${FINDING_EDIT_REASON_MIN} characters.`,
    };
  }
  const reason = isRevision ? parsed.data.reason!.trim() : null;

  try {
    // Mutation + audit in ONE transaction (ALCOA+).
    await prisma.$transaction(async (tx) => {
      await tx.finding.update({
        where: { id: findingId, tenantId: session.user.tenantId },
        data: {
          rootCause: parsed.data.rootCause.trim(),
          rcaMethod: parsed.data.rcaMethod,
          rcaDetail: parsed.data.rcaDetail ?? null,
          // Item 17 — the RCA's provenance, stamped in the SAME write as the
          // analysis. The close gate compares the closer against this author
          // (findingCloseBlockers), so it is stored, never re-derived from the
          // audit trail: a control must not depend on an inference.
          rcaRecordedAt: new Date(),
          rcaRecordedById: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Gap Assessment",
          // TWO action codes, not one code + a flag. "The assessment was performed"
          // and "the assessment was revised" are different events, and the trail is
          // keyed by action everywhere: FINDING_HISTORY_LABEL maps action→label
          // without parsing newValue, and a consumer asking "has an RCA ever been
          // recorded?" is then a keyed count, not a JSON scan of every row. #17 is
          // that consumer.
          action: isRevision ? "FINDING_RCA_UPDATED" : "FINDING_RCA_RECORDED",
          recordId: findingId,
          recordTitle: finding.reference ?? undefined,
          // The PRE-image only on a revision — on first entry there is no old value,
          // and an empty string would imply the analysis was blanked rather than
          // absent.
          oldValue: isRevision ? finding.rootCause : null,
          newValue: JSON.stringify({
            rcaMethod: parsed.data.rcaMethod,
            previousMethod: isRevision ? finding.rcaMethod : undefined,
            // Present only on a revision — see the reason rule above.
            ...(reason ? { reason } : {}),
            accessBasis: QA_AUTHORITY_ROLES.includes(session.user.role) ? "qaAuthority" : "raiser",
          }),
        },
      });
    });
    revalidatePath("/gap-assessment");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] saveFindingRCA failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to save the root cause analysis") };
  }
}

// ── Gap Step 4 — submit → QA review → rework loop (clones the deviation task) ──

const SubmitFindingSchema = z.object({
  completionNotes: z.string().min(5, "Completion notes are required (min 5 chars)"),
});
const ReworkFindingSchema = z.object({
  reason: z.string().min(5, "Rework reason is required (min 5 chars)"),
});

/** SUBMIT — the assignee (owner) submits the finding for QA review. */
export async function submitFinding(
  findingId: string,
  input: z.input<typeof SubmitFindingSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SubmitFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, owner: true, status: true, linkedCAPAId: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (await findingLockedByCapa(finding.linkedCAPAId, session.user.tenantId)) {
    return { success: false, error: GAP_LOCKED_MESSAGE };
  }
  if (!isAssignedToTask(session, { ownerId: finding.owner })) {
    return { success: false, error: "Only the assigned user can submit this finding." };
  }
  if (finding.status !== "Open" && finding.status !== "In Progress" && finding.status !== "Rework") {
    return { success: false, error: "This finding can no longer be submitted." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    // Mutation + audit in ONE transaction (ALCOA+).
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.finding.update({
        where: { id: findingId, tenantId: session.user.tenantId },
        data: {
          status: "Submitted",
          completionNotes: parsed.data.completionNotes,
          submittedAt: new Date(),
          submittedById: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId, userName: actor.displayName, userRole: actor.role,
          module: "Gap Assessment", action: "FINDING_SUBMITTED",
          recordId: findingId, recordTitle: finding.reference ?? undefined,
        },
      });
      return result;
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] submitFinding failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to submit finding") };
  }
}

/** REVIEW → COMPLETE — QA accepts a submitted finding (→ Closed). QA-gated + SoD
 *  (the reviewer must NOT be the assignee/owner). */
export async function reviewFinding(findingId: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can review findings." };
  }
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, owner: true, status: true, linkedCAPAId: true, rootCause: true, rcaRecordedById: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (await findingLockedByCapa(finding.linkedCAPAId, session.user.tenantId)) {
    return { success: false, error: GAP_LOCKED_MESSAGE };
  }
  if (finding.status !== "Submitted") {
    return { success: false, error: "Only a submitted finding can be reviewed." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  if (finding.owner && finding.owner === actor.userId) {
    return { success: false, error: "Separation of duties: you cannot review a finding assigned to you. A different QA Head must review it." };
  }
  // Item 17 — RCA gate. NOT redundant with the SoD above: that one is reviewer !=
  // ASSIGNEE, which says nothing about who wrote the analysis. Accepting the work
  // closes the finding, so the same rule the direct paths use applies here.
  const reviewBlockers = findingCloseBlockers(finding, actor.userId);
  if (reviewBlockers.length > 0) {
    return { success: false, error: reviewBlockers[0].message };
  }
  try {
    // Mutation + audit in ONE transaction (ALCOA+); notify after (side-effect).
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.finding.update({
        where: { id: findingId, tenantId: session.user.tenantId },
        data: { status: "Closed" },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId, userName: actor.displayName, userRole: actor.role,
          module: "Gap Assessment", action: "FINDING_REVIEW_CLOSED",
          recordId: findingId, recordTitle: finding.reference ?? undefined,
        },
      });
      return result;
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: finding.owner,
      actorUserId: actor.userId,
      type: "FINDING_CLOSED",
      title: `Your gap finding was accepted and closed (${finding.reference ?? findingId.slice(0, 8)})`,
      body: "Accepted and closed by QA.",
      linkPath: "/gap-assessment",
      entityType: "Finding",
      entityId: findingId,
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] reviewFinding failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to review finding") };
  }
}

/** REVIEW → REWORK — QA returns a submitted finding to the assignee. QA-gated +
 *  SoD. Auto-posts the rework reason as a FindingMessage (durable history), so
 *  it survives the assignee's resubmit — exactly like reworkDeviationTask. */
export async function reworkFinding(
  findingId: string,
  input: z.input<typeof ReworkFindingSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ReworkFindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!DEVIATION_QA_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head can review findings." };
  }
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, deletedAt: null },
    select: { id: true, reference: true, owner: true, status: true, linkedCAPAId: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  if (await findingLockedByCapa(finding.linkedCAPAId, session.user.tenantId)) {
    return { success: false, error: GAP_LOCKED_MESSAGE };
  }
  if (finding.status !== "Submitted") {
    return { success: false, error: "Only a submitted finding can be sent back for rework." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  if (finding.owner && finding.owner === actor.userId) {
    return { success: false, error: "Separation of duties: you cannot review a finding assigned to you. A different QA Head must review it." };
  }
  try {
    // Mutation + auto-posted rework message + audit in ONE transaction (ALCOA+);
    // notify after (side-effect).
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.finding.update({
        where: { id: findingId, tenantId: session.user.tenantId },
        data: {
          status: "Rework",
          reworkReason: parsed.data.reason,
          reworkAt: new Date(),
          reworkById: actor.userId,
        },
      });
      await tx.findingMessage.create({
        data: {
          tenantId: session.user.tenantId,
          findingId,
          authorId: actor.userId,
          authorName: actor.displayName,
          authorRole: actor.role,
          body: parsed.data.reason,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId, userName: actor.displayName, userRole: actor.role,
          module: "Gap Assessment", action: "FINDING_REWORK",
          recordId: findingId, recordTitle: finding.reference ?? undefined,
          newValue: JSON.stringify({ reason: parsed.data.reason.slice(0, 200) }),
        },
      });
      return result;
    });
    await notify({
      tenantId: session.user.tenantId,
      recipientUserId: finding.owner,
      actorUserId: actor.userId,
      type: "REWORK_ASSIGNED",
      title: `Gap finding returned for rework (${finding.reference ?? findingId.slice(0, 8)})`,
      body: parsed.data.reason.slice(0, 200),
      linkPath: "/worklist",
      entityType: "Finding",
      entityId: findingId,
    });
    revalidatePath("/gap-assessment");
    revalidatePath("/worklist");
    return { success: true, data: updated };
  } catch (err) {
    console.error("[action] reworkFinding failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to send finding for rework") };
  }
}

// postFindingMessage (the user-facing composer for the flat QA↔assignee
// conversation) is gone with the thread UI that was its only caller. The
// FindingMessage table and its rows are RETAINED (Part 11), and are still
// written by reworkFinding above, which persists QA's rework reason directly.

/** Read a finding's review payload (for the QA-side gap view, which doesn't get
 *  it from the worklist payload): the assignee's completion notes and QA's
 *  current rework ask. Tenant-scoped.
 *
 *  No longer returns the FindingMessage thread: the gap detail retired that
 *  display, and the card's "has this been reworked?" gate now reads the
 *  FINDING_REWORK audit rows it already loads for History. The rows themselves
 *  are retained (Part 11) — this only stops querying what nothing renders. */
export async function loadFindingReview(findingId: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Phase 3 — re-check PARENT visibility so a child (the review thread) of a
  // hidden finding is not readable: a non-see-all user who is neither creator
  // nor owner gets "not found" here, before any message is loaded.
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, ...findingVisibilityWhere(session) },
    select: { id: true, status: true, completionNotes: true, reworkReason: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  return {
    success: true,
    data: {
      status: finding.status,
      completionNotes: finding.completionNotes,
      reworkReason: finding.reworkReason,
    },
  };
}

// Phase 7 — the gap-detail History section. Sourced from the AuditLog (via
// getFindingAuditTrail), NOT FindingEdit: submit/review/rework/escalate/close
// write only to the AuditLog, so the FindingEdit trail (what the "Edit history"
// modal shows) is a PARTIAL story that would omit the finding→CAPA→closure arc
// an inspector follows. Same PARENT-visibility re-check as loadFindingReview:
// a hidden finding's history is not readable by a non-see-all non-owner.
export async function loadFindingHistory(findingId: string): Promise<ActionResult> {
  const session = await requireAuth();
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, tenantId: session.user.tenantId, ...findingVisibilityWhere(session) },
    select: { id: true },
  });
  if (!finding) return { success: false, error: "Finding not found" };
  const entries = await getFindingAuditTrail(findingId, session.user.tenantId);
  return { success: true, data: entries };
}
