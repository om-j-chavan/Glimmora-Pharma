import type { Finding as PrismaFinding } from "@prisma/client";
import type { Finding, FindingSeverity } from "@/store/findings.slice";

/** Prisma Finding plus the edit-history rows the page query includes, and the
 *  evidence-presence fact getFindings stamps on every row. */
export type FindingWithEdits = PrismaFinding & {
  edits?: {
    editedBy: string;
    editedByName: string;
    editedAt: Date;
    reason: string | null;
    changes: string;
  }[];
  hasEvidenceDoc?: boolean;
};

/* ── Adapt Prisma Finding → slice Finding shape ── */
export function adaptFinding(p: FindingWithEdits): Finding {
  return {
    id: p.id,
    reference: p.reference ?? undefined,
    tenantId: p.tenantId,
    siteId: p.siteId ?? "",
    area: p.area,
    requirement: p.requirement,
    purpose: p.purpose ?? undefined,
    framework: p.framework ?? "",
    severity: p.severity as FindingSeverity,
    status: (p.status ?? "Open") as Finding["status"],
    owner: p.owner,
    // Item 16 — the raiser, so the client can mirror canEditFindingRecord. Undefined
    // (not "") when null, so the fail-closed guard sees "unknown", not a value.
    createdById: p.createdById ?? undefined,
    // Item 18 — the assignment record, so the detail can say "Assigned to" only
    // when it actually knows. Undefined (not "") when null: absent means unknown.
    assignedAt: p.assignedAt ? p.assignedAt.toISOString() : undefined,
    assignedById: p.assignedById ?? undefined,
    targetDate: p.targetDate ? p.targetDate.toISOString() : "",
    evidenceLink: p.evidenceLink ?? "",
    hasEvidenceDoc: p.hasEvidenceDoc ?? false,
    rootCause: p.rootCause ?? undefined,
    // Item 17 — the RCA's author, so the close gate's client mirror compares against
    // the same stored fact the server does.
    rcaRecordedById: p.rcaRecordedById ?? undefined,
    rcaMethod: p.rcaMethod ?? undefined,
    rcaDetail: p.rcaDetail ?? undefined,
    capaId: p.linkedCAPAId ?? undefined,
    createdAt: p.createdAt.toISOString(),
    editHistory: p.edits?.length
      ? p.edits.map((e) => ({
          // Use the denormalised human name (editedByName), NOT the raw userId
          // (editedBy) — the Audit Trail renders this via displayName, so passing
          // the id showed a cuid instead of a name (#12).
          editedBy: e.editedByName || e.editedBy,
          editedAt: e.editedAt.toISOString(),
          reason: e.reason ?? undefined,
          changes: (() => {
            try {
              return JSON.parse(e.changes) as { field: string; oldValue: unknown; newValue: unknown }[];
            } catch {
              return [];
            }
          })(),
        }))
      : undefined,
  };
}
