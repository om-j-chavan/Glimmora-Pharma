# Glimmora-Pharma — User Guide (QA Team)

A practical, click-by-click guide for the QA team. Written for end users
who need to log findings, raise CAPAs, attach evidence, and sign things
off — not for developers.

> **A short companion to USER-MANUAL.md.** The detailed manual already in
> the docs folder describes every role and module across the whole platform.
> This guide is narrower: it covers what a QA-team member actually does on
> a normal day.

---

## 1. What this app is

Glimmora-Pharma is a quality-management platform for pharma and biotech
sites. You use it to **log compliance findings, raise CAPAs against them,
attach evidence, and close CAPAs with an electronic signature**. It also
keeps an audit trail of everything you do, so an FDA inspector can trace
who did what and when. If your day involves CAPAs, deviations, FDA 483
responses, or compliance evidence, this app is for you.

---

## 2. Getting started

### 2.1 Open the app

- Open your browser and go to the URL your administrator gave you.
  In a local development environment that is usually `http://localhost:3000`.
- You will land on a sign-in screen titled **"Welcome back"**.

### 2.2 Sign in

You sign in with email + password. Your administrator creates your account
in Settings → Users & Roles.

**[screenshot: login screen]**

For this evaluation environment there is a panel labelled **"Show dev
credentials"** at the bottom of the login form. Click it to see a table
of demo accounts. Click any row in the table to auto-fill the email and
password. Then click **Sign in**.

The most useful demo accounts for QA work are:

| Use this when you want to act as | Email | Password |
|---|---|---|
| **QA Head** (sign and close CAPAs) | `qa@pharmaglimmora.com` | `Demo@123` |
| **Regulatory Affairs** (FDA 483 work) | `ra@pharmaglimmora.com` | `Demo@123` |
| **QC/Lab Director** (lab compliance) | `qc@pharmaglimmora.com` | `Demo@123` |
| Customer Admin (everything in this tenant) | `admin@pharmaglimmora.com` | `Admin@123` |

> **Before you start:** if your tenant has MFA turned on, you'll get a
> 6-digit code by email after entering your password. Type the code into
> the OTP box that appears and click **Verify**. The Pharma Glimmora
> International demo tenant ships with MFA off, so you won't see the OTP
> prompt with the demo accounts above.

### 2.3 What you see first

After sign-in you land on the **Executive Dashboard** — a high-level
overview of your tenant's compliance state. The left side has a navigation
sidebar grouped into three folders:

- **Core Compliance** — Dashboard, Gap Assessment, Deviation Management,
  CAPA Tracker, CSV/CSA, FDA 483, Evidence
- **Readiness & Governance** — Inspection Readiness, Governance & KPIs,
  Audit Trail
- **System & Config** — Settings

You'll only see menu items your role is permitted to use. The QA Head
role sees everything in Core Compliance + Audit Trail.

---

## 3. The main screens — a tour

Screens you'll spend the most time on as a QA-team member, in the order
work usually flows: detect a problem → raise a CAPA → close it.

### 3.1 Executive Dashboard

**[screenshot: dashboard with KPI cards and heatmap]**

What it's for: a one-glance view of where your sites stand on inspection
readiness today. Use it at the start of the day to see what's burning.

What you can do here:
- **Filter by date range, site, and severity** at the top.
- **Read the five KPI cards** — Overall Readiness, Critical Findings,
  CAPA Overdue, CSV High Risk, Training Compliance.
- **Read the area-readiness heatmap** — six operational areas
  (Manufacturing, QC Lab, Warehouse, Utilities, QMS, CSV/IT) across all
  visible sites. Green = good, amber = watch, red = needs work.
  **Click any cell** to jump to Gap Assessment for that area.
- **Read the AGI Insights panel on the right** — short alerts like
  "3 critical findings open" with a quick-jump link.
- **Read the 90-Day Action Plan table** — the 10 most urgent open items.
  Click a row to jump to its source.

You don't *create* anything from the dashboard; it's a launchpad.

---

### 3.2 Gap Assessment & Findings

**[screenshot: gap assessment register with side detail panel]**

What it's for: log compliance gaps you find against regulations
(21 CFR 210/211, EU GMP Annex 11, etc.). This is usually where a CAPA
journey starts.

