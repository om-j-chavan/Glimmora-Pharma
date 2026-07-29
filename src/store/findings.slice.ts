import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type FindingSeverity = "Critical" | "High" | "Medium" | "Low";
export type FindingStatus = "Open" | "In Progress" | "Submitted" | "Rework" | "Closed";

export interface EditHistoryEntry {
  editedBy: string;
  editedAt: string;
  changes: { field: string; oldValue: unknown; newValue: unknown }[];
  reason?: string;
}

export interface Finding {
  id: string;
  // Human-readable reference (e.g. "FND-CHN-2026-001"). Optional —
  // populated server-side at create + backfill; UI falls back to the
  // cuid slice when missing.
  reference?: string;
  tenantId: string;
  siteId: string;
  area: string;
  requirement: string;
  purpose?: string;
  framework: string;
  severity: FindingSeverity;
  status: FindingStatus;
  owner: string;
  /** Item 16 — the RAISER's User id (Finding.createdById). The client needs it to
   *  mirror canEditFindingRecord: raiser-ness is a property of the RECORD, so role
   *  alone can't gate the Edit button or the RCA section. Undefined = unknown
   *  creator (predates the column) ⇒ nobody is the raiser ⇒ QA only. NOT the same
   *  as `owner`, which is the assignee once assignFinding has run. */
  createdById?: string;
  /** Item 18 — set by assignFinding, the only door to changing `owner`. The ONLY
   *  honest test for "is this assigned?". `status` is wrong 6 of 7 times (a
   *  finding reaches In Progress via createCAPA or a status edit without ever
   *  being assigned), and `owner !== createdById` is wrong both ways —
   *  false-negative when QA assigns back to the raiser (allowed), false-positive
   *  when never assigned. Null = never assigned OR predates the column: unknown
   *  either way, so the UI must not claim an assignment. */
  assignedAt?: string;
  /** The ASSIGNER (the actor), mirroring submittedById = the submitter. The
   *  assignee is `owner`. */
  assignedById?: string;
  targetDate: string;
  /** The AUTHOR's free-text reference. NOT a doc pointer — an uploaded document's
   *  filename must never land here (see uploadFindingEvidence). Read
   *  `hasEvidenceDoc` to ask whether the finding actually has evidence. */
  evidenceLink: string;
  /** Whether the finding has a retrievable uploaded document. Stamped by
   *  getFindings; the honest answer to "does this finding have evidence?", which
   *  a non-empty evidenceLink only ever approximated. */
  hasEvidenceDoc?: boolean;
  rootCause?: string;
  /** Item 17 — who recorded the RCA. The client needs it to mirror
   *  findingCloseBlockers: the closer must not be the analysis's author, and that
   *  comparison is made against a STORED fact, never re-derived from the audit
   *  trail. Undefined = no RCA, or authored before the column existed — an unknown
   *  author, which never satisfies the check. */
  rcaRecordedById?: string;
  // Gap RCA (Batch B) — structured method + JSON detail; rootCause is the mirror.
  rcaMethod?: string;
  rcaDetail?: string;
  agiSummary?: string;
  capaId?: string;
  linkedSystemId?: string;
  linkedSystemName?: string;
  createdAt: string;
  editHistory?: EditHistoryEntry[];
}

interface FindingsState {
  items: Finding[];
}

const initialState: FindingsState = { items: [] };

const findingsSlice = createSlice({
  name: "findings",
  initialState,
  reducers: {
    setFindings(state, { payload }: PayloadAction<Finding[]>) {
      state.items = payload;
    },
    addFinding(state, { payload }: PayloadAction<Finding>) {
      state.items.push(payload);
    },
    updateFinding(state, { payload }: PayloadAction<{ id: string; patch: Partial<Finding> }>) {
      const item = state.items.find((f) => f.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeFinding(state, { payload }: PayloadAction<string>) {
      const item = state.items.find((f) => f.id === payload);
      if (item) item.status = "Closed";
    },
    linkCapa(state, { payload }: PayloadAction<{ findingId: string; capaId: string }>) {
      const item = state.items.find((f) => f.id === payload.findingId);
      if (item) item.capaId = payload.capaId;
    },
    editFinding(state, { payload }: PayloadAction<{
      id: string;
      patch: Partial<Finding>;
      editedBy: string;
      editedAt: string;
      editReason?: string;
    }>) {
      const item = state.items.find((f) => f.id === payload.id);
      if (!item) return;
      const changes: EditHistoryEntry["changes"] = [];
      const { severity: _s, area: _a, framework: _fw, id: _id, ...safePatch } = payload.patch as Record<string, unknown>;
      for (const [field, newValue] of Object.entries(safePatch)) {
        if (newValue === undefined) continue;
        const oldValue = (item as Record<string, unknown>)[field];
        if (oldValue !== newValue) {
          changes.push({ field, oldValue, newValue });
          (item as Record<string, unknown>)[field] = newValue;
        }
      }
      if (changes.length > 0) {
        if (!item.editHistory) item.editHistory = [];
        item.editHistory.push({
          editedBy: payload.editedBy,
          editedAt: payload.editedAt,
          changes,
          reason: payload.editReason,
        });
      }
    },
  },
});

export const { setFindings, addFinding, updateFinding, closeFinding, linkCapa, editFinding } = findingsSlice.actions;
export default findingsSlice.reducer;
