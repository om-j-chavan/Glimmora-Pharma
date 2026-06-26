import type { Finding as PrismaFinding } from "@prisma/client";
import type { Finding, FindingSeverity } from "@/store/findings.slice";

/** Prisma Finding plus the edit-history rows the page query includes. */
export type FindingWithEdits = PrismaFinding & {
  edits?: {
    editedBy: string;
    editedByName: string;
    editedAt: Date;
    reason: string | null;
    changes: string;
  }[];
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
    targetDate: p.targetDate ? p.targetDate.toISOString() : "",
    evidenceLink: p.evidenceLink ?? "",
    rootCause: p.rootCause ?? undefined,
    rcaMethod: p.rcaMethod ?? undefined,
    rcaDetail: p.rcaDetail ?? undefined,
    capaId: p.linkedCAPAId ?? undefined,
    createdAt: p.createdAt.toISOString(),
    editHistory: p.edits?.length
      ? p.edits.map((e) => ({
          editedBy: e.editedBy,
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
