"use server";

/**
 * Risk CONVERSION (Governance Phase 2) — Risk → Gap Assessment / Deviation / CAPA.
 *
 * ── THE CORE PROPERTY: THESE ARE WRAPPERS, NOT CREATORS ────────────────────
 * Each convert action pre-fills the target module's own input and then calls
 * that module's REAL create action — `createFinding`, `createDeviation`,
 * `createCAPA`. Not a copy of them, not a "risk-record" variant: the same
 * function the Gap/Deviation/CAPA UI calls. The created record therefore gets
 * its normal reference, owner resolution, status, workflow, and audit entry, and
 * ALSO passes that module's OWN role gate. The risk merely seeds initial values.
 *
 * ── PERMISSIONS: BOTH GATES, ALWAYS ────────────────────────────────────────
 * A conversion must satisfy:
 *   1. `canManageGovernance(role)`  — GOVERNANCE_MANAGE_ROLES (customer_admin,
 *      super_admin, qa_head). Checked here.
 *   2. The TARGET's own create gate — GAP_CREATE_ROLES / DEVIATION_CREATE_ROLES /
 *      CAPA_CREATE_ROLES, each combined with `requireGxPAuthor`. Enforced inside
 *      the create action itself; ALSO pre-checked here so we never claim a risk
 *      for a caller who is about to be rejected downstream.
 *
 * The intersection is what actually matters, and today it is **qa_head alone**:
 * `customer_admin` is excluded from every create set ("admin ≠ doer") and
 * `super_admin` is walled from authoring GxP records by `requireGxPAuthor`. That
 * is deliberate. Conversion mints a real GxP record, so it demands a real
 * quality authority — we narrow the governance set, we never widen the GxP one.
 *
 * ── ATOMICITY: CLAIM → CREATE → LINK, WITH COMPENSATION ────────────────────
 * None of the three create actions accepts an external transaction client (each
 * opens its own, and `createCAPA` additionally does post-commit carryover work),
 * so a single enclosing transaction is impossible without duplicating them —
 * which the reuse rule forbids. Instead:
 *
 *   1. CLAIM   — compare-and-set the risk's status from its exact prior value to
 *                "Converted", in one `updateMany`. Exactly one concurrent caller
 *                can win; the loser sees `count === 0` and is told the risk is
 *                already converted. This is also the no-double-convert guard.
 *   2. CREATE  — call the real create action (its own transaction + audit).
 *                On failure → COMPENSATE: restore the risk's prior status. The
 *                common failure path therefore touches only the non-GxP risk row
 *                and never leaves an orphaned GxP record behind.
 *   3. LINK    — one transaction: stamp `risk.convertedToType/convertedToId`,
 *                stamp `target.raisedFromRiskId`, write BOTH audit entries, and
 *                copy documents if requested. On failure → COMPENSATE: restore
 *                the risk AND soft-delete the just-created record, then audit the
 *                rollback.
 *
 * No observable partial state survives any single failure: either the risk is
 * Converted and bidirectionally linked to a live record, or it is back in its
 * prior status with no linked record.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { canManageGovernance, canConvertRiskTo } from "@/lib/permissions/roleSets";
import { riskVisibilityWhere } from "@/lib/queries/risks";
import { createFinding } from "@/actions/findings";
import { createDeviation } from "@/actions/deviations";
import { createCAPA } from "@/actions/capas";
import { RISK_SEVERITIES, RISK_SOURCE_MODULE } from "@/constants/risk";
import {
  DEVIATION_CATEGORIES,
  DEVIATION_IMPACTS,
  DEVIATION_TYPES,
  RISK_CONVERT_TARGET_LABEL,
  RISK_TO_CAPA_SOURCE,
  TARGET_DOC_POINTERS,
  TARGET_SUPPORTS_DOC_CARRYOVER,
  type RiskConvertTarget,
} from "@/constants/riskConversion";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/** Generic denial — never reveals whether the id exists. Matches Phase 1. */
const NOT_FOUND = "Risk not found." as const;
/** The no-double-convert message, shared by the CAS loser and the pre-check. */
const ALREADY_CONVERTED = "This risk has already been converted." as const;

