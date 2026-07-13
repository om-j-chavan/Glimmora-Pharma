# Code Splitting Audit
Date: 2026-06-03
Branch: audit/code-splitting

> **Read-only audit.** No code was modified. Every proposal below honors three
> hard constraints: (1) no split crosses a Prisma `$transaction` boundary,
> (2) nothing touches the Part 11 signing/audit-log path
> (`src/lib/signing.ts` and the signed-transaction action bodies stay intact),
> (3) files are flagged only for genuine *responsibility* separation, not for
> hitting a line count alone.
>
> **Note on repo layout:** this project keeps source under `src/` — actions in
> `src/actions/`, shared components in `src/components/` + `src/modules/`,
> utilities in `src/lib/`. The `app/**/page.tsx` layer is uniformly thin
> (≤62 lines; all are App-Router shells that delegate to `src/modules/*`) and
> needs **no** splitting. Paths below are the real ones.

---

## Summary

- **Total files sized:** full `app/` + `src/` tree (~250 `.ts`/`.tsx` + schema)
  via recursive line count; **24 largest files deep-read** top-to-bottom.
- **Files flagged for split:** **16** (genuine responsibility separation).
  Three large files were read and **deliberately not split** (`signing.ts`,
  `aiBackend.ts`, the signed-transaction action cores) — see notes.
- **Top 5 worst offenders (raw line count):**
  1. `src/modules/fda-483/tabs/InvestigationTab.tsx` — **2,477**
  2. `src/actions/systems.ts` — **1,956**
  3. `src/modules/admin/CustomerAccountsPage.tsx` — **1,661**
  4. `src/actions/fda483.ts` — **1,551**
  5. `src/modules/ai-capa/AiCapaPage.tsx` — **1,380**
- **Estimated lines relocated if all splits applied:** **~6,500–7,500 lines**
  moved out of oversized files into focused modules. Of that, only **~200–300
  lines are *net* deletions** (from de-duplicating `ActionResult`, `truncate`,
  `formatSize`, the reference-retry loop, and RCA parsers — see Cross-cutting).
  The rest is relocation: the win is that no single file stays above ~600 lines
  and each new module owns one responsibility.

---

## Findings

### src/modules/fda-483/tabs/InvestigationTab.tsx

- **Size:** ~2,100 lines of code (2,477 raw) — the single largest file in the app.
- **Current responsibilities:**
  - Observation selection UI (`ObservationPicker`, ~215 lines, own search + outside-click)
  - Raise-CAPA flow with a *nested* AI pre-fill modal (`RaiseCAPAModal`, ~383 lines)
  - AI-RCA suggestion modal with pending-edit confirmation (`AiRcaModal`, ~395 lines)
  - Saved-RCA parsing/rendering per method (`SavedRcaDisplay` + `RcaBlock`, ~145 lines)
  - The actual investigation tab orchestration + 6 useState / 4 useRef / 3 useEffect
  - Display helpers (`truncate`, `formatTime`, `confidenceColor`)
- **Why it's a split candidate:** five fully-formed sub-components (each a
  distinct dialog/feature) are declared inline in one file; three of them are
  self-contained modals with their own state machines. This is composition, not
  one component.
- **Proposed split:**
  - `src/modules/fda-483/investigation/ObservationPicker.tsx`: the collapsible searchable observation selector + its `ObsPickerProps`.
  - `src/modules/fda-483/investigation/RaiseCAPAModal.tsx`: the raise-CAPA dialog incl. its nested AI pre-fill modal.
  - `src/modules/fda-483/investigation/AiRcaModal.tsx`: the AI suggestion/confirmation dialog.
  - `src/modules/fda-483/investigation/SavedRcaDisplay.tsx`: `SavedRcaDisplay` + `RcaBlock` (pure presentational RCA renderer).
  - `src/lib/rca/parseRcaMethod.ts`: the regex-based 5-Why/Fishbone parser inside `SavedRcaDisplay` (pure, testable).
  - Original file keeps: the `InvestigationTab` orchestrator, step-status derivations, and prop wiring.
