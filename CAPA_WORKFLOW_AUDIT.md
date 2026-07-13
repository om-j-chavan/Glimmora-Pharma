# CAPA Workflow Audit

> Read-only audit of the CAPA workflow against the 7 spec items. No code was changed.
> Every claim is cited to `file:line`. Date: 2026-07-11.

## Data model foundation (read first — everything below depends on it)

Three distinct document stores exist; conflating them is the main source of confusion in this spec:

| Model | Location | Purpose |
|---|---|---|
| **`Document`** (generic) | `prisma/schema.prisma:1246-1303` | Source-module docs. Keyed by `linkedModule` + `linkedRecordId` (`:1257-1258`). Gap = `"Gap Assessment"`, Deviation = `"Deviation Management"`, Deviation task = `"Deviation Task"`. |
| **`EvidenceItem`** / **`EvidenceFile`** | `prisma/schema.prisma:1484-1521` / `:1545-1580` | The **real** CAPA-side evidence store. `EvidenceItem` is one row per (CAPA, category), `@@unique([capaId, category])` (`:1519`); `EvidenceFile` hangs off it with optional `actionItemId` (`:1570`). |
| **`CAPADocument`** | `prisma/schema.prisma:616-631` | **Legacy / effectively dead** — no `storageKey`/category; the Overview migration notice (`OverviewBody.tsx:81-102`) confirms uploads moved to `EvidenceFile`. |

**CAPA → source links:** `findingId String? @unique` (`schema.prisma:358`), `deviationId String? @unique` (`:485`), and a plain `source String` label with **no FK** (`:362`). **There is no `observationId` on CAPA** — the only 483↔CAPA tie is a reverse soft string `FDA483Observation.capaId` (`:904`) that isn't even a Prisma relation. FDA-483 docs live in separate tables (`FDA483Document` is event-scoped `:876-888`; `FDA483CommitmentDocument` `:952-964`) that the CAPA layer never queries.

---

## Item 1 — Read-only source documents & evidence links in Overview

**Current behavior — deviation only, and partial.**

- The `CAPAOriginDoc` type (`src/lib/queries/capas.ts:99-104`) and `getCAPADeviationDocs` query (`:109-144`) fetch `Document` rows for `"Deviation Management"` + `"Deviation Task"`, deliberately excluding docs already converted to evidence (`:131-137`).
- Populated **only** when `deviationId` is set (`app/(app)/capa/[id]/page.tsx:34`); rendered read-only at `src/modules/capa/modals/sections/OverviewBody.tsx:193-209`, gated on `capa.deviation && originDocs.length > 0`, with downloads to `/api/documents/[id]`.
- **Gap findings: no reference block exists.** There is no `getCAPAFindingDocs`. Instead, on raise, the finding's *categorized* docs are physically **copied** into evidence via `convertCategorizedDocsToEvidence` (`src/actions/capas/lifecycle.ts:696-710`); the comment at `:699-701` states "the CAPA UI has no 'raised from finding' doc list." Un-categorized gap docs are dropped entirely.
- **FDA-483: nothing.** No block, no query, no carryover — a 483-sourced CAPA shows only a header label (`src/modules/capa/CAPADetailPage.tsx:424-428`).

**Forced re-upload?** The submit-readiness gate requires all 7 evidence categories resolved (`src/lib/capa-readiness.ts:140-152`, `EVIDENCE_CATEGORY_COUNT = 7` at `:71`), server-enforced. Categorized deviation/gap docs auto-convert so they don't need re-upload — but un-categorized source docs, and **all** 483 docs, must be uploaded fresh into `src/modules/capa/tabs/EvidenceCollectionPanel.tsx`.

**What needs to change:**
- Gap docs read-only in Overview → add `getCAPAFindingDocs` (clone of the deviation query, `linkedModule: "Gap Assessment"`), populate in `page.tsx` when `findingId`, extend the render block. **Small.** No blocker — FK + rows already exist. Must dedupe against the gap→evidence copy.
- 483 docs → **Large / blocked**: needs a new schema link *and* a bespoke query over the 483 tables.

---

## Item 2 — Source info in Overview only, not in Actions

**Overview shows source info today:** source badge `OverviewBody.tsx:157-159`; finding ref + View link `:160-168`; deviation ref `:169-178`; **source owner vs CAPA driver shown distinctly** `:215-236` (gap owner read-only, plus CAPA owner). Header repeats the link `CAPADetailPage.tsx:424-428`.

**Actions does NOT inject the source owner.** `ActionItemsSection` renders only explicit `capa.actionItems`; items are created solely via `addActionItem` (`src/modules/capa/tabs/sections/ActionItemsSection.tsx:213`) with the assignee chosen from the dropdown. No path — here or in `createCAPA` — auto-adds the source owner.

