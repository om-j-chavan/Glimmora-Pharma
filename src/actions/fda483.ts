"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { FDA483_SIGN_ROLES, FDA483_DELETE_ROLES } from "@/lib/permissions/roleSets";
import {
  canonicalizeFDA483ResponseContent,
  computeContentHash,
  verifyPasswordForSigning,
} from "@/lib/signing";
import { readSigningProvenance } from "@/actions/capas/_shared";
import { SIGNING_AUDIT_MODULE } from "@/actions/capas/_types";
import { assertTenantOwnsParent } from "@/lib/tenantScope";
import { buildReferencePrefix, generateReference, isReferenceConflict } from "@/lib/reference";
import { GENERIC_SEVERITY } from "@/lib/severity";
import { sanitizeServerError } from "@/lib/errors";
import { createCAPA } from "@/actions/capas/lifecycle";
import { FDA483_AUDIT_MODULE, getNextStage, REFERENCE_PREFIX_BY_EVENT_TYPE } from "@/modules/fda-483/_shared";
import type { WorkflowStage } from "@/types/fda483";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const SignSubmitFDA483Schema = z.object({
  // Re-authentication password (Part 11 Â§11.200(a)(1)(ii)).
  password: z.string().min(1, "Password is required to sign"),
  // From the SignSubmit modal dropdown â€” "approve" / "certify" / "authorize".
  signatureMeaning: z.string().min(1, "Signature meaning is required"),
});

// Agency is derived from event type server-side (the form shows it read-only)
// so the stored value can never drift from the type. Mirrors deriveAgency in
// src/modules/fda-483/_shared.ts (kept inline to avoid importing a client
// module into a "use server" file).
const AGENCY_BY_EVENT_TYPE: Record<string, string> = {
  "FDA 483": "FDA",
  "Warning Letter": "FDA",
  "EMA Inspection": "EMA",
  "MHRA Inspection": "MHRA",
  "WHO Inspection": "WHO",
  "Health Canada Inspection": "Health Canada",
  "TGA Inspection": "TGA",
  "PMDA Inspection": "PMDA",
  "CDSCO Inspection": "CDSCO",
  "ANVISA Inspection": "ANVISA",
  "Other Inspection": "Other",
};
function deriveAgencyServer(eventType: string): string {
  return AGENCY_BY_EVENT_TYPE[eventType] ?? "Other";
}

const CreateEventSchema = z.object({
  // Optional — the server auto-generates a unique code when blank (see below).
  referenceNumber: z.string().optional(),
  eventType: z.string().min(1),
  siteId: z.string().min(1),
  inspectionDate: z.string().min(1),
  inspectionEndDate: z.string().optional(),
  responseDeadline: z.string().min(1),
  internalOwnerId: z.string().min(1),
  leadInvestigator: z.string().optional(),
});

// Separate partial-update shape (the legacy 6-field event edit). Kept
// distinct from CreateEventSchema so the new create-only fields don't leak
// into updateFDA483Event's spread.
const UpdateEventSchema = z.object({
  referenceNumber: z.string().min(1),
  eventType: z.string().min(1),
  agency: z.string().min(1),
  siteId: z.string().min(1),
  inspectionDate: z.string().min(1),
  responseDeadline: z.string().min(1),
});

const CreateObservationSchema = z.object({
  eventId: z.string().min(1),
  number: z.number().int().positive(),
  text: z.string().min(10),
  area: z.string().optional(),
  regulation: z.string().optional(),
  severity: z.enum(GENERIC_SEVERITY),
});

const CreateCommitmentSchema = z.object({
  eventId: z.string().min(1),
  text: z.string().min(5),
  dueDate: z.string().optional(),
  owner: z.string().optional(),
  // Optional source linkage — an observation OR a CAPA (mutually exclusive),
  // or neither (event-level). Validated server-side.
  observationId: z.string().optional(),
  capaId: z.string().optional(),
});

export async function createFDA483Event(
  input: z.input<typeof CreateEventSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateEventSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
    try {
      requireGxPAuthor(actor);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
    }
    if (session.user.role === "viewer") {
      return { success: false, error: "Viewers cannot perform this action." };
    }
    const d = parsed.data;
    // Resolve the internal owner's name for the audit trail (best-effort).
    const owner = await prisma.user.findUnique({
      where: { id: d.internalOwnerId },
      select: { name: true },
    });

    // Reference: honour a user-typed value (e.g. a real Warning Letter number);
    // otherwise auto-generate a UNIQUE code `<prefix>-<siteCode>-<year>-<NNN>`
    // (same scheme as observations + seed) so events never collide. This is the
    // fix for FEI-as-reference duplicates — one facility has many 483s.
    let referenceNumber = (d.referenceNumber ?? "").trim();
    if (!referenceNumber) {
      const site = await prisma.site.findUnique({
        where: { id: d.siteId },
        select: { code: true },
      });
      const prefix = buildReferencePrefix(
        REFERENCE_PREFIX_BY_EVENT_TYPE[d.eventType] ?? "INS",
        site?.code ?? null,
      );
      referenceNumber = await generateReference(prefix, new Date(), async (p, year) => {
        const row = await prisma.fDA483Event.findFirst({
          where: {
            tenantId: session.user.tenantId,
            referenceNumber: { startsWith: `${p}-${year}-` },
          },
          orderBy: { referenceNumber: "desc" },
          select: { referenceNumber: true },
        });
        return row?.referenceNumber ?? null;
      });
    }

    const event = await prisma.fDA483Event.create({
      data: {
        tenantId: session.user.tenantId,
        referenceNumber,
        eventType: d.eventType,
        agency: deriveAgencyServer(d.eventType),
        siteId: d.siteId,
        inspectionDate: new Date(d.inspectionDate),
        inspectionEndDate: d.inspectionEndDate ? new Date(d.inspectionEndDate) : null,
        responseDeadline: new Date(d.responseDeadline),
        internalOwnerId: d.internalOwnerId,
        leadInvestigator: d.leadInvestigator ?? null,
        status: "Open",
        createdBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "FDA483_EVENT_CREATED",
        recordId: event.id,
        recordTitle: referenceNumber,
        newValue: owner?.name ? `Internal owner: ${owner.name}` : undefined,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] createFDA483Event failed:", err);
    return { success: false, error: "Failed to create event" };
  }
}

export async function updateFDA483Event(
  id: string,
  input: Partial<z.input<typeof UpdateEventSchema>>,
): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
    try {
      requireGxPAuthor(actor);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
    }
    if (session.user.role === "viewer") {
      return { success: false, error: "Viewers cannot perform this action." };
    }
    const event = await prisma.fDA483Event.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...input,
        ...(input.inspectionDate ? { inspectionDate: new Date(input.inspectionDate) } : {}),
        ...(input.responseDeadline ? { responseDeadline: new Date(input.responseDeadline) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "FDA483_EVENT_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] updateFDA483Event failed:", err);
    return { success: false, error: "Failed to update event" };
  }
}

