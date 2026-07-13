# BUG-001 — Deviation document uploads do not persist

**Severity:** High
**Status:** Open
**Filed:** 2026-05-03
**Source:** Surfaced during the USER_GUIDE.md verification pass —
see [USER_GUIDE_CONFIRMATIONS.md](../USER_GUIDE_CONFIRMATIONS.md)
item 6.

## One-line summary

A deviation's "Attached documents" section accepts file uploads,
shows a green success toast confirming the attachment, and then
loses the file on the next page reload. The upload never reaches
the database. Other users never see it. False confidence — the UI
tells the user the upload succeeded.

## Reproduction steps

1. Sign in as a QA-relevant role (`qa@pharmaglimmora.com` /
   `Demo@123` works).
2. Open **Deviation Management** from the sidebar.
3. Click any existing deviation row — the detail panel opens.
4. Scroll to the "Attached documents" section.
5. Click **Attach document** → drop or select a file (any
   supported type, e.g. a small PDF) → click **Attach document**
   in the modal.
6. The success popup confirms the attachment; the document
   appears in the deviation's attached-documents list.
7. **Reload the page** (F5 / Ctrl+R).
8. Open the same deviation again — the attached-documents section
   is empty. The file is gone.

Verified against current `dev-evidence-feature` HEAD (commit `40f5b76`).

## Root cause

Two facts together cause the bug:

1. The Document Upload component in the deviation detail panel
   dispatches a Redux reducer instead of calling a server action.

   [src/modules/deviation/DeviationPage.tsx:459-464](../../src/modules/deviation/DeviationPage.tsx#L459-L464):
   ```
   <DocumentUpload ...
     onUpload={(doc) => dispatch(addDeviationDocument({ deviationId: selected.id, doc }))}
   />
   ```

   [src/store/deviation.slice.ts:92](../../src/store/deviation.slice.ts#L92): `addDeviationDocument` is a pure Redux
   reducer — it mutates client-side state only, no network call.

2. There is **no `addDeviationDocument` server action** in
   [src/actions/deviations.ts](../../src/actions/deviations.ts) — the file has CRUD for the
   deviation itself but nothing for attached documents.

   The `deviation` slice is also explicitly excluded from the
   localStorage persistence list in [src/store/persistence.ts](../../src/store/persistence.ts), so
   the in-memory document doesn't even survive a same-browser
   refresh — the page re-fetches deviations from the server (via
   the page's server-component data load) and the unsaved
   document is gone.

Compare this with FDA 483, which gets it right:
[src/modules/fda-483/tabs/ResponseTab.tsx:360-378](../../src/modules/fda-483/tabs/ResponseTab.tsx#L360-L378) —
`onUpload` calls the server action [addResponseDocument](../../src/actions/fda483.ts#L608)
which persists to `prisma.fda483Document`. Same component, two
wiring patterns; the deviation wiring is wrong.

## Affected users

Anyone uploading evidence on a deviation. The risk is regulatory:
a deviation is a quality event that must have a defensible
audit trail. A file the user believes is attached but isn't
defeats the trail.

## Suggested fix

Mirror the FDA 483 pattern:

1. **Schema** — add a `DeviationDocument` Prisma model alongside
   `FDA483Document` ([prisma/schema.prisma:252-264](../../prisma/schema.prisma#L252-L264) is the
   reference shape: `id, deviationId, fileName, fileUrl,
   fileType, fileSize, uploadedBy, createdAt`). Migration + `Deviation.documents` relation.
2. **Server action** — add `addDeviationDocument(input)` and
   `removeDeviationDocument(documentId)` to
   [src/actions/deviations.ts](../../src/actions/deviations.ts), following the shape of
   `addResponseDocument` / `removeResponseDocument` in
   [src/actions/fda483.ts:608](../../src/actions/fda483.ts#L608). Persist via Prisma, write
   audit-log entries with `action: "DEVIATION_DOCUMENT_ATTACHED"`
   / `_REMOVED`.
3. **Wire-up** — replace the Redux dispatch in
   [DeviationPage.tsx:459-464](../../src/modules/deviation/DeviationPage.tsx#L459-L464) with an `await` of the new server
   action. Surface the existing success/error toast from the
   action's return shape.
4. **Cleanup** — drop the unused `addDeviationDocument` /
   `removeDeviationDocument` reducers from
   [src/store/deviation.slice.ts](../../src/store/deviation.slice.ts) once nothing imports them.
5. **Test** — add a Vitest case (when the test framework lands
   per Phase 0) that calls `addDeviationDocument` and verifies
   the row appears in `prisma.deviationDocument` + the
   audit-log row.

## Workaround until fixed

Documented in [USER_GUIDE.md §3.5](../USER_GUIDE.md) (after the Edit D update on
this branch): use the **Evidence & Documents** library page or the
**Evidence** tab inside a CAPA Detail modal for any
attachment that needs to persist.

## Blocks

Not a Phase 0 (Defensive) blocker — Phase 0 is scoped to
Closed-CAPA immutability and the Part 11 e-signature record.
This bug should land in **Phase 1** alongside the Stage 6
implementation-tracking work, since both touch evidence handling
on related entities.

## Related

- USER_GUIDE_CONFIRMATIONS.md item 6
- FDA 483 reference implementation:
  [src/actions/fda483.ts:608](../../src/actions/fda483.ts#L608) (`addResponseDocument`)
- CAPA reference implementation (different shape — uses
  `EvidenceFile` model for ALCOA+ retention):
  [src/actions/evidence.ts:211](../../src/actions/evidence.ts#L211) (`addEvidenceFile`)