Top of the page has three tabs:
- **Summary** — KPI cards and charts about your findings.
- **Findings Register** — the table of all findings, with a side panel
  that shows full detail when you click a row.
- **Evidence Index** — findings grouped by area, showing how complete
  the evidence is.

What you can do:
- Click **Report Gap** (top right) to log a new finding (see §4.1).
- Filter by site, area, framework, severity, status.
- Click any row to open the side detail panel, then **Link Evidence**,
  **Raise CAPA**, or **Close** the finding from there.

---

### 3.3 CAPA Tracker

**[screenshot: CAPA tracker page with three tabs across the top]**

What it's for: the heart of the QA workflow. Every corrective action
lives here from the moment it's raised until it's signed and closed.

Top of the page has three tabs:

- **QMS Blueprint** — a visual lifecycle diagram of how a CAPA flows
  through 7 steps (Finding → CAPA Raised → RCA → Corrective Action →
  QA Review → Sign & Close → Effectiveness). Click any step card to
  read what it's supposed to do and where the current gaps are. Below
  the lifecycle are three process cards (Deviation Management,
  Change Control, Complaint Handling) showing high-level metrics for
  each source.
- **CAPA Tracker** — the main table of all your CAPAs. This is the tab
  you'll live on.
- **Metrics** — four stat cards (on-time closure rate, overdue rate,
  DI exceptions, effectiveness checks) plus a stacked bar chart of risk
  signals over time and a status/source breakdown.

In the **CAPA Tracker** tab, the table has columns for CAPA ID, Site,
Source, Description, Risk, Status, Owner, Due date, and Effectiveness.
A red "Overdue" tag appears next to the due date if the CAPA is past due.

What you can do:
- Click **New CAPA** to raise one manually (see §4.2).
- Filter by site, status, risk, source; search by CAPA ID or description text.
- Click any row to open the **CAPA Detail** modal (see §3.4).

---

### 3.4 CAPA Detail (the modal that opens when you click a row)

**[screenshot: CAPA detail modal showing four tabs]**

The detail modal has a header strip at the top showing the CAPA reference
(e.g. `CAPA-2026-014`), a Risk pill (red/amber/green), a Status pill
(blue/amber/purple/green), and an "Overdue" pill if applicable. The CAPA's
description sits below as a one-line title. A pencil icon (edit) and ×
(close) sit top-right.

Four sub-tabs run across the body:

- **Overview** — high-level read-only info: description, risk
  classification grid, source, linked finding (clickable), DI gate
  banner if applicable, owner / due / created summary, and a collapsed
  audit trail section.
- **Evidence** — the seven evidence categories the regulator expects you
  to capture (Batch Records, Training Records, Equipment Logs, etc.).
  See §4.3.
- **RCA** — the root-cause analysis text and method.
- **Actions** — the corrective-action steps, the "Submit for QA review"
  button (if you're the owner), and the "Sign & Close" button (if you're
  QA Head with signatory authority and the CAPA is in Pending QA Review).

A small dismissible notice at the top of Overview reminds you that file
uploads now live on the **Evidence** tab — that's a recent reorganization.

---

### 3.5 Deviation Management

**[screenshot: deviation list with filter bar]**

What it's for: report and track unexpected quality or operational events
(equipment failure, environmental excursion, OOS result). Many CAPAs
get raised from a deviation.

Layout: a filterable table with KPI cards above (Total, Open, Under
Investigation, Overdue). Click a row to open a detail side panel.

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

---

### 3.6 Evidence & Documents

**[screenshot: evidence library with pack-builder bar at the bottom]**

What it's for: a central library of GxP documents (SOPs, validation
reports, certificates, etc.), separate from CAPA evidence. You can
also bundle selected documents into an **Evidence Pack** for an
inspector handoff.

Layout: a single page — there are no tabs. A searchable grid of documents
with filters across the top. When you select documents using the row
checkboxes, a floating bar appears at the bottom letting you name and
export the selection as an HTML evidence pack. (Files named
DILStatusTab.tsx and PackBuilderTab.tsx exist in the source but are not
imported or rendered — orphan code from an earlier design. Don't expect
to find tabs in this module.)

What you can do:
- Click **Add document** to register a new document (title, reference,
  version, type, area, status, author, effective date, etc.).
- Filter by area, type, system, status, date range.
- Toggle grid view vs. list view.
- Select rows → click **Export pack** → download an HTML bundle.

