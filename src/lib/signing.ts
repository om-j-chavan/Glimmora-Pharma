/**
 * Substage 5.4 — Part 11 e-signature primitives.
 *
 * Reusable signing helpers used by the CAPA approval / revocation flow
 * today. Designed to be polymorphic — FDA 483 SignSubmit, signAndCloseCAPA,
 * and other Part 11 signing surfaces will adopt the same SignedRecord
 * ledger in follow-up work, calling the same primitives here.
 *
 * Server-only by convention — the project removed `server-only` directives
 * earlier; these functions all use Prisma + bcrypt + node:crypto and would
 * fail at build time if accidentally imported into a client component.
 */

import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Verify a plaintext password against the stored bcrypt hash for the
 * given user id. Looks up Tenant first (covers super_admin and
 * customer_admin) then falls back to User. Returns a boolean — never
 * throws on mismatch; the caller decides UX. Audit logging is the
 * caller's responsibility (so the audit row carries the correct
 * recordType / recordId for the signing surface).
 *
 * bcrypt.compare is constant-time, so timing leakage isn't a concern.
 * The two-table lookup adds a small timing difference between
 * "tenant-matched" and "user-matched" success paths, but since the
 * negative path always tries both tables before returning false, attacker-
 * observable timing reveals only "exists somewhere" vs "nowhere" — same
 * surface as the login flow already exposes.
 */
export async function verifyPasswordForSigning(
  userId: string,
  plaintextPassword: string,
): Promise<boolean> {
  if (!userId || !plaintextPassword) return false;

  const tenant = await prisma.tenant.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (tenant?.passwordHash) {
    return bcrypt.compare(plaintextPassword, tenant.passwordHash);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (user?.passwordHash) {
    return bcrypt.compare(plaintextPassword, user.passwordHash);
  }

  return false;
}

/**
 * SHA-256 hex digest of the supplied canonical string. Pure helper —
 * callers are responsible for canonicalising the input first (sorted
 * keys, ISO timestamps, etc.) so the hash is deterministic.
 */
export function computeContentHash(canonicalString: string): string {
  return createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

/**
 * Canonical JSON serialiser for any object — sorts keys alphabetically
 * recursively before stringifying. Same input shape always yields the
 * same string regardless of property-insertion order. Arrays preserve
 * order (semantic position matters for ordered data like ack lists).
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${entries.join(",")}}`;
}

/** Input shape for canonicalising a CAPA approval — keep this struct
 *  stable; any change to the field set or order semantics invalidates
 *  every prior contentHash. */
export interface CAPAApprovalCanonicalInput {
  capaId: string;
  capaReference: string | null;
  capaDescription: string;
  riskLevel: string;
  approverRole: string;
  approvedAt: Date;
  comment: string | null;
}

/**
 * Build the canonical string for a CAPA approval. Output is a
 * deterministic JSON document — same input always yields the same string,
 * regardless of object-property order at the call site.
 *
 * NOTE: any change to this function's output format invalidates every
 * historical signature's verifiability. Treat it like a wire format —
 * version it (recordType bumps to "CAPA_APPROVAL_V2") rather than mutating
 * in place if the canonical fields ever need to change.
 */
export function canonicalizeCAPAApprovalContent(
  input: CAPAApprovalCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CAPA_APPROVAL",
    capaId: input.capaId,
    capaReference: input.capaReference,
    capaDescription: input.capaDescription,
    riskLevel: input.riskLevel,
    approverRole: input.approverRole,
    approvedAt: input.approvedAt.toISOString(),
    comment: input.comment ?? null,
  });
}

/** Input shape for canonicalising a CAPA approval revocation. */
export interface CAPAApprovalRevocationCanonicalInput {
  approvalId: string;
  capaId: string;
  capaReference: string | null;
  originalApprovedAt: Date;
  originalApproverRole: string;
  originalApproverId: string;
  revokedAt: Date;
  revokerId: string;
  revokerRole: string;
}

