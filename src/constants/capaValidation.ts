/**
 * Field-length limits — the ONE source both the server Zod schemas and the client
 * modal schemas import, closing the client/server drift flagged in Phase 3.
 *
 * NAME NOTE: this file is the APP's shared floors, not CAPA's. It started
 * CAPA-scoped and the name stuck; Gap Assessment now derives from it too
 * (FINDING_EDIT_REASON_MIN below, imported by actions/findings.ts + the gap detail).
 * Renaming it would churn every importer for no behaviour change — so it is
 * documented rather than moved. Put a new floor HERE; a second one-constant file
 * is how the drift this file exists to close gets reintroduced.
 *
 * Pure constants: no imports, no "use server" directive. A "use server" file may
 * IMPORT plain values (it just may not EXPORT non-async values), so lifecycle.ts /
 * action-items.ts / findings.ts can derive from this; client components can too.
 * Verified by tsc + build.
 */
export const CAPA_TITLE_MIN = 5;
export const CAPA_TITLE_MAX = 200;
export const CAPA_DESCRIPTION_MIN = 20;
export const TASK_DESCRIPTION_MIN = 10;

// Phase 6 — reason/attestation floors. Server schemas AND client modals import
// these (same anti-drift pattern). Raised deliberately: these fields gate real
// consequences, so a few characters can't stand in for the record.
export const CLOSING_NOTES_MIN = 20;   // signAndCloseCAPA — bound into the closure hash
export const CONCERN_MIN = 10;         // a concern BLOCKS CLOSURE
export const REJECT_REASON_MIN = 10;   // return-for-rework undoes accepted work
export const DI_CLEARANCE_MIN = 20;    // "what did you verify?" — now required, not optional
// updateFinding — ALCOA+ reason-for-change on a GxP record. The 10 tier, not 20:
// 20 is for an ATTESTATION bound into a signature or gating closure (above); this
// is a JUSTIFICATION for a change, the same shape as REJECT_REASON_MIN / CONCERN_MIN
// and the reassign/skip reasons in action-items.ts.
export const FINDING_EDIT_REASON_MIN = 10;