**Verdict: already compliant. No change needed.** (Optional Small enhancement: Overview surfaces only the *gap* owner, not deviation/483 owner.)

---

## Item 3 — Action Plan expand/collapse

**The affordance does not exist.** Action items render as a flat `<table>` (`src/modules/capa/tabs/sections/ActionItemsSection.tsx:387`), all detail always visible. `ChevronDown` is imported but **unused and explicitly voided** as a placeholder (`:606-608`).

⚠️ **Do not remove the wrong control:** the `ArrowUp`/`ArrowDown` buttons at `:443-444` are **reorder** controls (`handleReorder`, `:295-311`), not expand/collapse. The only genuine expandable *cards* in the CAPA module are on the **Evidence** tab (`EvidenceCollectionPanel.tsx:134,309-310`), a different surface.

**What needs to change:** nothing functional (only optional dead-code cleanup of the `ChevronDown` import). **Small.** **Likely spec ambiguity** — the author may be looking at the Evidence tab, not the Action Plan. Confirm the intended surface before acting.

---

## Item 4 — "Assigned To" dropdown filtering

**Current:** `ownerOptions` (`src/modules/capa/tabs/sections/ActionItemsSection.tsx:182-188`) filters only `status === "Active"` and excludes `super_admin` + `viewer`. It **still includes `qa_head` (QA Head) and `customer_admin` (Customer Admin)** — the exact roles the spec wants gone. `users` comes unfiltered from `useTenantConfig()` (`:82`, hook at `src/hooks/useTenantConfig.ts:20-21`).

**No executor role-set exists.** `src/lib/permissions/roleSets.ts` has `COMPLIANCE_AUTHOR_ROLES` (includes both excluded roles, `:114-120`), `QA_AUTHORITY_ROLES` = `qa_head, super_admin` (`:207`), and `GAP_CREATE_ROLES`/`DEVIATION_CREATE_ROLES` (doer roles + qa_head, `:226-247`) — but **no `CAPA_EXECUTE_ROLES`**. The closest concept is `GAP_CREATE_ROLES` minus `qa_head`.

**Server does not validate the assignee's role at all.** `addActionItem` checks only the *actor* (`QA_AUTHORITY_ROLES`, `src/actions/capas/action-items.ts:173-175`); `ownerId` is written straight through (`:197-201`) with no role check. Same for `updateActionItem`. So a UI-only filter would be bypassable.

**What needs to change:** tighten the client filter, add a shared `CAPA_EXECUTE_ROLES` set in `roleSets.ts`, and add server-side assignee-role validation to preserve the "UI mirrors server" invariant. **Medium.** **Dependency:** product decision on the exact executor role list.

---

## Item 5 — Due-date past-date validation

**Neither side rejects past dates today.**

- **Server:** `AddActionItemSchema.dueDate` = `z.string().min(1)` (`src/actions/capas/action-items.ts:56`); `UpdateActionItemSchema` same, optional (`:63`). Stored verbatim as `new Date(...)` (`:197`, `:385`). No comparison to "now."
- **Client:** the `DatePicker` **supports a `min` prop** (`src/components/ui/DatePicker.tsx:30`, enforced `:78-81`) — but it is **never passed** in the Add (`ActionItemsSection.tsx:486`) or Edit (`:520`) modals. Validators check only emptiness (`:206-209`, `:249`).

**What needs to change:** pass `min={today}` to both DatePickers (component already supports it) + add a `.refine()` to both Zod schemas. **Small.** **Nuance:** due dates store UTC (`ActionItemsSection.tsx:217`) — align the server refinement to avoid a midnight off-by-one, and decide whether editing a legacy already-past item is blocked.

---

## Item 6 — Worklist detail: worker access to source-module docs

**How a worker sees a CAPA action:** the worklist normalizes assigned actions via `actionToWorkItem` (`src/modules/worklist/WorklistPage.tsx:60-67`); clicking opens `WorkItemModal` (`:260-267`) — the de-facto detail page.

**A read-only "Related documents" section already exists** (`src/modules/worklist/WorkItemModal.tsx:223-232`) rendering `item.relatedDocs` via a `readOnly` uploader — **but for CAPA items `relatedDocs` is hardcoded `[]`** (`src/modules/worklist/workItem.ts:153`). Only **deviation tasks** populate it (`:182`). At the query layer, the CAPA-action branch of `getWorklist` never loads source-record `Document`s (`src/lib/queries/worklist.ts:186-198`) — though the deviation-task (`:339-374`) and finding (`:438-461`) branches **already implement exactly this pattern**.