> **Don't confuse this with CAPA evidence.** Files attached to a specific
> CAPA live on the **Evidence tab inside that CAPA's detail modal**
> (see §4.3). The Evidence & Documents page here is a tenant-wide
> library used for evidence packs, not for per-CAPA collection.

---

### 3.7 FDA 483 & Regulatory Events

**[screenshot: FDA 483 events list]**

What it's for: log FDA 483 inspection observations (or EMA / MHRA / WHO
inspection events), do RCA on each observation, draft a response letter,
and get it signed and submitted within the deadline.

Layout: list view of events; clicking an event walks you through a
sequential workflow of Observations → RCA → Response → Sign & Submit.
Each event card shows a readiness score (20 = event created, 100 = response
submitted).

What you can do:
- Click **Register Event** to log a new 483 / Warning Letter / inspection
  event (event type, reference number, agency, site, inspection date,
  response deadline).
- In an event: **Add observation**, **Add commitment**, run **RCA**
  (5 Why / Fishbone / freeform) per observation, draft the response
  letter, and **Sign & Submit** when ready.

> **Heads-up:** the "Generate AI draft" button does not generate
> anything with AI. It inserts a hardcoded boilerplate response template
> (date, agency, observation list, linked CAPAs) into the editor. The
> button label is misleading — treat it as "Insert template". See §6.

---

### 3.8 Audit Trail

**[screenshot: audit trail with filters and table]**

What it's for: a read-only, append-only log of every state change in the
system. This is what an inspector will ask to see. Visible to QA Head,
Customer Admin, and Super Admin only.

Layout: filter bar across the top, a summary row, and a table of entries.
Each entry shows timestamp, user, role, module, action (colour-coded:
red = critical, orange = status change, green = create, gray = other),
record ID, and old/new values for updates.

What you can do:
- Filter by free-text search (user, action, module, record), module,
  action type, user, date range.
- **Export CSV** of the filtered slice (top-right button).

> **About the truncation notice.** The page loads the **500 most recent
> entries** from your tenant. If your tenant has more than 500 entries,
> a yellow banner appears at the top: *"Showing the 500 most recent entries.
> X older entries are not displayed."* The CSV export covers only the
> visible 500. To see older entries today, you'd need to ask an admin
> to query the database directly. A date-range filter that pulls older
> rows from the database is on the roadmap but not in yet.

---

## 4. How to add data — step-by-step walkthroughs

The five flows you'll do most often as a QA-team member.

### 4.1 Log a compliance finding

**What this is for:** record a regulatory gap your audit / inspection /
review uncovered, so it's tracked, owned, and eventually resolved.

**When to use it:** during or right after a gap assessment, internal
audit, or self-inspection. If the gap is severe enough to need a formal
corrective action, you'll **raise a CAPA from this finding** in the next
flow.

**Steps:**

1. From the sidebar, click **Gap Assessment**.
2. Click the **Findings Register** tab if you're not already on it.
3. Click **Report Gap** (top right).
4. Fill in the fields in the modal:

| Field | Required | What to enter |
|---|---|---|
| Site | Yes | Your facility (auto-filled if you only have one site) |
| Area | Yes | Where the gap was found (Manufacturing, QC Lab, Warehouse, Utilities, QMS, CSV/IT) |
| Framework | Yes | Which regulation it relates to (Part 11, Annex 11, ICH Q9, etc.) |
| Requirement | Yes | A short sentence describing what's missing or wrong |
| Severity | Yes | Critical, High, or Low |
| Owner | Yes | The person responsible for closing the finding |
| Target date | Yes | When you commit to closing it |
| Evidence link | No | A document reference or URL if you already have evidence |
| Linked system | No | If the gap relates to a specific GxP system (CSV/IT or QC Lab areas only) |
| Root cause | No | Initial thoughts on why this happened |
| Raise CAPA immediately | No | Tick this if the finding needs a formal CAPA right away |

5. Click **Save**.

**What happens next:**
- A success popup confirms the finding is logged.
- The new finding appears in the Findings Register table.
- If you ticked **Raise CAPA immediately**, the popup tells you the new
  CAPA reference and offers a button to jump to the CAPA Tracker.

**Common mistakes:**
- Picking a Framework that isn't enabled for your tenant — only frameworks
  toggled ON in Settings → Frameworks appear in the dropdown.
