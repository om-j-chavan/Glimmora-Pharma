# Pharma Glimmora — AI Features Guide

A simple, plain-English guide to the AI (AGI) features in the Pharma Glimmora app —
what each one does in real life, step by step, with a description of every screenshot.

> **Who is this for?** Anyone — QA, Regulatory, Production, IT, or management — who
> wants to understand what the AI agents do, without technical jargon.

---

## How to add your screenshots

Each feature below has an image placeholder like `![...](./screenshots/01-....png)`.
Save your screenshots into a `docs/screenshots/` folder with the matching file name
and they will show up automatically. Even without the images, the **"What this screen
shows"** text under each one explains everything.

---

## ⭐ The one golden rule (read this first)

Every AI feature in this app follows the same safety rule:

> **The AI assists. A qualified human always reviews and decides.**

The AI can read data, spot problems, draft text, and raise alerts — but it can **never**
sign, approve, release, close, or make a compliance/safety decision on its own. That is
required by law (21 CFR Part 11) and the app enforces it. You will see this rule repeated
in every feature as the "❌ What the AI cannot do" list.

> **Note on "mock AI":** Today these features run on a built-in demo brain
> (deterministic mock data) so they are fast, free, and stable for demos and testing.
> The screens and the workflow are exactly the same as the real version — connecting a
> real AI model later is a one-setting change and does **not** change any screen.

---

## 1. ✅ FDA 483 Draft Response — *"one-click reply letter to the FDA"*

![FDA 483 AI Draft](./screenshots/01-fda-483-ai-draft.png)

### What it is (simple words)
When the FDA inspects a factory and finds problems, they leave a **Form FDA-483** listing
the issues ("observations"). The company must send a formal reply letter within ~15 days
for **every** observation. This AI **writes the first draft of that letter for you**.

### Real-life example
You are **Dr. Priya Sharma, QA Head**. An inspection at the Mumbai API Plant left
observations. You've already done the investigation and raised CAPAs. Instead of typing a
long formal letter by hand, you click **AI Draft** and a complete draft appears in seconds.

### Step by step
1. Open **FDA 483 & Regulatory** → open the event (e.g. `WL-MUM-2026-001`).
2. Go to the **Response** tab → **Step 1 — Response draft**.
3. Click **AI Draft**.
4. The AI gathers each observation + its root cause + its linked CAPA and writes a formal letter.
5. You read and edit it, then click **Save & Apply**.
6. **You** (a human QA Head) sign and submit with your password — the AI never does this.

### What this screenshot shows
The **"AI Draft — FDA 483 Response"** pop-up for event `WL-MUM-2026-001`. The AI has written
a full letter: *"Dear [FDA District Office], Pharma Glimmora International received Form
FDA-483 … of our Mumbai API Plant facility on 01/03/2026…"*. It lists **Observation #1**
(LIMS audit-trail access controls), its **Severity** and a **5-Why Root Cause**. At the
bottom, an amber warning reminds you: *"AI-generated draft. Review carefully… Tone, accuracy
and final language are your responsibility under 21 CFR Part 11."* You can **Cancel** or
**Save & Apply**.

### ❌ What the AI cannot do
- Sign or submit the response to the FDA
- Commit to regulatory timelines
- Replace the QA Head's sign-off

### Where it shows
FDA 483 & Regulatory → **Response** tab.

---

## 2. ✅ Regulatory Intelligence — *"news alerts for new medicine rules"*

![Regulatory Intelligence page](./screenshots/03-regulatory-intelligence.png)

### What it is (simple words)
Regulators (FDA, EMA, ICH, MHRA) keep publishing **new and updated rules**. Missing one
means you could be running an out-of-date, non-compliant process. This AI **watches the
regulators, flags the important new rules, and suggests what to change**.

### Real-life example
You're in **Regulatory Affairs**. Instead of manually reading dozens of agency PDFs, you
open one page and see a short, ranked list: *"these 6 updates matter, 2 introduce new
requirements, here's what to check."*