**Download route:** `GET /api/documents/[id]` authorizes on session + **tenant scope only** (`app/api/documents/[id]/route.ts:41-43`) — no module-linkage/assignment check. So surfacing the doc id is sufficient for a worker to download it (tenant-scoped).

**What needs to change:** in `getWorklist`, add `findingId`/`deviationId`/`source` to the CAPA select, batch-load the matching `Document` rows (mapper already exists), surface them and set `relatedDocs` in `actionToWorkItem`. The render component and download route need no change. **Medium.** No blocker.

---

## Item 7 — Evidence auto-appears from Worklist submissions

**Linkage is already automatic.** Worker upload calls `addEvidenceFile(evId, fd, a.id)` (fallback `addEvidenceFileToCategory`) (`src/modules/worklist/WorkItemModal.tsx:80-84`), writing an `EvidenceFile` on the *same* `EvidenceItem(capaId, category)` (`src/actions/evidence.ts:407-425`) that the CAPA panel reads via `getEvidenceForCAPA(capaId)` (`src/lib/queries/evidence.ts:91-145`). No missing linkage — the doc surfaces under its category with no manual step. The action also calls `revalidatePath("/capa/{id}")` (`src/actions/evidence.ts:447-448`).

**"Without a page refresh" is only partially met.** `EvidenceCollectionPanel` refetches client-side via `loadEvidenceForCAPA` in a mount `useEffect` (`src/modules/capa/tabs/EvidenceCollectionPanel.tsx:156-157,185-188`) — but only on mount or after *its own* mutations. There is **no polling / websocket / revalidateTag subscription**. A reviewer with the panel already open will **not** see a worker's out-of-band submission live; the file appears only when the panel next mounts. The worklist's `onChanged()` fires `router.refresh()` on the *worklist* page (`src/modules/worklist/WorklistPage.tsx:265`), not the CAPA panel.

**What needs to change:** data linkage — **nothing (already works)**. True live cross-user update — **Medium/Large**, requires adding a live-refresh mechanism (polling/SSE/websocket) the codebase does not currently have. Clarify whether the spec means "appears on next open" (already true) or "live in an open panel" (new infra).

---

## Files that will need to be touched (to implement all items)

| Item | Files |
|---|---|
| 1 (gap) | `src/lib/queries/capas.ts` (new query), `app/(app)/capa/[id]/page.tsx`, `src/modules/capa/modals/sections/OverviewBody.tsx` |
| 2 | none (already compliant) |
| 3 | `src/modules/capa/tabs/sections/ActionItemsSection.tsx` (optional cleanup only) — **confirm surface first** |
| 4 | `src/lib/permissions/roleSets.ts` (new set), `src/modules/capa/tabs/sections/ActionItemsSection.tsx`, `src/actions/capas/action-items.ts` |
| 5 | `src/modules/capa/tabs/sections/ActionItemsSection.tsx`, `src/actions/capas/action-items.ts` |
| 6 | `src/lib/queries/worklist.ts`, `src/modules/worklist/workItem.ts` (+ `WorklistActionItem` type) |
| 7 | none for linkage; live-refresh infra if required |

## Ambiguities to resolve before implementing

1. **Item 3** — no expand/collapse exists on Action Plan. Is the spec author actually looking at the **Evidence** tab's expandable cards? Confirm the intended surface.
2. **Item 4** — no canonical "CAPA executor" role-set exists. Need the exact eligible role list (proposed: `qa, qc_lab_director, regulatory_affairs, csv_val_lead, it_cdo, operations_head`).
3. **Item 1 (FDA-483)** — no CAPA→observation FK and 483 docs aren't in the generic `Document` table. Is 483 in scope? It's a Large schema+query change, unlike gap/deviation.
4. **Item 7** — "without a page refresh": next-open (works today) vs. live in an already-open panel (new infra)?
5. **Item 1 evidence gate** — should referenced source docs satisfy the 7-category readiness gate (`capa-readiness.ts:144`), or only physically-converted evidence?

## Suggested implementation order (by dependency & risk)

1. **Item 5** (past-date) — Small, isolated, no product decisions blocking the core.
2. **Item 4** (assignee filter) — needs the role-set decision, then client+server land together.
3. **Item 1 gap** (read-only gap docs) — Small, self-contained query+render, pattern already proven for deviation.
4. **Item 6** (worklist source docs) — Medium, reuses Item 1's gap/deviation doc-loading; benefits from doing Item 1 first.
5. **Item 3** — trivial, but gated on the surface-confirmation.
6. **Item 7 live-refresh** and **Item 1 FDA-483** — largest/most uncertain; defer pending clarification.

**Item 2 requires no work.** Nothing was modified — this is audit-only.