export function canonicalizeCAPAApprovalRevocationContent(
  input: CAPAApprovalRevocationCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CAPA_APPROVAL_REVOCATION",
    approvalId: input.approvalId,
    capaId: input.capaId,
    capaReference: input.capaReference,
    originalApprovedAt: input.originalApprovedAt.toISOString(),
    originalApproverId: input.originalApproverId,
    originalApproverRole: input.originalApproverRole,
    revokedAt: input.revokedAt.toISOString(),
    revokerId: input.revokerId,
    revokerRole: input.revokerRole,
  });
}

/** Input shape for canonicalising a CAPA closure (signAndCloseCAPA).
 *
 *  SME Section 1, Stage 4 (FULL) — actionItemsSummary BINDS the closure
 *  signature to the final state of each structured action item. Without
 *  it the signer's attestation says "I closed CAPA X" but doesn't
 *  cryptographically commit to which corrective actions were complete
 *  vs skipped. With it, an inspector reading the SignedRecord can
 *  recompute the hash from the action-item snapshot and confirm
 *  nothing was changed after signing. */
export interface CAPAActionItemHashedSummary {
  id: string;
  sequence: number;
  description: string;
  status: string;
  completedById: string | null;
  completedAt: string | null;
}

export interface CAPAClosureCanonicalInput {
  capaId: string;
  capaReference: string | null;
  capaDescription: string;
  riskLevel: string;
  closedAt: Date;
  closingComment: string | null;
  actionItemsSummary: CAPAActionItemHashedSummary[];
  // SME Section 1, Stage 6 (FULL) — bind the 90-day effectiveness due
  // date into the closure signature so the commitment is attested by
  // the same hash. Inspector reading a signed closure can verify both
  // the closure event AND when the effectiveness check is due.
  effectivenessDueAt: Date;
}

export function canonicalizeCAPAClosureContent(
  input: CAPAClosureCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CAPA_CLOSURE",
    actionItemsSummary: input.actionItemsSummary,
    capaDescription: input.capaDescription,
    capaId: input.capaId,
    capaReference: input.capaReference,
    closedAt: input.closedAt.toISOString(),
    closingComment: input.closingComment ?? null,
    effectivenessDueAt: input.effectivenessDueAt.toISOString(),
    riskLevel: input.riskLevel,
  });
}

/** Input shape for canonicalising a CAPA effectiveness review
 *  (SME Section 1, Stage 6 FULL). The signing event records the
 *  reviewer's verdict — "effective", "ineffective", or "partial" —
 *  bound to the CAPA id and the closure timestamp it's reviewing. */
export interface CAPAEffectivenessCanonicalInput {
  capaId: string;
  capaReference: string | null;
  capaDescription: string;
  closedAt: Date;
  effectivenessDueAt: Date;
  reviewedAt: Date;
  verdict: "effective" | "ineffective" | "partial";
  notes: string;
}

export function canonicalizeCAPAEffectivenessContent(
  input: CAPAEffectivenessCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CAPA_EFFECTIVENESS_REVIEW",
    capaDescription: input.capaDescription,
    capaId: input.capaId,
    capaReference: input.capaReference,
    closedAt: input.closedAt.toISOString(),
    effectivenessDueAt: input.effectivenessDueAt.toISOString(),
    notes: input.notes,
    reviewedAt: input.reviewedAt.toISOString(),
    verdict: input.verdict,
  });
}

/** Input shape for canonicalising an effectiveness-review revocation. */
export interface CAPAEffectivenessRevocationCanonicalInput {
  capaId: string;
  capaReference: string | null;
  originalReviewedAt: Date;
  originalReviewerId: string;
  originalVerdict: string;
  revokedAt: Date;
  revokerId: string;
  revokerRole: string;
}