### Step by step
1. On the **Dashboard**, an alert says *"2 new FDA/EMA regulatory requirements flagged."*
2. Click **Review guidance →** (or open **Regulatory Intelligence** in the sidebar).
3. The AI scans the agency feeds and shows the updates, most important first.
4. Read each update's **summary** and **Suggested alignment**.
5. Click **Mark reviewed** on the ones you've handled.

### What this screenshot shows
The **Regulatory Intelligence** page. Four summary cards: **Guidance updates 6**,
**New requirements 2**, **High impact 3**, **Sources monitored 4 (FDA · EMA · ICH · MHRA)**.
Below, the top update is tagged **FDA · High impact · New guidance · New requirement**:
*"Computer Software Assurance for Production and Quality System Software"* (FDA-2025-D-1402,
published 18 May 2026). It has a plain-English summary, a **Suggested alignment** box
(*"Transition the CSV/CSA validation SOP to a CSA risk model…"*), and **Affected areas:
CSV/IT, QMS**. Each card has a **Mark reviewed** button. Top-right: **Scan for updates**.

### ❌ What the AI cannot do
- Interpret the regulation (decide what it legally means)
- Make the compliance determination
- Replace Regulatory Affairs expertise

### Where it shows
**Dashboard** (alert) + **Regulatory Intelligence** page.

---

## 3. ✅ Deviation Intelligence — *"connects the dots across repeating problems"*

![Deviation Intelligence panel](./screenshots/04-deviation-intelligence.png)

### What it is (simple words)
A **deviation** is when something happens differently than the procedure says. People
usually look at them **one at a time** and miss the bigger pattern. This AI looks at
**all of them together**, spots the repeating patterns, and suggests the shared root cause.

### Real-life example
You're the **QA Head**. Five separate deviations look small individually — but the AI shows
that **two are in Manufacturing** and **two are in the QC Lab**, pointing to a systematic
issue you can now fix at the source.

### Step by step
1. Open **Deviation Management**.
2. The **Deviation Intelligence** panel at the top auto-groups your deviations into patterns.
3. Read each pattern's **Suggested root cause**.
4. Click a deviation reference (e.g. `DEV-CHN-2026-001`) to open its full detail.
5. Investigate and fix the **shared cause**, not just each symptom.

### What this screenshot shows
The **Deviation Management** page. KPIs: **Total 5 · Open 1 · Under investigation 3 ·
Overdue 4**. The **Deviation Intelligence** panel shows **"2 patterns"** with a note
*"AI-clustered patterns across 5 deviations. Suggestions are advisory…"*:
- **Recurring deviations in Manufacturing** — 2 deviations, 74% confidence; chips *2 major,
  EM Excursion, Out Of Specification*; **Suggested root cause** about out-of-specification
  controls; cluster members `DEV-CHN-2026-001`, `DEV-CHN-2026-002`.
- **Recurring deviations in QC Lab** — 2 deviations, 74% confidence; chips *1 major, 1 minor,
  Documentation, Qualification Overdue*; **Suggested root cause** about
  qualification/calibration scheduling; members `DEV-CHN-2026-003`, `DEV-CHN-2026-004`.

### ❌ What the AI cannot do
- Close deviations
- Approve investigation reports
- Make risk decisions

### Where it shows
**Deviation Management** page (panel above the deviation table).

---

## 4. ✅ Drift Detection — *"smoke detector for system changes"*

![Drift Detection panel](./screenshots/06-drift-detection.png)

### What it is (simple words)
The factory's validated computer systems are supposed to stay in a fixed, approved state.
Over time people quietly change settings, gain extra access, or switch off audit logs —
this slow movement is called **drift**. This AI **continuously watches and raises an alert**
the moment something drifts, so you fix it before an inspector finds it.

### Real-life example
An engineer disables an audit trail "just to troubleshoot" and forgets to turn it back on.
Normally nobody notices for months. With Drift Detection, a **critical alert appears the
same day**, and you re-enable it that week.

