# USER_GUIDE.md — confirmation pass

Read-only verification of the 10 `[NEEDS CONFIRMATION]` items at the
end of [USER_GUIDE.md](USER_GUIDE.md), plus one bonus item flagged
in §6 of the guide. No application code modified; this is the verification
ledger.

## Verification table

| # | Item (short) | State | Evidence (file:line) | Corrected wording (if needed) |
|---|---|---|---|---|
| 1 | "Raise CAPA immediately" checkbox in Gap Assessment | **WORKS** | Checkbox bound at [AddFindingModal.tsx:34,230](../src/modules/gap-assessment/modals/AddFindingModal.tsx). Page handler reads it and chains a real CAPA create at [GapPage.tsx:286-310](../src/modules/gap-assessment/GapPage.tsx) → `handleRaiseCapa(adaptFinding(created))` (CAPA reference returned, popup shown). | None — guide is accurate. |
| 2 | "Raise CAPA immediately" checkbox in Deviation | **WORKS** | Checkbox bound at [DeviationPage.tsx:104,537-540](../src/modules/deviation/DeviationPage.tsx). On submit, [DeviationPage.tsx:207-218](../src/modules/deviation/DeviationPage.tsx) calls `createCAPAAction({source: "Deviation", linkedDeviationId: created.id, ...})`; on success appends `" + CAPA raised"` to the toast. | None — guide is accurate. |
| 3 | Evidence Pack HTML export | **WORKS** | `exportPack(pack)` at [EvidencePage.tsx:388-436](../src/modules/evidence/EvidencePage.tsx) — builds full HTML (header, meta cards, table, Part 11 footer), creates a `Blob`, programmatically clicks an `<a download>`, then writes `EVIDENCE_PACK_EXPORTED` to the audit log. Real download. | None — guide is accurate. |
| 4 | FDA 483 "Generate AI draft" | **PARTIAL — no AI involved** | [FDA483Page.tsx:672-693](../src/modules/fda-483/FDA483Page.tsx). The handler builds a hardcoded template via string concatenation: `\`REGULATORY RESPONSE — ${ref}\\n\\nDear ${agency},\\n\\nWe have received and reviewed the ${type} dated ${date}…\``, then saves via `saveAGIDraftServer`. **Zero LLM/ML calls; pure templating.** | Reword the guide's parenthetical: *"the 'Generate AI draft' button currently inserts a hardcoded boilerplate response template (date, agency, observation list, linked CAPAs) into the editor — it does no AI generation. The label is misleading; treat it as 'Insert template'."* |
| 5 | DIL Status / Pack Builder tabs | **BROKEN/STUB** | [EvidencePage.tsx:32](../src/modules/evidence/EvidencePage.tsx) imports `DocumentLibraryTab` ONLY. `DILStatusTab.tsx` and `PackBuilderTab.tsx` exist as files but are not imported or rendered anywhere. The pack-export functionality from PackBuilderTab is reimplemented inline at [EvidencePage.tsx:388-436](../src/modules/evidence/EvidencePage.tsx) and triggered by an inline "Export Pack" button at [EvidencePage.tsx:684](../src/modules/evidence/EvidencePage.tsx). | Reword §3.6 of the guide: *"Evidence & Documents is a single-page library. There are no separate tabs — the document grid is the page. Pack creation works inline: select rows via checkboxes → a floating bar at the bottom appears → name the pack and click Export Pack to download an HTML bundle."* (The current `(Internal tabs exist… not user-visible)` parenthetical is correct but understated — the orphan files should be flagged as dead code, not as "internal aggregation tools".) |
| 6 | Document Upload in Deviation / FDA 483 detail panels | **PARTIAL — split behaviour** | **FDA 483 — works:** [ResponseTab.tsx:360-378](../src/modules/fda-483/tabs/ResponseTab.tsx) `<DocumentUpload onUpload={async (doc) => { await addResponseDocument(...) }} />` calls a real server action [fda483.ts:608](../src/actions/fda483.ts) which writes to `prisma.fda483Document`. Files survive page refresh and are visible to other users. **Deviation — broken:** [DeviationPage.tsx:459-464](../src/modules/deviation/DeviationPage.tsx) `<DocumentUpload onUpload={(doc) => dispatch(addDeviationDocument(...))} />` dispatches a Redux-only reducer at [deviation.slice.ts:92](../src/store/deviation.slice.ts). There is **no `addDeviationDocument` server action** in [src/actions/deviations.ts](../src/actions/deviations.ts). The `deviation` slice is excluded from the localStorage persistence list, so the upload is lost on page refresh; it never persists to the database; other users never see it. | Reword §3.5 of the guide to add: *"**Document upload from the deviation detail panel does not currently persist** — files attached here live in browser memory only and disappear on page refresh. Use the Evidence & Documents library or a CAPA's Evidence tab if you need an audit-trail-grade attachment."* |
| 7 | Settings → Frameworks dropdown filter | **WORKS** | [GapPage.tsx:135,140-143](../src/modules/gap-assessment/GapPage.tsx) computes `activeFrameworks = Object.keys(frameworks).filter(k => frameworks[k])` from `s.settings.frameworks`. Passed to [AddFindingModal.tsx:55,131-134](../src/modules/gap-assessment/modals/AddFindingModal.tsx) as `activeFrameworks` prop and rendered as `activeFrameworks.map(...)` for the dropdown options. Toggling a framework OFF in Settings removes it from the dropdown. | None — guide is accurate. |
| 8 | Closure auto-closes linked Finding + FDA observation | **PARTIAL — Finding yes, FDA observation no** | [capas.ts:342-347](../src/actions/capas.ts) — `if (capa.findingId) { await prisma.finding.update({..., data: { status: "Closed" }}) }`. ✓ Finding closes. **No FDA observation closure code exists in `signAndCloseCAPA`.** The CAPA model has no FDA-observation FK; observations link to CAPA via `FDA483Observation.capaId`, but the closure path doesn't query in that direction. Searched the action — no `prisma.fda483Observation` mutation anywhere in `signAndCloseCAPA`. | Reword §4.5 "What happens next": replace *"linked finding auto-closes too (if from 483), and linked FDA observation is auto-closed too"* with *"if the CAPA was raised from a Gap Assessment finding, that finding is auto-closed. **Linked FDA 483 observations are NOT auto-closed today** — close them manually on the FDA 483 events page if needed."* |
| 9 | Effectiveness check toggle conditional render | **WORKS** | [SignCloseModal.tsx:47-51](../src/modules/capa/modals/SignCloseModal.tsx) — `{capa.effectivenessCheck && (<Toggle ...>)}`. The toggle is hidden when the CAPA's `effectivenessCheck` is `false`. The submit button at L54 also only requires the toggle when `capa.effectivenessCheck` is true. | None — guide is accurate. |
| 10 | Pending categories in Evidence tab collapse by default | **BROKEN/STUB** | [EvidenceCollectionPanel.tsx:185-187](../src/modules/capa/tabs/EvidenceCollectionPanel.tsx) — `(items ?? []).map((item) => <EvidenceCard key={item.id} item={item} ... />)`. Every item renders a fully-expanded card. There is no `expanded`/`isOpen` state, no chevron, no collapse logic anywhere in the file. The collapse-by-default UX was a Step 4 design item in the CAPA modal redesign — Step 3 shipped (commit `d610901`), Steps 4-7 were explicitly deferred. | Reword §4.3 step 5: replace *"Click the card to expand it (Pending categories are collapsed by default)"* with *"All seven category cards render fully expanded by default — there is no collapse / expand affordance today. Scroll past categories that don't apply to your CAPA."* |
| **Bonus** | §6 claim "Closed CAPAs are still editable in some paths" | **UNDERSTATED — all paths** | [capas.ts:182-223 `updateCAPA`](../src/actions/capas.ts): no `status === "Closed"` check anywhere; updates any CAPA the tenant owns. [capas.ts:421-453 `deleteCAPA`](../src/actions/capas.ts): same — fetches the row, deletes it, no status check. There are NO server-side guards on Closed CAPAs at all. The gap report's H2 finding is correct as written; the user guide's "in some paths" softens it inaccurately. | Reword §6: replace *"Closed CAPAs are still editable in some paths. The system doesn't yet block all edits on a CAPA after it's been signed and closed."* with *"Closed CAPAs are still fully editable and deletable. There is no server-side guard on `updateCAPA` or `deleteCAPA` that checks status — a user with edit access can change or delete a signed-and-closed CAPA exactly as if it were Open. Don't treat closure as a lock until Phase 0 of CAPA_GAP_REPORT.md is implemented."* |