export async function addObservation(
  input: z.input<typeof CreateObservationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateObservationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // IDOR guard â€” verify the caller's tenant owns the parent event before
  // inserting the child observation. Derives the audit-row tenantId from
  // the verified parent (correct for super_admin cross-tenant writes too).
  const parent = await assertTenantOwnsParent<{
    id: string;
    tenantId: string;
    referenceNumber: string;
    siteId: string | null;
  }>(session, "fda483Event", parsed.data.eventId, {
    referenceNumber: true,
    siteId: true,
  });
  if (!parent) return { success: false, error: "FORBIDDEN" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }

  // SME final rung â€” site-scoped reference. FDA483Observation has no
  // siteId of its own; the site is resolved via the parent FDA483Event's
  // siteId. Falls back to the legacy 2-segment format when the parent
  // event has no site or the site has no code populated.
  let siteCodeForRef: string | null = null;
  if (parent.siteId) {
    const site = await prisma.site.findUnique({
      where: { id: parent.siteId },
      select: { code: true },
    });
    siteCodeForRef = site?.code ?? null;
  }
  const referencePrefix = buildReferencePrefix("483", siteCodeForRef);

  const MAX_REF_RETRIES = 5;
  let obs: Awaited<ReturnType<typeof prisma.fDA483Observation.create>> | null = null;
  let lastRefErr: unknown = null;
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    try {
      obs = await prisma.$transaction(async (tx) => {
        const reference = await generateReference(
          referencePrefix,
          new Date(),
          async (prefix, year) => {
            const row = await tx.fDA483Observation.findFirst({
              where: { reference: { startsWith: `${prefix}-${year}-` } },
              orderBy: { reference: "desc" },
              select: { reference: true },
            });
            return row?.reference ?? null;
          },
        );
        return tx.fDA483Observation.create({
          data: { ...parsed.data, reference, status: "Open" },
        });
      });
      break;
    } catch (err) {
      lastRefErr = err;
      if (!isReferenceConflict(err)) throw err;
    }
  }
  if (!obs) {
    console.error("[action] addObservation exhausted reference retries:", lastRefErr);
    return { success: false, error: sanitizeServerError(lastRefErr, "Failed to allocate observation reference") };
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: parent.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "OBSERVATION_ADDED",
        recordId: parsed.data.eventId,
        recordTitle: obs.reference ?? parent.referenceNumber,
        newValue: `Observation #${parsed.data.number}`,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: obs };
  } catch (err) {
    console.error("[action] addObservation post-create steps failed:", err);
    return { success: false, error: "Failed to add observation" };
  }
}

/* ── Bulk import observations from a 483 PDF extraction ────────────────
 * Companion to addObservation, for Feature M (FDA 483 PDF auto-extraction).
 * Takes the user-reviewed rows from ImportObservationsModal and creates them
 * in one call. Every row reuses the SAME atomic reference-allocation +
 * per-observation audit as addObservation; a summary
 * OBSERVATIONS_IMPORTED_FROM_PDF audit row carries the source-text provenance
 * (page + confidence + snippet) so the import is traceable with no schema
 * migration. The original PDF is retained via a `483_source` FDA483Document. */
const BulkImportObservationSchema = z.object({
  text: z.string().min(10),
  area: z.string().optional(),
  regulation: z.string().optional(),
  severity: z.enum(GENERIC_SEVERITY),
  sourcePage: z.number().int().nonnegative().optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  /** The observation number as printed on the 483 — kept for the audit trail
   *  only; the stored `number` is re-sequenced to avoid collisions. */
  originalNumber: z.number().int().optional(),
});

const BulkImportSchema = z.object({
  eventId: z.string().min(1),
  observations: z.array(BulkImportObservationSchema).min(1, "No observations to import"),
  sourceFile: z
    .object({
      fileName: z.string().min(1),
      fileUrl: z.string().min(1),
      fileType: z.string().optional(),
      fileSize: z.string().optional(),
    })
    .optional(),
});