export interface ConversionResult {
  target: RiskConvertTarget;
  recordId: string;
  recordReference: string | null;
  documentsCopied: number;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Gate
 * ══════════════════════════════════════════════════════════════════════════ */

/** The rejection message when the governance gate passes but the create gate doesn't. */
function createGateMessage(target: RiskConvertTarget): string {
  return `Your role cannot raise a ${RISK_CONVERT_TARGET_LABEL[target]}, so it cannot convert a risk into one. Conversion requires a quality authority (QA Head).`;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Shared plumbing
 * ══════════════════════════════════════════════════════════════════════════ */

/** The risk fields a conversion reads. */
const RISK_FOR_CONVERT = {
  id: true, reference: true, title: true, description: true,
  category: true, severity: true, likelihood: true, status: true,
  ownerId: true, createdById: true, siteId: true,
  targetDate: true, mitigationPlan: true,
  convertedToType: true, convertedToId: true,
} satisfies Prisma.RiskSelect;

type RiskForConvert = Prisma.RiskGetPayload<{ select: typeof RISK_FOR_CONVERT }>;

/**
 * Load the risk, visibility-scoped, and reject anything not convertible.
 * A risk is convertible iff it is live (not archived) and its status is Open or
 * Mitigating. "Converted" is TERMINAL — this is the no-double-convert guard's
 * first line (the CAS claim below is the race-proof second line).
 */
async function loadConvertibleRisk(
  riskId: string,
  session: Awaited<ReturnType<typeof requireAuth>>,
): Promise<{ ok: true; risk: RiskForConvert } | { ok: false; error: string }> {
  const risk = await prisma.risk.findFirst({
    where: {
      id: riskId,
      tenantId: session.user.tenantId,
      deletedAt: null,
      ...riskVisibilityWhere(session),
    },
    select: RISK_FOR_CONVERT,
  });
  if (!risk) return { ok: false, error: NOT_FOUND };
  if (risk.status === "Converted") return { ok: false, error: ALREADY_CONVERTED };
  if (risk.status !== "Open" && risk.status !== "Mitigating") {
    return { ok: false, error: `A ${risk.status.toLowerCase()} risk cannot be converted. Reopen it first.` };
  }
  return { ok: true, risk };
}

/**
 * CLAIM the risk: compare-and-set status `prior → "Converted"`.
 * Returns true iff THIS caller won. Two concurrent converts → exactly one wins;
 * the loser never calls a create action, so no duplicate record is ever minted.
 */
async function claimRisk(riskId: string, tenantId: string, prior: string): Promise<boolean> {
  const res = await prisma.risk.updateMany({
    where: { id: riskId, tenantId, deletedAt: null, status: prior, convertedToId: null },
    data: { status: "Converted" },
  });
  return res.count === 1;
}

/** COMPENSATION — put the risk back exactly as it was. */
async function releaseRisk(riskId: string, tenantId: string, prior: string): Promise<void> {
  try {
    await prisma.risk.updateMany({
      where: { id: riskId, tenantId, status: "Converted", convertedToId: null },
      data: { status: prior },
    });
  } catch (err) {
    // Nothing else we can do; log loudly. The risk is stuck Converted with a null
    // convertedToId, which the UI renders as "conversion incomplete" rather than
    // as a completed conversion (convertedToId is what gates the history line).
    console.error("[risk-conversion] COMPENSATION FAILED — could not release risk", riskId, err);
  }
}

/**
 * Copy the risk's supporting documents onto the created record.
 *
 * COPY, not reference: a NEW `Document` row is inserted per source doc, pointed
 * at the target via that module's own `linkedModule`/`linkedRecordId` (and the
 * newer `sourceModule`/`sourceId`) pointers, so the target's existing document
 * panel picks them up with zero UI changes.
 *
 * The BYTES are not duplicated — `storageKey` is content-addressed
 * (`<sha256>-<name>`), so the copy reuses the same key and the same `sha256`.
 * Two Document rows referencing one blob is safe because documents are only ever
 * SOFT-deleted (`deletedAt`); nothing in the app unlinks stored bytes.
 *
 * Runs inside the caller's link transaction: pure DB writes, no file IO.
 */
async function copyRiskDocuments(
  tx: Prisma.TransactionClient,
  target: RiskConvertTarget,
  riskId: string,
  recordId: string,
  tenantId: string,
): Promise<number> {
  const pointers = TARGET_DOC_POINTERS[target];
  if (!pointers) return 0; // CAPA — see CAPA_DOC_CARRYOVER_REASON.

  const docs = await tx.document.findMany({
    where: { tenantId, sourceModule: RISK_SOURCE_MODULE, sourceId: riskId, deletedAt: null },
    select: {
      fileName: true, fileType: true, fileSize: true, description: true,
      uploadedBy: true, uploadedById: true, uploadedAt: true, category: true,
      storageKey: true, sha256: true, originalFileName: true, fileExtension: true,
      linkUrl: true, siteId: true,
    },
  });
  if (docs.length === 0) return 0;

  await tx.document.createMany({
    data: docs.map((d) => ({
      tenantId,
      fileName: d.fileName,
      fileType: d.fileType,
      fileSize: d.fileSize,
      version: "v1.0",
      status: "draft",
      description: d.description,
      uploadedBy: d.uploadedBy,
      uploadedById: d.uploadedById,
      uploadedAt: d.uploadedAt ?? new Date(),
      linkedModule: pointers.linkedModule,
      linkedRecordId: recordId,
      sourceModule: pointers.sourceModule,
      sourceId: recordId,
      category: d.category,
      storageKey: d.storageKey, // same content-addressed blob; bytes not re-copied
      sha256: d.sha256,
      originalFileName: d.originalFileName,
      fileExtension: d.fileExtension,
      linkUrl: d.linkUrl,
      siteId: d.siteId,
    })),
  });
  return docs.length;
}

/** The Prisma delegate for each target, for the link + compensation writes. */
async function stampBackLink(
  tx: Prisma.TransactionClient,
  target: RiskConvertTarget,
  recordId: string,
  riskId: string,
): Promise<void> {
  if (target === "Gap") await tx.finding.update({ where: { id: recordId }, data: { raisedFromRiskId: riskId } });
  else if (target === "Deviation") await tx.deviation.update({ where: { id: recordId }, data: { raisedFromRiskId: riskId } });
  else await tx.cAPA.update({ where: { id: recordId }, data: { raisedFromRiskId: riskId } });
}

/** COMPENSATION — soft-delete a record created moments ago that we failed to link. */
async function softDeleteOrphan(
  target: RiskConvertTarget,
  recordId: string,
  by: { userId: string | null; name: string },
): Promise<void> {
  try {
    const data = { deletedAt: new Date(), deletedById: by.userId, deletedByName: by.name };
    if (target === "Gap") await prisma.finding.update({ where: { id: recordId }, data });
    else if (target === "Deviation") await prisma.deviation.update({ where: { id: recordId }, data });
    else await prisma.cAPA.update({ where: { id: recordId }, data });
  } catch (err) {
    console.error("[risk-conversion] COMPENSATION FAILED — orphaned record", target, recordId, err);
  }
}

const AUDIT_MODULE: Record<RiskConvertTarget, string> = {
  Gap: "Gap Assessment",
  Deviation: "Deviation Management",
  CAPA: "CAPA",
};

/**
 * Steps 3 (LINK) + its compensation. Given an already-created record, stamp both
 * sides of the link, write BOTH audit entries, optionally copy documents, and
 * return the conversion result. On any failure, undo everything.
 */
async function linkAndAudit(
  target: RiskConvertTarget,
  risk: RiskForConvert,
  record: { id: string; reference: string | null },
  copyDocuments: boolean,
  session: Awaited<ReturnType<typeof requireAuth>>,
  actor: Awaited<ReturnType<typeof resolveUserFk>>,
): Promise<ActionResult<ConversionResult>> {
  const tenantId = session.user.tenantId;
  const riskRef = risk.reference ?? risk.id;
  const recordRef = record.reference ?? record.id;

  try {
    const documentsCopied = await prisma.$transaction(async (tx) => {
      // FORWARD half of the link. The CAS already set status = "Converted";
      // this fills in what it points at.
      await tx.risk.update({
        where: { id: risk.id },
        data: { convertedToType: target, convertedToId: record.id },
      });

      // REVERSE half of the link.
      await stampBackLink(tx, target, record.id, risk.id);

      // Audit BOTH sides, in the same transaction as the link they describe.
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: "Governance",
          action: "RISK_CONVERTED",
          recordId: risk.id,
          recordTitle: `${riskRef} — ${risk.title}`,
          oldValue: risk.status,
          newValue: `Converted to ${RISK_CONVERT_TARGET_LABEL[target]} ${recordRef}`,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.userId,
          userName: actor.displayName,
          userRole: actor.role,
          module: AUDIT_MODULE[target],
          action: "RECORD_RAISED_FROM_RISK",
          recordId: record.id,
          recordTitle: recordRef,
          newValue: `Raised from risk ${riskRef}`,
        },
      });

      const copied = copyDocuments && TARGET_SUPPORTS_DOC_CARRYOVER[target]
        ? await copyRiskDocuments(tx, target, risk.id, record.id, tenantId)
        : 0;

      if (copied > 0) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actor.userId,
            userName: actor.displayName,
            userRole: actor.role,
            module: AUDIT_MODULE[target],
            action: "RISK_DOCUMENTS_CARRIED_OVER",
            recordId: record.id,
            recordTitle: recordRef,
            newValue: `${copied} document${copied === 1 ? "" : "s"} copied from ${riskRef}`,
          },
        });
      }
      return copied;
    });

    revalidatePath("/governance");
    revalidatePath(`/governance/risks/${risk.id}`);
    revalidatePath(target === "CAPA" ? "/capa" : target === "Gap" ? "/gap-assessment" : "/deviation");

    return { success: true, data: { target, recordId: record.id, recordReference: record.reference, documentsCopied } };
  } catch (err) {
    console.error("[risk-conversion] link failed; compensating:", err);
    // Undo BOTH sides: the record we just made, and the claim on the risk.
    await softDeleteOrphan(target, record.id, { userId: actor.userId, name: actor.displayName });
    await releaseRisk(risk.id, tenantId, risk.status);
    try {
      await prisma.auditLog.create({
        data: {
          tenantId, userId: actor.userId, userName: actor.displayName, userRole: actor.role,
          module: "Governance", action: "RISK_CONVERSION_ROLLED_BACK",
          recordId: risk.id, recordTitle: riskRef,
          newValue: `Rolled back a failed conversion to ${RISK_CONVERT_TARGET_LABEL[target]} ${recordRef}`,
        },
      });
    } catch { /* best effort */ }
    return { success: false, error: "Conversion failed and was rolled back. The risk is unchanged." };
  }
}