- **Reuse opportunity:** `SavedRcaDisplay` + the `parseRcaMethod` parser are a
  near-duplicate of `SavedDeviationRcaDisplay` in
  `src/modules/deviation/DeviationInvestigation.tsx` — both parse the same
  5-Why/Fishbone string format. One shared renderer serves both modules.
- **Risk:** Medium — same-module imports; no action signatures touched.
- **Effort:** L — five extractions + verifying the nested-modal focus/z-index behavior is unchanged.

### src/actions/systems.ts

- **Size:** ~1,600 lines of code (1,956 raw); 25 server actions + 2 exported helpers.
- **Current responsibilities:** system CRUD · validation-stage lifecycle ·
  stage documents · system attributes (risk/remediation/review) · roadmap ·
  cross-module Finding/CAPA links · Part 11 sign-off gates — **8 sub-features in one file.**
- **Why it's a split candidate:** eight independent action clusters share only
  imports; most touch different models. The transaction-bound actions
  (`createSystem`, `removeStageDocument`, `signValidation`, `unsignValidation`)
  are each *self-contained* — splitting along cluster lines never separates a
  `$transaction` from its body.
- **Proposed split** (mirrors the existing `src/actions/capas/` sub-folder pattern):
  - `src/actions/systems/stages.ts`: `submitStageForReview`, `approveStage`, `rejectStage`, `skipStage`, `updateStageNotes` + the `deriveValidationStatus`/`syncValidationStatus` helpers they share.
  - `src/actions/systems/stage-documents.ts`: `addStageDocument`, `removeStageDocument` (the `removeStageDocument` `$transaction` moves intact).
  - `src/actions/systems/attributes.ts`: `saveRiskFactors`, `saveRiskClassification`, `saveNextReview`, `saveRemediation`, `attestValidationStatus`, `resetToAutoDerivedStatus`.
  - `src/actions/systems/links.ts`: `linkFindingToSystem`, `unlinkFindingFromSystem`, `raiseCAPAFromSystem`.
  - `src/actions/systems/sign-off.ts`: `getSignOffReadiness`, `signValidation`, `unsignValidation` (Part 11 — the two `$transaction` blocks move whole, untouched).
  - Original `systems.ts` keeps: `createSystem`/`updateSystem`/`deleteSystem`/`restoreSystem` + `nextSystemReference`, re-exporting the sub-modules so callers' import paths can stay valid.
- **Reuse opportunity:** `deriveValidationStatus`, `rtmCoverageOf`,
  `computeReadiness`, `canManageSystemLinks` are pure and currently private —
  promote to `src/lib/csv-validation/` so the CSV/CSA UI panels can import the
  same logic instead of re-deriving it.
- **Risk:** High — server-action module; even with a re-export barrel, this is the
  surface other code imports from. Must verify every import + `revalidatePath`.
- **Effort:** L — large mechanical move, careful import/transaction verification.

### src/modules/admin/CustomerAccountsPage.tsx

- **Size:** ~1,140 lines of code (1,661 raw); main component has **12 useState**.
- **Current responsibilities:** tenant list/search UI · a ~550-line create/edit
  drawer (`AccountDrawer`) · subscription-plans modal · password-strength
  evaluation · tenant API orchestration (`handleSave` is ~140 lines) · error-code
  mapping.
- **Why it's a split candidate:** `AccountDrawer` (~550 lines) and
  `SubscriptionPlansModal` are complete dialogs living inside the page; the
  page-level state (12 useState) is mostly *their* state leaking upward.
- **Proposed split:**
  - `src/modules/admin/AccountDrawer.tsx`: the create/edit form drawer + its password-strength meter + logo upload.
  - `src/modules/admin/SubscriptionPlansModal.tsx`: already a distinct exported modal — move to its own file.
  - `src/lib/tenant/tenantErrorMessages.ts`: `mapCustomerError` + `friendlyError` (pure code→message maps).
  - `src/types/tenant.ts`: `AccountFormData`, `SubPlan` (shared form/data shapes).
  - Original page keeps: the list/table, search, and the drawer/modal mount points.
- **Reuse opportunity:** `tenantErrorMessages` is usable anywhere the
  `tenants.ts` actions are called; `AccountFormData`/`SubPlan` types are
  currently re-described ad hoc.
