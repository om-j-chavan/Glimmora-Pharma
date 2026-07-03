# Inspections & Regulatory — Module Workflow

> Formerly "FDA 483 & Regulatory". Route: `/fda-483`. This is the end-to-end guide
> to how the module works, who owns each stage, and a real-life walk-through.

---

## 1. What this module does

When a regulator (FDA, EMA, MHRA, WHO, Health Canada, TGA, PMDA, CDSCO, ANVISA…)
inspects a facility and issues **inspectional observations** (an FDA Form 483, a
Warning Letter, or any agency inspection report), this module lets the company:

- Record the inspection **event** and its **observations**
- Investigate each observation (**Root Cause Analysis → CAPA**)
- Draft, sign, and export the **formal response** to send to the agency
- Record the **agency's outcome** and close the event

…all with a Part 11 audit trail, so the company can prove exactly what it did.

**Important:** the inspector does **not** use this app. The regulator issues the
483/report externally; the company's team records it here and manages the response.

---

## 2. Who uses it — role-based stage ownership

The module follows a lightweight **stage ownership** model. Each event moves through
5 stages, and each stage has a fixed **owner role**. A "Hand off" button + a stage
banner make the current owner and the next step obvious. Handoff is *soft* — it never
locks editing; only the e-signatures are hard-gated for compliance.

| Stage | Owner | What they do |
|-------|-------|--------------|
| **1. Intake** | Regulatory Affairs | Register the event; add observations (manually or via **483 PDF auto-extract**) |
| **2. Investigation** | QA Head | RCA for each observation → raise a CAPA (assigns a worker via the Worklist) |
| **3. Response** | Regulatory Affairs | Draft the response (AI or manual), then Sign & Submit |
| **4. Sign-off** | Regulatory Affairs | Part 11 e-signature on the response (RA owns external regulator comms) |
| **5. Outcome** | Regulatory Affairs | Record the FDA's reply → event Closed |

### Permission summary
| Role | View | Create / Edit | Sign & Submit / Outcome | Delete |
|------|:----:|:-------------:|:-----------------------:|:------:|
| **Regulatory Affairs** | ✅ | ✅ | ✅ | ❌ |
| **QA Head** | ✅ | ✅ | ✅ | ✅ |
| Customer Admin | ✅ | ✅ | ❌ | ✅ |
| qa / qc / csv / it / operations | ✅ | (per matrix) | ❌ | ❌ |
| Viewer | ✅ (read-only) | ❌ | ❌ | ❌ |
| Super Admin | ❌ (admin console only) | — | — | — |

E-signature (Sign & Submit, Record Outcome) is restricted to **QA Head + Regulatory
Affairs**, server-enforced, with password re-authentication.

---

## 3. The workflow — step by step

### Stage 1 — Intake (Regulatory Affairs)
1. **Register Event** — pick the event type (FDA 483, Warning Letter, EMA/MHRA/WHO/
   Health Canada/TGA/PMDA/CDSCO/ANVISA/Other Inspection). Agency, response-deadline,
   and reference-label are derived automatically. The **event reference auto-generates**
   a unique code (`483-MUM-2026-004`) — or type a real agency reference if you have one.
2. **Add observations** — two ways:
   - **Manually** — number, text, severity, area, regulation.
   - **Import from 483 PDF** ⭐ — upload the inspector's digital 483 PDF; AI extracts
     each observation (text, regulation, area, severity, confidence, source page);
     review side-by-side, edit, and bulk-add. Cuts ~30 min of typing to ~3 min.
3. Banner: **Stage: Intake · Owner: Regulatory Affairs** → click **Hand to QA**.

### Stage 2 — Investigation (QA Head)
4. Open the **Investigation** tab. For each observation:
   - **Step 1 — RCA:** pick a method (5 Why / Fishbone / Fault Tree / Barrier Analysis),
     fill it in (or use the **AI Suggestion** starting point), then **Complete RCA**.
   - **Step 2 — Raise CAPA:** unlocks after RCA. Set owner + due date (AI Pre-fill
     available) → **Raise CAPA**. The assignee now sees it in their **Worklist**.
5. When all observations have RCA + CAPA → click **Hand to RA**.

### Stage 3 & 4 — Response + Sign-off (Regulatory Affairs)
6. **Response** tab → **Generate AI Draft** (real gpt-4o backend, with a deterministic
   mock fallback) → **Use draft** → edit → **Save draft**.
7. **Download response letter (PDF)** — a formal A4 letter (letterhead + reference block
   + body) to send to the agency. (Also "Export observations (PDF)" for the summary.)