/**
 * The shared skeleton: gate → load → CLAIM → create (caller-supplied) → LINK.
 * `runCreate` receives nothing but returns the real create action's result; it is
 * only ever invoked once the claim has been won.
 */
async function convert(
  target: RiskConvertTarget,
  riskId: string,
  copyDocuments: boolean,
  runCreate: (risk: RiskForConvert) => Promise<ActionResult>,
): Promise<ActionResult<ConversionResult>> {
  const session = await requireAuth();
  const role = session.user.role;
  const tenantId = session.user.tenantId;

  // GATE 1 — governance.
  if (!canManageGovernance(role)) {
    return { success: false, error: "You do not have permission to convert risks." };
  }
  // GATE 2 (pre-check) — the target's own create eligibility. The authoritative
  // check still runs inside the create action; this only avoids claiming a risk
  // for a caller who is certain to be rejected a moment later.
  if (!canConvertRiskTo(target, role)) {
    return { success: false, error: createGateMessage(target) };
  }

  const loaded = await loadConvertibleRisk(riskId, session);
  if (!loaded.ok) return { success: false, error: loaded.error };
  const risk = loaded.risk;

  const actor = await resolveUserFk(session.user.id, tenantId, role);

  // STEP 1 — CLAIM (compare-and-set). Race-proof no-double-convert.
  if (!(await claimRisk(risk.id, tenantId, risk.status))) {
    return { success: false, error: ALREADY_CONVERTED };
  }

  // STEP 2 — CREATE via the module's REAL create action (its own gate + tx + audit).
  let created: ActionResult;
  try {
    created = await runCreate(risk);
  } catch (err) {
    console.error("[risk-conversion] create threw; compensating:", err);
    await releaseRisk(risk.id, tenantId, risk.status);
    return { success: false, error: "Conversion failed. The risk is unchanged." };
  }
  if (!created.success) {
    await releaseRisk(risk.id, tenantId, risk.status); // COMPENSATE
    return { success: false, error: created.error, fieldErrors: created.fieldErrors };
  }

  const record = created.data as { id: string; reference: string | null };
  if (!record?.id) {
    await releaseRisk(risk.id, tenantId, risk.status);
    return { success: false, error: "Conversion failed. The risk is unchanged." };
  }

  // STEP 3 — LINK + dual audit (+ optional doc copy), compensating on failure.
  return linkAndAudit(target, risk, record, copyDocuments, session, actor);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Risk → Gap Assessment (Finding)
 *
 * FIELD MAPPING
 *   requirement  ← form.requirement   (seeded from risk.title; Gap needs ≥10 chars)
 *   purpose      ← form.purpose       (seeded from risk.description)
 *   area         ← form.area          (REQUIRED; no Risk analogue — user picks)
 *   severity     ← risk.severity      (identity; both use Critical/High/Medium/Low)
 *   targetDate   ← form.targetDate    (risk.targetDate if future, else today+30)
 *   siteId       ← risk.siteId        (carried through; drives FND-<SITE>-… ref)
 *   owner        ← STAMPED by createFinding as the CONVERTING user, not the risk's
 *                  owner — createFinding ignores any `owner` input by design.
 * ══════════════════════════════════════════════════════════════════════════ */

const ConvertToGapSchema = z.object({
  requirement: z.string().trim().min(10, "Requirement must be at least 10 characters"),
  purpose: z.string().optional(),
  area: z.string().min(1, "Area is required"),
  severity: z.enum(RISK_SEVERITIES),
  targetDate: z.string().min(1, "Target date is required"),
  copyDocuments: z.boolean().optional(),
});

export async function convertRiskToGap(
  riskId: string,
  input: z.input<typeof ConvertToGapSchema>,
): Promise<ActionResult<ConversionResult>> {
  const parsed = ConvertToGapSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  return convert("Gap", riskId, d.copyDocuments === true, (risk) =>
    createFinding({
      requirement: d.requirement,
      purpose: d.purpose || undefined,
      area: d.area,
      severity: d.severity,
      targetDate: d.targetDate,
      siteId: risk.siteId ?? undefined,
    }),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Risk → Deviation
 *
 * FIELD MAPPING
 *   title                ← form.title            (seeded from risk.title; ≥5)
 *   description          ← form.description      (seeded from risk.description; ≥10)
 *   type                 ← form.type             (seeded "unplanned" — a materialized
 *                                                 risk is never a planned departure)
 *   category             ← form.category         (seeded via RISK_CATEGORY_TO_DEVIATION_CATEGORY)
 *   severity             ← form.severity         (GENERIC→FDA via RISK_SEVERITY_TO_FDA,
 *                                                 rounding UP: Medium→Major)
 *   area                 ← form.area             (REQUIRED; no Risk analogue)
 *   immediateAction      ← form.immediateAction  (seeded from risk.mitigationPlan; ≥5)
 *   patient/product/reg  ← form.*Impact          (REQUIRED; no Risk analogue — explicit)
 *   dueDate              ← form.dueDate          (risk.targetDate if future, else today+30)
 *   siteId               ← risk.siteId
 *   owner                ← STAMPED by createDeviation as the converting user.
 * ══════════════════════════════════════════════════════════════════════════ */

const ConvertToDeviationSchema = z.object({
  title: z.string().trim().min(5, "Title must be at least 5 characters"),
  description: z.string().trim().min(10, "Description must be at least 10 characters"),
  type: z.enum(DEVIATION_TYPES),
  category: z.enum(DEVIATION_CATEGORIES),
  severity: z.enum(["Critical", "Major", "Minor"]),
  area: z.string().min(1, "Area is required"),
  immediateAction: z.string().trim().min(5, "Immediate action must be at least 5 characters"),
  patientSafetyImpact: z.enum(DEVIATION_IMPACTS),
  productQualityImpact: z.enum(DEVIATION_IMPACTS),
  regulatoryImpact: z.enum(DEVIATION_IMPACTS),
  dueDate: z.string().min(1, "Due date is required"),
  copyDocuments: z.boolean().optional(),
});

export async function convertRiskToDeviation(
  riskId: string,
  input: z.input<typeof ConvertToDeviationSchema>,
): Promise<ActionResult<ConversionResult>> {
  const parsed = ConvertToDeviationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  return convert("Deviation", riskId, d.copyDocuments === true, (risk) =>
    createDeviation({
      title: d.title,
      description: d.description,
      type: d.type,
      category: d.category,
      severity: d.severity,
      area: d.area,
      immediateAction: d.immediateAction,
      patientSafetyImpact: d.patientSafetyImpact,
      productQualityImpact: d.productQualityImpact,
      regulatoryImpact: d.regulatoryImpact,
      dueDate: d.dueDate,
      siteId: risk.siteId ?? undefined,
    }),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Risk → CAPA
 *
 * FIELD MAPPING
 *   title        ← form.title        (seeded from risk.title; ≤120)
 *   description  ← form.description  (seeded from risk.description; ≥10)
 *   risk         ← form.risk         (identity from risk.severity — CAPA.risk uses
 *                                     the same Critical/High/Medium/Low taxonomy)
 *   source       ← "Other"           (CreateCAPASchema has no "Risk Register" member;
 *                                     provenance lives in CAPA.raisedFromRiskId)
 *   dueDate      ← form.dueDate      (risk.targetDate if future, else today+30)
 *   siteId       ← risk.siteId
 *   owner        ← RESOLVED by createCAPA (falls back to the raising QA).
 *
 * Documents do NOT carry over — see CAPA_DOC_CARRYOVER_REASON.
 * ══════════════════════════════════════════════════════════════════════════ */

const ConvertToCapaSchema = z.object({
  title: z.string().trim().min(1).max(120, "Title must be 120 characters or fewer"),
  description: z.string().trim().min(10, "Description must be at least 10 characters"),
  risk: z.enum(RISK_SEVERITIES),
  dueDate: z.string().min(1, "Due date is required"),
});

export async function convertRiskToCapa(
  riskId: string,
  input: z.input<typeof ConvertToCapaSchema>,
): Promise<ActionResult<ConversionResult>> {
  const parsed = ConvertToCapaSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  // copyDocuments is not offered for CAPA (TARGET_SUPPORTS_DOC_CARRYOVER.CAPA=false);
  // pass false so a crafted payload can never smuggle it in.
  return convert("CAPA", riskId, false, (risk) =>
    createCAPA({
      title: d.title,
      description: d.description,
      source: RISK_TO_CAPA_SOURCE,
      risk: d.risk,
      dueDate: d.dueDate,
      siteId: risk.siteId ?? undefined,
    }),
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * Back-link lookup — "⚑ Raised from RISK-…" on the created record's detail.
 * ══════════════════════════════════════════════════════════════════════════ */

export interface SourceRisk {
  id: string;
  reference: string | null;
  title: string;
  severity: string;
  href: string;
}

/**
 * Given a created record, return the risk it was raised from — or null.
 * Tenant-scoped. Deliberately does NOT apply risk record-visibility: if you can
 * already see the Gap/Deviation/CAPA, you may see WHICH risk produced it (its
 * reference + title, nothing more). Withholding that would leave an unexplained
 * provenance banner on a record the user is entitled to read in full.
 */
export async function loadSourceRisk(
  target: RiskConvertTarget,
  recordId: string,
): Promise<SourceRisk | null> {
  const session = await requireAuth();
  const tenantId = session.user.tenantId;

  const where = { id: recordId, tenantId };
  const select = { raisedFromRiskId: true };
  const rec =
    target === "Gap" ? await prisma.finding.findFirst({ where, select })
    : target === "Deviation" ? await prisma.deviation.findFirst({ where, select })
    : await prisma.cAPA.findFirst({ where, select });

  if (!rec?.raisedFromRiskId) return null;

  const risk = await prisma.risk.findFirst({
    where: { id: rec.raisedFromRiskId, tenantId },
    select: { id: true, reference: true, title: true, severity: true },
  });
  if (!risk) return null;

  return { ...risk, href: `/governance/risks/${risk.id}` };
}