- Choosing an Owner who is no longer active — inactive users don't
  appear, but if you can't find someone, ask an admin to verify their
  status in Settings → Users & Roles.

---

### 4.2 Raise a new CAPA

**What this is for:** open a formal corrective action against a problem.
Most CAPAs come from a finding (§4.1), a deviation, or an FDA 483
observation, but you can also raise one manually.

**When to use it:** when a problem is serious enough that you need to
investigate the root cause, define corrective actions, and prove
effectiveness — not just a quick fix.

**Steps:**

1. From the sidebar, click **CAPA Tracker** → **CAPA Tracker** tab.
2. Click **New CAPA** (top right).
3. Fill in the modal:

| Field | Required | What to enter |
|---|---|---|
| Source | Yes | Where this CAPA came from (FDA 483, Internal Audit, Deviation, Complaint, OOS, Change Control, Gap Assessment) |
| Risk | Yes | Critical, High, or Low — drives badge colour and metrics |
| Owner | Yes | Person responsible for getting it closed |
| Site | Sometimes | Auto-filled if you only have one site; visible dropdown otherwise |
| Due date | Yes | When you commit to closure |
| Description | Yes (≥10 chars) | What the CAPA is about |
| RCA method | No | 5 Why / Fishbone / Fault Tree / Other (you can fill in later) |
| Linked finding | No | Reference like `FIND-001` if this CAPA was raised from a finding |
| Effectiveness check | No (default ON) | Schedules a 90-day post-closure verification |
| DI gate required | No (default OFF) | Tick if the CAPA touches data-integrity-relevant systems; QA Head must clear it before closure |

4. Click **Create CAPA**.

**What happens next:**
- A green success toast appears: *"CAPA created. Added to the tracker.
  Document RCA and corrective actions next."*
- The CAPA appears in the Tracker table with a fresh reference like
  `CAPA-2026-027` and status **Open**.
- The CAPA is yours to edit (or whoever you set as Owner) until it
  reaches Pending QA Review.

**Common mistakes:**
- Forgetting to set DI gate required for a CAPA touching electronic
  records / Part 11 systems. If the gate should be on but isn't, the
  CAPA can be closed without a data-integrity review — switch it on
  via the pencil-icon edit.
- Picking too short a Due date for a Critical CAPA — there's no automatic
  validation today, but overdue CAPAs are flagged red on the dashboard.

---

### 4.3 Add evidence to a CAPA

**What this is for:** capture the documentation that proves you
investigated and fixed the issue. Inspectors expect specific kinds of
evidence (batch records, training records, equipment logs, etc.).

**When to use it:** as you investigate. The Evidence tab covers seven
standard categories — fill them in as you collect each one.

**Steps:**

1. From the sidebar, go to **CAPA Tracker** → **CAPA Tracker** tab.
2. Click the row for your CAPA. The detail modal opens.
3. Click the **Evidence** tab inside the modal.
4. You'll see seven category cards (Batch Records, Training Records,
   Equipment Logs, Environmental Data, Deviation History, Witness
   Interviews, Supplier Data). A progress bar at the top shows how many
   of the seven you've completed.