8. **Sign & Submit** — signature meaning + **password** (Part 11 e-signature). Status →
   **Response Submitted**; stage → **Outcome**.

> The app produces the signed package; **actual transmission to the agency is manual**
> (FDA has no public API) — RA sends via the FDA portal / ESG / email.

### Stage 5 — Outcome → Closed (Regulatory Affairs)
9. When the agency replies, click **Record FDA Outcome**: choose the outcome
   (**Acknowledged / Closed / Warning Letter / Follow-up Requested**), add a note,
   optionally attach the agency letter, and **sign with your password**.
   - Acknowledged / Closed / Warning Letter → event **Closed** (locked).
   - Follow-up Requested → reopens the Response stage for a revised reply.

### Audit Trail (any time)
Every action is logged: `OBSERVATION_ADDED`, `OBSERVATIONS_IMPORTED_FROM_PDF`,
`STAGE_HANDED_OFF`, `FDA483_RESPONSE_SUBMITTED`, `FDA483_OUTCOME_RECORDED`, plus the
Part 11 `SignedRecord` entries.

---

## 4. Real-life example

> **Scenario:** The FDA inspects Glimmora's Mumbai API Plant (2–6 March 2026) and hands
> over a Form 483 with 5 observations.

1. **Intake (Rahul Mehta, Regulatory Affairs):** Registers the event — type "FDA 483",
   site "Mumbai API Plant", deadline auto-set to 15 working days. He uploads the 483 PDF;
   AI extracts all 5 observations; he reviews, fixes one wording, and adds them. Reference
   auto-generates as `483-MUM-2026-004`. Clicks **Hand to QA**.
2. **Investigation (Dr. Priya Sharma, QA Head):** For observation #1 ("stability samples
   not tested at 6-month station") she runs a 5-Why, lands on the root cause
   ("no system check flags a batch missing from the stability program"), and raises a CAPA
   assigned to a QC analyst — who now sees it in their Worklist. She repeats for all 5,
   then clicks **Hand to RA**.
3. **Response (Rahul, RA):** Generates the AI draft response letter, edits it, downloads
   the **PDF letter**, and submits it to the FDA via the ESG portal. In the app he clicks
   **Sign & Submit** (password) — status becomes **Response Submitted**.
4. **Outcome (Rahul, RA):** Three weeks later the FDA sends an acknowledgement (EIR,
   classification VAI). He clicks **Record FDA Outcome → Acknowledged**, attaches the FDA
   letter, signs — the event is **Closed**.
5. **Audit:** If the FDA returns, the full story — inspection → observations → RCA → CAPA →
   response → outcome — is in the audit trail with signatures. Nothing was missed.

---

## 5. Key features (built into this module)

- **483 PDF auto-extraction** — upload → AI-extract observations → review → bulk-create.
- **Role-based stage workflow** — Intake → Investigation → Response → Sign-off → Outcome,
  with owner banners, soft handoff, and (dormant-safe) next-owner signalling.
- **Record FDA Outcome** — closes the lifecycle (Acknowledged / Closed / Warning Letter /
  Follow-up), Part 11 signed.
- **RA can sign** — Regulatory Affairs signs the regulatory response, not just QA Head.
- **Response letter PDF export** + observations package export.
- **AI response draft** (real gpt-4o with mock fallback) + AI RCA suggestions + AI CAPA
  pre-fill.
- **Global event types** — 11 agencies with auto agency/deadline/reference/badge.
- **Auto-generated unique event references** (no more FEI-as-reference duplicates).
- **Owner dropdowns show name + role** everywhere (e.g. "Dr. Priya Sharma (QA Head)").

---

## 6. Compliance (21 CFR Part 11)

- Every e-signature (response submission, outcome) re-authenticates the user's password,
  records a tamper-evident `SignedRecord` (content hash + signer + meaning + timestamp),
  and is audited.
- Once submitted or an outcome is recorded, the event is **locked** — observations, RCA,
  and response can no longer be edited (except "Follow-up Requested", which reopens it).
- AI outputs are always advisory: every AI-extracted or AI-drafted field is editable and
  requires human confirmation before it is saved.

---

## 7. Test logins (seed data)

| Role | Email | Password |
|------|-------|----------|
| QA Head | `qa@pharmaglimmora.com` | `Demo@123` |
| Regulatory Affairs | `ra@pharmaglimmora.com` | `Demo@123` |
| Read-only (qa) | `qa.exec@pharmaglimmora.com` | `Demo@123` |

Run the app: `npm run dev` (in `Glimmora-Pharma/`) → http://localhost:3000 →
Sidebar → **Inspections & Regulatory**.