- **Risk:** Medium — imports across admin module; no server-action change.
- **Effort:** M — drawer extraction + lifting its state behind a clean props contract.

### src/actions/fda483.ts

- **Size:** ~1,551 lines of code; 20 server actions + 2 helpers.
- **Current responsibilities:** event CRUD · observations + status flow ·
  commitments + completion evidence · response drafting + signed submission ·
  response documents · CAPA-raise pipeline — **6 clusters.**
- **Why it's a split candidate:** observations, commitments, and response
  handling are independent sub-domains. The five `$transaction` blocks
  (`addObservation`, `addCommitment`, `signSubmitFDA483Response`,
  `updateObservation`+CAPA-invalidation, `completeCommitment`) are each
  self-contained and move whole.
- **Proposed split** (mirror `src/actions/capas/`):
  - `src/actions/fda483/observations.ts`: `addObservation`, `updateObservation`, `markObservationResponseDrafted`, `closeObservation`, `deleteObservation`, `linkCAPAToEvent`.
  - `src/actions/fda483/commitments.ts`: `addCommitment`, `updateCommitment`, `deleteCommitment`, `completeCommitment`, `reopenCommitment` + `findOwnedCommitment`.
  - `src/actions/fda483/response.ts`: `saveResponseDraft`, `saveAGIDraft`, `signSubmitFDA483Response` (the signed `$transaction` moves intact), `addResponseDocument`, `removeResponseDocument`.
  - `src/actions/fda483/capa-linkage.ts`: `raiseCAPAFromObservation`.
  - Original `fda483.ts` keeps: event CRUD + `deriveAgencyServer`, re-exporting the rest.
- **Reuse opportunity:** `deriveAgencyServer` (eventType→agency) is also needed
  in the FDA-483 read/query layer; promote to `src/lib/fda483/agency.ts`.
- **Risk:** High — server-action surface + cross-module `revalidatePath("/capa")`.
- **Effort:** L.

### src/modules/ai-capa/AiCapaPage.tsx

- **Size:** ~920 lines of code (1,380 raw); 9 useState + a ~80-line `refresh()`.
- **Current responsibilities:** AI-backend orchestration (6 parallel fetches) ·
  six stage *view* components · six stage *modal* components · a dozen record
  extraction helpers · risk/tone derivations.
- **Why it's a split candidate:** ~12 sub-components and ~15 pure helpers are
  inlined; the views and modals are independent per CAPA stage.
- **Proposed split:**
  - `src/modules/ai-capa/views/` — one file per stage view (`RcaView`, `ActionPlanView`, `MonitoringView`, `EffectivenessView`, `ClosureView`) + the shared `StageCard`/`Section`/`CopyableId` presentationals.
  - `src/modules/ai-capa/modals/` — one file per stage modal (`RcaModal`, `ActionPlanModal`, `MonitoringModal`, `EffectivenessModal`, `ClosureModal`) + `ModalShell`.
  - `src/lib/ai-capa/recordExtraction.ts`: `extractRecord`, `firstRecord`, `recordIdFrom`, `planActions`, `rcaId`/`planId`/`effectivenessId`, `asString`/`asArray` (pure backend-record coercers).
  - Original page keeps: the `refresh()` data orchestration + layout shell.
- **Reuse opportunity:** the record-extraction helpers are equally needed by
  `AiCapaIndex.tsx` and `AiToolsPage.tsx`, which both parse the same backend
  record shapes.
- **Risk:** Medium — module-local; backend calls unchanged.
- **Effort:** L — many small extractions.

### src/modules/readiness/ReadinessPage.tsx

- **Size:** ~940 lines of code (1,193 raw); **32+ useState** — the most
  fragmented component in the app.
- **Current responsibilities:** inspection selector + create/complete flows ·
  ~120 lines of *static* governance UI (RACI/flow/team tables) · readiness-score
  derivation · simulation completion with training auto-tick · 6 stacked modals ·
  two inline Zod schemas (`cardSchema`, `simSchema`).
- **Why it's a split candidate:** a third of the file is hardcoded governance
  display data; the modals and the inspection-lifecycle state are separable from
  the tab shell.