5. All seven category cards render fully expanded by default — there is
   no collapse / expand affordance today. For each category you have
   evidence for:
   - Set the **Status** dropdown (Pending → In Progress → Complete, or
     Not Applicable if it doesn't apply).
   - Type into **Notes** to record what evidence you collected, by whom,
     and why it satisfies the category. The notes save automatically
     about a second after you stop typing — you'll briefly see *"Saving…"*.
   - **Drag and drop a file** onto the card's upload area, or click
     **Browse files**. Accepts PDF, PNG, JPG, XLSX, DOCX, CSV, TXT.
     Max 10 MB per file.

**What happens next:**
- Each uploaded file shows its name, size, the SHA-256 hash prefix
  (proof the bytes haven't been altered), uploader name, and timestamp.
- Files are downloadable any time via the ↓ button on the row.
- Files are **soft-delete only** — to remove one, click the ⋯ menu →
  **Soft delete**, type a reason of at least 10 characters, and confirm.
  The file stays in the system for the retention period (7 years by
  default) but is hidden from the list.
- Notes are versioned — every edit appended is a new immutable snapshot.
  Click **History** on the card to see all prior versions with timestamp
  and editor.

**Common mistakes:**
- Forgetting to flip the status from **Pending** to **Complete** after
  you've attached files — the progress bar at the top counts categories
  by status, not by file count.
- Trying to upload a file >10 MB — the server rejects it with an error
  toast. Compress or split the document first.

---

### 4.4 Report a deviation

**What this is for:** record an unexpected quality or operational event
that wasn't supposed to happen (an OOS result, an environmental
excursion, an equipment failure mid-batch). Many of these will become
CAPAs.

**When to use it:** as soon as the deviation is detected. The faster
it's logged, the clearer the timeline for inspectors.

**Steps:**

1. From the sidebar, click **Deviation Management**.
2. Click **Report Deviation** (top right).
3. Work through the modal sections from top to bottom:

**Basic Information:**

| Field | Required | What to enter |
|---|---|---|
| Title | Yes (≥5 chars) | A one-line summary |
| Description | Yes (≥10 chars) | What happened, in plain language |
| Type | Yes | Planned or Unplanned |
| Category | Yes | Process / Equipment / Material / Environmental / Personnel / Documentation / System / Other |
| Severity | Yes | Critical / Major / Minor |
| Area | Yes | Where it happened |

**Immediate Action** (textarea, ≥5 chars): what you did right away to
contain the problem (quarantine, hold, notify, etc.).

**Impact Assessment** — three dropdowns rating the impact on Patient
Safety, Product Quality, and Regulatory exposure (High / Medium / Low /
None each).

**Assignment:**

| Field | Required | What to enter |
|---|---|---|
| Owner | Yes | Person responsible for investigating and closing |
| Due date | Yes | When you commit to closure |
| Batches affected | No | Comma-separated batch numbers (e.g., `STB-2026-042, STB-2026-043`) |
| Raise CAPA immediately | No | Tick if the deviation needs a formal CAPA right away |

4. Click **Save**.

**What happens next:**
- The deviation appears in the table with status **Open**.
- The Owner can click the row to open the detail panel and click
  **Start Investigation** when ready, then **Submit for QA Review**
  when investigation is complete.
- If you ticked **Raise CAPA immediately**, a CAPA is created and
  linked back; the popup tells you the new CAPA reference.

**Common mistakes:**
- Logging Severity = Minor when patient safety is actually impacted —
  use the Impact Assessment dropdowns honestly; they drive risk-signal
  reporting on the dashboard.

---

### 4.5 Sign and close a CAPA (QA Head only)

**What this is for:** the final approval step — the QA Head reviews the
CAPA and electronically signs it as complete.

**Before you start:**
- You must be signed in as a **QA Head**, **Customer Admin**, or
  **Super Admin** with the **GxP Signatory** flag enabled. The default
  demo `qa@pharmaglimmora.com` has this set.
- The CAPA must be in **Pending QA Review** status. The Owner moves it
  there using **Submit for QA Review** on the Actions tab.
- If the CAPA has **DI gate required** turned on, the gate must be
  cleared first (Edit → DI Gate section → set to Cleared).

**Steps:**

1. From the sidebar, click **CAPA Tracker**.
2. Filter the table by Status = **Pending QA Review**.
3. Click the CAPA row. The detail modal opens.
4. Click the **Actions** tab inside the modal.
5. Review the corrective actions text. If anything looks incomplete,
   close the modal and tell the Owner to fix it before re-submitting.
6. Click **Sign & Close CAPA** (green button at the bottom).
7. A signature modal opens with a Part 11 notice. Fill in:
   - **Signature meaning** dropdown: choose one of:
     - "I approve the corrective actions as complete and effective"
     - "I verify the root cause analysis is adequate"
     - "I confirm evidence is sufficient for closure"
   - **Confirm your password**: re-enter your account password.
   - **Effectiveness check confirmed** toggle (only shown if effectiveness
     check is on for this CAPA): tick to confirm 90-day monitoring will
     be scheduled.
8. Click **Sign & Close CAPA**.

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

**Common mistakes:**
- Trying to sign and close before the CAPA is in **Pending QA Review** —
  the button isn't shown for any other status.
- Forgetting to clear the DI Gate when it's required — closure is blocked
  with an error toast telling you to clear the gate first.
- Signing with weak password input — see §6 for an honest note about how
  the signature is currently captured.

---

## 5. How to find data you've already added

**On any list page** (Gap Assessment, CAPA, Deviation, Evidence,
FDA 483, Audit Trail), you'll see the same pattern:

- **Search box** (top-left) — searches the most useful columns for that
  module: ID, title, description, person name.
- **Dropdown filters** (next to search) — narrow by site, status,
  severity, source, category, etc. Available filters vary per module.
- **Clear button** — appears once any filter is active.
- **Result count** — shown above the table ("12 of 47 entries").

**Specific tools by module:**

| Module | Search by | Filter by | Export? |
|---|---|---|---|
| Gap Assessment | Finding ID, requirement text | Site, area, framework, severity, status | No CSV export today |
| CAPA Tracker | CAPA ID, description | Site, status, risk, source | No CSV export today |
| Deviation | Deviation ID, title | Status, severity, category | No CSV export today |
| Evidence & Documents | Title, reference | Area, type, system, status, date range | Yes — Evidence Pack as HTML bundle |
| FDA 483 | Reference number | Type, agency, status, site | No CSV export today |
| **Audit Trail** | User, action, module, record | Module, action type, user, date range | **Yes — CSV** |

**Linking between modules** is mostly via reference IDs you type into a
field (e.g. typing `FIND-001` into a CAPA's Linked Finding field).
A handful of detail panels have direct click-through (Gap Assessment
finding → linked CAPA, CAPA → linked finding), but most cross-module
navigation today is "look up the ID, then go open it manually."

---

## 6. What you cannot do (yet)

A truthful list of things that look like they exist but aren't fully
wired up. QA people hate discovering these mid-task.

### Things the UI shows but the backend doesn't really do

- **The "Sign & Close" password isn't actually re-verified server-side.**
  You type a password into the signature modal, and the CAPA closes —
  but the server doesn't currently re-check that password against your
  account. It also doesn't store a separate, immutable "signature
  receipt" record. The **closure happens and is audit-logged**, but the
  Part 11 e-signature claim the modal makes (*"identity, meaning, and
  content hash will be recorded and cannot be altered"*) isn't fully
  delivered. A defensive fix is planned (see CAPA_GAP_REPORT.md → Phase 0).
- **Closed CAPAs are still fully editable and deletable.** There is no
  server-side guard on `Edit` or `Delete` actions that checks whether
  a CAPA is Closed. A user with edit access can change or delete a
  signed-and-closed CAPA exactly as if it were Open. Closure today is
  just a status flag, not a lock. The defensive fix is the first item
  in Phase 0 of CAPA_GAP_REPORT.md.
- **The 90-day Effectiveness Check date is set on closure, but no
  background job actually checks it.** You'll see the date on the
  CAPA's Actions tab, but nothing reminds you when the 90 days are up.
  Treat it as a manual follow-up for now.
- **The "AGI Console" and any "AI" buttons are mostly cosmetic.** There
  is no real AI / LLM integration anywhere in the platform today —
  toggles, agent on/off switches, and the "Generate AI draft" button
  in FDA 483 are UI shells that emit placeholders or templates. No
  inferences, no model calls.
- **The per-record audit trail section inside CAPA Detail → Overview
  is a placeholder.** It says "audit trail loading is deferred — see
  Governance > Audit log page for the full tenant log." For now, use
  the dedicated **Audit Trail** page and filter by the CAPA's record ID.
- **Audit Trail truncation.** Only the most recent **500** entries per
  tenant load. Older entries exist in the database but aren't visible
  in the UI today. The notice at the top of the page tells you when
  this is happening.

### Things missing entirely

- **No tiered approval routing.** Every CAPA goes to the same QA Head
  gate regardless of risk. Critical, High, Medium, and Low CAPAs all
  use the same single approver.
- **No reportability flags** for MDR / FAR / BPDR / Field Alert. If
  your CAPA needs regulatory notification, today there's no field to
  capture that — track it externally.
- **No Change Control entity.** "Change Control" is a Source dropdown
  option but there's no separate Change Control module to link to
  bidirectionally.
- **No structured "actions" inside a CAPA.** The corrective actions
  are a free-text textarea, not a list of individual actions each with
  their own owner / due date / status. So Stage 6 implementation
  tracking has to happen offline.
- **No effectiveness-criteria locking at design time.** The
  effectiveness check toggle is on/off; there's no place to record the
  measurable criteria you're going to check after 90 days.
- **`/capa/CAPA-2026-014`-style URLs don't work yet.** The CAPA detail
  URL today uses an internal database id, not the human-readable
  reference. To share a link to a specific CAPA, copy the URL from your
  browser after you open the modal.

### Module-level honest notes

- **Inspection Readiness page** is largely a placeholder layout — most
  cards are static. Don't expect live inspection-readiness data here
  yet.
- **Governance & KPIs page** loads but the KPI feed it expects
  (`/api/governance/kpis`) doesn't exist yet — there's a TODO marker
  in the code. Use the Executive Dashboard for KPI work today.
- **Settings → AGI Policy** changes are saved but they don't gate any
  real AI behavior (because there isn't any).

---

## 7. Glossary

| Term | Plain meaning |
|---|---|
| **ALCOA+** | A Part 11 record-quality principle: Attributable, Legible, Contemporaneous, Original, Accurate (+ Complete, Consistent, Enduring, Available). The Evidence module's note versioning and SHA-hashed file uploads are designed to satisfy this. |
| **Annex 11** | EU GMP rules for computerized systems. Equivalent in spirit to FDA Part 11. |
| **Audit Trail** | The append-only log of who did what and when. Visible in the **Audit Trail** page. Inspectors will ask to see this. |
| **CAPA** | Corrective and Preventive Action. The formal record of investigating and fixing a quality problem so it doesn't recur. |
| **Closed (CAPA)** | The final status. Reached by **Sign & Close** by a QA Head. |
| **Deviation** | An unexpected event that didn't follow procedure (OOS result, equipment failure, environmental excursion). Often the trigger for a CAPA. |
| **DI Gate** | Data Integrity Gate. A check that a CAPA touching electronic records has had its data-integrity implications reviewed before closure. Set per-CAPA via the "DI gate required" toggle. |
| **Effectiveness Check** | A 90-day post-closure verification that the corrective action actually worked. Today the date is recorded but no automated reminder runs. |
| **e-Signature / Sign & Close** | The Part 11 electronic signature step at CAPA closure. See §6 for honest notes on the current implementation. |
| **Evidence** | Files and notes attached to a CAPA proving the investigation happened (batch records, training records, etc.). Lives on the **Evidence** tab inside CAPA Detail. |
| **Evidence Pack** | A bundle of documents from the **Evidence & Documents** library, exported as an HTML file for inspector handoff. |
| **FDA 483** | The form an FDA inspector hands you at the end of an inspection listing observed deficiencies. The FDA 483 module tracks each observation through to a signed response. |
| **Finding** | A documented compliance gap recorded in **Gap Assessment**. Often the trigger for a CAPA. |
| **GxP** | Umbrella term for "Good x Practice" — GMP, GLP, GCP, etc. |
| **GxP Signatory** | Per-user flag (set in Settings → Users & Roles) that controls whether someone can apply an electronic signature. Required for **Sign & Close**. |
| **MFA / OTP** | Multi-Factor Authentication via a One-Time Password sent to your email. Per-tenant setting; off by default for the demo. |
| **Owner** | The person responsible for completing a finding / CAPA / deviation. Picked from a dropdown of active users. |
| **Part 11** | 21 CFR Part 11 — FDA rules for electronic records and electronic signatures. The Sign & Close, Evidence file-hashing, and Audit Trail features all exist to satisfy Part 11. |
| **Pending QA Review** | The CAPA status between Owner submitting their work and QA Head signing off. |
| **RCA** | Root Cause Analysis. The "why did this happen?" part of a CAPA. Methods include 5 Why, Fishbone, Fault Tree. |
| **Reference (CAPA)** | The human-readable id like `CAPA-2026-014`. New CAPAs get one automatically when you create them. |
| **Site** | A facility within your tenant (Mumbai API Plant, Chennai QC Lab, etc.). Many filters and forms scope to your active site. |
| **Tenant** | Your organization in the platform. All your users, sites, CAPAs, etc. live in one tenant. Set up by the Customer Admin. |

---

## Coverage notes

### Documented in this guide

- §2 Login + demo credentials + MFA hint
- §3.1 Executive Dashboard
- §3.2 Gap Assessment & Findings (Findings Register tab focus)
- §3.3 CAPA Tracker (all three top-level tabs)
- §3.4 CAPA Detail modal (all four sub-tabs)
- §3.5 Deviation Management
- §3.6 Evidence & Documents (library + pack export)
- §3.7 FDA 483 & Regulatory Events
- §3.8 Audit Trail
- §4.1 Log a finding
- §4.2 Raise a CAPA
- §4.3 Add evidence to a CAPA
- §4.4 Report a deviation
- §4.5 Sign and close a CAPA

### Skipped, with reasons

- **CSV/CSA Validation** — out of scope for the QA-team audience this
  guide is written for; CSV/CSA is primarily the CSV/Val Lead's surface.
  Documented in the broader [USER-MANUAL.md](USER-MANUAL.md).
- **Inspection Readiness** — page is largely a placeholder layout
  today (see §6). Not enough live behavior to walk through.
- **Governance & KPIs** — the page loads but its expected KPI feed
  isn't implemented (TODO marker in code). Use Executive Dashboard
  instead.
- **AGI Console** — UI shell with no underlying AI behavior (see §6).
  Walking through the toggles would imply they do things they don't.
- **Admin module** (`/admin`) — super-admin / customer-admin only;
  not a QA-team daily surface. Documented in USER-MANUAL.md.
- **Settings module** — admin-only; relevant to QA only when an admin
  is configuring frameworks, sites, or users on their behalf.
  Documented in USER-MANUAL.md.

### `[NEEDS CONFIRMATION]` items collected for follow-up

> **Status: all 10 items resolved as of 2026-05-03 (commit `40f5b76`).**
> See [USER_GUIDE_CONFIRMATIONS.md](USER_GUIDE_CONFIRMATIONS.md) for the
> per-row verdict and any corrective edits that were applied to this
> guide. The table below is preserved as a record of which items the
> guide author was uncertain about at the time of writing.

| # | Item | Where in this guide | What needs confirming |
|---|---|---|---|
| 1 | "Raise CAPA immediately" checkbox in Gap Assessment finding intake | §3.2, §4.1 | I documented that ticking this auto-creates a linked CAPA and pops up the new reference. **Confirm** the auto-create actually fires today vs. just storing the intent. |
| 2 | "Raise CAPA immediately" checkbox in Deviation report intake | §3.5, §4.4 | Same question for the Deviation modal. **Confirm** the auto-create works end-to-end. |
| 3 | Evidence Pack HTML export | §3.6, §5 | I described it as "a styled HTML table with meta cards". **Confirm** the export actually triggers a download in the browser today (not a stub). |
| 4 | FDA 483 "Generate AI draft" button | §3.7, §6 | I described it as "template-based, not real AI." **Confirm** the template generation runs today and what its output looks like, vs. doing nothing on click. |
| 5 | DIL Status / Pack Builder tabs in Evidence module | §3.6 | One discovery pass said these tabs are not user-visible (rolled into the main library view); another said they exist as separate tabs. **Confirm** what users see at runtime. |
| 6 | Document Upload component used inside Deviation and FDA 483 detail panels | §3.5, §3.7 | The component renders, but I haven't verified end-to-end that uploaded files actually persist and are downloadable from those modules (versus the CAPA Evidence tab where I have). **Confirm.** |
| 7 | Settings → Frameworks toggling effect on Gap Assessment dropdown | §4.1 (common mistakes) | I stated that turning a framework OFF in Settings hides it from the Framework dropdown when reporting a new finding. **Confirm** the dropdown is genuinely filtered by the toggles. |
| 8 | Closure auto-closes linked Finding and FDA 483 observation | §4.5 (what happens next) | I claimed both happen automatically when a CAPA closes. **Confirm** both side-effects actually fire today. |
| 9 | Effectiveness check toggle in Sign & Close modal | §4.5 step 7 | I described the toggle appearing only if the CAPA's `effectivenessCheck` is on. **Confirm** the conditional render actually hides it when `effectivenessCheck` is off. |
| 10 | Pending categories in Evidence tab collapse by default | §4.3 step 5 | I said Pending categories with zero files are collapsed by default. **Confirm** this UX matches what's running today (it was in a recent design plan; verify it shipped). |

These ten items have been resolved in [USER_GUIDE_CONFIRMATIONS.md](USER_GUIDE_CONFIRMATIONS.md).
After applying the recommended edits in that document, this guide moves
from "best-effort honest" to "verified per-build" against current HEAD
(commit `40f5b76`).