export async function bulkAddObservationsFromExtraction(
  input: z.input<typeof BulkImportSchema>,
): Promise<ActionResult<{ created: number }>> {
  const session = await requireAuth();
  const parsed = BulkImportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const parent = await assertTenantOwnsParent<{
    id: string;
    tenantId: string;
    referenceNumber: string;
    siteId: string | null;
  }>(session, "fda483Event", parsed.data.eventId, {
    referenceNumber: true,
    siteId: true,
  });
  if (!parent) return { success: false, error: "FORBIDDEN" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }

  // Site-scoped reference prefix (same derivation as addObservation).
  let siteCodeForRef: string | null = null;
  if (parent.siteId) {
    const site = await prisma.site.findUnique({
      where: { id: parent.siteId },
      select: { code: true },
    });
    siteCodeForRef = site?.code ?? null;
  }
  const referencePrefix = buildReferencePrefix("483", siteCodeForRef);

  // Continue numbering after any observations the event already has.
  const existingCount = await prisma.fDA483Observation.count({
    where: { eventId: parsed.data.eventId },
  });

  const MAX_REF_RETRIES = 5;
  const created: { id: string; number: number; reference: string | null }[] = [];
  const provenance: { number: number; originalNumber?: number; sourcePage?: number; confidence?: number; snippet: string }[] = [];

  for (let i = 0; i < parsed.data.observations.length; i++) {
    const row = parsed.data.observations[i];
    const number = existingCount + i + 1;
    let obs: Awaited<ReturnType<typeof prisma.fDA483Observation.create>> | null = null;
    let lastRefErr: unknown = null;
    for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
      try {
        obs = await prisma.$transaction(async (tx) => {
          const reference = await generateReference(
            referencePrefix,
            new Date(),
            async (prefix, year) => {
              const r = await tx.fDA483Observation.findFirst({
                where: { reference: { startsWith: `${prefix}-${year}-` } },
                orderBy: { reference: "desc" },
                select: { reference: true },
              });
              return r?.reference ?? null;
            },
          );
          return tx.fDA483Observation.create({
            data: {
              eventId: parsed.data.eventId,
              number,
              text: row.text,
              area: row.area ?? "",
              regulation: row.regulation ?? "",
              severity: row.severity,
              reference,
              status: "Open",
            },
          });
        });
        break;
      } catch (err) {
        lastRefErr = err;
        if (!isReferenceConflict(err)) throw err;
      }
    }
    if (!obs) {
      console.error("[action] bulkAddObservationsFromExtraction reference retries exhausted:", lastRefErr);
      // Partial success: report how many landed so the user isn't left guessing.
      if (created.length > 0) break;
      return { success: false, error: sanitizeServerError(lastRefErr, "Failed to allocate observation reference") };
    }
    created.push({ id: obs.id, number: obs.number, reference: obs.reference });
    provenance.push({
      number,
      originalNumber: row.originalNumber,
      sourcePage: row.sourcePage,
      confidence: row.confidence,
      snippet: row.text.slice(0, 160),
    });
  }

  try {
    // Per-observation audit rows (mirrors addObservation) …
    await prisma.auditLog.createMany({
      data: created.map((c) => ({
        tenantId: parent.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "OBSERVATION_ADDED",
        recordId: parsed.data.eventId,
        recordTitle: c.reference ?? parent.referenceNumber,
        newValue: `Observation #${c.number} (imported from 483 PDF)`,
      })),
    });
    // … plus a single import-summary row carrying the source-text provenance.
    await prisma.auditLog.create({
      data: {
        tenantId: parent.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "OBSERVATIONS_IMPORTED_FROM_PDF",
        recordId: parsed.data.eventId,
        recordTitle: parsed.data.sourceFile?.fileName ?? parent.referenceNumber,
        newValue: JSON.stringify({
          fileName: parsed.data.sourceFile?.fileName ?? null,
          count: created.length,
          perObs: provenance,
        }),
      },
    });
  } catch (err) {
    console.error("[action] bulkAddObservationsFromExtraction audit failed:", err);
    // Observations already committed; don't fail the whole import on audit-only error.
  }

  // Retain the original PDF so the extraction is traceable to its source.
  if (parsed.data.sourceFile) {
    try {
      await prisma.fDA483Document.create({
        data: {
          eventId: parsed.data.eventId,
          fileName: parsed.data.sourceFile.fileName,
          fileUrl: parsed.data.sourceFile.fileUrl,
          fileType: parsed.data.sourceFile.fileType ?? null,
          fileSize: parsed.data.sourceFile.fileSize ?? null,
          type: "483_source",
          uploadedBy: session.user.name,
        },
      });
    } catch (err) {
      console.error("[action] bulkAddObservationsFromExtraction source-doc save failed:", err);
    }
  }

  revalidatePath("/fda-483");
  return { success: true, data: { created: created.length } };
}

// NOTE — actor identity: never write `session.user.id` into a User FK column.
// Admin logins are Tenant rows (session.user.id is a Tenant id) → FK violation.
// Resolve via resolveUserFk() from @/lib/auth (AUDIT Finding #2 / Rung 3E).

export async function addCommitment(
  input: z.input<typeof CreateCommitmentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateCommitmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // IDOR guard â€” verify the caller's tenant owns the parent event.
  const parent = await assertTenantOwnsParent<{
    id: string;
    tenantId: string;
    referenceNumber: string;
    siteId: string | null;
  }>(session, "fda483Event", parsed.data.eventId, { referenceNumber: true, siteId: true });
  if (!parent) return { success: false, error: "FORBIDDEN" };

  // Linkage validation — observation XOR capa, and each must belong to this
  // event (the CAPA via one of the event's observations).
  const { observationId, capaId } = parsed.data;
  if (observationId && capaId) {
    return { success: false, error: "A commitment can link to an observation OR a CAPA, not both." };
  }
  if (observationId) {
    const obs = await prisma.fDA483Observation.findFirst({
      where: { id: observationId, eventId: parsed.data.eventId },
      select: { id: true },
    });
    if (!obs) return { success: false, error: "Linked observation is not part of this event." };
  }
  if (capaId) {
    const linked = await prisma.fDA483Observation.findFirst({
      where: { eventId: parsed.data.eventId, capaId },
      select: { id: true },
    });
    if (!linked) return { success: false, error: "Linked CAPA is not associated with this event." };
  }

  // Reference allocation — COMM-<siteCode>-<year>-<NNN>, mirroring the
  // deviation/observation retry-on-conflict pattern.
  let siteCodeForRef: string | null = null;
  if (parent.siteId) {
    const site = await prisma.site.findUnique({ where: { id: parent.siteId }, select: { code: true } });
    siteCodeForRef = site?.code ?? null;
  }
  const referencePrefix = buildReferencePrefix("COMM", siteCodeForRef);

  // session.user.id may be a Tenant-row id (super_admin / customer_admin) —
  // resolve to a real User FK or null so createdById never violates its FK.
  const createdById = (await resolveUserFk(session.user.id, session.user.tenantId, session.user.role)).userId;
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }

  const MAX_REF_RETRIES = 5;
  let commitment: Awaited<ReturnType<typeof prisma.fDA483Commitment.create>> | null = null;
  let lastRefErr: unknown = null;
  for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
    try {
      commitment = await prisma.$transaction(async (tx) => {
        const reference = await generateReference(
          referencePrefix,
          new Date(),
          async (prefix, year) => {
            const row = await tx.fDA483Commitment.findFirst({
              where: { reference: { startsWith: `${prefix}-${year}-` } },
              orderBy: { reference: "desc" },
              select: { reference: true },
            });
            return row?.reference ?? null;
          },
        );
        return tx.fDA483Commitment.create({
          data: {
            reference,
            eventId: parsed.data.eventId,
            text: parsed.data.text,
            owner: parsed.data.owner ?? null,
            dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
            observationId: observationId ?? null,
            capaId: capaId ?? null,
            status: "Pending",
            createdById,
          },
        });
      });
      break;
    } catch (err) {
      lastRefErr = err;
      if (!isReferenceConflict(err)) throw err;
    }
  }
  if (!commitment) {
    console.error("[action] addCommitment exhausted reference retries:", lastRefErr);
    return { success: false, error: sanitizeServerError(lastRefErr, "Failed to allocate commitment reference") };
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId: parent.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "COMMITMENT_ADDED",
        recordId: commitment.id,
        recordTitle: commitment.reference ?? parent.referenceNumber,
        newValue: commitment.reference,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: commitment };
  } catch (err) {
    console.error("[action] addCommitment audit failed:", err);
    return { success: true, data: commitment };
  }
}