## Summary by state

| State | Count | Items |
|---|---|---|
| **WORKS** | 5 | 1, 2, 3, 7, 9 |
| **PARTIAL** | 3 | 4 (no AI), 6 (FDA works, Deviation doesn't persist), 8 (Finding closes, FDA observation doesn't) |
| **BROKEN/STUB** | 2 | 5 (orphan tab files), 10 (collapse never built) |
| **UNDERSTATED** | 1 | Bonus — H2 in §6 |

---

## Recommended guide updates

The exact `str_replace` edits below would bring [USER_GUIDE.md](USER_GUIDE.md)
in line with reality. Each edit corresponds to one item from the table.
Read the proposed wording, then apply via your edit tool of choice — I am
NOT applying these in this turn.

> **Apply order suggestion:** Item 5 first (it changes a section headline
> claim that the others reference), then bonus, then items 4, 6, 8, 10
> in any order. Items 1, 2, 3, 7, 9 require no edit — they're already
> accurate.

### Edit A — Item 5 — Evidence module tab structure (§3.6 + §6)

**Find this text in §3.6 of USER_GUIDE.md:**
```
Layout: a searchable grid of documents with filters across the top.
When you select documents using the row checkboxes, a floating bar
appears at the bottom letting you name and export the selection as
an HTML evidence pack.
```

