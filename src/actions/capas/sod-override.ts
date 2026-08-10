import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeSeverityForDisplay } from "@/lib/severity";

/**
 * CAPA Single-QA SoD override (Phase 1) — shared block→justified-proceed transform,
 * applied IDENTICALLY at every waivable gate. VERIFICATION is excluded (retired, Q7).
 *
 * A gate calls `evaluateSodOverride` ONLY when its SoD self-check has already fired
 * (actor == the disallowed person). The decision is:
 *   - Critical CAPA  → BLOCK (hard floor; checked BEFORE the flag — never waivable).
 *   - flag OFF       → BLOCK with the gate's ORIGINAL message (byte-for-byte today).
 *   - missing/invalid reason code or short justification → BLOCK.
 *   - otherwise      → PROCEED; the gate then writes the override record + audit
 *                      IN THE SAME TRANSACTION as its mutation (see writeSodOverride).
 * accepter≠owner (action-items.ts) is deliberately NOT wired here — it stays an
 * unconditional hard block.
 */

export const SOD_REASON_CODES = ["SOLE_QA_ON_SITE", "SECOND_QA_UNAVAILABLE", "OTHER"] as const;
export type SodReasonCode = (typeof SOD_REASON_CODES)[number];

export type SodControl =
  | "RCA_APPROVAL"
  | "RCA_EDITOR_APPROVER"
  | "RCA_REJECTION_OVERRIDE"
  | "ALIGNMENT_OVERRIDE"
  | "CLOSE_CREATOR"
  | "CLOSE_RCA_AUTHOR"
  | "EFFECTIVENESS";

/** The identity rule each control waives — recorded in the audit for inspectors. */
export const SOD_WAIVED_RULE: Record<SodControl, string> = {
  RCA_APPROVAL: "creator!=reviewer",
  RCA_EDITOR_APPROVER: "editor!=approver",
  RCA_REJECTION_OVERRIDE: "rejecter!=overrider",
  ALIGNMENT_OVERRIDE: "flagger!=overrider",
  CLOSE_CREATOR: "closer!=creator",
  CLOSE_RCA_AUTHOR: "closer!=rcaEditedById",
  EFFECTIVENESS: "reviewer!=workAuthor",
};

export const SOD_OVERRIDE_CRITICAL_BLOCK =
  "Critical CAPAs require independent QA review; the single-QA override does not apply.";

/** Optional override inputs added to each waivable action's schema. */
export interface SodOverrideInput {
  sodOverrideReasonCode?: string;
  sodOverrideJustification?: string;
}

export type SodDecision =
  | { proceed: false; error: string }
  | { proceed: true; reasonCode: string; justification: string };

/** Load the tenant's override posture. Call ONLY inside a fired self-check so the
 *  flag-OFF / non-self paths add no query and stay byte-for-byte identical. */
export async function tenantSodOverrideOn(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { sodSingleQAOverride: true },
  });
  return t?.sodSingleQAOverride === true;
}

/** Decide block vs justified-proceed. `existingBlockError` is the gate's ORIGINAL
 *  hard-block message, returned verbatim when the flag is OFF. */
export function evaluateSodOverride(opts: {
  risk: string | null;
  flagOn: boolean;
  existingBlockError: string;
  input: SodOverrideInput;
}): SodDecision {
  // Flag OFF first — a tenant WITHOUT the override sees only the gate's ORIGINAL
  // block message; it never learns of a feature it doesn't have (even for Critical).
  if (!opts.flagOn) return { proceed: false, error: opts.existingBlockError };
  // Critical hard floor — for tenants that DO have the override, Critical CAPAs are
  // still never waivable; show the ceiling message. Normalized so legacy lowercase
  // ("critical") is caught too (generic taxonomy). Net: Critical self-action stays
  // blocked either way — only the message differs by flag.
  if (normalizeSeverityForDisplay(opts.risk, "generic") === "Critical") {
    return { proceed: false, error: SOD_OVERRIDE_CRITICAL_BLOCK };
  }
  const reasonCode = opts.input.sodOverrideReasonCode;
  const justification = (opts.input.sodOverrideJustification ?? "").trim();
  if (!reasonCode || !(SOD_REASON_CODES as readonly string[]).includes(reasonCode)) {
    return { proceed: false, error: "A reason code is required to proceed under single-QA override." };
  }
  if (justification.length < 20) {
    return { proceed: false, error: "A justification (min 20 chars) is required under single-QA override." };
  }
  return { proceed: true, reasonCode, justification };
}