- **Proposed split:**
  - `src/modules/readiness/governance/governanceModel.ts`: the static `FLOW_STEPS`, `RACI_DATA`, team-card data (currently inline constants).
  - `src/modules/readiness/governance/GovernanceTab.tsx`: the presentational governance section + `CollapsibleSection`.
  - `src/modules/readiness/modals/` — `CreateInspectionModal`, `CompleteInspectionModal`, `CompleteSimulationModal`, `AddCardModal`, `AddSimulationModal`.
  - `src/lib/readiness/adaptInspection.ts`: the Prisma→Redux `adaptInspection` mapper + `PrismaInspectionWithRelations` type.
  - `src/lib/schemas/readiness.ts`: `cardSchema`, `simSchema` (Zod).
  - Original page keeps: tab routing + the active-inspection orchestration.
- **Reuse opportunity:** `adaptInspection` is also used implicitly by the
  readiness sub-tabs; the Zod schemas mirror the `inspections.ts` action inputs.
- **Risk:** Medium.
- **Effort:** L — high useState count means careful state-ownership push-down.

### src/modules/fda-483/FDA483Page.tsx

- **Size:** ~1,050 lines of code (1,103 raw); main component has **21 useState**.
- **Current responsibilities:** Prisma event/CAPA hydration into Redux · list +
  detail tabbed views · 4 filters · RCA buffer state threaded into
  `InvestigationTab` · sign-submit credential flow · `computeReadiness` +
  `adaptEvent` derivations · inline `EventHeader`.
- **Why it's a split candidate:** the 21 useState mix four unrelated concerns
  (filters, modal open-state, RCA buffers, sign credentials). The RCA buffers
  in particular are threaded down to `InvestigationTab` and (per a prior recon
  note) belong in that tab's local state.
- **Proposed split:**
  - `src/modules/fda-483/EventHeader.tsx`: the inline identity card (~99 lines).
  - `src/lib/fda483/computeReadiness.ts`: `computeReadiness` + `adaptEvent` + `PrismaEventWithRelations` (pure derivations, currently exported from the page).
  - `src/modules/fda-483/useFda483Filters.ts`: the 4-filter state + `filteredEvents` memo as a hook.
  - Original page keeps: data hydration + tab orchestration; RCA buffers ideally migrate into `InvestigationTab` (separate behavior-neutral refactor).
- **Reuse opportunity:** `computeReadiness`/`adaptEvent` are imported by the
  FDA-483 query layer and `OverviewTab`; a lib home removes the page as an
  awkward import source.
- **Risk:** Medium (High if RCA-buffer migration is attempted — defer that).
- **Effort:** M for the pure extractions; L if buffers are migrated.

### src/modules/capa/tabs/sections/DiscussionSection.tsx

- **Size:** ~645 lines of code (914 raw); **14 useState** + a **350-line
  `renderNode()`** recursive function.
- **Current responsibilities:** threaded comment tree rendering · 6 mutation
  handlers (post/reply/edit/resolve/reopen/delete) · permission derivations ·
  4 confirmation modals · a note-history modal.
- **Why it's a split candidate:** `renderNode` alone is 350 lines spanning
  permission checks, edit/deleted/body ternaries, action buttons, reply form,
  and recursion — a component pretending to be a function. The 14 useState are
  three modal sub-states plus the comment buffers.
- **Proposed split:**
  - `src/modules/capa/tabs/sections/discussion/CommentNode.tsx`: the per-node renderer (body, resolution info, recursion) as a real component.
  - `src/modules/capa/tabs/sections/discussion/CommentActions.tsx`: the action-button row (reply/edit/resolve/reopen/delete).
  - `src/modules/capa/tabs/sections/discussion/CommentModals.tsx`: the resolve/reopen/delete + note-history modals.
  - `src/modules/capa/tabs/sections/discussion/useCommentMutations.ts`: the 6 mutation handlers + their busy/error state.
  - Original keeps: load + tree assembly (`buildCommentTree` already lives in `../utils/commentTree`).
- **Reuse opportunity:** `useCommentMutations` is the template other comment
  surfaces could adopt; `CommentNode` makes the recursion testable.