**Replace with:**
```
Layout: a single page — there are no tabs. A searchable grid of documents
with filters across the top. When you select documents using the row
checkboxes, a floating bar appears at the bottom letting you name and
export the selection as an HTML evidence pack. (Files named
DILStatusTab.tsx and PackBuilderTab.tsx exist in the source but are not
imported or rendered — orphan code from an earlier design. Don't expect
to find tabs in this module.)
```

### Edit B — Item 10 — Evidence card collapse (§4.3 step 5)

**Find this text in §4.3 step 5:**
```
5. For each category you have evidence for:
   - Click the card to expand it (Pending categories are collapsed by default).
   - Set the **Status** dropdown (Pending → In Progress → Complete, or
```

**Replace with:**
```
5. All seven category cards render fully expanded by default — there is
   no collapse / expand affordance today. For each category you have
   evidence for:
   - Set the **Status** dropdown (Pending → In Progress → Complete, or
```

### Edit C — Item 4 — FDA 483 "AI draft" wording (§3.7 + §6)

**Find this text in §3.7 of USER_GUIDE.md:**
```
> **Heads-up:** the "Generate AI draft" button on the response page
> currently produces a template-based draft, **not** real AI-generated
> text — there is no live LLM behind it yet. See §6.
```

**Replace with:**
```
> **Heads-up:** the "Generate AI draft" button does not generate
> anything with AI. It inserts a hardcoded boilerplate response template
> (date, agency, observation list, linked CAPA descriptions) into the
> editor. The button label is misleading — treat it as "Insert
> template". See §6.
```

### Edit D — Item 6 — Deviation document upload not persisting (§3.5 + §6)

**Find this text in §3.5 (after the bullet list of deviation actions):**
```
What you can do:
- Click **Report Deviation** to log a new one (see §4.4).
- Filter by status, severity, category, or search by ID/title.
- From the detail panel: Start Investigation, Submit for QA Review,
  Sign & Close (QA Head only), Reject, Raise CAPA.
```

**Replace with:**
```
What you can do:
- Click **Report Deviation** to log a new one (see §4.4).
- Filter by status, severity, category, or search by ID/title.
- From the detail panel: Start Investigation, Submit for QA Review,
  Sign & Close (QA Head only), Reject, Raise CAPA.

> **Document upload limitation.** The detail panel has an "Attached
> documents" section that accepts file uploads, but **uploads from this
> panel do not persist to the database**. Files live in your browser's
> memory only and are lost on page reload, won't be visible to other
> users, and won't survive a deployment. If you need an audit-trail-grade
> attachment, upload via the Evidence & Documents page or via the
> Evidence tab inside a CAPA Detail modal instead. (FDA 483 response
> documents on the FDA 483 module *do* persist correctly — that's a
> separate code path.)
```

