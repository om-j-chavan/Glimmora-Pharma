import type { CAPA, CAPARisk, CAPAStatus, CAPASource, RCAMethod } from "@/store/capa.slice";

type PrismaCAPA = {
  id: string;
  tenantId: string;
  siteId: string | null;
  findingId: string | null;
  source: string;
  description: string;
  risk: string;
  owner: string;
  dueDate: Date | null;
  status: string;
  rca: string | null;
  rcaMethod: string | null;
  correctiveActions: string | null;
  effectivenessCheck: boolean;
  effectivenessDate: Date | null;
  diGate: boolean;
  diGateStatus: string | null;
  diGateNotes: string | null;
  diGateReviewedBy: string | null;
  diGateReviewDate: Date | null;
  closedBy: string | null;
  closedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  documents?: Array<{
    id: string;
    fileName: string;
    fileSize: string | null;
    fileType: string | null;
    version: string;
    status: string;
    uploadedBy: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    description: string | null;
    createdAt: Date;
  }>;
};

const STATUS_MAP: Record<string, CAPAStatus> = {
  Open: "Open",
  open: "Open",
  "In Progress": "In Progress",
  in_progress: "In Progress",
  "Pending QA Review": "Pending QA Review",
  pending_qa_review: "Pending QA Review",
  Closed: "Closed",
  closed: "Closed",
  rejected: "Open",
};

export function mapCAPAFromPrisma(row: PrismaCAPA): CAPA {
  return {
    id: row.id,
    tenantId: row.tenantId,
    siteId: row.siteId ?? "",
    findingId: row.findingId ?? undefined,
    source: (row.source as CAPASource) ?? "Gap Assessment",
    risk: (row.risk as CAPARisk) ?? "Low",
    owner: row.owner,
    dueDate: row.dueDate ? row.dueDate.toISOString() : "",
    status: STATUS_MAP[row.status] ?? "Open",
    description: row.description,
    rca: row.rca ?? undefined,
    rcaMethod: (row.rcaMethod as RCAMethod | null) ?? undefined,
    correctiveActions: row.correctiveActions ?? undefined,
    effectivenessCheck: row.effectivenessCheck,
    effectivenessDate: row.effectivenessDate ? row.effectivenessDate.toISOString() : undefined,
    evidenceLinks: [],
    diGate: row.diGate,
    diGateStatus: (row.diGateStatus as "open" | "cleared" | null) ?? undefined,
    diGateNotes: row.diGateNotes ?? undefined,
    diGateReviewedBy: row.diGateReviewedBy ?? undefined,
    diGateReviewDate: row.diGateReviewDate ? row.diGateReviewDate.toISOString() : undefined,
    closedAt: row.closedAt ? row.closedAt.toISOString() : undefined,
    closedBy: row.closedBy ?? undefined,
    createdAt: row.createdAt.toISOString(),
    documents: [],
  };
}