export function canonicalizeCAPAEffectivenessRevocationContent(
  input: CAPAEffectivenessRevocationCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CAPA_EFFECTIVENESS_REVIEW_REVOCATION",
    capaId: input.capaId,
    capaReference: input.capaReference,
    originalReviewedAt: input.originalReviewedAt.toISOString(),
    originalReviewerId: input.originalReviewerId,
    originalVerdict: input.originalVerdict,
    revokedAt: input.revokedAt.toISOString(),
    revokerId: input.revokerId,
    revokerRole: input.revokerRole,
  });
}

/** Input shape for canonicalising a CAPA independent QA verification
 *  (SME Section 1, Stage 5 FULL). Verification is the signing event
 *  that attests "an independent reviewer (different from creator and
 *  from every approver) confirmed this CAPA's work is correct."
 *  Distinct from closure (which is the ledger event that finalises the
 *  CAPA) and from approval (which is the tier-rule satisfaction event). */
export interface CAPAVerificationCanonicalInput {
  capaId: string;
  capaReference: string | null;
  capaDescription: string;
  riskLevel: string;
  verifiedAt: Date;
  notes: string;
}

export function canonicalizeCAPAVerificationContent(
  input: CAPAVerificationCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CAPA_VERIFICATION",
    capaDescription: input.capaDescription,
    capaId: input.capaId,
    capaReference: input.capaReference,
    notes: input.notes,
    riskLevel: input.riskLevel,
    verifiedAt: input.verifiedAt.toISOString(),
  });
}

/** Input shape for canonicalising a CAPA verification revocation. */
export interface CAPAVerificationRevocationCanonicalInput {
  capaId: string;
  capaReference: string | null;
  originalVerifiedAt: Date;
  originalVerifierId: string;
  revokedAt: Date;
  revokerId: string;
  revokerRole: string;
}

export function canonicalizeCAPAVerificationRevocationContent(
  input: CAPAVerificationRevocationCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CAPA_VERIFICATION_REVOCATION",
    capaId: input.capaId,
    capaReference: input.capaReference,
    originalVerifiedAt: input.originalVerifiedAt.toISOString(),
    originalVerifierId: input.originalVerifierId,
    revokedAt: input.revokedAt.toISOString(),
    revokerId: input.revokerId,
    revokerRole: input.revokerRole,
  });
}

/** Input shape for canonicalising an FDA 483 response submission. */
export interface FDA483ResponseCanonicalInput {
  eventId: string;
  referenceNumber: string;
  responseDraftHash: string;
  signatureMeaning: string;
  submittedAt: Date;
}

export function canonicalizeFDA483ResponseContent(
  input: FDA483ResponseCanonicalInput,
): string {
  return canonicalJson({
    recordType: "FDA483_RESPONSE",
    eventId: input.eventId,
    referenceNumber: input.referenceNumber,
    responseDraftHash: input.responseDraftHash,
    signatureMeaning: input.signatureMeaning,
    submittedAt: input.submittedAt.toISOString(),
  });
}

/** Input shape for canonicalising a Document approval. */
export interface DocumentApprovalCanonicalInput {
  docId: string;
  title: string;
  version: string;
  approvedAt: Date;
  approverId: string;
  approverRole: string;
}

export function canonicalizeDocumentApprovalContent(
  input: DocumentApprovalCanonicalInput,
): string {
  return canonicalJson({
    recordType: "DOCUMENT_APPROVAL",
    approvedAt: input.approvedAt.toISOString(),
    approverId: input.approverId,
    approverRole: input.approverRole,
    docId: input.docId,
    title: input.title,
    version: input.version,
  });
}

/** Input shape for canonicalising a Deviation closure. */
export interface DeviationClosureCanonicalInput {
  deviationId: string;
  title: string;
  severity: string;
  rootCause: string | null;
  closingComment: string | null;
  closedAt: Date;
}

