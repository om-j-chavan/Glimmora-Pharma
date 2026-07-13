import type { CAPA, CAPARisk, CAPASource, RCAMethod } from "@/store/capa.slice";
import type { CAPAStatus } from "@/types/capa";

type PrismaCAPA = {
  id: string;
  reference: string | null;
  tenantId: string;
  siteId: string | null;
  findingId: string | null;
  source: string;
  title: string;
  description: string;
  risk: string;
  owner: string;
  dueDate: Date | null;
  status: string;
  rca: string | null;
  rcaMethod: string | null;
  rcaDetail: string | null;
  correctiveActions: string | null;
  effectivenessCheck: boolean;
  effectivenessDate: Date | null;
  diGate: boolean;
  diGateStatus: string | null;
  diGateNotes: string | null;
  diGateReviewedBy: string | null;
  diGateReviewDate: Date | null;
  alignmentStatus: string | null;
  alignmentReviewedBy: string | null;
  alignmentReviewedById: string | null;
  alignmentReviewedAt: Date | null;
  alignmentNotes: string | null;
  alignmentOverrideBy: string | null;
  alignmentOverrideById: string | null;
  alignmentOverrideAt: Date | null;
  alignmentOverrideReason: string | null;
  rcaApproved: boolean | null;
  rcaReviewedBy: string | null;
  rcaReviewedById: string | null;
  rcaReviewedAt: Date | null;
  rcaReviewNotes: string | null;
  rcaOverrideBy: string | null;
  rcaOverrideById: string | null;
  rcaOverrideAt: Date | null;
  rcaOverrideReason: string | null;
  verifiedBy: string | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  verificationNotes: string | null;
  verificationSignatureId: string | null;
  // SME Stage 6 (FULL) — effectiveness review outcome.
  effectivenessReviewedAt: Date | null;
  effectivenessVerdict: string | null;
  effectivenessReviewedBy: string | null;
  effectivenessReviewedById: string | null;
  effectivenessReviewNotes: string | null;
  effectivenessSignatureId: string | null;
  // SME Stage 4 (FULL) — optional include; present only when the row
  // was fetched via getCAPA / getCAPAs which add actionItems.
  actionItems?: Array<{
    id: string;
    capaId: string;
    sequence: number;
    description: string;
    owner: string;
    ownerId: string | null;
    dueDate: Date;
    status: string;
    completedBy: string | null;
    completedById: string | null;
    completedAt: Date | null;
    completionNotes: string | null;
    reworkReason: string | null;
    reworkRequestedById: string | null;
    reworkRequestedAt: Date | null;
    createdAt: Date;
    createdBy: string;
    createdById: string | null;
    updatedAt: Date;
  }>;
  ccBlockOverrideReason: string | null;
  ccBlockOverrideById: string | null;
  ccBlockOverrideByName: string | null;
  ccBlockOverrideAt: Date | null;
  closedBy: string | null;
  closedAt: Date | null;
  rejectionReason: string | null;
  rejectedById: string | null;
  rejectedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  // Optional include — present only when the row was fetched via getCAPA
  // / getCAPAs (which add the deviation relation per SME Stage 2 FULL).
  // Mapper passes it through unchanged (Dates → ISO strings) so the
  // Redux store carries the same shape.
  deviation?: {
    id: string;
    reference: string | null;
    title: string;
    severity: string;
    status: string;
    createdAt: Date;
  } | null;
  // Optional include — linked Gap (Finding) provenance. getCAPA uses
  // `finding: true` (full row, structurally a superset); getCAPAs selects
  // id/reference/owner. Mapper passes id/reference/owner to the slice.
  finding?: {
    id: string;
    reference: string | null;
    owner: string;
  } | null;
};

export const STATUS_MAP: Record<string, CAPAStatus> = {
  // Canonical (snake_case) — identity.
  open: "open",
  in_progress: "in_progress",
  pending_qa_review: "pending_qa_review",
  closed: "closed",
  rejected: "rejected",
  // Legacy Title-Case — fold to canonical for any rows still pending the
  // fix_capa_status_vocab.sql migration. Safe to remove once that
  // migration has run everywhere.
  Open: "open",
  "In Progress": "in_progress",
  "Pending QA Review": "pending_qa_review",
  Closed: "closed",
};