### Step by step
1. On the **Dashboard**, an alert says *"1 critical system drift alert detected."*
2. Click **Review drift →** (or open **CSV/CSA Validation**).
3. The **Drift Detection** panel lists the alerts, most serious first.
4. Each alert has a **suggested action** and an owner.
5. A human re-enables the audit trail / revokes the extra access.

### What this screenshot shows
The **CSV/CSA Validation** page. The **Drift Detection** panel shows **"5 open · 1 critical"**
and the alerts:
- 🔴 **Audit Trail Anomaly · Critical · Open** (08 Jun 2026) — *"Audit trail disabled on
  Empower CDS (instrument QC-HPLC-07) for 6 days…"*; action: re-enable & investigate; Owner: IT/CDO.
- 🟠 **Access Creep · Major · Investigating** (06 Jun 2026) — *"LIMS: 3 analyst accounts hold
  the Administrator role — segregation-of-duties conflict…"*; Owner: QA Head.
- 🟠 **Configuration Change · Major · Open** (04 Jun 2026) — *"SCADA high-temperature alarm
  limit for Reactor R-200 changed … outside change control…"*; Owner: Operations Head.
- 🟢 **Configuration Change · Minor · Open** (02 Jun 2026) — *"MES batch-report template (v4)
  differs from the validated baseline (v3)…"*; Owner: CSV/Val Lead.

### ❌ What the AI cannot do
- Change system configurations
- Restore access controls
- Make IT security decisions

### Where it shows
**Dashboard** (alert) + **CSV/CSA Validation** page (panel).

---

## 🏠 Bonus — the Dashboard ties it together

![Dashboard AGI Insights](./screenshots/02-dashboard-agi-insights.png)

### What this screenshot shows
The **Dashboard** with KPI cards (Overall readiness, Critical findings, CAPA overdue,
CSV high risk, Training compliance) and, on the right, the **AGI Insights** panel
(marked **autonomous**). This is where several agents surface their headline alerts together:
- *"2 new FDA/EMA regulatory requirements flagged — review compliance alignment."* → **Review guidance**
- *"1 critical system drift alert detected (audit-trail coverage drop)."* → **Review drift**
- *"2 CAPAs past due. Risk of inspection finding."* → **View CAPAs**

So the Dashboard is the **single place** where the AI brings the most urgent things to your
attention, each with a one-click link to act.

---

## 📋 Quick summary

| AI feature | In one line | Shows in | AI never… |
|---|---|---|---|
| **FDA 483 Draft Response** | One-click reply letter to the FDA | FDA 483 → Response tab | signs/submits to FDA |
| **Regulatory Intelligence** | News alerts for new medicine rules | Dashboard + own page | interprets/decides compliance |
| **Deviation Intelligence** | Connects the dots across repeating problems | Deviation Management | closes or approves anything |
| **Drift Detection** | Smoke detector for system changes | Dashboard + CSV/CSA | changes systems or access |

---

## 🔑 How to try it yourself

1. Log in as the **QA Head**: `qa@pharmaglimmora.com` / `Demo@123`
2. Use the sidebar to visit each feature:
   - **FDA 483 & Regulatory** → open `WL-MUM-2026-001` → Response tab → **AI Draft**
   - **Regulatory Intelligence**
   - **Deviation Management** (Deviation Intelligence panel at the top)
   - **CSV/CSA Validation** (Drift Detection panel at the top)
3. To turn any agent on/off: **Settings → AGI Policy**.

---

## ℹ️ Honest status (what's built vs not)

**Built and working (4 of 6 agents):** FDA 483 Draft Response, Regulatory Intelligence,
Deviation Intelligence, Drift Detection.

**Not built yet (2 agents — only the on/off switch exists):**
- **CAPA Effectiveness Monitor** — would check whether your fixes (CAPAs) actually worked
  and flag weak ones.
- **Supplier Quality Agent** — would score suppliers/vendors by risk.

All built features currently use **mock AI** (`MOCK_AI_RESPONSES = true`). Connecting a real
AI model later changes only the "brain" behind each feature — the screens stay identical.

---

*Document generated for the Pharma Glimmora AI feature set.*