export function canonicalizeDeviationClosureContent(
  input: DeviationClosureCanonicalInput,
): string {
  return canonicalJson({
    recordType: "DEVIATION_CLOSURE",
    closedAt: input.closedAt.toISOString(),
    closingComment: input.closingComment ?? null,
    deviationId: input.deviationId,
    rootCause: input.rootCause ?? null,
    severity: input.severity,
    title: input.title,
  });
}

/** Input shape for canonicalising a Change Control consequential transition.
 *  Only In Review→Approved, In Review→Rejected, and Implemented→Closed are
 *  signed — administrative transitions (Draft→In Review, etc.) are not. */
export interface ChangeControlTransitionCanonicalInput {
  ccId: string;
  ccReference: string | null;
  fromStatus: string;
  toStatus: string;
  comment: string | null;
  transitionedAt: Date;
}

export function canonicalizeChangeControlTransitionContent(
  input: ChangeControlTransitionCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CHANGE_CONTROL_TRANSITION",
    ccId: input.ccId,
    ccReference: input.ccReference,
    comment: input.comment ?? null,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    transitionedAt: input.transitionedAt.toISOString(),
  });
}

/** Input shape for canonicalising a CSV/CSA validation sign-off (RUNG 2.6).
 *  Deterministic from system identity + executed-stage tally + RTM coverage +
 *  Part 11/Annex 11 posture + open-findings count + next requalification date
 *  + signer/meaning/timestamp. Any later drift in these inputs changes the
 *  hash, so an inspector can detect whether the signed-off state still holds. */
export interface CSVValidationSignOffCanonicalInput {
  systemId: string;
  reference: string;
  stagesApproved: number;
  stagesTotal: number;
  rtmCoverage: number;
  part11Compliant: boolean;
  annex11Compliant: boolean;
  openFindings: number;
  nextReviewIso: string;
  signatureMeaning: string;
  signerEmail: string;
  signedAtIso: string;
}

export function canonicalizeCSVValidationSignOffContent(
  input: CSVValidationSignOffCanonicalInput,
): string {
  return canonicalJson({
    recordType: "CSV_VALIDATION_SIGNOFF",
    annex11Compliant: input.annex11Compliant,
    nextReview: input.nextReviewIso,
    openFindings: input.openFindings,
    part11Compliant: input.part11Compliant,
    reference: input.reference,
    rtmCoverage: input.rtmCoverage,
    signatureMeaning: input.signatureMeaning,
    signedAt: input.signedAtIso,
    signerEmail: input.signerEmail,
    stagesApproved: input.stagesApproved,
    stagesTotal: input.stagesTotal,
    systemId: input.systemId,
  });
}

/** Options for createSignedRecord — every field is required at the
 *  signing-surface level (callers compute or default before calling).
 *  Used for the non-transactional case; transactional callers (e.g. the
 *  CAPA approval flow) call `tx.signedRecord.create(...)` directly so the
 *  underlying record + signature land atomically. */
export interface CreateSignedRecordOptions {
  tenantId: string;
  recordType: string;
  recordId: string;
  signerId: string;
  signerName: string;
  signerRole: string;
  signerEmail: string;
  signatureMeaning: string;
  contentHash: string;
  contentSummary: string;
  passwordVerifiedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Inserts a SignedRecord row outside a transaction and returns it. Use
 * this for signing surfaces where atomicity with the underlying record
 * isn't required (e.g. signing an existing immutable artifact).
 */
export async function createSignedRecord(opts: CreateSignedRecordOptions) {
  return prisma.signedRecord.create({
    data: {
      tenantId: opts.tenantId,
      recordType: opts.recordType,
      recordId: opts.recordId,
      signerId: opts.signerId,
      signerName: opts.signerName,
      signerRole: opts.signerRole,
      signerEmail: opts.signerEmail,
      signatureMeaning: opts.signatureMeaning,
      contentHash: opts.contentHash,
      contentSummary: opts.contentSummary,
      passwordVerifiedAt: opts.passwordVerifiedAt,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
    },
  });
}