/** Write the CAPASODOverride record + the CAPA_SOD_OVERRIDE_USED audit inside the
 *  caller's transaction (atomic with the waived action). `signedRecordId` links to
 *  the SignedRecord for signed steps (close); null for unsigned review waivers. */
export async function writeSodOverride(
  tx: Prisma.TransactionClient,
  opts: {
    tenantId: string;
    capaId: string;
    control: SodControl;
    actorUserId: string;
    actorName: string;
    actorRole: string;
    reasonCode: string;
    justification: string;
    recordTitle: string;
    signedRecordId?: string | null;
  },
): Promise<void> {
  await tx.cAPASODOverride.create({
    data: {
      tenantId: opts.tenantId,
      capaId: opts.capaId,
      control: opts.control,
      actorUserId: opts.actorUserId,
      actorName: opts.actorName,
      actorRole: opts.actorRole,
      reasonCode: opts.reasonCode,
      justification: opts.justification,
      signedRecordId: opts.signedRecordId ?? null,
    },
  });
  await tx.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      userName: opts.actorName,
      userRole: opts.actorRole,
      module: "CAPA / SoD Override",
      action: "CAPA_SOD_OVERRIDE_USED",
      recordId: opts.capaId,
      recordTitle: opts.recordTitle.slice(0, 80),
      newValue: JSON.stringify({
        control: opts.control,
        waivedRule: SOD_WAIVED_RULE[opts.control],
        reasonCode: opts.reasonCode,
        justification: opts.justification,
        signedRecordId: opts.signedRecordId ?? null,
      }),
    },
  });
}

/* ── Deviation single-QA SoD override (Phase 1) ──────────────────────────────
 * The DEVIATION analogue of the CAPA transform above — same block→justified-proceed
 * shape, reusing the shared reason codes / input / decision types / tenant read.
 * Three differences: (1) the ceiling is severity ∈ {Critical, Major} on the FDA
 * taxonomy — deviation severity is Critical/Major/Minor, never "High" (Major IS the
 * FDA "High" tier); (2) it writes DeviationSODOverride + DEVIATION_SOD_OVERRIDE_USED;
 * (3) deviation close is ALWAYS signed, so signedRecordId is never null. The
 * e-signature is never waived here — only identity-independence.
 */

export type DeviationSodControl =
  | "DEV_CLOSE_REPORTER"
  | "DEV_CLOSE_INVESTIGATOR"
  | "DEV_CLOSE_ASSIGNEE";

/** The identity rule each deviation-close control waives — recorded for inspectors. */
export const DEVIATION_SOD_WAIVED_RULE: Record<DeviationSodControl, string> = {
  DEV_CLOSE_REPORTER: "reporter!=closer",
  DEV_CLOSE_INVESTIGATOR: "investigator!=closer",
  DEV_CLOSE_ASSIGNEE: "taskAssignee!=closer",
};

export const DEVIATION_SOD_OVERRIDE_CEILING_BLOCK =
  "Critical/Major deviations require independent QA review; the single-QA override does not apply.";

/** Decide block vs justified-proceed at ONE deviation-close identity check. Mirrors
 *  evaluateSodOverride: flag OFF first ⇒ the check's ORIGINAL message (a tenant
 *  without the override never sees override wording, even for Critical/Major);
 *  flag ON + Critical/Major ⇒ ceiling block; otherwise require a reason code +
 *  justification. FDA taxonomy so legacy lowercase severities are caught too. */
