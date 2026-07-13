"use server";

export interface TaskDetail {
  action: {
    id: string;
    capaId: string;
    sequence: number;
    description: string;
    owner: string;
    ownerId: string | null;
    dueDate: string;
    status: string;
    completionNotes: string | null;
    reworkReason: string | null;
  };
  capa: {
    id: string;
    reference: string | null;
    title: string;
    status: string;
    dueDate: string | null;
    rca: string | null;
    rcaApproved: boolean | null;
    ownerId: string | null;
  };
  files: { id: string; fileName: string; category: string; fileSize: number; uploadedBy: string; uploadedById: string | null; createdAt: string }[];
  comments: { id: string; body: string; authorName: string; authorRole: string; createdAt: string }[];
  /** Storage bucket for action-scoped uploads — the CAPA's first evidence
   *  category, or null when evidence isn't initialised yet. */
  defaultEvidenceItemId: string | null;
}
