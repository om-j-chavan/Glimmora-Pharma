import { createSlice } from "@reduxjs/toolkit";

// Re-exported for backwards compatibility — canonical source is auth.slice.ts
export type { TenantSiteConfig as SiteConfig } from "./auth.slice";
export type { TenantUserConfig as UserConfig } from "./auth.slice";

/**
 * ── This slice is now empty, deliberately ─────────────────────
 *
 * It used to hold `agi` — the AI agent policy: operating mode, confidence
 * threshold and six per-agent toggles. That was the wrong home for it in three
 * separate ways:
 *
 *   1. It was persisted to the browser's `glimmora-state` localStorage blob
 *      (see PERSIST_SLICES in store/persistence.ts), so the policy was
 *      per-BROWSER rather than per-tenant. Two colleagues in the same
 *      organisation could hold contradictory policies, and clearing site data
 *      silently reset it to "all agents on".
 *   2. Any user could flip any switch for themselves — there was no role check
 *      and no audit entry, on a control that governs what AI may do to
 *      regulated records.
 *   3. No server ever read it. Panels consulted it to hide a button, and that
 *      was the entire effect: the endpoints answered regardless. "Disabling"
 *      an agent disabled nothing.
 *
 * It now lives in the `TenantAgiPolicy` table, is edited only by
 * customer_admin / qa_head through `src/actions/agi-policy.ts` (audited on both
 * sides of every change), is read by components through
 * `src/hooks/useAgiPolicy.ts`, and is ENFORCED in
 * `app/api/ai-proxy/[...path]/route.ts` — the single doorway every browser AI
 * call passes through.
 *
 * The slice is kept (rather than deleted from the store) so the persisted
 * localStorage shape stays loadable for users with an existing blob; any `agi`
 * key in it is simply ignored now. Do not add UI preferences here that a server
 * needs to honour — that is the mistake this documents.
 */

interface SettingsState {
  /** Reserved. See the note above before adding anything here. */
  _empty?: never;
}

const initialState: SettingsState = {};

const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {},
});

export default settingsSlice.reducer;