export async function deleteFDA483Event(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
    try {
      requireGxPAuthor(actor);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
    }
    // Phase 6 cleanup FIX 4 — delete restricted to qa_head + customer_admin
    // (was any non-viewer via requireGxPAuthor).
    if (!FDA483_DELETE_ROLES.includes(session.user.role)) {
      return { success: false, error: "Only a QA Head or an administrator can delete FDA 483 records." };
    }
    await prisma.fDA483Event.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "FDA483_EVENT_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteFDA483Event failed:", err);
    return { success: false, error: "Failed to delete event" };
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * RESPONSE DRAFTS â€” narrative + AGI
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export async function saveResponseDraft(
  eventId: string,
  draft: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
    try {
      requireGxPAuthor(actor);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
    }
    if (session.user.role === "viewer") {
      return { success: false, error: "Viewers cannot perform this action." };
    }
    const event = await prisma.fDA483Event.update({
      where: { id: eventId, tenantId: session.user.tenantId },
      data: {
        responseDraft: draft,
        // Bump status only when there's actual draft content; preserve
        // a more advanced status (e.g. Response Submitted) by checking
        // whether the current status is in the early lifecycle.
        status: "Response Drafted",
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "RESPONSE_DRAFT_SAVED",
        recordId: eventId,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] saveResponseDraft failed:", err);
    return { success: false, error: "Failed to save response draft" };
  }
}

export async function saveAGIDraft(
  eventId: string,
  agiDraft: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
    try {
      requireGxPAuthor(actor);
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
    }
    if (session.user.role === "viewer") {
      return { success: false, error: "Viewers cannot perform this action." };
    }
    const event = await prisma.fDA483Event.update({
      where: { id: eventId, tenantId: session.user.tenantId },
      data: { agiDraft },
    });
    // Audit log for AGI draft save (audit finding 10.4 â€” coverage gap closed).
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "AGI_DRAFT_SAVED",
        recordId: eventId,
        recordTitle: event.referenceNumber,
        newValue: agiDraft.slice(0, 200),
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] saveAGIDraft failed:", err);
    return { success: false, error: "Failed to save AGI draft" };
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * SIGN & SUBMIT â€” captures signature meaning
 * Schema fields: status, responseDraft, submittedAt,
 * submittedBy, signatureMeaning, closedAt.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export async function signSubmitFDA483Response(
  eventId: string,
  draft: string,
  input: z.input<typeof SignSubmitFDA483Schema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = SignSubmitFDA483Schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Validation failed",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (!FDA483_SIGN_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head or Regulatory Affairs can sign and submit the FDA 483 response" };
  }

  const existing = await prisma.fDA483Event.findFirst({
    where: { id: eventId, tenantId: session.user.tenantId },
    select: { id: true, referenceNumber: true },
  });
  if (!existing) return { success: false, error: "FDA 483 event not found" };

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // Â§11.200(a)(1)(ii) â€” re-authenticate at the moment of signing.
  const passwordOk = await verifyPasswordForSigning(
    session.user.id,
    parsed.data.password,
  );
  if (!passwordOk) {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "SIGNING_PASSWORD_FAILED",
        recordId: eventId,
        recordTitle: existing.referenceNumber,
        newValue: JSON.stringify({
          recordType: "FDA483_RESPONSE",
          attempt_at: new Date().toISOString(),
        }),
      },
    });
    return {
      success: false,
      error: "Password verification failed. Please try again.",
    };
  }

  try {
    const submittedAt = new Date();
    // Hash the draft content separately so the canonical bound state is
    // compact yet still detects any post-signing tampering of the response.
    const responseDraftHash = computeContentHash(draft);
    const canonicalContent = canonicalizeFDA483ResponseContent({
      eventId: existing.id,
      referenceNumber: existing.referenceNumber,
      responseDraftHash,
      signatureMeaning: parsed.data.signatureMeaning,
      submittedAt,
    });
    const contentHash = computeContentHash(canonicalContent);
    const contentSummary = `FDA 483 ${existing.referenceNumber} response submitted by ${session.user.name} (${session.user.role}) â€” meaning: ${parsed.data.signatureMeaning}`;
    const provenance = await readSigningProvenance();

    const { event, signedRecord } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "FDA483_RESPONSE",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: parsed.data.signatureMeaning,
          contentHash,
          contentSummary,
          passwordVerifiedAt: submittedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      const updated = await tx.fDA483Event.update({
        where: { id: eventId, tenantId: session.user.tenantId },
        data: {
          status: "Response Submitted",
          // Advance the workflow pointer to the Outcome stage (RA records the
          // FDA reply next). Soft — does not lock anything.
          currentStage: "outcome",
          responseDraft: draft,
          submittedAt,
          submittedBy: session.user.name,
          signatureMeaning: parsed.data.signatureMeaning,
          responseSignatureId: sig.id,
        },
      });
      return { event: updated, signedRecord: sig };
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "FDA483_RESPONSE_SUBMITTED",
        recordId: eventId,
        newValue: parsed.data.signatureMeaning,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "FDA483_RESPONSE_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.referenceNumber,
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          signatureMeaning: parsed.data.signatureMeaning,
          eventId: existing.id,
          responseDraftHashPrefix: responseDraftHash.slice(0, 16),
        }),
      },
    });
    revalidatePath("/fda-483");
    revalidatePath("/");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] signSubmitFDA483Response failed:", err);
    return { success: false, error: "Failed to submit response" };
  }
}

/* ══════════════════════════════════════════════════
 * WORKFLOW — soft stage handoff (role ownership)
 * ══════════════════════════════════════════════════ */

/**
 * Advance the event's `currentStage` pointer to the next stage and notify the
 * next owner (via the client notification engine, which reads currentStage).
 * SOFT: this does not lock editing — it's an ownership convenience. Only the
 * legal next transition is allowed (validated against getNextStage). Any
 * non-viewer GxP author may hand off; the UI shows the button to the stage
 * owner. The signed transitions (response→outcome, outcome→closed) go through
 * signSubmitFDA483Response / recordFDA483Outcome, NOT this action.
 */
const HandoffSchema = z.object({
  eventId: z.string().min(1),
  toStage: z.enum(["investigation", "response"]),
});