- **Risk:** Medium — same-module; the audit-logged mutations stay in their handlers untouched.
- **Effort:** L.

### src/modules/csv-csa/detail/ValidationPanel.tsx

- **Size:** ~745 lines of code (850 raw); **13+ useState**; each stage card is ~200 lines of JSX.
- **Current responsibilities:** dual-track progress calc · 9 stage actions wired
  in · per-stage card rendering (upload/notes/QA-review/skip) · stage
  variant/label/glyph/color helpers · file-size formatting · 4 modals.
- **Why it's a split candidate:** the per-stage card is duplicated structurally
  across stages and carries its own upload/notes/review state; the stage-styling
  helpers are pure config.
- **Proposed split:**
  - `src/modules/csv-csa/detail/StageCard.tsx`: one stage card (submit/approve/reject/skip/upload/notes) as a component taking a stage + callbacks.
  - `src/lib/csv-validation/stagePresentation.ts`: `stageVariant`, `stageLabel`, `stageGlyph`, `stageBorderColor`, `getStages`, `formatFileSize`.
  - `src/modules/csv-csa/detail/validationModals.tsx`: Approve/Reject/Skip/Delete confirmation modals.
  - Original keeps: the dual-track progress header + stage map + status-attestation section.
- **Reuse opportunity:** `stagePresentation` is also used by
  `SignOffTab.tsx`/`SystemRTMTab.tsx` which re-derive stage colors.
- **Risk:** Medium.
- **Effort:** M–L.

### src/modules/capa/tabs/EvidenceCollectionPanel.tsx

- **Size:** ~745 lines of code (964 raw); 4 useState; 5 inline sub-components.
- **Current responsibilities:** evidence accordion · per-item card with
  note-debounce + status transitions (`EvidenceCard`, ~260 lines) · file
  upload/download/delete with drag-drop (`FileList`, ~150 lines) · 3 modals
  (remove-file, note-history, NA-reason) · label/icon maps · `formatSize`.
- **Why it's a split candidate:** two large sub-components (`EvidenceCard`,
  `FileList`) and three modals are inlined; the label maps are config.
- **Proposed split:**
  - `src/modules/capa/components/evidence/EvidenceCard.tsx`
  - `src/modules/capa/components/evidence/FileList.tsx` + `RemoveFileModal`
  - `src/modules/capa/components/evidence/NoteHistoryModal.tsx`, `NAReasonModal.tsx`
  - `src/lib/format/fileSize.ts`: `formatSize` (shared — see Cross-cutting).
  - `src/modules/capa/components/evidence/evidenceLabels.ts`: CATEGORY/STATUS label + icon maps.
  - Original keeps: the panel shell + load/refresh.
- **Reuse opportunity:** `FileList` is a generic Part-11 file widget reusable in
  FDA-483 documents and CSV stage documents; `formatSize` is duplicated app-wide.
- **Risk:** Medium — the file mutations are audit-logged via server actions that stay put.
- **Effort:** M–L.

### src/modules/evidence/EvidencePage.tsx

- **Size:** ~983 lines of code; 7 useState; one ~185-line aggregation function.
- **Current responsibilities:** cross-module document aggregation
  (`getAllDocuments`, lines 197–380 — findings + deviations + FDA-483 + CAPA
  evidence + uploaded docs) · a ~200-line inline HTML export template
  (`exportPack`) · library grid/list UI · filters · selection bar · `docSchema`.
- **Why it's a split candidate:** `getAllDocuments` is business logic that has no
  reason to live in a component, and `exportPack` is a string-templating concern.
- **Proposed split:**
  - `src/lib/evidence/aggregateDocuments.ts`: `getAllDocuments` + `adaptPrismaDoc` + the `EvidenceDocument` type.
  - `src/lib/evidence/exportPackHtml.ts`: `exportPack`'s HTML builder (data-in → HTML-string-out, pure; the download + `auditLog` call stay in the component so the audit path is unchanged).
  - `src/lib/schemas/document.ts`: `docSchema` (Zod).
  - Original keeps: UI, filters, selection, and the audit-logged export trigger.
- **Reuse opportunity:** `aggregateDocuments` is the same join the Dashboard and
  governance reports need; centralizing prevents drift.