export function mapCAPAFromPrisma(row: PrismaCAPA): CAPA {
  return {
    id: row.id,
    reference: row.reference ?? undefined,
    tenantId: row.tenantId,
    siteId: row.siteId ?? "",
    findingId: row.findingId ?? undefined,
    source: (row.source as CAPASource) ?? "Gap Assessment",
    risk: (row.risk as CAPARisk) ?? "Low",
    owner: row.owner,
    dueDate: row.dueDate ? row.dueDate.toISOString() : "",
    status: STATUS_MAP[row.status] ?? "open",
    title: row.title,
    description: row.description,
    rca: row.rca ?? undefined,
    rcaMethod: (row.rcaMethod as RCAMethod | null) ?? undefined,
    rcaDetail: row.rcaDetail ?? undefined,
    correctiveActions: row.correctiveActions ?? undefined,
    effectivenessCheck: row.effectivenessCheck,
    effectivenessDate: row.effectivenessDate ? row.effectivenessDate.toISOString() : undefined,
    diGate: row.diGate,
    diGateStatus: (row.diGateStatus as "open" | "cleared" | null) ?? undefined,
    diGateNotes: row.diGateNotes ?? undefined,
    diGateReviewedBy: row.diGateReviewedBy ?? undefined,
    diGateReviewDate: row.diGateReviewDate ? row.diGateReviewDate.toISOString() : undefined,
    alignmentStatus:
      row.alignmentStatus === "aligned" ||
      row.alignmentStatus === "cosmetic" ||
      row.alignmentStatus === "needs_review"
        ? row.alignmentStatus
        : undefined,
    alignmentReviewedBy: row.alignmentReviewedBy ?? undefined,
    alignmentReviewedById: row.alignmentReviewedById ?? undefined,
    alignmentReviewedAt: row.alignmentReviewedAt
      ? row.alignmentReviewedAt.toISOString()
      : undefined,
    alignmentNotes: row.alignmentNotes ?? undefined,
    alignmentOverrideBy: row.alignmentOverrideBy ?? undefined,
    alignmentOverrideById: row.alignmentOverrideById ?? undefined,
    alignmentOverrideAt: row.alignmentOverrideAt
      ? row.alignmentOverrideAt.toISOString()
      : undefined,
    alignmentOverrideReason: row.alignmentOverrideReason ?? undefined,
    // SME Stage 3 (FULL) — RCA review fields. Null is meaningful for
    // rcaApproved ("explicitly cleared" vs "never reviewed" both render
    // the same "not reviewed" UI today, but the audit trail
    // distinguishes them via CAPA_RCA_REVIEW_CLEARED events).
    rcaApproved: row.rcaApproved,
    rcaReviewedBy: row.rcaReviewedBy ?? undefined,
    rcaReviewedById: row.rcaReviewedById ?? undefined,
    rcaReviewedAt: row.rcaReviewedAt ? row.rcaReviewedAt.toISOString() : undefined,
    rcaReviewNotes: row.rcaReviewNotes ?? undefined,
    rcaOverrideBy: row.rcaOverrideBy ?? undefined,
    rcaOverrideById: row.rcaOverrideById ?? undefined,
    rcaOverrideAt: row.rcaOverrideAt ? row.rcaOverrideAt.toISOString() : undefined,
    rcaOverrideReason: row.rcaOverrideReason ?? undefined,
    // SME Stage 5 (FULL) — verification fields.
    verifiedBy: row.verifiedBy ?? undefined,
    verifiedById: row.verifiedById ?? undefined,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : undefined,
    verificationNotes: row.verificationNotes ?? undefined,
    verificationSignatureId: row.verificationSignatureId ?? undefined,
    // SME Stage 6 (FULL) — effectiveness review fields.
    effectivenessReviewedAt: row.effectivenessReviewedAt
      ? row.effectivenessReviewedAt.toISOString()
      : undefined,
    effectivenessVerdict:
      row.effectivenessVerdict === "effective" ||
      row.effectivenessVerdict === "ineffective" ||
      row.effectivenessVerdict === "partial"
        ? row.effectivenessVerdict
        : undefined,
    effectivenessReviewedBy: row.effectivenessReviewedBy ?? undefined,
    effectivenessReviewedById: row.effectivenessReviewedById ?? undefined,
    effectivenessReviewNotes: row.effectivenessReviewNotes ?? undefined,
    effectivenessSignatureId: row.effectivenessSignatureId ?? undefined,
    // SME Stage 4 (FULL) — structured action plan items.
    actionItems: row.actionItems
      ? row.actionItems.map((a) => ({
          id: a.id,
          capaId: a.capaId,
          sequence: a.sequence,
          description: a.description,
          owner: a.owner,
          ownerId: a.ownerId,
          dueDate: a.dueDate.toISOString(),
          status: a.status as "pending" | "in_progress" | "complete" | "skipped" | "rework",
          completedBy: a.completedBy,
          completedById: a.completedById,
          completedAt: a.completedAt ? a.completedAt.toISOString() : null,
          completionNotes: a.completionNotes,
          reworkReason: a.reworkReason,
          reworkRequestedById: a.reworkRequestedById,
          reworkRequestedAt: a.reworkRequestedAt ? a.reworkRequestedAt.toISOString() : null,
          createdAt: a.createdAt.toISOString(),
          createdBy: a.createdBy,
          createdById: a.createdById,
          updatedAt: a.updatedAt.toISOString(),
        }))
      : undefined,
    ccBlockOverrideReason: row.ccBlockOverrideReason ?? undefined,
    ccBlockOverrideById: row.ccBlockOverrideById ?? undefined,
    ccBlockOverrideByName: row.ccBlockOverrideByName ?? undefined,
    ccBlockOverrideAt: row.ccBlockOverrideAt
      ? row.ccBlockOverrideAt.toISOString()
      : undefined,
    closedAt: row.closedAt ? row.closedAt.toISOString() : undefined,
    closedBy: row.closedBy ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    rejectedById: row.rejectedById ?? undefined,
    rejectedAt: row.rejectedAt ? row.rejectedAt.toISOString() : undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    // null = relation included, no linked deviation; undefined = relation
    // was not included in this query path. UI treats both as "no panel".
    deviation: row.deviation
      ? {
          id: row.deviation.id,
          reference: row.deviation.reference ?? null,
          title: row.deviation.title,
          severity: row.deviation.severity,
          status: row.deviation.status,
          createdAt: row.deviation.createdAt.toISOString(),
        }
      : undefined,
    finding: row.finding
      ? {
          id: row.finding.id,
          reference: row.finding.reference ?? null,
          owner: row.finding.owner ?? null,
        }
      : undefined,
  };
}
