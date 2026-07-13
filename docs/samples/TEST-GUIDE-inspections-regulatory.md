# Test Guide — "Inspections & Regulatory" module

Step-by-step manual test with copy-paste sample data. Covers the full lifecycle
**+ the new PDF Auto-Extraction feature**.

---

## 0. Prerequisites

**Run the app** (from `Glimmora-Pharma/`):
```bash
npm run dev
```
Open http://localhost:3000

**Login (QA Head — can do everything incl. sign):**
| Field | Value |
|---|---|
| Email | `qa@pharmaglimmora.com` |
| Password | `Demo@123` |

> This is Dr. Priya Sharma (role `qa_head`, e-signature enabled). Other logins:
> Regulatory Affairs `ra@pharmaglimmora.com` / `Demo@123`; read-only `qa.exec@pharmaglimmora.com` / `Demo@123` (both password `Demo@123`).

If login fails, reseed: `npm run db:seed`.

Navigate: **Sidebar → Core Compliance → Inspections & Regulatory**

---

## Test 1 — Register an event

Click **Register Event** and enter:

| Field | Value |
|---|---|
| Event type | `FDA 483` |
| Agency | (auto → FDA, read-only) |
| Facility Identifier (FEI) | `3004795103` |
| Site | `Chennai` (or any active site) |
| Inspection start date | today − 5 days |
| Inspection end date | today − 2 days |
| Response deadline | (auto-computed — leave it) |
| Internal owner | Dr. Priya Sharma |
| Lead investigator | `Dr. Karen Whitfield` |

**Expect:** Event appears in the list; deadline auto-filled (FDA = 15 working days);
a "days remaining" chip shows. Open the event → 5 tabs (Overview / Observations /
Investigation / Response / Audit Trail).

---

## Test 2A — Add ONE observation manually

Open the event → **Observations** tab → **Add observation**:

| Field | Value |
|---|---|
| Number | `1` |
| Severity | `Critical` |
| Area | `Quality Control` |
| Regulation | `21 CFR 211.166(a)` |
| Text | `Your firm failed to establish and follow an adequate written stability testing program. Stability samples for Batch AMX-2025-114 were not tested at the 6-month station.` |

**Expect:** Observation saved with an auto reference (`483-…`), status **Open**.

---

## Test 2B — ⭐ Import observations from a 483 PDF (the new feature)

Still on the **Observations** tab → click **Import from 483 PDF**.

1. **Upload** — pick a PDF. (Convert [sample-fda-483.md](./sample-fda-483.md) to PDF,
   or use any PDF — see note below.)
2. **Analyzing** — spinner "Extracting observations from the 483…".
3. **Review (side-by-side)** — LEFT = your PDF; RIGHT = extracted rows.
   - Each row has: include checkbox, text (editable), severity dropdown, area,
     regulation, a **confidence %** badge + **page** chip.
   - **Edit** one row's text; **change** one severity; **uncheck** one row.
4. Click **Confirm & Add N observations**.

**Expect:** Toast "N observations imported"; the new observations appear in the list
(numbered after the manual one). Excluded row is NOT added.

> **Mock mode (default, `AI_MOCK.fda483Extraction = true`):** ANY PDF returns the
> same deterministic 5 observations — perfect for testing the UI flow now, no
> backend needed. To extract the REAL content of your PDF, set
> `AI_MOCK.fda483Extraction = false` in `src/lib/ai/index.ts` + run the FastAPI
> backend with `OPENAI_API_KEY`.

---

## Test 3 — Investigation (Root Cause Analysis)

**Investigation** tab → pick Observation #1 → **Step 1: RCA**.

- Choose method **5 Why**. Enter:
  1. `Stability sample was not pulled at the 6-month interval.`
  2. `The stability schedule reminder did not trigger.`
  3. `The LIMS stability calendar was not configured for this batch.`
  4. `Batch registration skipped the stability-enrolment step.`
  5. `No system check flags a batch missing from the stability program.` ← root cause
- Click **Save / Complete RCA**.

**Expect:** RCA saved; observation status → **Response Drafted**; **Step 2 (Raise CAPA)**
unlocks (was "Locked").

*(Optional: try the **AI Suggestion** button — mocked 5-Why suggestions you can edit/apply.)*

---

## Test 4 — Raise a CAPA from the observation

Investigation tab → **Step 2: Raise CAPA**:

| Field | Value |
|---|---|
| Title | (pre-filled from observation) |
| Description | (pre-filled from root cause) |
| Risk | `Critical` |
| Owner | Dr. Priya Sharma (or any user) |
| Due date | today + 30 days |

Click **Raise CAPA**.

**Expect:** Toast "CAPA raised"; observation status → **CAPA Linked**; a linked-CAPA
preview shows. *(Optional: **AI Pre-fill** button generates title/description.)*

---

## Test 5 — Response draft + Sign & Submit (Part 11)

**Response** tab:

1. Click **Generate AI Draft** → a response letter appears (mocked, ~1.5s). Click
   **Use draft** → edit if you like → **Save draft**.
2. Click **Sign & Submit**:
   | Field | Value |
   |---|---|
   | Signature meaning | `approve` |
   | Password | `Demo@123` |
3. Submit.

**Expect:** Event status → **Response Submitted**; the event shows the submitted
state. (Wrong password → inline error, modal stays open — try `wrongpass` to verify.)

---

## Test 6 — Audit Trail (traceability check)

**Audit Trail** tab. **Expect** rows for everything you did, including:
- `OBSERVATION_ADDED` (per observation)
- `OBSERVATIONS_IMPORTED_FROM_PDF` ← the import summary (open it: carries fileName,
  count, per-obs source page + confidence + text snippet)
- `RESPONSE_DOCUMENT_ADDED` (the retained source PDF, type `483_source`)
- RCA save, CAPA raised, `FDA483_RESPONSE_SUBMITTED`

---

## Test 7 — Permission check (optional)

Log out → log in as **`qa.exec@pharmaglimmora.com` / `Demo@123`** (role `qa`, read-only).

**Expect:** Can OPEN Inspections & Regulatory and view events, but **no** "Register
Event", "Add observation", "Import from 483 PDF", or "Sign & Submit" buttons.

---

## Quick pass/fail checklist

- [ ] Event registers; deadline auto-computes
- [ ] Manual observation adds
- [ ] **PDF import: upload → extract → side-by-side review → edit/uncheck → confirm → observations added**
- [ ] RCA saves; CAPA unlocks
- [ ] CAPA raises; observation → CAPA Linked
- [ ] AI response draft; Part 11 sign & submit works; wrong password blocked
- [ ] Audit Trail shows all actions incl. `OBSERVATIONS_IMPORTED_FROM_PDF`
- [ ] Read-only user sees no write buttons