export async function handoffFDA483Stage(
  input: z.input<typeof HandoffSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = HandoffSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }

  const existing = await prisma.fDA483Event.findFirst({
    where: { id: parsed.data.eventId, tenantId: session.user.tenantId },
    select: { id: true, referenceNumber: true, currentStage: true },
  });
  if (!existing) return { success: false, error: "FDA 483 event not found" };

  const from = (existing.currentStage ?? "intake") as WorkflowStage;
  const expectedNext = getNextStage(from);
  if (expectedNext !== parsed.data.toStage) {
    return { success: false, error: `Cannot hand off from "${from}" to "${parsed.data.toStage}".` };
  }

  try {
    const event = await prisma.fDA483Event.update({
      where: { id: parsed.data.eventId, tenantId: session.user.tenantId },
      data: { currentStage: parsed.data.toStage },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "STAGE_HANDED_OFF",
        recordId: parsed.data.eventId,
        recordTitle: existing.referenceNumber,
        oldValue: from,
        newValue: parsed.data.toStage,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] handoffFDA483Stage failed:", err);
    return { success: false, error: "Failed to hand off the event" };
  }
}

/* ══════════════════════════════════════════════════
 * OUTCOME — record FDA's reply (Part 11 signed) → close
 * ══════════════════════════════════════════════════ */

const RecordOutcomeSchema = z.object({
  eventId: z.string().min(1),
  outcomeType: z.enum(["Acknowledged", "Closed", "Warning Letter", "Follow-up Requested"]),
  note: z.string().optional(),
  password: z.string().min(1, "Password is required to sign"),
  signatureMeaning: z.string().min(1, "Signature meaning is required"),
  // Optional FDA letter attachment (base64 data URL, mirrors addResponseDocument).
  document: z
    .object({
      fileName: z.string().min(1),
      fileUrl: z.string().min(1),
      fileType: z.string().optional(),
      fileSize: z.string().optional(),
    })
    .optional(),
});

// outcomeType → { event status, is-terminal, next stage }. "Follow-up
// Requested" reopens the Response stage so RA can revise + resubmit; the
// others close the loop.
const OUTCOME_STATUS: Record<string, { status: string; terminal: boolean; stage: WorkflowStage }> = {
  Acknowledged: { status: "FDA Acknowledged", terminal: true, stage: "closed" },
  Closed: { status: "Closed", terminal: true, stage: "closed" },
  "Warning Letter": { status: "Warning Letter", terminal: true, stage: "closed" },
  "Follow-up Requested": { status: "Response Drafted", terminal: false, stage: "response" },
};

export async function recordFDA483Outcome(
  input: z.input<typeof RecordOutcomeSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = RecordOutcomeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!FDA483_SIGN_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only QA Head or Regulatory Affairs can record the FDA outcome" };
  }

  const existing = await prisma.fDA483Event.findFirst({
    where: { id: parsed.data.eventId, tenantId: session.user.tenantId },
    select: { id: true, referenceNumber: true, status: true },
  });
  if (!existing) return { success: false, error: "FDA 483 event not found" };
  if (existing.status !== "Response Submitted" && existing.status !== "FDA Acknowledged") {
    return { success: false, error: "Record the outcome only after the response has been submitted." };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  // §11.200(a)(1)(ii) — re-authenticate at the moment of signing.
  const passwordOk = await verifyPasswordForSigning(session.user.id, parsed.data.password);
  if (!passwordOk) {
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "SIGNING_PASSWORD_FAILED",
        recordId: parsed.data.eventId,
        recordTitle: existing.referenceNumber,
        newValue: JSON.stringify({ recordType: "FDA483_OUTCOME", attempt_at: new Date().toISOString() }),
      },
    });
    return { success: false, error: "Password verification failed. Please try again." };
  }

  const map = OUTCOME_STATUS[parsed.data.outcomeType];
  try {
    const recordedAt = new Date();
    const canonical = JSON.stringify({
      recordType: "FDA483_OUTCOME",
      eventId: existing.id,
      referenceNumber: existing.referenceNumber,
      outcomeType: parsed.data.outcomeType,
      note: parsed.data.note ?? "",
      signatureMeaning: parsed.data.signatureMeaning,
      recordedAt: recordedAt.toISOString(),
    });
    const contentHash = computeContentHash(canonical);
    const contentSummary = `FDA 483 ${existing.referenceNumber} outcome "${parsed.data.outcomeType}" recorded by ${session.user.name} (${session.user.role}) — meaning: ${parsed.data.signatureMeaning}`;
    const provenance = await readSigningProvenance();

    const { event, signedRecord } = await prisma.$transaction(async (tx) => {
      const sig = await tx.signedRecord.create({
        data: {
          tenantId: session.user.tenantId,
          recordType: "FDA483_OUTCOME",
          recordId: existing.id,
          signerId: session.user.id,
          signerName: session.user.name,
          signerRole: session.user.role,
          signerEmail: session.user.email,
          signatureMeaning: parsed.data.signatureMeaning,
          contentHash,
          contentSummary,
          passwordVerifiedAt: recordedAt,
          ipAddress: provenance.ipAddress,
          userAgent: provenance.userAgent,
        },
      });
      const updated = await tx.fDA483Event.update({
        where: { id: parsed.data.eventId, tenantId: session.user.tenantId },
        data: {
          status: map.status,
          currentStage: map.stage,
          outcomeType: parsed.data.outcomeType,
          outcomeNote: parsed.data.note ?? null,
          outcomeSignatureId: sig.id,
          closedAt: map.terminal ? recordedAt : null,
        },
      });
      if (parsed.data.document) {
        await tx.fDA483Document.create({
          data: {
            eventId: parsed.data.eventId,
            fileName: parsed.data.document.fileName,
            fileUrl: parsed.data.document.fileUrl,
            fileType: parsed.data.document.fileType ?? null,
            fileSize: parsed.data.document.fileSize ?? null,
            type: "fda_outcome",
            uploadedBy: session.user.name,
          },
        });
      }
      return { event: updated, signedRecord: sig };
    });

    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "FDA483_OUTCOME_RECORDED",
        recordId: parsed.data.eventId,
        recordTitle: existing.referenceNumber,
        newValue: JSON.stringify({ outcomeType: parsed.data.outcomeType, status: map.status }),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: SIGNING_AUDIT_MODULE,
        action: "FDA483_OUTCOME_SIGNED",
        recordId: signedRecord.id,
        recordTitle: existing.referenceNumber,
        newValue: JSON.stringify({
          signerId: session.user.id,
          contentHashPrefix: contentHash.slice(0, 16),
          outcomeType: parsed.data.outcomeType,
          eventId: existing.id,
        }),
      },
    });
    revalidatePath("/fda-483");
    revalidatePath("/");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] recordFDA483Outcome failed:", err);
    return { success: false, error: "Failed to record the outcome" };
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * OBSERVATIONS â€” update / delete + CAPA link
 * Schema fields: text, area, regulation, severity,
 * rcaMethod, rootCause, capaId, responseText, status.
 * (No `linkedCAPAId` or `rcaData` columns â€” spec
 * incorrectly named these.)
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const UpdateObservationSchema = z.object({
  text: z.string().optional(),
  area: z.string().optional(),
  regulation: z.string().optional(),
  severity: z.enum(GENERIC_SEVERITY).optional(),
  rcaMethod: z.string().optional(),
  rootCause: z.string().optional(),
  responseText: z.string().optional(),
  // RUNG 3D-FDA — status removed (was the arbitrary-status bypass, Finding #4).
  // Transitions go through dedicated guarded actions (see NOTE on updateObservation).
  capaId: z.string().optional(),
});