- **Risk:** Medium — **do not move the `auditLog` call**, only the HTML builder.
- **Effort:** M.

### src/modules/capa/tabs/sections/ActionItemsSection.tsx

- **Size:** ~575 lines of code (780 raw); **9 useState**; ~175-line table rows.
- **Current responsibilities:** action-item table with inline-edit rows · 6
  mutation handlers · add form · status + delete modals · status maps ·
  `overdueDays`.
- **Why it's a split candidate:** the inline-edit row is a component's worth of
  JSX repeated per row, and the add/edit/status/delete state is separable.
- **Proposed split:**
  - `src/modules/capa/tabs/sections/action-items/ActionItemRow.tsx`: the view/edit row.
  - `src/modules/capa/tabs/sections/action-items/useActionItemMutations.ts`: add/edit/status/delete/reorder handlers + their state.
  - `src/lib/capa/actionItemStatus.ts`: `STATUS_LABEL`/`STATUS_VARIANT` + `overdueDays`.
  - Original keeps: the table shell + load.
- **Reuse opportunity:** the status maps duplicate patterns already partly in
  `src/constants/statusTaxonomy.ts` — consolidate there.
- **Risk:** Medium.
- **Effort:** M.

### src/modules/deviation/DeviationPage.tsx

- **Size:** ~712 lines of code; **13+ useState**; 6 inline async handlers.
- **Current responsibilities:** deviation list/detail/table · close + reject +
  submit + start-investigation flows (incl. Part 11 password closure) · filters ·
  `severityToRisk` derivation · identity display wrappers.
- **Why it's a split candidate:** the action handlers and the close-credential
  state are separable from the list/detail rendering; filters are reusable.
- **Proposed split:**
  - `src/modules/deviation/useDeviationActions.ts`: the create/close/reject/submit/start handlers + close-modal credential state (**the `closeDeviationAction` call and its audit path stay inside the handler — only the wiring moves**).
  - `src/lib/deviation/severityToRisk.ts`: the pure severity→risk map.
  - Original keeps: list, detail modal, filters (or a small `useDeviationFilters` hook).
- **Reuse opportunity:** `severityToRisk` mirrors logic in CAPA risk scoring.
- **Risk:** Medium.
- **Effort:** M.

### src/modules/deviation/DeviationInvestigation.tsx

- **Size:** ~527 lines of code (712 raw); two exported sections, each with >3 useState.
- **Current responsibilities:** RCA capture UI (`InvestigationSection`) ·
  CAPA-decision SoD UI (`CapaDecisionSection`) · RCA buffer
  serialize/parse/validate (`parseBuffers`, `buildPayload`, `canComplete`) ·
  saved-RCA display (`SavedDeviationRcaDisplay`).
- **Why it's a split candidate:** the buffer serialization is pure logic mixed
  into a UI file, and the saved-RCA renderer duplicates the FDA-483 one.
- **Proposed split:**
  - `src/lib/rca/serializeRcaBuffers.ts`: `emptyBuffers`, `parseBuffers`, `buildPayload`, `canComplete`, `RcaBuffers` type (pure, testable).
  - `src/modules/shared/rca/SavedRcaDisplay.tsx`: shared with FDA-483 (see InvestigationTab finding).
  - Original keeps: `InvestigationSection` + `CapaDecisionSection` UI.
- **Reuse opportunity:** **both** the serializer and the display are shared with
  `src/modules/fda-483/tabs/InvestigationTab.tsx` — this is the highest-value
  cross-module dedup of RCA logic.
- **Risk:** Low for the serializer (pure); Medium for the shared display component.
- **Effort:** M.

### src/components/chatbot/AIChatbot.tsx

- **Size:** ~820 lines of code (1,070 raw); 10 useState + 10 useRef + 5 useEffect;
  a **~200-line `startRecording()`**.
- **Current responsibilities:** floating draggable chat bubble · text chat ·
  voice recording with a full WebAudio graph (RNNoise worklet, wet/dry mix,
  VU-meter analyser) · STT/round-trip voice · settings drawer · `VoiceMeter`.