export function evaluateDeviationSodOverride(opts: {
  severity: string | null;
  flagOn: boolean;
  existingBlockError: string;
  input: SodOverrideInput;
}): SodDecision {
  if (!opts.flagOn) return { proceed: false, error: opts.existingBlockError };
  const canon = normalizeSeverityForDisplay(opts.severity, "fda");
  if (canon === "Critical" || canon === "Major") {
    return { proceed: false, error: DEVIATION_SOD_OVERRIDE_CEILING_BLOCK };
  }
  const reasonCode = opts.input.sodOverrideReasonCode;
  const justification = (opts.input.sodOverrideJustification ?? "").trim();
  if (!reasonCode || !(SOD_REASON_CODES as readonly string[]).includes(reasonCode)) {
    return { proceed: false, error: "A reason code is required to proceed under single-QA override." };
  }
  if (justification.length < 20) {
    return { proceed: false, error: "A justification (min 20 chars) is required under single-QA override." };
  }
  return { proceed: true, reasonCode, justification };
}

/** Write the DeviationSODOverride record + DEVIATION_SOD_OVERRIDE_USED audit inside
 *  the caller's transaction (atomic with the signed close). signedRecordId is the
 *  closure SignedRecord id — never null (deviation close is always signed). One row
 *  per waived control; a closer who trips multiple checks gets multiple rows. */
export async function writeDeviationSodOverride(
  tx: Prisma.TransactionClient,
  opts: {
    tenantId: string;
    deviationId: string;
    control: DeviationSodControl;
    actorUserId: string;
    actorName: string;
    actorRole: string;
    reasonCode: string;
    justification: string;
    recordTitle: string;
    signedRecordId: string;
  },
): Promise<void> {
  await tx.deviationSODOverride.create({
    data: {
      tenantId: opts.tenantId,
      deviationId: opts.deviationId,
      control: opts.control,
      actorUserId: opts.actorUserId,
      actorName: opts.actorName,
      actorRole: opts.actorRole,
      reasonCode: opts.reasonCode,
      justification: opts.justification,
      signedRecordId: opts.signedRecordId,
    },
  });
  await tx.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      userName: opts.actorName,
      userRole: opts.actorRole,
      module: "Deviation / SoD Override",
      action: "DEVIATION_SOD_OVERRIDE_USED",
      recordId: opts.deviationId,
      recordTitle: opts.recordTitle.slice(0, 80),
      newValue: JSON.stringify({
        control: opts.control,
        waivedRule: DEVIATION_SOD_WAIVED_RULE[opts.control],
        reasonCode: opts.reasonCode,
        justification: opts.justification,
        signedRecordId: opts.signedRecordId,
      }),
    },
  });
}

/* ── Gap Assessment finding-closure single-QA SoD override (Part 3) ───────────
 *
 * ⚠️ UNVERIFIED — built without DB access. MUST be verified against Postgres
 * before deploy: close a finding under a waiver and confirm the
 * FindingSODOverride row + FINDING_SOD_OVERRIDE_USED audit land in the SAME
 * transaction as the FINDING_CLOSURE signature; confirm a Critical finding is
 * still refused; confirm the flag-OFF path returns the ORIGINAL block message.
 * Do NOT deploy until this passes.
 *
 * The FINDING analogue of the two transforms above — same block→justified-proceed
 * shape, reusing the shared reason codes / input / decision types / tenant read.
 * Three differences from deviation: (1) the ceiling is severity === "Critical" on
 * the GENERIC taxonomy (findings are Critical/High/Medium/Low — there is no Major
 * tier, so deviation's Critical+Major does not map; this matches CAPA, which uses
 * the same taxonomy); (2) it writes FindingSODOverride + FINDING_SOD_OVERRIDE_USED;
 * (3) finding close is ALWAYS signed, so signedRecordId is never null.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The finding-close identity checks a waiver may excuse.
 *
 * DELIBERATELY EXCLUDED: `rca_missing`. That blocker is a COMPLETENESS rule
 * ("was the assessment performed?"), not an identity rule — nothing about
 * single-QA staffing makes a missing root cause analysis acceptable, and
 * src/lib/finding-close.ts is explicit that a missing RCA must never be
 * retro-fitted. There is no control code for it here, so evaluate/write cannot
 * express it and the hard block in findingCloseBlockers always stands.
 */
export type FindingSodControl =
  | "FINDING_CLOSE_RCA_AUTHOR"
  | "FINDING_REVIEW_ASSIGNEE";