### Edit E — Item 8 — Closure side effects (§4.5 "What happens next")

**Find this text in §4.5 "What happens next":**
```
**What happens next:**
- The CAPA status flips to **Closed**.
- `closedAt` and `closedBy` are recorded on the CAPA.
- If the CAPA was linked to a finding, the finding auto-closes too.
- A success toast appears: *"CAPA closed. Signed and closed. Audit trail
  entry recorded."*
- The closure is logged in **Audit Trail** with action `CAPA_CLOSED`.
```

**Replace with:**
```
**What happens next:**
- The CAPA status flips to **Closed**.
- `closedAt` and `closedBy` are recorded on the CAPA.
- If the CAPA was linked to a Gap Assessment finding, the finding
  auto-closes too.
- **Linked FDA 483 observations are NOT auto-closed.** If you raised
  this CAPA from an FDA 483 observation, go to the FDA 483 events page
  and close the observation manually — closure does not propagate
  upstream today.
- A success toast appears: *"CAPA closed. Signed and closed. Audit trail
  entry recorded."*
- The closure is logged in **Audit Trail** with action `CAPA_CLOSED`.
```

### Edit F — Bonus — Closed CAPA editability (§6)

**Find this text in §6 of USER_GUIDE.md:**
```
- **Closed CAPAs are still editable in some paths.** The system doesn't
  yet block all edits on a CAPA after it's been signed and closed. Don't
  rely on closure as a hard lock until that's fixed.
```

**Replace with:**
```
- **Closed CAPAs are still fully editable and deletable.** There is no
  server-side guard on `Edit` or `Delete` actions that checks whether
  a CAPA is Closed. A user with edit access can change or delete a
  signed-and-closed CAPA exactly as if it were Open. Closure today is
  just a status flag, not a lock. The defensive fix is the first item
  in Phase 0 of CAPA_GAP_REPORT.md.
```

### Edit G — Add a "Coverage notes" entry retiring the resolved confirmations

**Find this text at the end of USER_GUIDE.md under "`[NEEDS CONFIRMATION]` items collected for follow-up":**
```
These ten items would each take a developer a few minutes to verify by
clicking through the live app. Resolving them lets this guide move from
"best-effort honest" to "verified per-build."
```

**Replace with:**
```
These ten items have been resolved in [USER_GUIDE_CONFIRMATIONS.md](USER_GUIDE_CONFIRMATIONS.md).
After applying the recommended edits in that document, this guide moves
from "best-effort honest" to "verified per-build" against current HEAD
(commit `40f5b76`).
```

---

## What's NOT proposed for change

For completeness — items 1, 2, 3, 7, and 9 in the user guide are
**verified accurate**. No edits required:

- §3.2 / §4.1 "Raise CAPA immediately" in Gap Assessment — works as written.
- §3.5 / §4.4 "Raise CAPA immediately" in Deviation — works as written.
- §3.6 / §5 Evidence Pack HTML export — works as written.
- §4.1 "common mistakes" Frameworks dropdown filter — works as written.
- §4.5 step 7 effectiveness toggle conditional — works as written.

If you'd like, I can also surface a separate doc/ticket for the **two
real bugs** the verification turned up (Deviation doc upload not
persisting; FDA observation not auto-closing on CAPA close) — both
are out of scope for the user guide but worth tracking as defects.

## Verification log

- 2026-05-03: confirmations resolved against commit `40f5b76` (`refactor: extract shared CAPA badge variants to src/lib/badgeVariants.ts`)
- 2026-05-03: edits A–G applied to USER_GUIDE.md on branch `docs/user-guide-verified` (commits `95c8fcf..f32e2e6`, plus stale-reference cleanup at `17bd9a1`)
- 2026-05-03: BUG-001 (`6397dec`), BUG-002 (`08c179f`), CHORE-001 (`996d0b1`) filed under `docs/issues/`
