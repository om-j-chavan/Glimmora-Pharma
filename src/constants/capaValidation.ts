/**
 * Field-length limits for CAPA validation — the ONE source both the server Zod
 * schemas (src/actions/capas/*) and the client modal schemas import, closing the
 * client/server drift flagged in Phase 3.
 *
 * Pure constants: no imports, no "use server" directive. A "use server" file may
 * IMPORT plain values (it just may not EXPORT non-async values), so lifecycle.ts /
 * action-items.ts can derive from this; client components can too. Verified by
 * tsc + build.
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