- **Why it's a split candidate:** the audio-engineering concern (graph setup,
  teardown, analyser loop) is wholly separable from the chat UI, and the drag
  helpers are pure.
- **Proposed split:**
  - `src/lib/audio/voiceRecorder.ts`: `startRecording`'s audio-graph setup + `teardownRecording` + the analyser tick, exposed as a small controller (no React).
  - `src/lib/chatbot/panelPosition.ts`: `loadPosition`/`savePosition`/`clampToViewport`/`loadSuppressionLevel` + `Position` type.
  - `src/components/chatbot/VoiceMeter.tsx`: the VU-meter sub-component.
  - Original keeps: the chat panel UI + message state + the recorder controller wiring.
- **Reuse opportunity:** the recorder controller is reusable by any future
  voice-input surface; position helpers by any draggable widget.
- **Risk:** Medium — audio lifecycle is timing-sensitive; behavior must be verified by hand.
- **Effort:** L.

---

### Audited but deliberately NOT split

- **`src/lib/signing.ts` (498 LOC)** — the Part 11 e-signature pipeline: 14
  canonicalization builders + `computeContentHash` + `createSignedRecord`. The
  canonical JSON format is bonded to historical signature verifiability (the
  file's own comments warn that changing it invalidates past signatures).
  **Splitting is explicitly out of bounds per the audit rules.** It reads as
  large but is one cohesive responsibility. Leave intact.
- **`src/lib/aiBackend.ts` (406 LOC)** — a façade client over the FastAPI
  backend; a domain split (`capa.ts`/`rca.ts`/…) is *possible* but the shared
  generic `request()` helper makes it low-value and slightly risky. Not flagged.
- **The signed-transaction action cores** in `change-control.ts`,
  `deviations.ts`, and `capas/lifecycle.ts` — these files are large, but their
  `$transaction` blocks (signed CC transitions, deviation closure, CAPA
  creation+link atomicity) and tightly-coupled SoD chains must stay together.
  Only their *read-only loaders* are safely separable (see below), so I did not
  flag the whole files.
  - **`change-control.ts`** minor-opportunity: move the 6 `load*` read functions
    to `src/actions/change-control/loaders.ts` and link/unlink to
    `…/links.ts`. Low value, Low risk, S — listed for completeness only.

---

## Recommended order

Ranked by ROI — line reduction (and dedup value) per minute of work, lowest risk first.

| # | Split | Why first | Risk | Effort |
|---|---|---|---|---|
| 1 | **Cross-cutting: extract `ActionResult<T>`** → `src/types/action-result.ts` | 10+ identical inline copies deleted; unblocks the action-file splits | Med | S |
| 2 | **Cross-cutting: `formatSize`/`formatFileSize`/`formatDuration`** → `src/lib/format/` | 3+ dupes; pure; zero behavior risk | Low | S |
| 3 | **Cross-cutting: reference-retry loop** → `src/lib/reference/withReferenceRetry.ts` | repeated in 6 create-actions; pure wrapper (stays inside each `$transaction`) | Med | M |
| 4 | **RCA serializer + SavedRcaDisplay** (DeviationInvestigation + InvestigationTab) | dedups the single most-copied domain logic across two modules | Low/Med | M |
| 5 | **ReadinessPage** governance constants + Zod + `adaptInspection` | ~500 lines leave a 32-useState file for near-zero risk (mostly static data) | Med | M |
| 6 | **EvidencePage** `aggregateDocuments` + `exportPackHtml` | big pure-logic extraction; keeps audit call in place | Med | M |
| 7 | **InvestigationTab** five sub-components | largest file in app; biggest absolute reduction | Med | L |
| 8 | **CustomerAccountsPage** AccountDrawer + error maps | removes ~700 lines + 12-useState pressure | Med | M |
| 9 | **DiscussionSection** CommentNode/Actions/Modals + mutations hook | tames the 350-line renderNode | Med | L |
| 10 | **AiCapaPage** views/modals/extraction | many small, mechanical extractions | Med | L |
| 11 | **ValidationPanel** StageCard + stagePresentation | reusable by other CSV panels | Med | M–L |
| 12 | **systems.ts** sub-folder split | highest reduction but highest risk (action surface) — do after the pattern is proven on `fda483.ts` | High | L |
| 13 | **fda483.ts** sub-folder split | same pattern; do alongside #12 | High | L |
| 14–16 | EvidenceCollectionPanel, ActionItemsSection, DeviationPage, FDA483Page, AIChatbot | solid but lower absolute ROI | Med | M–L |

> Do items 1–3 (cross-cutting) **before** the per-file action splits — the
> action-file extractions all depend on a shared `ActionResult` and a shared
> reference helper, so landing those first makes 12–13 mechanical.

---

## Cross-cutting opportunities

1. **`ActionResult<T>` is re-declared inline in 10+ action files**
   (`systems.ts:20`, `fda483.ts:21`, `change-control.ts:46`, `deviations.ts:26`,
   `findings.ts`, and every file under `src/actions/capas/`). All are the same
   `{success:true;data} | {success:false;error;fieldErrors?}` union. **Extract to
   `src/types/action-result.ts`** and import. One definition, ~10 deletions.
   *(Risk Med because it is a shared type used in action signatures, but the type
   is byte-identical everywhere — import-only, no signature change.)*

2. **Reference-generation retry-on-`P2002` loop is copy-pasted in 6 create
   actions** (`createSystem`, `createDeviation`, `createCAPA`, `createFinding`,
   `createChangeControl`, plus `addObservation`/`addCommitment`). Same
   `for (attempt…) { try {$transaction…} catch(isReferenceConflict) }` shape.
   **Extract `withReferenceRetry(prefix, fn)` to `src/lib/reference/`** — the
   callback still runs the existing `$transaction`, so atomicity is unchanged.

3. **File-size + duration formatters duplicated** — `formatSize`
   (`EvidenceCollectionPanel`), `formatFileSize` (`ValidationPanel`),
   `formatDuration` (`AIChatbot`), plus a `truncate` in both `InvestigationTab`
   and `ObservationsListTab`. **Consolidate into `src/lib/format/fileSize.ts`,
   `…/duration.ts`, `src/lib/text/truncate.ts`.** Pure, Low risk.

4. **RCA 5-Why/Fishbone parse + render duplicated across modules** —
   `SavedRcaDisplay` (FDA-483) and `SavedDeviationRcaDisplay` (Deviation) parse
   the same serialized format; `parseBuffers`/`buildPayload` exist on the
   deviation side only. **Extract `src/lib/rca/` (serialize + parse) and a shared
   `SavedRcaDisplay` component.** Highest-value domain dedup.

5. **Status badge variant/label maps re-declared per module** —
   `STATUS_VARIANT`/`STATUS_LABEL` in `ActionItemsSection`, `ValidationPanel`,
   `DeviationPage.constants`, etc., while `src/constants/statusTaxonomy.ts`
   already centralizes most taxonomies. **Route the stragglers through
   `statusTaxonomy.ts`** so badge colors can't drift between surfaces.

6. **Inline Zod form schemas that mirror server-action schemas** —
   `cardSchema`/`simSchema` (ReadinessPage), `docSchema` (EvidencePage),
   `formSchema` (EffectivenessCriteriaPanel), `aiCapaSchema` (AIGenerateCAPAModal)
   each restate a shape the corresponding action also validates. **Move shared
   ones to `src/lib/schemas/<feature>.ts`** so client and server validate against
   one source. *(Where the client schema is a strict subset, keep that nuance —
   don't force-share if shapes legitimately differ.)*

7. **Schema model bloat (informational):** `CAPA` is **169 lines / ~55 fields**
   (`schema.prisma:198–366`), followed by `Deviation` (98) and `GxPSystem` (75).
   These are wide because the domain is wide; **splitting a Prisma model is High
   risk (relations + migration + Part 11 history) and is *not* recommended as a
   code-splitting action.** Flagged only to satisfy the model-bloat check — the
   realistic lever is grouping CAPA's optional sub-records (already done via
   `CAPAActionItem`/`CAPAApproval`/`CAPAComment`/`CAPAEffectivenessCriterion`),
   not narrowing the core row.

---

*Audit only. No code, schema, or migration changes were made; nothing committed
beyond this document's branch.*