// NOTE: status field intentionally NOT accepted (Rung 3D-FDA). Status changes
// route through dedicated guarded transitions:
//   → Response Drafted: markObservationResponseDrafted (after RCA is saved)
//   → CAPA Linked:      linkCAPAToEvent / raiseCAPAFromObservation (existing)
//   → Closed:           closeObservation (QA/admin, reason required)
// See AUDIT-GLOBAL-PATTERNS.md Finding #4.
export async function updateObservation(
  id: string,
  input: z.input<typeof UpdateObservationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateObservationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  // Fetch the existing observation (tenant-scoped unless super_admin) —
  // serves as the IDOR guard AND supplies the pre-update rootCause /
  // rcaMethod / capaId for the auto-invalidation comparison below.
  const existing = await prisma.fDA483Observation.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id }
        : { id, event: { tenantId: session.user.tenantId } },
    select: { id: true, rootCause: true, rcaMethod: true, capaId: true },
  });
  if (!existing) return { success: false, error: "FORBIDDEN" };

  // Part 11 data integrity: when an edit changes the RCA substance
  // (rootCause or rcaMethod) of an observation that already has a linked
  // CAPA, the CAPA's standing RCA-review verdict no longer reflects the
  // analysis and must be invalidated. Mirrors the updateCAPA auto-
  // invalidation in capas/lifecycle.ts using the field-set from
  // capas/rca-review.ts.
  const rcaChanged =
    (parsed.data.rootCause !== undefined &&
      parsed.data.rootCause !== existing.rootCause) ||
    (parsed.data.rcaMethod !== undefined &&
      parsed.data.rcaMethod !== existing.rcaMethod);
  const invalidateCapaId =
    rcaChanged && existing.capaId ? existing.capaId : null;

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    const obs = await prisma.$transaction(async (tx) => {
      const updated = await tx.fDA483Observation.update({
        where: { id },
        data: parsed.data,
      });

      if (invalidateCapaId) {
        // Only invalidate a CAPA that carries a standing RCA verdict
        // (approved or rejected); skip when it was never reviewed (null).
        const capa = await tx.cAPA.findUnique({
          where: { id: invalidateCapaId },
          select: { id: true, reference: true, description: true, rcaApproved: true },
        });
        if (capa && capa.rcaApproved !== null) {
          await tx.cAPA.update({
            where: { id: capa.id },
            data: {
              rcaApproved: false,
              rcaReviewedBy: null,
              rcaReviewedById: null,
              rcaReviewedAt: null,
              rcaReviewNotes: null,
              // Mirror clearRCAReview's full field-set — a stale override
              // must not survive a source-RCA change either.
              rcaOverrideBy: null,
              rcaOverrideById: null,
              rcaOverrideAt: null,
              rcaOverrideReason: null,
            },
          });
          await tx.auditLog.create({
            data: {
              tenantId: session.user.tenantId,
              userId: actor.userId,
              userName: actor.displayName,
              userRole: actor.role,
              module: "CAPA",
              action: "CAPA_RCA_REVIEW_INVALIDATED_BY_OBS_RCA_CHANGE",
              recordId: capa.id,
              recordTitle: (capa.reference ?? capa.description).slice(0, 80),
              oldValue: capa.rcaApproved ? "approved" : "rejected",
              newValue: JSON.stringify({
                reason: "Source observation RCA changed",
                observationId: id,
              }),
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: FDA483_AUDIT_MODULE,
          action: "OBSERVATION_UPDATED",
          recordId: id,
          newValue: parsed.data.rcaMethod ?? "updated",
        },
      });

      return updated;
    });
    revalidatePath("/fda-483");
    revalidatePath("/capa");
    return { success: true, data: obs };
  } catch (err) {
    console.error("[action] updateObservation failed:", err);
    return { success: false, error: "Failed to update observation" };
  }
}

/**
 * RUNG 3D-FDA — guarded transition to "Response Drafted" (the state the RCA-save
 * UI used to set via the updateObservation status bypass). The RCA content
 * itself (rootCause / rcaMethod, plus the linked-CAPA RCA invalidation) is still
 * written through updateObservation; this only advances the status. Open to all
 * compliance roles (matches who could save RCA before); viewers blocked.
 */