/** The identity rule each finding-close control waives — recorded for inspectors. */
export const FINDING_SOD_WAIVED_RULE: Record<FindingSodControl, string> = {
  FINDING_CLOSE_RCA_AUTHOR: "rcaAuthor!=closer",
  FINDING_REVIEW_ASSIGNEE: "assignee!=reviewer",
};

export const FINDING_SOD_OVERRIDE_CEILING_BLOCK =
  "Critical findings require independent QA review; the single-QA override does not apply.";

/**
 * Decide block vs justified-proceed at ONE finding-close identity check. Gate
 * order is IDENTICAL to evaluateSodOverride / evaluateDeviationSodOverride:
 * flag OFF first ⇒ the check's ORIGINAL message (a tenant without the override
 * never sees override wording, even for Critical); flag ON + Critical ⇒ ceiling
 * block; otherwise require a reason code + justification.
 *
 * CEILING DECISION: "Critical" only, GENERIC taxonomy. Finding severity is
 * Critical/High/Medium/Low — the same scale CAPA uses, so CAPA's ceiling is the
 * one that maps. Deviation's Critical+Major is expressed on the FDA taxonomy
 * (Critical/Major/Minor) where Major IS the High tier; findings have no Major, so
 * copying that string would silently waive nothing extra while reading as
 * stricter. Normalised via normalizeSeverityForDisplay so a legacy lowercase
 * "critical" row is caught too.
 */
export function evaluateFindingSodOverride(opts: {
  severity: string | null;
  flagOn: boolean;
  existingBlockError: string;
  input: SodOverrideInput;
}): SodDecision {
  if (!opts.flagOn) return { proceed: false, error: opts.existingBlockError };
  if (normalizeSeverityForDisplay(opts.severity, "generic") === "Critical") {
    return { proceed: false, error: FINDING_SOD_OVERRIDE_CEILING_BLOCK };
  }
  const reasonCode = opts.input.sodOverrideReasonCode;
  const justification = (opts.input.sodOverrideJustification ?? "").trim();
  if (!reasonCode || !(SOD_REASON_CODES as readonly string[]).includes(reasonCode)) {
    return { proceed: false, error: "A reason code is required to proceed under single-QA override." };
  }
  if (justification.length < 20) {
    return { proceed: false, error: "A justification (min 20 chars) is required under single-QA override." };
  }
  return { proceed: true, reasonCode, justification };
}

/** Write the FindingSODOverride record + FINDING_SOD_OVERRIDE_USED audit inside
 *  the caller's transaction (atomic with the signed close). signedRecordId is the
 *  closure SignedRecord id — never null (finding close is always signed). One row
 *  per waived control; a closer who trips both checks gets two rows. */
export async function writeFindingSodOverride(
  tx: Prisma.TransactionClient,
  opts: {
    tenantId: string;
    findingId: string;
    control: FindingSodControl;
    actorUserId: string;
    actorName: string;
    actorRole: string;
    reasonCode: string;
    justification: string;
    recordTitle: string;
    signedRecordId: string;
  },
): Promise<void> {
  await tx.findingSODOverride.create({
    data: {
      tenantId: opts.tenantId,
      findingId: opts.findingId,
      control: opts.control,
      actorUserId: opts.actorUserId,
      actorName: opts.actorName,
      actorRole: opts.actorRole,
      reasonCode: opts.reasonCode,
      justification: opts.justification,
      signedRecordId: opts.signedRecordId,
    },
  });
  await tx.auditLog.create({
    data: {
      tenantId: opts.tenantId,
      userId: opts.actorUserId,
      userName: opts.actorName,
      userRole: opts.actorRole,
      module: "Gap Assessment / SoD Override",
      action: "FINDING_SOD_OVERRIDE_USED",
      recordId: opts.findingId,
      recordTitle: opts.recordTitle.slice(0, 80),
      newValue: JSON.stringify({
        control: opts.control,
        waivedRule: FINDING_SOD_WAIVED_RULE[opts.control],
        reasonCode: opts.reasonCode,
        justification: opts.justification,
        signedRecordId: opts.signedRecordId,
      }),
    },
  });
}
