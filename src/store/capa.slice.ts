import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { CAPAStatus } from "@/types/capa";
// Phase 1.5 — RCA method values unified into one shared constant.
import type { CapaRCAMethod } from "@/constants/rcaMethods";

export type CAPARisk = "Critical" | "High" | "Medium" | "Low";
export type RCAMethod = CapaRCAMethod;
export type CAPASource = "483" | "Internal Audit" | "Deviation" | "Complaint" | "OOS" | "Change Control" | "Gap Assessment";

export interface CAPA {
  id: string;
  /** Human-readable per-tenant identifier, e.g. "CAPA-2026-014".
   *  Optional in the slice type because legacy in-memory CAPAs created
   *  before the migration may exist transiently; every persisted row
   *  has a non-null reference after the 20260502000000 migration. */
  reference?: string;
  tenantId: string;
  siteId: string;
  findingId?: string;
  source: CAPASource;
  risk: CAPARisk;
  owner: string;
  dueDate: string;
  status: CAPAStatus;
  title: string;
  description: string;
  rca?: string;
  rcaMethod?: RCAMethod;
  /** Batch 2 — method-specific structured RCA as a JSON string (5-Why array /
   *  Fishbone buckets / Fault-Tree fields). `rca` stays the readable mirror. */
  rcaDetail?: string;
  correctiveActions?: string;
  effectivenessCheck: boolean;
  effectivenessDate?: string;
  diGate: boolean;
  linkedSystemId?: string;
  linkedSystemName?: string;
  diGateStatus?: "open" | "cleared";
  diGateNotes?: string;
  diGateReviewedBy?: string;
  diGateReviewDate?: string;
  // Substage 4.7 — Action-to-Cause Alignment Review fields. Optional in
  // the Redux shape because legacy in-memory CAPAs created before the
  // migration won't have them; every persisted row populates these (or
  // leaves them null) after migration add_capa_alignment_review.
  alignmentStatus?: "aligned" | "cosmetic" | "needs_review";
  alignmentReviewedBy?: string;
  alignmentReviewedById?: string;
  alignmentReviewedAt?: string;
  alignmentNotes?: string;
  alignmentOverrideBy?: string;
  alignmentOverrideById?: string;
  alignmentOverrideAt?: string;
  alignmentOverrideReason?: string;
  // SME Section 1, Stage 3 (FULL) — RCA review fields. rcaApproved is
  // tri-state: undefined/null = not yet reviewed, true = approved,
  // false = rejected. Override fields populated only when a second
  // reviewer overrides a prior rejection.
  rcaApproved?: boolean | null;
  rcaReviewedBy?: string;
  rcaReviewedById?: string;
  rcaReviewedAt?: string;
  rcaReviewNotes?: string;
  rcaOverrideBy?: string;
  rcaOverrideById?: string;
  rcaOverrideAt?: string;
  rcaOverrideReason?: string;
  // SME Section 1, Stage 5 (FULL) — Independent QA Verification fields.
  // Populated by verifyCAPA; cleared by revokeCAPAVerification AND by
  // any approval revocation that drops the CAPA back to pending_qa_review.
  verifiedBy?: string;
  verifiedById?: string;
  verifiedAt?: string;
  verificationNotes?: string;
  verificationSignatureId?: string;
  // Substage 6.4 — Linked CC dependency override metadata. Populated only
  // when a Medium/Low CAPA was sealed while linked CCs were still
  // incomplete (the soft-gate path). Null on the normal flow so an
  // inspector can tell at a glance whether an override was applied.
  ccBlockOverrideReason?: string;
  ccBlockOverrideById?: string;
  ccBlockOverrideByName?: string;
  ccBlockOverrideAt?: string;
  closedAt?: string;
  closedBy?: string;
  // Phase 4 — targeted reject metadata (CAPA bounced back to in_progress).
  rejectionReason?: string;
  rejectedById?: string;
  rejectedAt?: string;
  // Display name of the creator. Used client-side to mirror the server-side
  // SoD guard (a user cannot approve a CAPA they created). Name-equality
  // only — schema lacks createdById today.
  createdBy?: string;
  createdAt: string;
  // SME Section 1, Stage 2 (FULL) — bidirectional CAPA↔Deviation link.
  // Populated when the row was hydrated via getCAPA / getCAPAs (which
  // include the new deviation relation). Renders the "Linked deviation"
  // panel on the CAPA detail modal directly from this prop — no
  // separate fetch round-trip needed.
  deviation?: {
    id: string;
    reference?: string | null;
    title: string;
    severity: string;
    status: string;
    createdAt: string;
  } | null;
  // CAPA-module batch — linked Gap (Finding) provenance, threaded like
  // deviation: the human reference (for readable display + click-through) and
  // the gap owner (shown alongside the CAPA driver). Populated by getCAPA /
  // getCAPAs; null when the source isn't a gap finding.
  finding?: {
    id: string;
    reference?: string | null;
    owner?: string | null;
  } | null;
  // SME Section 1, Stage 4 (FULL) — structured action plan items.
  // Replaces correctiveActions as the source of truth; the
  // correctiveActions string remains on the CAPA as a denormalised
  // cache rebuilt by syncCorrectiveActions on every write.
  actionItems?: CAPAActionItem[];
  // SME Section 1, Stage 6 (FULL) — effectiveness review outcome.
  // effectivenessDate (legacy column) doubles as the +90d due date;
  // see schema comment. Verdict is "effective" | "ineffective" |
  // "partial" once a review is recorded.
  effectivenessReviewedAt?: string;
  effectivenessVerdict?: "effective" | "ineffective" | "partial";
  effectivenessReviewedBy?: string;
  effectivenessReviewedById?: string;
  effectivenessReviewNotes?: string;
  effectivenessSignatureId?: string;
}

export type CAPAActionItemStatus = "pending" | "in_progress" | "complete" | "skipped" | "rework";

export interface CAPAActionItem {
  id: string;
  capaId: string;
  sequence: number;
  description: string;
  owner: string;
  ownerId?: string | null;
  dueDate: string;
  status: CAPAActionItemStatus;
  completedBy?: string | null;
  completedById?: string | null;
  completedAt?: string | null;
  completionNotes?: string | null;
  // Phase 4 — targeted-reject rework metadata (kept as history even after the
  // item is re-completed).
  reworkReason?: string | null;
  reworkRequestedById?: string | null;
  reworkRequestedAt?: string | null;
  createdAt: string;
  createdBy: string;
  createdById?: string | null;
  updatedAt: string;
}

interface CAPAState {
  items: CAPA[];
}

const initialState: CAPAState = { items: [] };

const capaSlice = createSlice({
  name: "capa",
  initialState,
  reducers: {
    setCAPAs(state, { payload }: PayloadAction<CAPA[]>) {
      state.items = payload;
    },
    addCAPA(state, { payload }: PayloadAction<CAPA>) {
      const idx = state.items.findIndex((c) => c.id === payload.id);
      if (idx >= 0) state.items[idx] = payload;
      else state.items.push(payload);
    },
    updateCAPA(state, { payload }: PayloadAction<{ id: string; patch: Partial<CAPA> }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) Object.assign(item, payload.patch);
    },
    closeCAPA(state, { payload }: PayloadAction<{ id: string; closedBy: string; closedAt: string }>) {
      const item = state.items.find((c) => c.id === payload.id);
      if (item) {
        item.status = "closed";
        item.closedBy = payload.closedBy;
        item.closedAt = payload.closedAt;
      }
    },
  },
});

export const { setCAPAs, addCAPA, updateCAPA, closeCAPA } = capaSlice.actions;
export default capaSlice.reducer;