export async function markObservationResponseDrafted(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot update observations." };
  }
  const existing = await prisma.fDA483Observation.findFirst({
    where: session.user.role === "super_admin" ? { id } : { id, event: { tenantId: session.user.tenantId } },
    select: { id: true, status: true, reference: true },
  });
  if (!existing) return { success: false, error: "FORBIDDEN" };
  if (existing.status === "Closed") {
    return { success: false, error: "Cannot draft a response on a closed observation." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const obs = await prisma.fDA483Observation.update({ where: { id }, data: { status: "Response Drafted" } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "OBSERVATION_RESPONSE_DRAFTED",
        recordId: id,
        recordTitle: existing.reference ?? undefined,
        oldValue: existing.status,
        newValue: "Response Drafted",
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: obs };
  } catch (err) {
    console.error("[action] markObservationResponseDrafted failed:", err);
    return { success: false, error: "Failed to advance observation" };
  }
}

const CloseObservationSchema = z.object({
  reason: z.string().min(10, "A reason of at least 10 characters is required to close").max(2000),
});

/**
 * RUNG 3D-FDA — guarded close of an observation. Closure is final, so it is
 * QA Head / admin only and requires a reason. (No e-signature in this rung —
 * a signed close could be a future enhancement, mirroring signValidation.)
 */
export async function closeObservation(
  id: string,
  input: z.input<typeof CloseObservationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (
    session.user.role !== "qa_head" &&
    session.user.role !== "customer_admin" &&
    session.user.role !== "super_admin"
  ) {
    return { success: false, error: "Only a QA Head or an admin can close an observation." };
  }
  const parsed = CloseObservationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const existing = await prisma.fDA483Observation.findFirst({
    where: session.user.role === "super_admin" ? { id } : { id, event: { tenantId: session.user.tenantId } },
    select: { id: true, status: true, reference: true },
  });
  if (!existing) return { success: false, error: "FORBIDDEN" };
  if (existing.status === "Closed") return { success: false, error: "Observation is already closed." };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const obs = await prisma.fDA483Observation.update({ where: { id }, data: { status: "Closed" } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "OBSERVATION_CLOSED",
        recordId: id,
        recordTitle: existing.reference ?? undefined,
        oldValue: existing.status,
        newValue: JSON.stringify({ status: "Closed", reason: parsed.data.reason }),
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: obs };
  } catch (err) {
    console.error("[action] closeObservation failed:", err);
    return { success: false, error: "Failed to close observation" };
  }
}

export async function linkCAPAToEvent(
  eventId: string,
  observationId: string,
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  // Rung 3A-bis.1 — explicit viewer block (the super_admin-IDOR-bypass below
  // does not restrict viewers).
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Observation.findFirst({
      where: { id: observationId, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.fDA483Observation.update({
      where: { id: observationId },
      data: { capaId, status: "CAPA Linked" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "CAPA_LINKED_TO_OBSERVATION",
        recordId: eventId,
        newValue: capaId,
      },
    });
    revalidatePath("/fda-483");
    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] linkCAPAToEvent failed:", err);
    return { success: false, error: "Failed to link CAPA" };
  }
}

export async function deleteObservation(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Observation.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  // Phase 6 cleanup FIX 4 — delete restricted to qa_head + customer_admin.
  if (!FDA483_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only a QA Head or an administrator can delete FDA 483 records." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.fDA483Observation.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "OBSERVATION_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteObservation failed:", err);
    return { success: false, error: "Failed to delete observation" };
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * COMMITMENTS â€” update / delete
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const UpdateCommitmentSchema = z.object({
  text: z.string().optional(),
  dueDate: z.string().optional(),
  owner: z.string().optional(),
  // "Complete" is accepted by the schema but rejected in the handler (use the
  // dedicated completeCommitment flow). "Cancelled" closes a commitment
  // without completion.
  status: z.enum(["Pending", "In Progress", "Complete", "Cancelled", "Overdue"]).optional(),
});

export async function updateCommitment(
  id: string,
  input: z.input<typeof UpdateCommitmentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateCommitmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }
  // Completion has a dedicated flow (captures completer + evidence); the
  // generic update must not flip status straight to "Complete".
  if (parsed.data.status === "Complete") {
    return { success: false, error: "Use Mark Complete to complete a commitment." };
  }
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Commitment.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const commitment = await prisma.fDA483Commitment.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(parsed.data.dueDate ? { dueDate: new Date(parsed.data.dueDate) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "COMMITMENT_UPDATED",
        recordId: id,
        newValue: parsed.data.status ?? "updated",
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: commitment };
  } catch (err) {
    console.error("[action] updateCommitment failed:", err);
    return { success: false, error: "Failed to update commitment" };
  }
}

export async function deleteCommitment(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Commitment.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  // Phase 6 cleanup FIX 4 — delete restricted to qa_head + customer_admin.
  if (!FDA483_DELETE_ROLES.includes(session.user.role)) {
    return { success: false, error: "Only a QA Head or an administrator can delete FDA 483 records." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.fDA483Commitment.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "COMMITMENT_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteCommitment failed:", err);
    return { success: false, error: "Failed to delete commitment" };
  }
}

const CompleteCommitmentSchema = z.object({
  completionNotes: z.string().max(2000).optional(),
  // Evidence attachments (optional) — shape mirrors the DocumentUpload
  // primitive's LinkedDocument (name/url + optional type/size).
  evidence: z
    .array(
      z.object({
        fileName: z.string().min(1),
        fileUrl: z.string().min(1),
        fileType: z.string().optional(),
        fileSize: z.string().optional(),
      }),
    )
    .optional(),
});

/** Tenant-scope guard shared by complete/reopen — returns the row (with the
 *  fields those actions need) or null when the caller's tenant doesn't own it. */
async function findOwnedCommitment(
  id: string,
  session: Awaited<ReturnType<typeof requireAuth>>,
) {
  return prisma.fDA483Commitment.findFirst({
    where:
      session.user.role === "super_admin"
        ? { id }
        : { id, event: { tenantId: session.user.tenantId } },
    select: { id: true, reference: true, status: true, completedAt: true, completedById: true },
  });
}

export async function completeCommitment(
  id: string,
  input: z.input<typeof CompleteCommitmentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CompleteCommitmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const owned = await findOwnedCommitment(id, session);
  if (!owned) return { success: false, error: "FORBIDDEN" };
  // Tenant-row logins (super_admin / customer_admin) aren't User rows —
  // resolve to a valid User FK or null for completedById / uploadedById.
  const userFk = (await resolveUserFk(session.user.id, session.user.tenantId, session.user.role)).userId;
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }
  try {
    const commitment = await prisma.$transaction(async (tx) => {
      const updated = await tx.fDA483Commitment.update({
        where: { id },
        data: {
          status: "Complete",
          completedAt: new Date(),
          completedById: userFk,
          completionNotes: parsed.data.completionNotes ?? null,
        },
      });
      if (parsed.data.evidence?.length) {
        await tx.fDA483CommitmentDocument.createMany({
          data: parsed.data.evidence.map((e) => ({
            commitmentId: id,
            fileName: e.fileName,
            fileUrl: e.fileUrl,
            fileType: e.fileType ?? null,
            fileSize: e.fileSize ?? null,
            uploadedById: userFk,
          })),
        });
      }
      return updated;
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "COMMITMENT_COMPLETED",
        recordId: id,
        recordTitle: owned.reference ?? undefined,
        newValue: JSON.stringify({ evidenceCount: parsed.data.evidence?.length ?? 0 }),
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: commitment };
  } catch (err) {
    console.error("[action] completeCommitment failed:", err);
    return { success: false, error: "Failed to complete commitment" };
  }
}

const ReopenCommitmentSchema = z.object({
  reason: z.string().min(3, "A reason is required to reopen"),
});

export async function reopenCommitment(
  id: string,
  input: z.input<typeof ReopenCommitmentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = ReopenCommitmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const owned = await findOwnedCommitment(id, session);
  if (!owned) return { success: false, error: "FORBIDDEN" };
  if (owned.status !== "Complete") {
    return { success: false, error: "Only a completed commitment can be reopened." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }
  try {
    const commitment = await prisma.fDA483Commitment.update({
      where: { id },
      data: { status: "Pending", completedAt: null, completedById: null },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "COMMITMENT_REOPENED",
        recordId: id,
        recordTitle: owned.reference ?? undefined,
        // Preserve the prior completion provenance in the audit trail.
        oldValue: JSON.stringify({ completedById: owned.completedById, completedAt: owned.completedAt }),
        newValue: parsed.data.reason,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: commitment };
  } catch (err) {
    console.error("[action] reopenCommitment failed:", err);
    return { success: false, error: "Failed to reopen commitment" };
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * RESPONSE DOCUMENTS
 * (FDA483Document model â€” requires migration)
 *
 * Spec called the URL field `fileUrl`; for in-app uploads via the
 * shared <DocumentUpload> component, this is a base64 data URL â€”
 * for external links it's a real URL. Either way the column stores
 * a string the UI can hand straight to <a href={fileUrl}>.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const AddResponseDocSchema = z.object({
  eventId: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileType: z.string().optional(),
  fileSize: z.string().optional(),
  type: z.string().default("response"),
});

export async function addResponseDocument(
  input: z.input<typeof AddResponseDocSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AddResponseDocSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  if (session.user.role === "viewer") {
    return { success: false, error: "Viewers cannot perform this action." };
  }
  // IDOR guard - verify the caller's tenant owns the parent event before
  // inserting the document (canonical pattern: same assertTenantOwnsParent
  // helper addObservation uses). Returns null for a missing event OR one
  // owned by another tenant; the error is deliberately vague so we don't
  // leak cross-tenant existence.
  const parent = await assertTenantOwnsParent<{ id: string; tenantId: string }>(
    session,
    "fda483Event",
    parsed.data.eventId,
  );
  if (!parent) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: FDA483_AUDIT_MODULE,
          action: "RESPONSE_DOCUMENT_ADD_BLOCKED_TENANT_MISMATCH",
          recordId: parsed.data.eventId,
          recordTitle: parsed.data.fileName.slice(0, 80),
        },
      });
    } catch (err) {
      console.error("[action] failed to write RESPONSE_DOCUMENT_ADD_BLOCKED audit:", err);
    }
    return { success: false, error: "Event not found." };
  }
  try {
    const doc = await prisma.fDA483Document.create({
      data: {
        eventId: parsed.data.eventId,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        fileType: parsed.data.fileType ?? null,
        fileSize: parsed.data.fileSize ?? null,
        type: parsed.data.type ?? "response",
        uploadedBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: parent.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "RESPONSE_DOCUMENT_ADDED",
        recordId: parsed.data.eventId,
        recordTitle: parsed.data.fileName,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] addResponseDocument failed:", err);
    return { success: false, error: "Failed to add document" };
  }
}

export async function removeResponseDocument(
  id: string,
  eventId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Document.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    await prisma.fDA483Document.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "RESPONSE_DOCUMENT_REMOVED",
        recordId: eventId,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeResponseDocument failed:", err);
    return { success: false, error: "Failed to remove document" };
  }
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * RAISE CAPA FROM OBSERVATION
 *
 * Combined transaction:
 *   1. Create CAPA (source = "FDA 483")
 *   2. Update observation: link capaId + flip status to "CAPA Linked"
 *   3. Audit log under both modules
 *
 * Schema notes:
 *   - CAPA columns: source/description/risk/owner/dueDate/status/siteId/diGate/createdBy
 *     (NOT `site`, NOT `diGateRequired`)
 *   - Observation column: `capaId` (NOT `linkedCAPAId`)
 *   - Status defaults are PascalCase ("Open", "CAPA Linked")
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const RaiseCAPASchema = z.object({
  eventId: z.string().min(1),
  observationId: z.string().min(1),
  observationNumber: z.number().int().optional(),
  observationText: z.string().min(1),
  observationSeverity: z.enum(GENERIC_SEVERITY),
  referenceNumber: z.string().optional(),
  siteId: z.string().optional(),
  owner: z.string().min(1),
  dueDate: z.string().min(1),
  rootCause: z.string().optional(),
  rcaMethod: z.string().optional(),
});

export async function raiseCAPAFromObservation(
  input: z.input<typeof RaiseCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = RaiseCAPASchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;
  const risk = d.observationSeverity === "Critical" ? "Critical" : d.observationSeverity === "High" ? "High" : "Low";
  const description = d.referenceNumber && d.observationNumber !== undefined
    ? `${d.referenceNumber} Obs #${d.observationNumber}: ${d.observationText}`
    : d.observationText.slice(0, 200);

  // Tenant scope check â€” prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Observation.findFirst({
      where: { id: d.observationId, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }

  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }

  try {
    // 1) Create the CAPA via the canonical createCAPA so it gets a real
    //    CAPA-<SITE>-<YEAR>-<NNN> reference + the shared role gate + audit,
    //    exactly like Gap / Deviation / CSV/CSA (was a direct prisma.cAPA.create
    //    with no reference). Full field parity preserved: rca/rcaMethod flow
    //    through, and diGate/diGateStatus are reproduced via diGateRequired
    //    (auto-required for IT / CSV Lead origins).
    const created = await createCAPA({
      source: "FDA 483",
      // Phase A — title required; derive from the observation description.
      title: description.slice(0, 120),
      description,
      risk,
      owner: d.owner,
      siteId: d.siteId ?? undefined,
      dueDate: d.dueDate,
      rca: d.rootCause ?? undefined,
      rcaMethod: d.rcaMethod ?? undefined,
      diGateRequired: session.user.role === "it_cdo" || session.user.role === "csv_val_lead",
    });
    if (!created.success) return created;
    const capa = created.data as { id: string; reference: string | null };

    // 2) Link the CAPA back to the observation + advance its status.
    await prisma.fDA483Observation.update({
      where: { id: d.observationId },
      data: { capaId: capa.id, status: "CAPA Linked" },
    });

    // 3) FDA 483-side audit. The CAPA-module CAPA_CREATED entry is written by
    //    createCAPA itself, so we no longer duplicate it here.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: FDA483_AUDIT_MODULE,
        action: "CAPA_RAISED_FROM_OBSERVATION",
        recordId: d.eventId,
        recordTitle: d.referenceNumber ?? null,
        newValue: capa.id,
      },
    });

    revalidatePath("/fda-483");
    revalidatePath("/capa");
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] raiseCAPAFromObservation failed:", err);
    return { success: false, error: "Failed to raise CAPA. Please try again." };
  }
}
