# Glimmora — Quality System Documentation

**Glimmora Pharma — Quality Management System**

**Version 0.9 — DRAFT, pending verification**  ·  28 July 2026

Approved by: _________________________   Date: _____________

> **DRAFT — NOT FOR DISTRIBUTION.** This document is pending a walk-through of the running app. Points marked `[VERIFY]` are not yet confirmed on screen. See **Known Unverified Points** below.

---

## Known Unverified Points

This draft is pending live-app verification. Rows 1 and 6 are **fix-the-app** items, not wording choices. The Support and CSV/CSA chapters (rows 14 and 15) are **provisional** — they were not part of the review and must be completed against the live app before they can be relied on.

One punch-list for **both** manuals — the user manual (`docs/manual/`) and the process manual
(`docs/process/`). Each row is one `[VERIFY]` tag. Carry this through the running app before either
manual is called final.

Sorted **hardest-consequence first** — the top rows can mislead a user or leave a record stuck if the
manual is wrong; the lower rows are label and column confirmations that only affect polish. Tick
**Done** once you've confirmed the screen matches (or logged a correction). The **Source** column shows
which file(s) depend on the answer — some rows fix two or three documents at once.

**Total open: 38** (behaviour & access: 15 · labels & tiles: 23).

## Behaviour & access — check these first (a wrong answer misleads the user)

| # | Source | What the manuals claim | What to check on screen | Done |
|---|---|---|---|:--:|
| 1 | user `04-DEVIATIONS.md` §7 **and** process `02-DEVIATION.md` Step 8 + §7 | A **Rejected** deviation does **not** move on; both manuals warn the on-screen wording ("returned to investigation") disagrees with the actual, terminal outcome. | Reject a deviation in a test record. Where does it go — truly back to investigation, or a dead stop? **Two documents get corrected at once.** Fix both manuals and flag the mismatch to the build team. | [ ] |
| 2 | user `02-DASHBOARD.md` | Clicking a **headline tile** may lead toward the scorecards, which only QA Head and Customer Admin can open. | Sign in as a non-oversight role (e.g. QC Lab Director). Click each headline tile. Does it open something useful, get refused, or bounce back? Record what happens per tile. | [ ] |
| 3 | user `02-DASHBOARD.md` | Headline numbers are site-wide, but clicking through shows most roles only **their own** records, so the list can be shorter than the number. | As a non-oversight role, click a tile / heatmap cell / plan row and compare the count with the list you land on. Confirm the "shorter list is normal" explanation holds. | [ ] |
| 4 | user `09-TRAINING.md` **and** process `07-READINESS.md` | Completing a readiness task is **final — there's no undo**. | Mark a readiness task complete in a test inspection. Is there any way to reopen it? If yes, both manuals must change. | [ ] |
| 5 | user `06-INSPECTIONS.md`, user `50-WALKTHROUGHS.md` (Story 3) **and** process `04-FDA483.md` | Signing/submitting the response is for **QA Head and Regulatory Affairs**; the on-screen note may say only QA Head. | Sign in as Regulatory Affairs. Can you actually sign and submit a response? Read the on-screen wording and confirm it isn't wrongly limiting it to QA Head. **Fixes three documents.** | [ ] |
| 6 | process `03-CAPA.md` §4 + §5 | On **older** corrective actions, the app decides "who raised it" by matching **names**, which weakens the "must be a different person" check for the root-cause review, the close, and the effectiveness check. | On an older corrective action, confirm the original author is firmly identified, not just name-matched. Where it's name-matched, treat the independence check as unreliable. **Fix-the-app item for old records.** | [ ] |
| 7 | user `02-DASHBOARD.md` | The **overdue corrective-action** tile shows in full to QA Head/Customer Admin; other roles reach that work via My Work. | As a non-oversight role, look at the corrective-action tile. Is it empty, a number, or hidden? Record what that role sees. | [ ] |
| 8 | user `08-GOVERNANCE.md` **and** process `06-GOVERNANCE.md` §3 | Archiving a risk/meeting **may not show a confirmation**; the manuals tell users to refresh and check. | Archive a risk as Customer Admin. Is there a success (or failure) message? If it can fail silently, keep the caution; if it confirms clearly, soften it. | [ ] |
| 9 | user `06-INSPECTIONS.md` **and** process `04-FDA483.md` | The screen **may offer importing observations** from an inspection document. | Open an inspection's Observations. Is there an import-from-document option? If yes, it deserves a walkthrough; if no, remove the tag. | [ ] |
| 10 | user `12-SETTINGS.md` | Adding a person or site **may hit a plan limit**; the manual points the user to their account contact. | Confirm the exact wording shown when a limit is reached, and that the manual's plain-language version matches. | [ ] |
| 11 | user `10-MY-WORK.md` | For a **deviation task**, notes are added **at submit**, not saved separately (unlike gaps and corrective actions). | Open a deviation task in My Work. Is there a separate "Save notes", or only notes-at-submit? Correct the manual to match. | [ ] |
| 12 | process `01-GAP.md` §2 | The person who **raised** a finding can correct its details including the **area** — the audit is unsure the screen actually allows editing "area". | As the raiser of a finding, try to change its **area**. Does the screen allow it? Confirm whether "area" belongs in the raiser's limited-edit set. | [ ] |
| 13 | user `09-TRAINING.md` **and** process `07-READINESS.md` §7 | Readiness tasks **may carry due dates**, which is when **Overdue** would appear. | Check whether the standard readiness tasks have due dates. If none do, note that "Overdue" won't normally appear. | [ ] |
| 14 | **process `08-SUPPORT.md` (whole chapter) — NEW** | Support was **not covered by the audit**. Only "anyone can raise a request" and the alert points (a reply notifies the other side; escalation notifies the platform admins; raising sends no alert) are confirmed; everything else is a skeleton. | Walk Support end to end in the live app: who can reply, escalate, resolve, close, reopen, cancel; the fields; the statuses; whether anything is password-signed. Fill the chapter from what you find. | [ ] |
| 15 | **process `09-CSV.md` (process & sign-off) — NEW** | For CSV/CSA, the **roles and stage statuses are reliable** (from the app's shared definitions), but the **step-by-step flow and screens are not confirmed**, and it's unknown whether stage approval / sign-off is **password-signed**. | Walk a validation stage: prepare → submit → approve/reject → sign-off. Confirm the exact steps and gates, who assigns a rework task, whether the person who prepared a stage may approve it, and whether sign-off asks for a password. | [ ] |

## Labels, columns & tiles — confirm the words match (polish)

| # | Source | What the manuals claim | What to check on screen | Done |
|---|---|---|---|:--:|
| 16 | user `02-DASHBOARD.md` | Five headline tiles named readiness / critical findings / overdue corrective actions / validation at high risk / training. | Confirm the exact tile names and how many tiles there are. | [ ] |
| 17 | user `02-DASHBOARD.md` | The time filter starts on a recent window by default. | Confirm the default period and the list of period choices. | [ ] |
| 18 | user `02-DASHBOARD.md` | A heatmap cell selects through to related findings. | Confirm the click target of a heatmap cell. | [ ] |
| 19 | user `03-GAP-ASSESSMENT.md` | The **Summary** view shows counts/charts of your findings. | Confirm what the Summary view actually shows. | [ ] |
| 20 | user `03-GAP-ASSESSMENT.md` | The **Register** shows reference, title, severity, status, owner, target date. | Confirm the exact columns. | [ ] |
| 21 | user `03-GAP-ASSESSMENT.md` | The Register offers filters (e.g. by status, severity). | Confirm the exact filters available. | [ ] |
| 22 | user `04-DEVIATIONS.md` | The deviation list shows reference, title, severity, priority, status, reporter. | Confirm the exact columns and any filters. | [ ] |
| 23 | user `05-CAPA.md` | The CAPA list shows reference, title, status, owner. | Confirm the exact columns and filters. | [ ] |
| 24 | user `05-CAPA.md` | The CAPA detail groups plan/root cause, people & their work, review, evidence, discussion. | Confirm the section names and arrangement on the detail page. | [ ] |
| 25 | user `06-INSPECTIONS.md` | Detail tabs are Overview / Observations / Investigation / Response / History. | Confirm the exact tab names (including the history tab). | [ ] |
| 26 | user `06-INSPECTIONS.md` **and** process `04-FDA483.md` | The readiness step refers to **commitments** being complete or withdrawn. | Confirm the word "commitments" appears on screen. | [ ] |
| 27 | user `06-INSPECTIONS.md`, user `50-WALKTHROUGHS.md` **and** process `04-FDA483.md` — NEW | An observation shows a particular status **after its root cause is recorded** (before a corrective action is linked). | Record a root cause on an observation and read the status label it shows at that point. Confirm the manuals' wording. | [ ] |
| 28 | user `07-EVIDENCE.md` | The library offers filters (e.g. by where a document came from). | Confirm the exact filters. | [ ] |
| 29 | user `07-EVIDENCE.md` | Tiles show total / editable / locked / recent counts. | Confirm the exact tiles. | [ ] |
| 30 | user `07-EVIDENCE.md` **and** process `05-EVIDENCE.md` §7 | Documents are shown as "yours to manage" vs "Locked". | Confirm the exact status labels shown. | [ ] |
| 31 | user `08-GOVERNANCE.md` | The Risk Register shows title, category, severity, likelihood, owner, status. | Confirm the exact columns and filters. | [ ] |
| 32 | user `08-GOVERNANCE.md` **and** process `06-GOVERNANCE.md` §3 | The KPIs view exports a quality report. | Confirm the exact report name. | [ ] |
| 33 | user `09-TRAINING.md` | Views are Overview / Tasks / Training / Activity. | Confirm the exact tab names. | [ ] |
| 34 | user `09-TRAINING.md` **and** process `07-READINESS.md` | An inspection has labels while being prepared and once closed out. | Confirm the labels shown for an inspection in preparation vs closed out. | [ ] |
| 35 | user `10-MY-WORK.md` | Summary tiles show total / overdue / due this week / waiting on you. | Confirm the exact tiles. | [ ] |
| 36 | user `10-MY-WORK.md` | Task labels are Not Started / In Progress / Returned / Submitted / Done / Closed. | Confirm the exact status wording. | [ ] |
| 37 | user `12-SETTINGS.md` | Editable tabs are People / Sites / Standards; view-only are Subscription / Organisation details. | Confirm the exact tab names. | [ ] |
| 38 | process `00-ACCESS.md` §3 — NEW | An admin sets a person's **site(s)** when adding them; the exact place on the People screen isn't pinned down. | Open **Settings → People → Add** (and a person's edit). Confirm where the site is set, and that site-less roles (QA Head, Customer Admin) don't require one. | [ ] |

---

**When every row is ticked** (or its correction applied), both manuals are safe to call final. Rows 1–6
are the ones that would most embarrass us with a real user — do those before anything else. Rows **1 and
6** are also **fix-the-app** items, not just wording. Rows **14 and 15** are whole-chapter unknowns
(Support and CSV/CSA were never audited) — those two chapters can't be called final until someone walks
them in the live app.

---

## Contents

**Part 1 — User Manual**

- [Glimmora Quality System — User Guide](#glimmora-quality-system--user-guide)
- [Chapter 1 — Getting Started](#chapter-1--getting-started)
- [Chapter 2 — The Dashboard](#chapter-2--the-dashboard)
- [Chapter 3 — Gap Assessment & Findings](#chapter-3--gap-assessment--findings)
- [Chapter 4 — Deviations](#chapter-4--deviations)
- [Chapter 5 — CAPAs](#chapter-5--capas)
- [Chapter 6 — Inspections & Regulatory Responses](#chapter-6--inspections--regulatory-responses)
- [Chapter 7 — Evidence & Documents](#chapter-7--evidence--documents)
- [Chapter 8 — Governance & KPIs](#chapter-8--governance--kpis)
- [Chapter 9 — Training & Awareness](#chapter-9--training--awareness)
- [Chapter 10 — My Work](#chapter-10--my-work)
- [Chapter 11 — Staying Informed](#chapter-11--staying-informed)
- [Chapter 12 — Administration & Settings](#chapter-12--administration--settings)
- [Chapter 50 — Worked Examples](#chapter-50--worked-examples)
- [Chapter 99 — Roles at a Glance](#chapter-99--roles-at-a-glance)

**Part 2 — Process Manual**

- [Process — Managing People & Access](#process--managing-people--access)
- [Process — Gap Assessment (Findings)](#process--gap-assessment-findings)
- [Process — Deviations](#process--deviations)
- [Process — CAPA (Corrective and Preventive Action)](#process--capa-corrective-and-preventive-action)
- [Process — Inspections & Regulatory Responses](#process--inspections--regulatory-responses)
- [Process — Evidence & Documents](#process--evidence--documents)
- [Process — Governance & KPIs](#process--governance--kpis)
- [Process — Training & Awareness (Inspection Readiness)](#process--training--awareness-inspection-readiness)
- [Process — Support](#process--support)
- [Process — CSV / CSA Validation](#process--csv--csa-validation)

---

# Part 1 — User Manual

# Glimmora Quality System — User Guide

**For:** quality and operations staff using the Glimmora app day to day.
**Last updated:** 28 July 2026.

This guide explains what you can do in the app, screen by screen, in plain language. You do not need
any technical background to use it. Read the chapter that matches the job in front of you.

---

## What this guide covers

The app is where your organisation runs its quality work: recording gaps, investigating deviations,
managing corrective actions, preparing for inspections, and keeping the evidence and records that
prove it all happened. Each chapter below covers one part of that work.

---

## Chapters

| # | Chapter | What it's for |
|---|---|---|
| 1 | **Getting Started** | Signing in, finding your way around, and the words you'll see everywhere. |
| 2 | **The Dashboard** | Your at-a-glance view of readiness and what needs attention. |
| 3 | **Gap Assessment & Findings** | Recording a compliance gap and taking it to closure. |
| 4 | **Deviations** | Reporting something that went off-plan and investigating it. |
| 5 | **CAPAs** | Running a corrective and preventive action from start to sign-off. |
| 6 | **Inspections & Regulatory Responses** | Managing an inspection and its formal response. |
| 7 | **Evidence & Documents** | Uploading and finding the documents that support your records. |
| 8 | **Governance: Risks & Management Reviews** | The risk register and the record of management meetings. |
| 9 | **Training & Inspection Readiness** | Preparing for an inspection and tracking readiness. |
| 10 | **My Work** | The single list of everything assigned to you. |
| 11 | **Staying Informed** | How the app tells you when something needs you. |
| 12 | **Administration & Settings** | Managing people, sites, and organisation settings. |
| 99 | **Roles at a Glance** | A one-page summary of what each role can and can't do. |

> This pass of the guide includes chapters 1, 12 (roles overview), and 99. The remaining chapters
> follow.

---

## Which chapters apply to me

Find your role down the side. A tick means you'll use that chapter.

| Your role | 1 Start | 2 Dash | 3 Gaps | 4 Devs | 5 CAPA | 6 Insp | 7 Evid | 8 Gov | 9 Train | 10 Work | 11 Alerts | 12 Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| **QA** | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| **CSV / Validation Lead** | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| **Regulatory Affairs** | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| **QC Lab Director** | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| **IT / CDO** | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| **Operations Head** | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ | ✓ | ✓ | |
| **Customer Admin** | ✓ | ✓ | | | ✓* | | ✓* | ✓* | | | ✓ | ✓ |
| **Viewer** | ✓ | ✓ | ✓* | ✓* | | ✓* | ✓* | | ✓* | | ✓ | |

**✓\*** = you can see and read these records, but you can't create or change them.

**A note on the Platform Admin role:** the Platform Admin manages the platform itself and works in a
separate administration area. That area is not part of this guide, and the Platform Admin does not
create or work on quality records.

---

## How to read this guide

- **"You"** means you, the person signed in.
- **"The screen"**, **"the list"**, **"the form"**, **"the button"** mean exactly what they say.
- Where a chapter says only certain roles can do something, that limit is real — the app will stop
  anyone else, and it does so to keep quality decisions with the right people.

---

# Chapter 1 — Getting Started

This chapter gets you into the app, shows you the menu, and explains a few things that surprise
first-time users. It ends with a short glossary of the words you'll meet everywhere.

---

## Signing in

1. Open the app. You'll see the sign-in screen.
2. Enter your email address (or the username your organisation gave you).
3. Enter your passcode.
4. Select **Sign in**.

When you sign in, the app takes you straight to your starting screen. Your work is tied to your site,
so you land ready to work without picking anything.

### If you can't get in

The sign-in screen keeps the reason for a failed sign-in deliberately vague, so no one can learn
whether an email address exists. Use the guide below to work out what to do.

| What you see or suspect | What it usually means | What to do |
|---|---|---|
| "Incorrect email or password" | Your email or passcode was wrong. | Check for typos and try again. There is no self-service reset — if you're sure they're right, use the contact details shown on the sign-in screen, or ask your Customer Admin to help. |
| You're sure your details are right but still can't get in | Your account may have been switched off. | Your account may be inactive — contact your Customer Admin or QA Head to have it re-enabled. |
| A message that access is suspended | Your organisation's access has been paused. | This is an organisation-wide matter — contact your Customer Admin. |
| A message about no site | You haven't been assigned to a site yet. | You need a site before you can work — contact your Customer Admin or QA Head to be assigned one. |
| A message that a subscription has expired | Your organisation's plan has lapsed. | Contact your Customer Admin; this is sorted out at the organisation level. |

Whatever the reason, your own details are never shown to anyone else, and a failed attempt doesn't
change anything.

### Signing out

Select your name or the sign-out control in the menu, and confirm. You're returned to the sign-in
screen.

---

## The menu down the left

The menu is how you move around. You only see the items your role uses, so your menu may be shorter
than a colleague's. Here is every item and what it's for.

| Menu item | What it's for | Who sees it |
|---|---|---|
| **Dashboard** | Your at-a-glance view of readiness and open work. | Everyone (except Platform Admin). |
| **Gap Assessment** | Record a compliance gap and take it to closure. | Most roles. |
| **Deviation Management** | Report something that went off-plan and investigate it. | Everyone (except Platform Admin). |
| **CAPA Tracker** | Manage corrective and preventive actions. | **Only QA Head and Customer Admin.** Everyone else works their CAPA tasks from **My Work**. |
| **My Work** | One list of everything assigned to you. | Everyone (except Platform Admin). |
| **CSV/CSA Validation** | Manage computer system validation. | Roles that do validation work. |
| **Inspections & Regulatory** | Manage an inspection and its formal response. | Most roles. |
| **Evidence & Documents** | Your library of supporting documents. | Most roles. |
| **Training & Awareness** | Prepare for an inspection and track readiness. | Everyone (except Platform Admin). |
| **Governance & KPIs** | The risk register and management-review records. | **Only QA Head and Customer Admin.** |
| **Audit Trail** | The record of who did what. | **Only QA Head and Customer Admin.** |
| **Settings** | Manage people, sites, and organisation settings. | Mainly Customer Admin. |
| **Support** | Raise a support request. | Everyone. |

---

## Why can't I see records other people mention?

This is the most common early question, and the answer is by design.

- **Most people see only their own work.** If you raised a record, or it was assigned to you, you see
  it. If it belongs to someone else, it usually won't appear in your lists. This keeps everyone
  focused on what's theirs and keeps records private to the people working them.
- **QA Head and Customer Admin see everything for the site.** These two roles have an oversight view,
  so they can see all the site's records, not just their own.
- **My Work only ever shows work assigned to you.** It never shows a colleague's tasks. If a task
  isn't in your My Work, it isn't yours to do.

So if a colleague mentions a record you can't find, either it hasn't been assigned to you, or it's
one only the oversight roles can see. Ask the person who owns it, or ask your QA Head.

---

## Why does the app ask for my password again?

Some actions are **legally signed actions**. Signing one is like putting your name on a paper record:
it records that *you*, at that moment, took that decision. Because the app can't just take your word
that you're still the person sitting there, it asks you to enter your password again at the moment you
sign.

You'll be asked for your password when you:

- **Close a deviation.**
- **Reject a deviation** (send it back).
- **Sign and close a CAPA.**
- **Sign and submit an inspection response.**
- **Record the outcome of an inspection.**

Administrators are also asked for their password when they **remove a site or a person**, or when they
**change who is allowed to sign**.

**If the password is wrong**, the action does not go through. Nothing is changed, and the app records
that a signing attempt was made. Simply enter the correct password and try again.

---

## Glossary

Plain-language meanings for the words you'll see throughout the app.

**Deviation** — Something that happened differently from the approved plan or procedure. You report a
deviation so it can be investigated and put right.

**Finding** — A gap between what a rule or standard requires and what your organisation currently
does. You record a finding so the gap can be closed with evidence.

**CAPA** — A Corrective and Preventive Action. It's the structured piece of work that fixes a problem
and stops it coming back. A CAPA is usually raised from a deviation, a finding, or an inspection.

**Root Cause** — The real underlying reason a problem happened, not just its symptom. Recording the
root cause is what makes a fix trustworthy, and the app won't let some records close without one.

**Evidence** — The documents and files that prove work was done: a signed procedure, a training
record, a photo, a report. Evidence is attached to the record it supports.

**Signature** — A legally signed action inside the app. When you sign, the app records who you are,
the exact time, and what you were agreeing to. It asks for your password to confirm it's really you.

**Audit Trail** — The permanent, unchangeable history of who did what and when. Every important action
adds a line to it. It can be read by the oversight roles but never edited or erased.

**Separation of Duties** — The rule that the same person shouldn't both do a piece of work and approve
their own work. For example, the person who investigates a deviation can't be the one who signs it
closed. The app enforces these rules for you so quality decisions always have a second pair of eyes.

---

# Chapter 2 — The Dashboard

## 1. What this is for

The Dashboard is your starting screen and your at-a-glance view of how the site is doing. It shows
headline numbers on readiness, open critical work, and overdue actions, so you can see where attention
is needed without opening every screen. It's a place to look and jump off from — you don't do work
here, you go from here to the work.

## 2. Who uses it

Everyone lands on the Dashboard when they sign in (except the Platform Admin, who works elsewhere). The
headline numbers are the same for everyone — they cover the whole site. What differs is what you see
when you click through into the detail: QA Head and Customer Admin see all the records behind a number,
while other roles see only the records that are theirs (see section 3).

## 3. The screens

The Dashboard is one page with several parts. [VERIFY] the exact tiles, labels, and click targets on
your screen — the names below are descriptive.

**The headline tiles** across the top give you the key numbers, for example:

- **Overall readiness** — how prepared the site is, as a percentage.
- **Critical findings** — how many serious gaps are open.
- **Overdue corrective actions** — how many corrective actions are past their due date.
- **Validation at high risk** — how many systems need validation attention.
- **Training** — how far along training is, as a percentage.

[VERIFY] the exact tile names and how many there are.

> **Important — the numbers are site-wide, but your lists may be shorter.** Every headline number
> counts the whole site. When you click through to see the records behind a number, though, most roles
> see only the records they raised or were assigned — so the list you land on can be shorter than the
> number suggested. That's expected: QA Head and Customer Admin see everything behind a number;
> everyone else sees their own share. [VERIFY] exactly where each tile takes you, and what a non-QA-Head
> user sees when they click a headline tile — some tiles lead toward the scorecards, which only QA Head
> and Customer Admin can open.

**The other panels** on the page typically include:

- A **readiness heatmap** — a grid showing how each area is doing. Selecting a cell takes you to the
  related findings. [VERIFY] the click target.
- A **trend chart** — how findings by severity have moved over time.
- A **90-day plan** — the near-term work that needs attention. The rows here are already limited to
  what you can see, so they match your own lists.
- **Insight** and **risk-signal** panels — short prompts pointing you to where attention is needed,
  each with a link into the relevant screen.
- An **Ask AI** panel — a way to search your records in plain language. It searches only the records
  you're allowed to see.

## 4. How to…

### Read the Dashboard

1. Sign in. You arrive on the Dashboard.
2. Read the headline tiles for the site's overall position.
3. Scan the panels below for where attention is needed.

### Focus the view with filters

1. Use the **time** filter to change the period the Dashboard covers. It starts on a recent window by
   default. [VERIFY] the default period and the choices offered.
2. Use the **severity** filter to focus on more serious items.
3. If your role covers more than one site, use the **site** filter to switch between them. If you work
   at a single site, you won't see this choice.
4. Use **Clear filters** to return to the full view.

### Jump to the work behind a number

1. Select a tile, a heatmap cell, a plan row, or an insight link.
2. The Dashboard takes you to the matching screen. Remember the note in section 3: the number was
   site-wide, but the list you land on shows what you're allowed to see.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **The list I clicked into is shorter than the number on the tile** | The tile counts the whole site; the list shows only the records that are yours. This is normal for most roles. QA Head and Customer Admin see the full list behind a number. |
| **Clicking a headline tile didn't take me where I expected** | Some tiles lead toward the scorecards, which only QA Head and Customer Admin can open. [VERIFY] what a non-oversight role sees when selecting these tiles. |
| **There's no site filter for me** | You're assigned to a single site, so there's nothing to switch between. The site filter only appears for roles that cover more than one site. |
| **The corrective-action numbers look empty for me** | The corrective-action detail is shown in full to QA Head and Customer Admin. Other roles reach their own corrective-action work through **My Work**. [VERIFY] what the tile shows for a non-oversight role. |
| **An insight or link didn't lead anywhere useful** | Insight panels point you toward a screen; if the underlying area isn't one your role opens, the prompt may not apply to you. |

## 6. What happens next

The Dashboard doesn't create work or send alerts — it's a read-only overview. It's a launch point: from
here you move into the screens where the actual work happens. Alerts about work assigned to you appear
on the bell (Chapter 11), not on the Dashboard.

## 7. Statuses

The Dashboard has no statuses of its own. It **summarises** the state of records that live in other
screens — findings, corrective actions, inspections, and validation — using their own statuses. To
understand a status behind a number, see the chapter for that record:

| Behind this number | See |
|---|---|
| Critical findings | Chapter 3 — Gap Assessment |
| Overdue corrective actions | Chapter 5 — CAPAs |
| Readiness / training | Chapter 9 — Training & Awareness |
| Validation at high risk | The validation screen |

---

# Chapter 3 — Gap Assessment & Findings

## 1. What this is for

A **finding** is a gap between what a rule or standard requires and what your organisation does today.
This screen is where you record a finding, work it, and take it to a verified close. It keeps each gap
visible, owned, and backed by evidence until someone independent confirms it's resolved.

## 2. Who uses it

Most working roles use this screen: QA Head, QA, CSV/Validation Lead, Regulatory Affairs, QC Lab
Director, IT/CDO, and Operations Head can all raise and work findings. QA Head also assigns, reviews,
and closes them. Customer Admin and Viewer can read findings but cannot create or change them.

## 3. The screens

The Gap Assessment area has three views you switch between at the top.

**Summary** — an overview of your findings: how many are open, and how they break down. Use it to see
where attention is needed at a glance. [VERIFY] the exact counts and charts shown here.

**Register** — the working list of findings. This is where you spend most of your time.

- **Columns** you'll see include the finding's reference, a short title, its **severity** (Critical,
  High, Medium, or Low — how serious the gap is), its **status** (where it is in its life — see
  section 7), its owner, and its target date. [VERIFY] the exact column set on your screen.
- **Filters and search** let you narrow the list — for example, to open findings, or a particular
  severity. [VERIFY] the exact filters available.
- Selecting a row opens the finding's detail, where you do everything below.

**Evidence** — a view of the documents attached to findings. Selecting an item takes you to the
finding it belongs to.

From a finding's detail you can, depending on your role and where the finding is: record the root
cause, add or edit details, attach a document, assign it (QA Head), raise a CAPA from it (QA Head),
and review or close it (QA Head).

## 4. How to…

### Report a gap

1. In the **Register** view, select **Report Gap** at the top.
2. Fill in the form:
   - **Requirement** — what the rule or standard requires. This is required and needs a real
     sentence, not a couple of words.
   - **Area** — the area the gap sits in. Required.
   - **Severity** — Critical, High, Medium, or Low. Required.
   - **Target date** — when you expect it resolved. Required, and it can't be in the past.
   - If your role covers more than one site, pick the **site**. If you work at a single site, the app
     sets it for you and you won't see this choice.
3. Optionally attach a supporting document.
4. Select the confirm button. The button stays unavailable until the required entries are filled in.
5. You'll see a short "Finding logged" confirmation, and the finding appears in the Register as
   **Open**, owned by you.

### Record the root cause

1. Open the finding from the Register.
2. Find the **Root Cause** section.
3. Choose how you worked it out, and write the root cause.
4. If the finding already has a root cause and you're changing it, you must give a reason of at least
   a few words. On a first entry, no reason is needed.
5. Save. You'll see a confirmation and the root cause now shows on the finding.

You can record the root cause if you raised the finding — but only up until QA assigns it to someone.
After that, QA Head records or changes it. QA Head can always record it.

### Assign a gap to someone (QA Head)

1. Open the finding.
2. In the disposition area, choose the person to assign it to, then select the assign button.
3. You can't assign a finding to yourself. The person you pick must be an active member of your site.
4. The finding moves to **In Progress** and lands in that person's **My Work**.

Assigning this way is for **Low** severity findings. For High, Medium, and Critical findings, raise a
CAPA instead (below).

### Raise a CAPA from a gap (QA Head)

1. Open the finding.
2. Select **Raise CAPA**.
3. Confirm the details and create the CAPA.
4. The gap is now **locked** to the CAPA — you continue the work in the CAPA, and the finding closes
   automatically when the CAPA is signed and closed.

### Submit your assigned gap for review (from My Work)

If a gap was assigned to you, you work and submit it from **My Work**, not from the Gap Assessment
screen.

1. Open **My Work** and select the finding.
2. Attach any evidence and add your notes (at least a short sentence).
3. Select **Submit to QA**.
4. The finding moves to **Submitted** and goes to QA Head to review.

### Review a submitted gap (QA Head)

1. Open the finding.
2. In the review area you have two choices:
   - **Accept & close** — you're satisfied. The finding moves to **Closed**.
   - **Send for rework** — it needs more. Give a short reason. The finding moves to **Rework** and
     goes back to the person who did it.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **No "Report Gap" button** | Your role can't raise findings. Viewers and Customer Admins can read findings but not create them. Ask a colleague in a working role, or your QA Head. |
| **I can change the details but not the severity or status** | As the person who raised the finding, you can correct its details, but severity and status are QA judgments. Ask your QA Head to change them. |
| **I can't edit the finding at all** | It's likely closed, or a CAPA has been raised from it (which locks it), or it isn't one you raised or were assigned. Continue the work in the linked CAPA if there is one. |
| **The Root Cause section is read-only** | Once QA assigns the finding to someone, only QA Head can change the root cause — the work has been handed off. It's also read-only once a CAPA has been raised. |
| **"Accept & close" is greyed out — no root cause** | A finding can't close without a root cause. Record the root cause first (there's a link to that section), then close. |
| **"Accept & close" is greyed out — you recorded the root cause** | You can't close a finding when you recorded its root cause — ask a colleague to close it. This keeps the review independent. |
| **"Accept & close" is greyed out — you did the work** | You can't review a finding that was assigned to you. A different QA Head must review it. |
| **I can't assign the finding to myself** | You can't assign a finding to yourself — assign it to someone else so the work and the review stay separate. |
| **"Assign" only appears for some findings** | Assignment is for Low severity findings. For higher severities, raise a CAPA instead. |
| **There's no "Submit" on the Gap screen** | If a gap was assigned to you, you submit it from **My Work**, not from here. |

## 6. What happens next

- **When you assign a finding**, the person you assigned it to gets an alert, and it appears in their
  **My Work**.
- **When you accept and close a finding**, the person who did the work is told it was accepted and
  closed.
- **When you send a finding back for rework**, that person is alerted and the finding returns to their
  **My Work** with your reason.

Raising a finding, recording a root cause, and attaching evidence don't send an alert. QA Head sees
new and submitted findings by looking at the Register.

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | The finding has been raised. No one is working it yet. |
| **In Progress** | It's been assigned to someone (or a CAPA has been raised from it) and work is under way. |
| **Submitted** | The person who did the work has sent it to QA Head for review. |
| **Rework** | QA Head sent it back for more work. It returns to the person who did it, who addresses the feedback and resubmits. |
| **Closed** | The gap is resolved and verified by QA Head. This is the end of the line. |

---

# Chapter 4 — Deviations

## 1. What this is for

A **deviation** is something that happened differently from the approved plan or procedure. This
screen is where you report a deviation, investigate its root cause, decide whether a CAPA is needed,
and close it with a signature. It keeps each deviation moving through a controlled path where the
person who reports, the person who investigates, and the person who signs it closed are kept separate.

## 2. Who uses it

QA Head, QA, CSV/Validation Lead, Regulatory Affairs, QC Lab Director, IT/CDO, and Operations Head can
all report deviations. QA Head runs the decisions — starting the investigation, deciding on a CAPA,
and closing or rejecting. The investigation itself can be done by any of the working roles, as long as
it isn't the person who reported it. Customer Admin and Viewer can read deviations but not change them.

## 3. The screens

The Deviation area opens as a list of deviations. Selecting one opens its detail, where the whole life
of the deviation lives in one place.

**The list** shows each deviation's reference, a short title, its **severity** and **priority** (how
serious and how urgent), its **status** (see section 7), and who reported it. [VERIFY] the exact
columns and any filters on your screen.

**The detail** brings together:

- The core report — what happened, the area, the immediate action taken.
- The **Investigation** section — where the root cause is recorded.
- The **CAPA decision** — whether a CAPA is needed, with the reason.
- **Documents** — supporting files attached by the person who reported it.
- For low-priority deviations, a **task** area where a specific person is asked to do a piece of work
  and submit it back.

What you can do here depends on your role and where the deviation is in its life.

## 4. How to…

### Report a deviation

1. Select **Report Deviation** at the top of the list.
2. Fill in the form:
   - **Title** — a short summary. Required.
   - **Description** — what happened. Required.
   - **Type** — planned or unplanned. Required.
   - **Category** and **Severity** — required.
   - **Area** — where it happened. Required.
   - **Immediate action** — what you did straight away. Required.
   - **Due date** — required, and not in the past.
   - If your role covers more than one site, pick the **site**; otherwise the app sets it for you.
3. Optionally attach a supporting document.
4. Select confirm. The button stays unavailable until the required entries are filled in.
5. You'll see a short "reported" confirmation, and the deviation appears as **Open**.

### Attach a supporting document (the person who reported it)

1. Open the deviation.
2. In the Documents area, add your file.

Only the person who reported the deviation attaches its evidence. QA reviews the evidence rather than
adding it.

### Start the investigation (QA Head)

1. Open an **Open** deviation.
2. Select **Start Investigation**. The deviation moves to **Under Investigation**.

### Record the investigation and root cause

1. Open the deviation (now Under Investigation).
2. In the **Investigation** section, choose how you worked out the cause and write the root cause.
   Both are required.
3. Save. When the investigation is complete, the deviation moves to **Pending QA Review**.

The investigation must be done by someone other than the person who reported the deviation.

### Make the CAPA decision (QA Head)

1. Open the deviation once the investigation is complete.
2. In the **CAPA decision** area, choose whether a CAPA is required, and give a short reason.
3. Save.

You can make this decision only if you didn't report the deviation and didn't investigate it.

### Raise a CAPA (QA Head)

1. Open the deviation.
2. Select the option to raise a CAPA and confirm.
3. The deviation moves to **CAPA Pending** and stays linked to the CAPA. It waits there until the CAPA
   is closed, then returns for you to sign it closed.

### Assign a low-priority task (QA Head)

1. Open a low-priority deviation.
2. Select **Assign Task**, choose the person, and write a short message about what's needed.
3. The task lands in that person's **My Work**. They do it and submit it back to you.

### Sign and close a deviation (QA Head)

1. Open the deviation when it's ready to close.
2. Select **Sign & Close**.
3. Write a short closing note and enter your **password** to sign.
4. The deviation moves to **Closed**.

For a **Critical** deviation, you can't close it until a CAPA has been raised and linked to it.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **No "Report Deviation" button** | Your role can't report deviations. Viewers and Customer Admins can read them but not raise them. |
| **I can't attach a document** | Only the person who reported the deviation attaches its evidence. If you're QA, you review the evidence rather than adding it. |
| **No "Start Investigation" button** | Only QA Head starts an investigation, and only while the deviation is Open. |
| **I can't record the investigation** | You can't investigate a deviation you reported yourself — ask a colleague to investigate it. This keeps the investigation independent. |
| **I can't make the CAPA decision** | The CAPA decision is QA Head's, and it can't be made by the person who reported or investigated the deviation. |
| **"Sign & Close" is greyed out — not ready** | The investigation isn't complete yet, or (for a Critical deviation) no CAPA has been raised and linked. Finish the investigation, or raise the CAPA first. |
| **"Sign & Close" is greyed out — it's yours** | You can't sign a deviation closed if you reported it, investigated it, or were the person assigned its task. A different QA Head must close it. This keeps the sign-off independent. |
| **I can't reject the deviation** | A deviation can only be rejected while it's under QA review. |
| **"Assign Task" isn't available** | Tasks are for low-priority deviations. For higher priorities, raise a CAPA instead. |

## 6. What happens next

- **When you assign a task**, the person gets an alert and it appears in their **My Work**.
- **When they submit the task back**, you (the QA Head who assigned it) are alerted.
- **When you send a task back for rework**, that person is alerted and the task returns to their
  **My Work**.

The main steps of a deviation's life — starting the investigation, recording the root cause, making
the CAPA decision, closing — don't send an alert. QA Head keeps an eye on the deviation list to see
what's waiting.

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | Reported. The investigation hasn't started. |
| **Under Investigation** | The root cause is being worked out. |
| **Pending QA Review** | The investigation is complete and QA Head is reviewing it, ready to close or reject. |
| **CAPA Pending** | A CAPA has been raised. The deviation stays open and linked until that CAPA is closed. |
| **Closed** | QA Head is satisfied and has signed it closed. This is the end of the line. |
| **Rejected** | QA Head has rejected it. [VERIFY] the on-screen wording suggests it goes back to investigation, but in practice a rejected deviation does not move on — confirm the intended behaviour in the live app before relying on this status. |

---

# Chapter 5 — CAPAs

## 1. What this is for

A **CAPA** — a Corrective and Preventive Action — is the structured piece of work that fixes a problem
and stops it coming back. This screen is where a CAPA is raised, planned, worked by a team, reviewed,
and signed closed. It brings the root cause, the corrective actions, the evidence, and the sign-off
together in one place, with checks that make sure nothing is skipped.

## 2. Who uses it

**Only QA Head and Customer Admin can open the CAPA screen.** Everyone else does their part of a CAPA
from **My Work**, where their assigned pieces appear. QA Head runs the CAPA: raising it, reviewing the
root cause, assigning the corrective work, and signing it closed. Customer Admin can view CAPAs but
cannot create or change them. The people who carry out the corrective work — QA, CSV/Validation Lead,
QC Lab Director, Regulatory Affairs, IT/CDO, and Operations Head — do it through **My Work**.

## 3. The screens

**The CAPA list** shows each CAPA's reference, a short title, its **status** (see section 7), and its
owner. [VERIFY] the exact columns and filters on your screen.

**The CAPA detail** opens as a full page and gathers everything about the CAPA. You'll find:

- **The plan and root cause** — what the CAPA is for, and why the problem happened.
- **The people and their work** — the list of **action items** (the individual pieces of corrective
  work), who each is assigned to, and how each is progressing.
- **The review** — where QA Head reviews the root cause, checks the plan lines up with the problem,
  clears the data-integrity check where one applies, and records how effectiveness will be measured.
- **Evidence** — the supporting files, organised by category.
- **Discussion** — comments, including **concerns**, which are points that must be resolved before the
  CAPA can close.

[VERIFY] the exact names and arrangement of these sections on your screen.

## 4. How to…

### Raise a CAPA (QA Head)

1. From the CAPA list, select the option to add a CAPA.
2. Fill in the form:
   - **Title** — a short summary. Required.
   - **Description** — what the CAPA covers. Required, and it needs a real description, not a few
     words.
   - **Source** and **Risk** — where it came from and how serious it is. Required.
3. Confirm. The CAPA appears as **Open**.

A CAPA is often raised from a deviation, a finding, or an inspection rather than from scratch. When it
is, much of the detail is carried across for you.

### Record and review the root cause

1. Open the CAPA and record the **root cause** in the plan area. Once a root cause is entered, the
   CAPA moves to **In Progress**.
2. QA Head then reviews the root cause and marks it approved (or sends it back). A short note is
   required with the review.

The person who created the CAPA can't be the one who reviews its root cause — a different reviewer is
required so the review stays independent.

### Add and assign an action item (QA Head)

1. In the people-and-work area, add an **action item**.
2. Fill in what needs doing (a real description), who it's assigned to, and the due date. The due date
   can't be after the CAPA's own due date.
3. The person you assign it to must be one of the doer roles — QA, CSV/Validation Lead, QC Lab
   Director, Regulatory Affairs, IT/CDO, or Operations Head. QA Head and administrators assign the
   work; they don't carry it out.
4. The action item lands in that person's **My Work**.

### Complete an action item (the assignee, from My Work)

1. Open **My Work** and select the CAPA action item.
2. Add your notes and attach any evidence.
3. Submit it. It goes to QA Head to review.

### Review a person's completed work (QA Head)

For each completed action item you can:

- **Accept** it — you're satisfied it's done.
- **Send it back** — it needs more; give a short reason, and it returns to the person's **My Work**.

You can also, where needed, reassign an action item to someone else or skip one that no longer
applies, each with a short reason.

### Get the CAPA ready and submit for review

Before a CAPA can be submitted, a short **readiness checklist** must be complete. The app shows you
what's still outstanding and keeps the submit option unavailable until it's all done. The checklist is:

1. The **root cause** has been approved by QA.
2. The **action plan alignment** has been reviewed.
3. The **data-integrity check** has been cleared — only when one applies to this CAPA.
4. **All corrective actions** are complete.
5. **At least one evidence category** has been answered (either completed or marked not applicable).
6. **At least one effectiveness measure** has been defined.

When every item is met, select **Submit for review**. The CAPA moves to **Pending QA Review**.

### Sign and close the CAPA (QA Head)

1. Open the CAPA in **Pending QA Review**.
2. Select **Sign & Close**.
3. Write a short closing note and enter your **password** to sign.
4. The CAPA moves to **Closed**.

To sign a CAPA closed you need signing authority, and you can't be the person who created the CAPA.

### Record effectiveness (after closure)

After a CAPA is closed, its effectiveness is reviewed later (the app sets a date around 90 days on).
When that's due, open the closed CAPA, record whether it was effective, and enter your **password** to
sign. The person who does this review can't be the same person who signed the CAPA closed.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **I can't find CAPA in my menu** | Only QA Head and Customer Admin see the CAPA screen. If you have CAPA work to do, it's waiting for you in **My Work**. |
| **I can view CAPAs but can't change anything** | As Customer Admin you can read CAPAs but not create or change them. Quality work belongs to the quality roles. |
| **There's no option to raise a CAPA** | Only QA Head raises a CAPA. |
| **"Submit for review" is greyed out** | The readiness checklist isn't complete. The app lists what's still missing — for example, the root cause not yet approved, the alignment not reviewed, the data-integrity check not cleared, some corrective actions not finished, no evidence answered, or no effectiveness measure defined. Complete those and the option opens. |
| **I can't review the root cause** | You created this CAPA, so you can't review its root cause — a different reviewer is required. This keeps the review independent. |
| **"Sign & Close" is greyed out — actions** | Not every corrective action has been accepted or skipped yet. Work through them first. |
| **"Sign & Close" is greyed out — a concern** | There's an unresolved concern in the discussion. A concern must be resolved before the CAPA can close. |
| **"Sign & Close" is greyed out — it's yours** | You can't sign closed a CAPA you created. A different QA Head must close it. |
| **"Sign & Close" is greyed out — signing** | You need signing authority to sign a CAPA closed. If you should have it, ask your Customer Admin. |
| **I can't be assigned an action item** | Only the doer roles can be assigned corrective work. QA Head and administrators assign the work rather than carrying it out. |
| **I can't edit the CAPA any more** | Once a CAPA is submitted for review, it's locked while QA Head reviews it. If it needs changes, QA Head can send it back, which reopens it for work. |

## 6. What happens next

- **When you assign an action item** (or reassign or nudge one), the person gets an alert and it
  appears in their **My Work**.
- **When you send work back for rework**, or **reject the CAPA back for more work**, the people
  affected are alerted and their pieces return to their **My Work**.
- **When you sign the CAPA closed**, its owner is told it's closed.

Submitting a CAPA for review doesn't send an alert — QA Head watches the CAPA list for what's waiting.

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | The CAPA has been raised. The root cause hasn't been recorded yet. |
| **In Progress** | The root cause is in and the corrective work is under way. |
| **Pending QA Review** | The CAPA has been submitted and QA Head is reviewing it, ready to sign closed or send back. |
| **Closed** | QA Head has signed and closed it. An effectiveness review follows later. |

---

# Chapter 6 — Inspections & Regulatory Responses

## 1. What this is for

This screen is where you manage a regulatory inspection from start to finish. You record the
inspection and its observations, investigate each one, raise a corrective action where needed, draft
and sign the formal response, and record what the regulator decided. It keeps the whole inspection —
observations, root causes, response, and sign-off — in one controlled place.

## 2. Who uses it

QA Head and Regulatory Affairs set up inspections and sign the formal response. The working roles — QA,
CSV/Validation Lead, QC Lab Director, IT/CDO, and Operations Head — can add observations, investigate
them, and draft responses. Raising a corrective action from an observation is QA Head's. Customer Admin
and Viewer can read inspections but not change them.

## 3. The screens

The area opens as a list of inspection events. Selecting one opens its detail, arranged in tabs.
[VERIFY] the exact tab names on your screen.

- **Overview** — the inspection's key facts: the regulator, the dates, the response deadline, and who
  owns it internally.
- **Observations** — the list of what the regulator raised. Each observation has its own text,
  a **severity**, and a **status** (see section 7).
- **Investigation** — where the root cause of each observation is recorded.
- **Response** — where the formal response is drafted, then signed and submitted, in ordered steps.
- **History** — the record of who did what on this inspection. [VERIFY] the exact name of this tab.

An inspection also moves through **stages** — from intake, to investigation, to response, to outcome.
A banner shows the current stage and whose turn it is.

## 4. How to…

### Register an inspection (QA Head or Regulatory Affairs)

1. Select **Register Event** at the top of the list.
2. Fill in the form: the inspection **type**, the **site**, the **inspection date**, the **response
   deadline**, and the internal **owner**. These are required.
3. Confirm. The inspection appears as **Open**.

### Add observations

1. Open the inspection and go to **Observations**.
2. Select **Add observation**.
3. Enter the observation **text** (a full sentence), its **number**, and its **severity**. The area
   and the regulation reference are optional.
4. Save. The observation appears as **Open**.

[VERIFY] whether your screen also offers importing observations from an inspection document.

### Record the root cause of an observation

1. Go to **Investigation** and open the observation.
2. Choose how you worked out the cause, and write the **root cause**.
3. Save.

### Raise a corrective action from an observation (QA Head)

1. Open the observation.
2. Select the option to raise a corrective action.
3. Fill in the owner and due date, and confirm. A CAPA is created and linked to the observation, which
   now shows as **CAPA Linked**. (See Chapter 5 for how the CAPA is then run.)

### Draft the response

1. Go to **Response**.
2. Write the draft. You can only start the draft once **every** observation has both a root cause and a
   linked corrective action.
3. Save. The inspection shows as **Response Drafted**.

### Sign and submit the response (QA Head or Regulatory Affairs)

1. In **Response**, work through the readiness steps until they're all met:
   - every observation has a root cause,
   - every observation has a linked corrective action,
   - at least one response document is attached,
   - the response draft is written,
   - all commitments are complete or withdrawn. [VERIFY] the word "commitments" on your screen.
2. Select **Sign & Submit**.
3. Confirm the meaning of your signature and enter your **password**.
4. The inspection moves to **Response Submitted**.

### Record the outcome (QA Head or Regulatory Affairs)

1. When the regulator responds, open the inspection.
2. Select **Record Outcome**, choose the result, and enter your **password** to sign.
3. The inspection moves to the matching outcome status (see section 7).

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **"Register Event" doesn't work for me** | Only QA Head and Regulatory Affairs can create an inspection. Ask one of them to set it up. |
| **I can't start the response draft** | The draft stays locked until every observation has both a root cause and a linked corrective action. Complete those first. |
| **"Sign & Submit" is greyed out** | The readiness steps aren't all met — for example, a missing root cause or corrective action, no response document, or an open commitment. The screen shows what's outstanding. |
| **I can't change anything on the inspection** | Once the response is submitted, the whole inspection is locked. It's now a signed, submitted record. |
| **I raised the observations but can't sign the response** | Signing and submitting the response is reserved for QA Head and Regulatory Affairs, because it's a signed action. [VERIFY] the on-screen note, which may mention only QA Head even though Regulatory Affairs can also sign. |
| **I can't raise the corrective action from an observation** | Only QA Head can raise a corrective action. Ask your QA Head. |

## 6. What happens next

- **When you raise a corrective action from an observation**, a CAPA is created and linked; from there
  it runs like any other CAPA (Chapter 5), and its owner is alerted.
- **As a deadline approaches**, the app shows you a reminder so the response isn't missed.
- Moving an inspection between stages doesn't send a direct alert — the current stage and whose turn it
  is are shown on the inspection's banner, so check there.

## 7. Statuses

**Inspection statuses**

| Status | What it means in practice |
|---|---|
| **Open** | The inspection has been recorded. Work hasn't started. |
| **Response Drafted** | A draft response has been written. |
| **Response Submitted** | The signed response has been submitted to the regulator. |
| **FDA Acknowledged** | The regulator has confirmed receipt. |
| **Closed** | The regulator is satisfied and no further action is needed. |
| **Warning Letter** | The regulator has escalated. This needs immediate senior attention. |

You may also see **Response Due** shown as a reminder when the deadline is near.

**Observation statuses**

| Status | What it means in practice |
|---|---|
| **Open** | The observation hasn't been addressed yet. |
| **CAPA Linked** | A corrective action has been raised for it. |
| **Response Drafted** | Its part of the response has been drafted. |

---

# Chapter 7 — Evidence & Documents

## 1. What this is for

This is your library of supporting documents — the files that prove your quality work was done. You
upload documents here, search and filter to find them, and download them when you need them. It also
shows, for reference, the evidence that's attached to your other records.

## 2. Who uses it

QA Head, CSV/Validation Lead, and Regulatory Affairs can add documents to the library. QA Head can
also remove them. Most roles can open the library to browse and download. QA Head and Customer Admin
see every document for the site; everyone else sees only the documents they uploaded themselves.

## 3. The screens

The Evidence library opens as a searchable collection of documents. You can switch between a grid view
and a list view.

- **Search and filters** let you narrow the collection — for example, by where a document came from.
  [VERIFY] the exact filters on your screen.
- **The tiles** at the top give you counts: how many documents in total, how many you can edit, how
  many are locked, and how many are recent. [VERIFY] the exact tiles.
- Each document shows its name, its type, and where it came from. Selecting one opens its details,
  where you can download it and — if it's one you can manage — edit or remove it.

Documents that were attached inside another record (a CAPA, a finding, or a deviation) appear here too,
for reference. Those are **locked** in the library — you manage them from the record they belong to,
not here.

## 4. How to…

### Add a document

1. Select **Add document**.
2. Provide the file **or** a web link to it — one or the other is required.
3. Give it a name, and optionally a category and a description.
4. Confirm. A file must be within the size limit and of an allowed type; the app tells you if it isn't.
5. The document appears in your library.

### Edit a document's details

1. Open the document's details.
2. Select **Edit**.
3. Change the name, type, or description, then save. The file itself and where it came from can't be
   changed.

You can only edit documents that were added here in the library, and only if your role allows it.

### Download a document

1. Open the document's details and download it, **or**
2. Select several documents and use **Download Selected** to get them together. Documents that are only
   a web link are skipped, since there's no file to download.

### Remove a document (QA Head)

1. Open the document's details.
2. Select **Delete** and confirm. The document is removed from the library but its record is retained.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **No "Add document" button** | Only QA Head, CSV/Validation Lead, and Regulatory Affairs can add documents to the library. |
| **I can't edit or remove a document** | It came from another record — a CAPA, finding, or deviation — so it's locked here. Manage it from that record instead. Or your role doesn't allow it. |
| **There's nowhere to link this document to a record** | You attach evidence from inside the record itself — open the CAPA, finding, or deviation and add it there, not from the library. |
| **I can't see a document a colleague mentioned** | Most people see only the documents they uploaded. QA Head and Customer Admin see all of the site's documents. |
| **"Delete" isn't available to me** | Only QA Head can remove a document. |

## 6. What happens next

Adding, editing, or removing a document in the library doesn't send anyone an alert — it's a
self-service library. When evidence matters to a record, it's attached inside that record, and the
alerts that come with that record (Chapters 4 and 5) apply there.

## 7. Statuses

The library separates documents you manage from documents that belong to other records. [VERIFY] the
exact status labels shown on your screen.

| What you see | What it means in practice |
|---|---|
| **A document you added** | Yours to edit or remove, as your role allows. |
| **Locked** | The document belongs to another record and is shown here for reference only. Manage it from that record. |

---

# Chapter 8 — Governance & KPIs

## 1. What this is for

This screen holds your organisation's oversight records: the risk register, the record of management
reviews, and the quality scorecards. You raise and track risks, turn a risk into real quality work
when it needs one, minute management meetings, and see how the site is performing at a glance. It's the
view that ties day-to-day quality work to management oversight.

## 2. Who uses it

Governance is available to **QA Head and Customer Admin** only. Both can raise, edit, and archive risks
and minute management reviews. Turning a risk into a gap, deviation, or corrective action is reserved
for QA Head. (This is one screen where Customer Admin can create and change records, because these are
oversight records rather than quality records.)

## 3. The screens

Governance has three views you switch between at the top.

**Risk Register** — the working list of risks.

- **Columns** include the risk's title, its **category**, its **severity** and **likelihood** (how bad
  it would be and how likely it is), its owner, and its **status** (see section 7). [VERIFY] the exact
  columns and filters.
- Selecting a risk opens its detail, where you edit it, attach documents, convert it, and see its
  history.

**Management Reviews** — the record of management meetings.

- Each entry is a meeting, with its topic, date, attendees, and a list of decisions and follow-up
  items.
- Selecting a meeting opens its detail, where you amend it and tick its follow-up items done.

**KPIs** — the quality scorecards for the site, and a report you can export.

## 4. How to…

### Raise a risk

1. In **Risk Register**, select **Add Risk**.
2. Fill in the form: a **title**, a **description**, the **category**, the **severity**, the
   **likelihood**, and the **owner**. These are required. A site, target date, and mitigation plan are
   optional.
3. Confirm. The risk appears as **Open**.

### Edit a risk

1. Open the risk and select **Edit**.
2. Change what you need and save.

You can edit a risk if you're a managing role, or if you raised it or own it.

### Archive a risk

1. Open the risk (or use its menu in the list) and select **Archive**, then confirm.

Archiving is for the managing roles. If you only raised or own a risk, you can edit it but not archive
it.

### Turn a risk into quality work (QA Head)

1. Open the risk's detail.
2. In the **Convert** section, choose whether to raise a **gap**, a **deviation**, or a **corrective
   action** from it.
3. Fill in the details for the new record and confirm. A real record is created and linked back to the
   risk, and the risk is marked **Converted**.

### Minute a management review

1. In **Management Reviews**, select **Record Decision**.
2. Fill in the **topic**, the **meeting date**, the **attendees**, and at least one decision or
   follow-up item. These are required.
3. Confirm. The meeting is recorded.

### Amend a meeting or tick off a follow-up item

1. Open the meeting.
2. Select **Amend** to change its details, or use the tick against a follow-up item to mark it done or
   open again.

Amending is for the managing roles, or the person who minuted the meeting.

### Export the scorecard report

In **KPIs**, use the export option to produce the quality report. [VERIFY] the exact report name on
your screen.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **I can't find Governance in my menu** | Governance is available only to QA Head and Customer Admin. |
| **"Archive" isn't available on a risk** | Archiving is for the managing roles. If you raised or own the risk you can edit it, but only a managing role can archive it. |
| **The Convert options are greyed out** | Only QA Head can turn a risk into a gap, deviation, or corrective action. |
| **I can't convert a closed risk** | Reopen the risk first, then convert it. |
| **I can't edit a converted risk** | Once a risk is converted it's fixed — the work continues in the record it became. Open that record from the link on the risk. |
| **I archived something and nothing seemed to happen** | [VERIFY] archiving may not always show a confirmation. Refresh the list to check whether it archived; if it's still there, try again or ask your QA Head. |

## 6. What happens next

- **When you convert a risk**, the new gap, deviation, or corrective action is created and linked back
  to the risk; from there it follows its own chapter, and its owner is alerted.
- Other governance changes — raising, editing, or archiving a risk, minuting or amending a meeting —
  don't send alerts. Each change is recorded in the history, which QA Head and Customer Admin can read.

## 7. Statuses

**Risk statuses**

| Status | What it means in practice |
|---|---|
| **Open** | The risk has been raised and is being watched. |
| **Mitigating** | Work is under way to reduce it. |
| **Closed** | The risk no longer needs active management. It can be reopened if it returns. |
| **Converted** | The risk has been turned into a gap, deviation, or corrective action. This is final — the work now lives in that record. |

**Follow-up item statuses (in a management review)**

| Status | What it means in practice |
|---|---|
| **Open** | The follow-up item still needs doing. |
| **Done** | The follow-up item is complete. |

---

# Chapter 9 — Training & Awareness

## 1. What this is for

This screen helps you get ready for an inspection and see how prepared you are. You set up an
inspection to prepare for, work through a standard set of readiness tasks, and run practice drills. A
readiness score shows, at a glance, how far along the preparation is.

## 2. Who uses it

QA Head runs inspection readiness — setting up an inspection to prepare for and closing it out. QA Head
and Customer Admin can mark readiness tasks complete and run practice drills. Everyone else can open
the screen to see the readiness score and where things stand, but doesn't change it.

> This is a lighter screen than the others. It shows you what's ready and lets the oversight roles keep
> it up to date; there isn't much for a working role to do here beyond viewing.

## 3. The screens

The area has a few views. [VERIFY] the exact tab names on your screen.

- **Overview** — the readiness score and a summary of where preparation stands.
- **Tasks** — the list of readiness tasks for the inspection you're preparing for. Each shows whether
  it's done.
- **Training** — practice drills you can schedule and score.
- **Activity** — a running history of what's been done: tasks completed, drills run.

There's also a **Resources** panel for reference material you can read alongside your preparation.

## 4. How to…

### Set up an inspection to prepare for (QA Head)

1. Select **New Inspection**.
2. Fill in the inspection's **title**, **site**, **lead**, and expected **date**. These are required.
3. Confirm. The inspection is created with a standard set of readiness tasks, all starting as **Not
   Started**.

### Mark a readiness task complete (QA Head or Customer Admin)

1. Go to **Tasks** and find the task.
2. Select **Mark complete**.
3. The task moves to **Complete**, and the readiness score goes up.

### Schedule and score a practice drill (QA Head or Customer Admin)

1. Go to **Training**.
2. Select **Schedule simulation** and give it a title. It appears as **Scheduled**.
3. When the drill has been run, select **Score & complete**, enter a score, and confirm. It moves to
   **Completed**.

### Close out an inspection (QA Head)

1. When preparation is finished, select **Complete Inspection**.
2. Choose the **outcome**. This is required.
3. Confirm. The inspection is closed out, and attention moves to the next one you're preparing for.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **I can open the screen but can't change anything** | The readiness tasks and drills are kept up to date by QA Head (and Customer Admin for some). Everyone else views the readiness picture. |
| **There's no "New Inspection" for me** | Only QA Head sets up an inspection to prepare for. |
| **I can't reopen a task I marked complete** | Completing a readiness task is final — there's no undo. [VERIFY] this in the live app before relying on it. |
| **"Complete Inspection" isn't available or won't finish** | Closing out an inspection is QA Head's, and it needs an outcome chosen first. |

## 6. What happens next

Readiness work doesn't send alerts. Completing tasks raises the readiness score on the **Overview**,
and everything you do shows in the **Activity** history so the picture stays current for whoever looks.

## 7. Statuses

**Readiness task**

| Status | What it means in practice |
|---|---|
| **Not Started** | The task hasn't been done yet. |
| **Complete** | The task is done, and it counts towards the readiness score. |

You may also see **Overdue** on a task that has a due date that has passed. [VERIFY] whether your tasks
carry due dates.

**Practice drill**

| Status | What it means in practice |
|---|---|
| **Scheduled** | Booked, not yet run. |
| **Completed** | Run and scored. |

[VERIFY] the labels shown for the inspection itself while it's being prepared and once it's closed out.

---

# Chapter 10 — My Work

## 1. What this is for

**My Work** is one list of everything assigned to you, gathered from across the app in a single place.
It pulls together the gaps, corrective actions, deviation tasks, and validation tasks that are yours
to do, so you don't have to hunt through each screen. If a piece of work is yours, this is where you
pick it up, do it, and hand it back.

## 2. Who uses it

Everyone who does hands-on work uses My Work: QA, CSV/Validation Lead, Regulatory Affairs, QC Lab
Director, IT/CDO, and Operations Head all work their assigned tasks here. QA Head sees their own
assigned tasks here too, though they mostly act from the main screens. My Work only ever shows work
assigned to **you** — never anyone else's.

## 3. The screens

My Work opens as a single page with a few parts.

**The summary tiles** across the top give you a quick count: how many items you have in total, how many
are **overdue**, how many are **due this week**, and how many are **waiting on you**. [VERIFY] the
exact tiles on your screen.

**The task sections** group your work:

- **Needs rework** — tasks that were sent back to you for more work. Deal with these first.
- **My work** — everything else that's yours and active.
- **Validation tasks** — validation pieces that were returned to you (see below).

**Opening a task** brings up a panel with everything you need: its status and priority, a link to the
record it belongs to, the description, any note from a reviewer who sent it back, your uploaded
documents, related documents (which you can read), and a place to add your work notes.

**Validation tasks** are shown as a simple strip. You don't work them in the panel — opening one takes
you to the validation screen, where you do the work.

## 4. How to…

### Work and submit a task

1. Open **My Work** and select the task.
2. Read the description, and any note from a reviewer if it was sent back.
3. Attach any evidence in your documents area.
4. Add your **work notes** — at least a short sentence. This is required to submit.
5. Select **Submit to QA**. The task goes to QA Head to review, and moves to **Submitted**.

### Save your notes as you go (gaps and corrective actions)

For a gap or a corrective action, you can save your notes without submitting yet:

1. Open the task.
2. Add your notes.
3. Select **Save notes**. Your notes are kept, and the task stays with you.

For a deviation task, you add your notes at the point you submit, rather than saving them separately.
[VERIFY] this on your screen.

### Open the record a task belongs to

From the task menu, choose **View** to jump to the gap, corrective action, or deviation the task came
from, if you want the fuller picture.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **My Work is empty** | You have no tasks assigned right now. Work is given to you by QA Head; when something is assigned, it appears here and you're alerted. |
| **A finding I was working on has disappeared** | Once a CAPA is raised from a finding, or the finding is closed, it leaves My Work — the work carries on in the CAPA. |
| **"Submit to QA" won't let me** | You need to add work notes first — at least a short sentence — then submit. |
| **The buttons on a task are missing** | The task has already been submitted, or it's finished, so there's nothing more to do on it here. |
| **I can't do anything to a validation task in the panel** | Validation tasks are worked on the validation screen. Open the task and the app takes you there. |
| **I can see a task but it isn't mine to change** | If it's only there to read, it's linked for context. You can act only on tasks assigned to you. |

## 6. What happens next

- **When you submit a task**, it goes to QA Head to review. For a deviation task, the QA Head who
  assigned it is alerted.
- **If your work is accepted**, that happens in the record it belongs to, and you're told.
- **If it's sent back**, the task returns to your **Needs rework** section with the reviewer's note,
  and you're alerted.

## 7. Statuses

My Work shows a simple, shared set of labels so tasks from different parts of the app read the same
way. [VERIFY] the exact wording on your screen.

| Status | What it means in practice |
|---|---|
| **Not Started** | The task is yours but you haven't begun. |
| **In Progress** | You've started it. |
| **Returned** | A reviewer sent it back for more work, with a note. |
| **Submitted** | You've handed it to QA Head and it's waiting to be reviewed. |
| **Done** | Your work on it has been accepted. |
| **Closed** | The record it belongs to has been closed. |

---

# Chapter 11 — Staying Informed

## 1. What this is for

Alerts tell you when something needs you — a task assigned to you, work returned for changes, or one of
your records reaching a milestone. They keep you from having to check every screen to find what's
waiting. This chapter shows you where alerts appear and how to act on them.

## 2. Who uses it

Everyone. Whatever your role, you see only your own alerts — the ones about work that's yours.

## 3. The screens

Your alerts live behind the **bell** at the top of every screen.

- A small count on the bell shows how many alerts you haven't read yet. A large number of unread alerts
  shows as **9+**.
- Selecting the bell opens your list of alerts, most recent first.
- Each alert says what happened and, when you select it, takes you straight to the record or task it's
  about.

## 4. How to…

### Read an alert and go to the work

1. Select the **bell**.
2. Select an alert. It's marked as read, and the app takes you to the right place — into the record, or
   into **My Work** if it's a task for you to do.

### Clear your alerts

- Select **Mark all read** to clear the unread count in one go. Your alerts stay in the list; they're
  just no longer counted as new.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **The bell shows a number but I can't find the work** | Open the bell and select the alert itself — it takes you straight to the record or task, rather than you searching for it. |
| **I have no alerts** | Nothing needs you right now. Alerts arrive when work is assigned to you or one of your records moves on. |
| **An alert dropped me into My Work** | Alerts about a task you need to do land you in **My Work**, which is where you carry the task out. |
| **I wasn't alerted about something I expected** | Not every step sends an alert. Some things — like a record waiting for you to review in a list — you'll find by opening the relevant screen rather than from the bell. |

## 6. What happens next

Reading an alert or choosing **Mark all read** clears the unread count. New alerts appear as fresh work
is assigned to you or your records progress, and the count goes up again. The bell is always there at
the top, so you can check it at any time.

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Unread** | New since you last looked — it's counted on the bell. |
| **Read** | You've opened it. It stays in your list for reference but no longer counts as new. |

---

# Chapter 12 — Administration & Settings

## 1. What this is for

Settings is where your organisation is kept in order: the people who can use the app, the sites they
work at, and which standards apply. It's an administrator's screen — most of it is about adding people,
setting what they're allowed to do, and keeping sites current. A few of the things done here are
legally signed, so they ask for your password.

## 2. Who uses it

Settings is Customer Admin's screen. A Customer Admin can add and manage people, manage sites, and turn
standards on or off. Anyone else who opens Settings sees it in read-only form — they can look, but a
banner tells them only a Customer Admin can make changes.

## 3. The screens

Settings is organised into tabs. The ones where you can make changes that stick are **People**,
**Sites**, and **Standards**; the others are for viewing. [VERIFY] the exact tab names on your screen.

- **People** — everyone with access: their name, role, site, and whether their account is active. This
  is where you add people and manage what they can do.
- **Sites** — the sites your organisation runs. Add, edit, or remove a site here.
- **Standards** — the regulatory standards that apply to your organisation. Turn them on or off.
- **Subscription** — your organisation's plan. This is for viewing.
- **Organisation details** — your company's basic details. This is for viewing.

## 4. How to…

### Add a person

1. Go to **People** and select **Add**.
2. Fill in their **name**, **email**, **username**, **role**, and a starting **password**. These are
   required.
3. Confirm. The person is added and can now sign in.

You can only grant the roles you're allowed to grant — you can't create another administrator or a
platform-level account.

### Turn a person's account off or on

1. Go to **People** and open the person.
2. Select **Deactivate** to switch their access off, or **Activate** to switch it back on.

You can't change your own account this way — ask another administrator.

### Give or remove signing authority

Some people are allowed to sign legally signed actions. To change that:

1. Open the person in **People**.
2. Turn their **signing authority** on or off.
3. Enter your **password** to confirm — this is itself a signed change.

You can't change your own signing authority.

### Remove a person

1. Open the person in **People**.
2. Select **Delete** and enter your **password** to confirm.

Where possible, switch a person's account off (Deactivate) rather than removing them, so their history
stays clear.

### Add or edit a site

1. Go to **Sites**.
2. Select **Add** to create a site, or open a site and **Edit** it.
3. Fill in the site's details (a name is required) and save.

### Remove a site

1. Open the site in **Sites**.
2. Select **Delete** and enter your **password** to confirm.

### Turn a standard on or off

1. Go to **Standards**.
2. Switch a standard on, or off. Turning one off asks you to confirm.
3. The change is saved and applied.

## 5. Why can't I…?

| What you see | Why, and what to do |
|---|---|
| **Settings is read-only for me** | Only a Customer Admin can change settings. If something needs changing, ask your Customer Admin. |
| **I can't create an administrator or a higher-level account** | A Customer Admin can grant only certain roles. Higher-level accounts are set up outside this screen. |
| **I can't add another person or site** | You may have reached your plan's limit for people or sites. [VERIFY] the exact message; if so, this is handled at the organisation level — check with your account contact. |
| **I can't change my own status or signing authority** | You can't change your own account's status or signing authority — this keeps changes independent. Ask another administrator. |
| **I changed something and it didn't stick** | The screens that save your changes are **People**, **Sites**, and **Standards**. The other views are for reference only. |
| **The password I entered was refused** | The change doesn't go through, and the attempt is recorded. Enter the correct password and try again. |

## 6. What happens next

Settings changes don't send alerts to other people. Each change is recorded in the history for the
oversight roles to see. Adding a person gives them an account they can sign in with straight away;
turning an account off stops that person signing in until it's turned back on.

## 7. Statuses

| Thing | States it can be in |
|---|---|
| **A person's account** | **Active** (can sign in) or **Inactive** (can't sign in). |
| **A person's signing authority** | **On** (may sign legally signed actions) or **Off**. |
| **A site** | **Active** or **Inactive**. |
| **A standard** | **On** (applies to your organisation) or **Off**. |

---

# Chapter 50 — Worked Examples

This chapter follows five records from start to finish, as stories, so you can see how work moves from
one person to the next. Watch for the **handovers** — the points where the app deliberately requires a
*different* person to take the next step. Those are where most people get confused ("why can't I just
finish it myself?"), and they exist to keep every quality decision independent.

## The cast

Each person's job title decides what they're allowed to do. The stories keep to those limits.

| Name | Role | What that lets them do |
|---|---|---|
| **Tom Alvarez** | Operations Head | Report deviations and findings; do work assigned to them. |
| **Sara Okoro** | QC Lab Director | Raise findings and deviations; do assigned work. |
| **David Chen** | CSV / Validation Lead | Raise findings and deviations; add documents to the library. |
| **Lena Duarte** | Regulatory Affairs | Run inspections and sign their responses. |
| **Ravi Menon** | QA | Carry out tasks assigned to them, from My Work. |
| **Priya Nair** | QA Head | Assign, review, close, and sign; convert risks; raise corrective actions. |
| **Nadia Farouk** | QA Head | The same — a second QA Head, so independent sign-offs are possible. |
| **Marcus Webb** | Customer Admin | Manage people, sites, and the risk register; view quality records. |

> Two QA Heads appear on purpose. Several steps can't be done by the same person who did the step
> before, so a second QA Head is often what lets a record finish.

---

## Story 1 — A deviation, start to finish

*A temperature excursion is spotted on the packing line.*

1. **Tom (Operations Head)** opens **Deviation Management**, selects **Report Deviation**, fills in what
   happened, and confirms.
   - *What had to be done first:* nothing — anyone in a working role can report.
   - *Status after:* **Open**. Tom can see his own deviation; so can the QA Heads. Most other people
     can't see it at all.
2. **Priya (QA Head)** opens the deviation and selects **Start Investigation**.
   - *Status after:* **Under Investigation**.
3. **Priya** records the **root cause** in the Investigation section and saves.
   - *Why Priya and not a line colleague:* only the QA Heads (and the person who reported it) can see
     this deviation, and the reporter isn't allowed to investigate their own. So a QA Head does it.
   - *Status after:* **Pending QA Review**.
4. **⚠ Handover.** Because **Priya recorded the investigation, she can't also decide on a corrective
   action or sign the deviation closed.** A different QA Head takes over. **Nadia (QA Head)** opens the
   deviation and records the **corrective-action decision** (here: not required, with a reason).
   - *What the next person sees:* the deviation doesn't drop into anyone's work list. Nadia finds it by
     opening the deviation list and looking at the ones marked **Pending QA Review**.
   - *Status after:* **Pending QA Review**.
5. **Nadia** selects **Sign & Close**, writes a closing note, and enters her **password** to sign.
   - *Why Nadia and not Priya:* the person who closes can't be the reporter or the investigator. Tom
     reported it; Priya investigated it; Nadia is clear of both.
   - *Status after:* **Closed**.

> If the corrective-action decision had been *required*, Nadia would have raised a corrective action
> instead. The deviation would then wait at **CAPA Pending** until that corrective action was closed,
> and only then be signed closed. And if the deviation had been low priority, a QA Head could instead
> have assigned a **task** to a named person — that task *would* appear in their **My Work**.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Tom (Operations Head) | Reports the deviation | Open |
| 2 | Priya (QA Head) | Starts the investigation | Under Investigation |
| 3 | Priya (QA Head) | Records the root cause | Pending QA Review |
| 4 | Nadia (QA Head) | Records the corrective-action decision | Pending QA Review |
| 5 | Nadia (QA Head) | Signs and closes (password) | Closed |

---

## Story 2 — A finding, start to finish

*An internal check turns up a gap against a data-integrity requirement.*

1. **Sara (QC Lab Director)** opens **Gap Assessment**, selects **Report Gap**, describes the
   requirement and the gap, sets it to **Low** severity, and confirms.
   - *Status after:* **Open**. Sara owns it.
2. **Sara** records the **Root Cause** in the finding's Root Cause section.
   - *What had to be done first:* nothing — as the person who raised it, Sara may record the root cause,
     but only up until it's assigned to someone.
   - *Status after:* **Open** (now with a root cause recorded).
3. **Priya (QA Head)** opens the finding and **assigns** it to Ravi.
   - *What the next person sees:* the finding appears in **Ravi's My Work**, and Ravi is alerted.
   - *Status after:* **In Progress**.
4. **Ravi (QA)** opens the task in **My Work**, attaches his evidence, adds his notes, and selects
   **Submit to QA**.
   - *What had to be done first:* Priya had to assign it to him — Ravi couldn't have picked it up
     otherwise.
   - *Status after:* **Submitted**.
5. **⚠ Handover.** Ravi can't review or close his own work. **Priya (QA Head)** opens the finding and
   selects **Accept & close**.
   - *Why Priya can close it:* the person who closes must not be the one who recorded the root cause.
     Sara recorded it, and Priya is a different person — so Priya is clear. (If *Priya* had recorded the
     root cause herself, she couldn't close it, and Nadia would have to.)
   - *What the next person sees:* Ravi is told his work was accepted and closed.
   - *Status after:* **Closed**.

> A note on finding QA at step 4→5: submitting doesn't send QA an alert. Priya finds submitted findings
> by opening the register and looking at the ones marked **Submitted**. If she'd sent it back instead,
> it would return to **Ravi's My Work** as **Returned**, with her reason.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Sara (QC Lab Director) | Raises the finding | Open |
| 2 | Sara (QC Lab Director) | Records the root cause | Open |
| 3 | Priya (QA Head) | Assigns it to Ravi | In Progress |
| 4 | Ravi (QA) | Works it and submits (from My Work) | Submitted |
| 5 | Priya (QA Head) | Accepts and closes | Closed |

---

## Story 3 — An inspection observation, start to finish

*A regulator visits and leaves a written observation.*

1. **Lena (Regulatory Affairs)** opens **Inspections & Regulatory**, selects **Register Event**, enters
   the inspection details, and confirms.
   - *Status after:* inspection **Open**.
2. **Lena** goes to **Observations** and adds the regulator's observation.
   - *Status after:* observation **Open**.
3. **Lena** goes to **Investigation** and records the observation's **root cause**.
   - *Status after:* the observation now carries a root cause. [VERIFY] the exact status label the
     observation shows at this point.
4. **⚠ Handover.** Lena **can't raise the corrective action herself** — that's reserved for a QA Head.
   **Priya (QA Head)** opens the observation and raises a **corrective action** from it.
   - *What the next person sees:* a corrective action is created and then runs like any other (Story 5's
     tail, or Chapter 5); once its pieces are assigned, they appear in the doers' **My Work**.
   - *Status after:* observation **CAPA Linked**.
5. **Lena** goes to **Response** and drafts the response.
   - *What had to be done first:* the response draft stays locked until **every** observation has both a
     root cause **and** a linked corrective action. Priya's step 4 is what unlocked it for Lena.
   - *Status after:* inspection **Response Drafted**.
6. **Lena** works through the readiness steps, selects **Sign & Submit**, confirms the meaning of her
   signature, and enters her **password**.
   - *Why Lena can sign:* signing an inspection response is allowed for Regulatory Affairs as well as
     QA Head. [VERIFY] the on-screen wording, which may mention only QA Head.
   - *Status after:* inspection **Response Submitted**.
7. **Lena** later selects **Record Outcome**, chooses the regulator's result, and enters her
   **password**.
   - *Status after:* the matching outcome — for example **FDA Acknowledged** or **Closed**.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Lena (Regulatory Affairs) | Registers the inspection | Event: Open |
| 2 | Lena (Regulatory Affairs) | Adds the observation | Observation: Open |
| 3 | Lena (Regulatory Affairs) | Records the observation's root cause | Observation: root cause recorded [VERIFY] |
| 4 | Priya (QA Head) | Raises the corrective action from it | Observation: CAPA Linked |
| 5 | Lena (Regulatory Affairs) | Drafts the response | Event: Response Drafted |
| 6 | Lena (Regulatory Affairs) | Signs and submits (password) | Event: Response Submitted |
| 7 | Lena (Regulatory Affairs) | Records the outcome (password) | Event: FDA Acknowledged / Closed |

---

## Story 4 — A document, start to finish

*A supporting document has to back up a piece of corrective work.*

1. **Ravi (QA)** opens his corrective-action task in **My Work** and uploads the supporting document to
   it.
   - *What had to be done first:* a QA Head had to assign Ravi the task — evidence is attached to the
     task, so the task has to exist first.
   - *Status after:* the document is **attached to the corrective action**. It also shows up in the
     **Evidence library**, but **locked** there — it's managed from the record, not the library.
2. **Ravi** adds his notes and submits the task. The document travels with it.
   - *Status after:* attached, and now awaiting QA review.
3. **⚠ Handover.** The doer uploads evidence; **QA reviews it rather than adding it.** **Priya (QA
   Head)** opens the corrective action, reviews Ravi's work, and opens his document as evidence.
   - *Status after:* the document is part of the record Priya is reviewing.
4. **Priya** accepts the work.
   - *Status after:* the document is **retained as part of the record** for good.

> **The evidence rule is strictest on deviations:** there, only the person who *reported* the deviation
> can attach its supporting documents — QA reviews the evidence and cannot upload it. It keeps the
> evidence coming from the person who saw the problem.
>
> **The library is separate.** David (CSV/Validation Lead) can upload a standalone reference document to
> the **Evidence library**; only he and the oversight roles (QA Head, Customer Admin) see it. But a
> library document can't be tied to a record from the library — you attach record evidence *inside* the
> record, as Ravi did.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Ravi (QA) | Uploads the document to his task (My Work) | Attached to the corrective action; locked in the library |
| 2 | Ravi (QA) | Submits the task | Attached; awaiting QA review |
| 3 | Priya (QA Head) | Reviews the work and opens the document | Part of the record under review |
| 4 | Priya (QA Head) | Accepts the work | Retained with the closed record |

---

## Story 5 — A governance risk, start to finish

*A recurring supplier problem is logged as a risk before it becomes an incident.*

1. **Marcus (Customer Admin)** opens **Governance & KPIs**, goes to the **Risk Register**, selects
   **Add Risk**, describes it, and confirms.
   - *What had to be done first:* nothing — on the Governance screen, Customer Admin may raise and
     manage risks (this is oversight, not quality-record work).
   - *Status after:* **Open**.
2. **Marcus** records a mitigation plan and moves the risk along.
   - *Status after:* **Mitigating**.
3. **⚠ Handover.** The risk now needs to become real quality work — but **Marcus can't convert it.**
   Turning a risk into a gap, deviation, or corrective action is reserved for a QA Head, because it
   creates a real quality record that must be authored by a quality authority. **Priya (QA Head)** opens
   the risk and **converts** it into a deviation.
   - *What the next person sees:* a new deviation is created and linked back to the risk. It doesn't
     drop into a work list; it's picked up on the deviation screen.
   - *Status after:* risk **Converted** (this is final — the work now lives in the deviation).
4. From here the new deviation follows **Story 1** — reported into being by the conversion, then
   investigated by one QA Head and signed closed by another.

**Summary**

| Step | Who | What they do | Status after |
|---|---|---|---|
| 1 | Marcus (Customer Admin) | Raises the risk | Open |
| 2 | Marcus (Customer Admin) | Records mitigation; moves it along | Mitigating |
| 3 | Priya (QA Head) | Converts it into a deviation | Converted |
| 4 | — | The new deviation follows Story 1 | Deviation: Open |

---

## The handovers, in one place

If you remember nothing else, remember these — they're the moments the app makes someone else finish
what you started:

- **A deviation:** the reporter can't investigate it; whoever investigates it can't decide the
  corrective action or sign it closed; the person who closes it can't be the reporter, the
  investigator, or the assignee.
- **A finding:** whoever the work is assigned to can't review or close their own work; the person who
  closes it can't be the person who recorded its root cause.
- **An inspection observation:** only a QA Head can raise the corrective action, and the response can't
  be drafted until every observation has both a root cause and a linked corrective action.
- **A document:** the doer uploads the evidence; QA reviews it. On a deviation, only the reporter
  attaches evidence.
- **A risk:** a Customer Admin can raise and manage it, but only a QA Head can convert it into real
  quality work.

---

# Chapter 99 — Roles at a Glance

Everyone in the app has a role. Your role decides what you can see, what you can do, and where you
spend your time. This page summarises each one. If your menu or buttons look different from a
colleague's, your role is the reason.

---

## QA Head

**The quality authority.** You have the widest reach and the final say on quality decisions.

- **You can:** assign work to others, review and approve what they submit, close and sign deviations
  and CAPAs, run inspections and sign their responses, and manage risks and management reviews.
- **You can't:** approve your own work. Where you both did a piece of work and would be the one to
  sign it off, the app steps in and requires a different person — this keeps quality honest.
- **Where you spend your time:** across every quality screen, plus **My Work** for anything assigned
  to you. You see all records for the site, not just your own.

---

## QA

**A hands-on quality role.** You do the work that keeps quality moving.

- **You can:** raise findings and deviations, and carry out the tasks assigned to you — including
  action items on a CAPA — from **My Work**.
- **You can't:** approve, close, or sign records, and you don't open the CAPA screen directly. Your
  CAPA tasks come to you through **My Work**.
- **Where you spend your time:** **My Work**, plus Gap Assessment and Deviations when you're raising
  something.

---

## CSV / Validation Lead

**A functional specialist for computer system validation.**

- **You can:** raise findings and deviations, carry out validation work, and complete the tasks
  assigned to you from **My Work**.
- **You can't:** approve or sign the quality decisions that belong to QA Head.
- **Where you spend your time:** validation, plus **My Work** for your assigned tasks.

---

## Regulatory Affairs

**The owner of regulator-facing work.**

- **You can:** raise findings and deviations, start an inspection, draft its response, and sign and
  submit that response alongside QA Head.
- **You can't:** make the quality dispositions reserved for QA Head (for example, closing a CAPA).
- **Where you spend your time:** Inspections & Regulatory, plus **My Work**.

---

## QC Lab Director

**A functional specialist for the quality-control laboratory.**

- **You can:** raise findings and deviations, and complete the tasks assigned to you from **My Work**.
- **You can't:** approve or sign the decisions that belong to QA Head.
- **Where you spend your time:** your assigned work, plus Gap Assessment and Deviations.

---

## IT / CDO

**A functional specialist for IT and data.**

- **You can:** raise findings and deviations, and complete the tasks assigned to you from **My Work**.
- **You can't:** approve or sign the decisions that belong to QA Head.
- **Where you spend your time:** your assigned work, plus Gap Assessment and Deviations.

---

## Operations Head

**A functional specialist for operations.**

- **You can:** raise findings and deviations, and complete the tasks assigned to you from **My Work**.
- **You can't:** approve or sign the decisions that belong to QA Head.
- **Where you spend your time:** your assigned work, plus Gap Assessment and Deviations.

---

## Customer Admin

**The administrator for your organisation.** You keep the app set up and the right people in place.

- **You can:** manage people, sites, and organisation settings. You can also **view** quality records
  — deviations, findings, CAPAs, and risks — across the site.
- **You can't — and this is deliberate:** create or change quality records. You can read a deviation,
  a finding, a CAPA, or a risk, but you cannot raise one, edit one, or approve one. Quality work
  belongs to the quality roles; your job is to run the organisation, not the quality records.
- **Where you spend your time:** Settings, plus the oversight views (Dashboard, Governance, the
  document library, and the Audit Trail).

---

## Viewer

**A read-only role.** You can look, but not touch.

- **You can:** open and read the records your access allows.
- **You can't:** create, change, approve, or sign anything.
- **Where you spend your time:** the Dashboard and the lists you're given access to, for reference.

---

## Platform Admin

**The platform administrator.** This role manages the platform and customer accounts from a separate
administration area. It does not create or work on quality records, and that area is outside this
guide. If you are a Platform Admin, your work isn't covered here.

---

# Part 2 — Process Manual

# Process — Managing People & Access

This chapter is for administrators. It explains the ten roles, how you set someone up, what each role
is allowed to do, and which parts of the app each role can reach. It's the reference for "who is
allowed to do what, and why can't they."

---

## 1. The ten roles, in one line each

| Role | What kind of work they may do |
|---|---|
| **Platform Admin** | Manages the platform and customer accounts from a separate area. **Never creates, changes, or signs quality work.** |
| **Customer Admin** | Administers your organisation — people, sites, and settings. **Can view quality records but cannot create, change, or sign them.** (May raise and manage risks and management reviews in Governance.) |
| **QA Head** | The quality authority. Raises, assigns, reviews, closes, and signs quality work, and sees every record for the site. |
| **QA** | Hands-on quality. Raises findings and deviations, and carries out tasks assigned to them. Does not approve or sign. |
| **CSV / Validation Lead** | A validation specialist. Raises findings and deviations, does assigned tasks, and can add documents to the library. |
| **Regulatory Affairs** | Owns regulator-facing work. Raises findings and deviations, and can sign inspection responses. |
| **QC Lab Director** | A quality-control-lab specialist. Raises findings and deviations, and does assigned tasks. |
| **IT / CDO** | An IT-and-data specialist. Raises findings and deviations, and does assigned tasks. |
| **Operations Head** | An operations specialist. Raises findings and deviations, and does assigned tasks. |
| **Viewer** | Read-only everywhere. Can look, but not create, change, or sign anything. |

---

## 2. What access differs by role

Four plain rules run through everything:

- **Who can create quality records** — the working roles (QA, CSV/Validation Lead, Regulatory Affairs,
  QC Lab Director, IT/CDO, Operations Head) and QA Head. They raise findings and deviations.
- **Who can only view quality records** — **Customer Admin views quality work but cannot author it**:
  they can read a deviation, a finding, or a corrective action, but cannot raise, change, or sign one.
  Viewer is read-only too.
- **Who can sign** — only people who have been given **signing authority** (see section 5), and only
  QA Head and Regulatory Affairs sign the quality actions that need a signature. **Platform Admin never
  signs quality work.**
- **Who administers the organisation** — Customer Admin (people, sites, settings). Platform Admin runs
  the platform itself, in a separate area.

---

## 3. Adding a person

Only a Customer Admin does this.

1. Open **Settings** and go to **People**.
2. Select **Add**.
3. Fill in the person's **name**, **email**, **username**, **role**, and a starting **password**. All
   are required.
4. Confirm.

**Adding a person does not ask you for your own password** — it isn't a legally signed action.

**What the role decides.** The role you choose is what decides everything that person can do: which
parts of the app they see, whether they can create quality records or only view them, and whether they
can be given signing authority. You can only grant the roles you're allowed to grant — a Customer Admin
cannot create another administrator or a platform-level account.

**Assigning a site.** Most roles work at a single site and must be given one — without a site, a
site-bound person cannot sign in. A few roles see every site by design and don't need one assigned:
QA Head and Customer Admin (and Platform Admin, who sits outside sites). [VERIFY] the exact place you
set a person's site on your screen.

**What changes for that person, straight away:**

- They can sign in with the details you set.
- Their menu and what they can do follow their role.
- They see the records for their site — or, if they're QA Head or Customer Admin, every record for the
  site.

---

## 4. Changing a person later

- **Turn an account off or on.** Open the person in **People** and select **Deactivate** or
  **Activate**. A deactivated person cannot sign in until reactivated. You cannot change your own
  account this way.
- **Edit a person's details or role.** Open them and change what's needed. Editing does not ask for
  your password.

---

## 5. Signing authority, and the actions that ask for a password

**Signing authority** is a separate switch from a person's role. Some quality actions are *legally
signed* — signing one records that a named person, at that moment, took that decision, and it asks the
signer to enter their password. A person can only perform those actions if an administrator has given
them signing authority.

Two administrator actions are themselves legally signed, so **they ask you (the admin) for your own
password:**

- **Removing a person.** Open the person in **People**, select **Delete**, and enter your **password**
  to confirm. Where you can, switch the account off instead of removing it, so their history stays
  clear.
- **Changing who can sign.** Turn a person's **signing authority** on or off, and enter your
  **password** to confirm. You cannot change your own signing authority.

**Adding a person does not ask for a password.** Editing a person, or turning an account off and on,
does not either. Only removing a person and changing signing authority do.

**If your password is wrong**, the change does not go through, and the attempt is recorded. Enter the
correct password and try again.

---

## 6. Who can reach which part of the app

This is the see-it / don't-see-it map. "Sees it" means the item is in that role's menu; it doesn't
always mean they can change what's inside (that's sections 2 and 5).

| Part of the app | Who sees it |
|---|---|
| **Dashboard** | Everyone except Platform Admin. |
| **Gap Assessment** | Working roles and QA Head act; Customer Admin and Viewer can view. |
| **Deviation Management** | Everyone except Platform Admin. |
| **CAPA Tracker** | **Only QA Head and Customer Admin.** Everyone else reaches their corrective-action work through **My Work**. |
| **My Work** | Everyone except Platform Admin. |
| **Inspections & Regulatory** | Working roles and QA Head; Customer Admin and Viewer can view. |
| **Evidence & Documents** | Most roles. |
| **Training & Awareness** | Everyone except Platform Admin. |
| **Governance & KPIs** | **Only QA Head and Customer Admin.** |
| **Audit Trail** | **Only QA Head and Customer Admin.** |
| **Settings** | Customer Admin makes changes; anyone else who reaches it sees it read-only. |
| **Support** | Everyone. |

**Within a screen, most people see only their own records** — the ones they raised or were assigned.
**QA Head and Customer Admin see every record for the site.** **My Work only ever shows work assigned
to the person looking at it.**

---

## 7. Where access questions usually come from

| What the person says | Why, and what to do |
|---|---|
| "I can't find a whole part of the menu." | Some parts are limited by role — CAPA, Governance, and the Audit Trail are for QA Head and Customer Admin; Settings is for Customer Admin. Check their role. |
| "I can see records but can't change them." | They may be a Customer Admin or Viewer, who view quality work but don't author it. Or the record isn't theirs. |
| "A new person can't sign in." | Check their account is active, they have a site (if their role needs one), and their details are right. |
| "Someone can't sign a closure." | They need signing authority. An administrator grants it — and that grant is itself a signed action. |
| "I can't create an administrator." | A Customer Admin can grant only certain roles. Higher-level accounts are set up outside this screen. |

---

# Process — Gap Assessment (Findings)

## 1. What this process achieves

This process takes a compliance gap from the moment it's spotted to a verified close. It makes sure
every finding has a root cause, an owner who does the work, and an independent review before it's shut.
The people who raise, work, and close a finding are kept separate so no one signs off their own work.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ (full) | ✓ | ✓ | — | ✓ | |
| **QA** | ✓ | ✓ (own, limited) | | | — | | |
| **CSV / Validation Lead** | ✓ | ✓ (own, limited) | | | — | | |
| **Regulatory Affairs** | ✓ | ✓ (own, limited) | | | — | | |
| **QC Lab Director** | ✓ | ✓ (own, limited) | | | — | | |
| **IT / CDO** | ✓ | ✓ (own, limited) | | | — | | |
| **Operations Head** | ✓ | ✓ (own, limited) | | | — | | |
| **Customer Admin** | | | | | — | | ✓ |
| **Viewer** | | | | | — | | ✓ |

- **Fill (full)** — QA Head can change any of a finding's details, including its severity.
- **Fill (own, limited)** — the person who raised a finding can correct its own details (the
  requirement, the area, the target date, the evidence link, and the root cause) but **not** its
  severity or status. [VERIFY] whether the raiser can change the "area" — the audit is not certain the
  screen allows it even though the rules suggest it.
- **Sign** — findings have **no** password-signed step (see section 5), so this column is not used here.
- The person a finding is **assigned** to is one of the working roles (not an administrator or Viewer,
  and not the person assigning it). They do the work from **My Work**.

## 3. The process, step by step

### Step 1 — Raise the finding
- **Who:** any working role (QA Head, QA, CSV/Validation Lead, Regulatory Affairs, QC Lab Director,
  IT/CDO, Operations Head).
- **Opens and clicks:** **Gap Assessment** → the **Register** view → **Report Gap**.
- **Fills in:** the **requirement** (a real sentence, required), the **area** (required), the
  **severity** (Critical / High / Medium / Low, required), and the **target date** (required, not in
  the past). If their role covers more than one site, they pick the **site**; otherwise the app sets it.
- **Gate:** none — this is the start.
- **Signed action?** No.
- **Status after:** **Open**. The raiser owns it.
- **Goes to:** the raiser keeps it. QA Head can see it in the register. Most other people can't see it.

### Step 2 — Record the root cause
- **Who:** the person who raised it (until it's assigned), or QA Head at any time.
- **Opens and clicks:** the finding → the **Root Cause** section → records how it was worked out and the
  root cause → saves.
- **Fills in:** how the cause was worked out, and the **root cause** text (required). If the finding
  already has a root cause and this is a change, a short **reason** is required; a first entry needs no
  reason.
- **Gate:** the finding isn't closed, and no corrective action has been raised from it. The raiser may
  do this **only until the finding is assigned** — after that, only QA Head can.
- **Signed action?** No.
- **Status after:** unchanged.
- **Goes to:** stays with the finding. The root cause now shows on it.

### Step 3 — Assign the finding (Low severity)
- **Who:** QA Head only.
- **Opens and clicks:** the finding → chooses a person → **Assign**.
- **Fills in:** the person to assign it to.
- **Gate:** the finding is **Low** severity; the person is active working staff at the site; you can't
  assign it to yourself; the finding isn't closed or locked. (For High, Medium, and Critical findings,
  QA Head raises a corrective action instead — see the alternative below.)
- **Signed action?** No.
- **Status after:** **In Progress**.
- **Goes to:** the assignee. It appears in their **My Work**, and they're alerted.

### Step 4 — Do the work and submit
- **Who:** the assignee.
- **Opens and clicks:** **My Work** → the task → attaches evidence, adds notes → **Submit to QA**.
- **Fills in:** work **notes** (at least a short sentence, required to submit), plus any evidence.
- **Gate:** the task is assigned to you, and the finding isn't locked.
- **Signed action?** No.
- **Status after:** **Submitted**.
- **Goes to:** QA Head. There's **no alert on submit** — QA Head finds submitted findings by opening the
  register and looking at the ones marked **Submitted**.

### Step 5 — Review and close
- **Who:** QA Head — but not the person who did the work.
- **Opens and clicks:** the finding → **Accept & close**, or **Send for rework** with a reason.
- **Fills in:** for rework, a short **reason** (required).
- **Gate:** the finding is **Submitted**; the reviewer is not the assignee; to close, a root cause must
  already exist and the person closing must not be the one who recorded it.
- **Signed action?** No.
- **Status after:** **Closed** (accepted) or **Rework** (sent back).
- **Goes to:** on accept, the person who did the work is told it was closed. On rework, it returns to
  their **My Work** as **Returned**, with the reason, and they resubmit (back to Step 4).

### Alternative to Steps 3–5 — Raise a corrective action
- **Who:** QA Head.
- **Opens and clicks:** the finding → **Raise CAPA** → confirms.
- **Gate:** used for the more serious findings, and the usual route for High, Medium, and Critical.
- **Signed action?** No (raising it isn't signed; closing the corrective action later is — see the CAPA
  process).
- **Status after:** the finding is **locked** to the corrective action and moves to **In Progress**.
  Work continues in the corrective action, and the finding **closes automatically** when that
  corrective action is signed closed.

## 4. The independence rules (who can't finish their own work)

- **The person the work was assigned to cannot review or close their own work** — a different QA Head
  must review it.
- **The person who recorded the root cause cannot be the one who closes the finding** — a different
  colleague must close it. In practice the raiser records the root cause and a QA Head closes, so there's
  no clash; but if a QA Head records the root cause, a different QA Head has to close it.
- **Once the finding is assigned, the person who raised it can no longer change the root cause** — from
  that point only QA Head can, because the work has been handed off.

## 5. Signing & closing

**Findings are not password-signed.** Closing a finding is a QA Head judgment and is recorded in the
history, but it does **not** ask for a password. (The password-signed actions live in the Deviations,
CAPA, and Inspections processes.) The control that keeps a close honest here is the independence rule in
section 4 — a root cause must exist, and the person closing must not be the one who recorded it.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **No "Report Gap" button** | Their role can't raise findings. | Viewers and Customer Admins view findings but don't raise them; ask a working role or QA Head. |
| **Can't change severity or status** | Those are QA judgments. | As the raiser you can correct the details; ask QA Head to change severity or status. |
| **The Root Cause section is read-only** | The finding is assigned (only QA Head changes it now), or a corrective action has been raised from it (which locks it). | Continue in the linked corrective action if there is one; otherwise ask QA Head. |
| **"Accept & close" is greyed out — no root cause** | A finding can't close without a root cause. | Record the root cause first, then close. |
| **"Accept & close" is greyed out — you recorded the root cause** | The person who recorded the root cause can't close the finding. | Ask a different colleague to close it — this keeps the review independent. |
| **"Accept & close" is greyed out — you did the work** | You can't review a finding assigned to you. | A different QA Head must review it. |
| **Can't assign the finding to yourself** | The work and the review must stay with different people. | Assign it to someone else. |
| **"Assign" only appears for some findings** | Assignment is for Low severity. | For higher severities, raise a corrective action instead. |
| **No "Submit" on the Gap screen** | Assignees submit from My Work. | Open **My Work** and submit the finding from there. |

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | Raised. No one is working it yet. |
| **In Progress** | Assigned to someone (or a corrective action has been raised from it) and work is under way. |
| **Submitted** | The person who did the work has sent it to QA Head for review. |
| **Rework** | QA Head sent it back for more work; it returns to the person who did it. |
| **Closed** | Resolved and verified by QA Head. This is the end of the line. |

---

# Process — Deviations

## 1. What this process achieves

This process takes a deviation from the moment it's reported to a signed close. It makes sure the
deviation is investigated, that a decision is made about whether a corrective action is needed, and that
the close is signed by someone independent of the work. It carries the heaviest independence rules in
the app: the reporter, the investigator, and the person who signs it closed must all be different people.

## 2. Who takes part

| Role | Raise | Fill (investigate) | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| **QA** | ✓ | ✓* | | | | | |
| **CSV / Validation Lead** | ✓ | ✓* | | | | | |
| **Regulatory Affairs** | ✓ | ✓* | | | | | |
| **QC Lab Director** | ✓ | ✓* | | | | | |
| **IT / CDO** | ✓ | ✓* | | | | | |
| **Operations Head** | ✓ | ✓* | | | | | |
| **Customer Admin** | | | | | | | ✓ |
| **Viewer** | | | | | | | ✓ |

**✓\*** — the investigation may be recorded by any working role *except the person who reported the
deviation*. In practice, only a QA Head (who can see every record) or a person the deviation was handed
to can open it to investigate — so this usually falls to a QA Head.

> **Closing genuinely needs a different person from the earlier steps.** Even though Assign, Review,
> Sign, and Close all belong to QA Head, the *same* QA Head cannot carry one deviation through every
> step. Whoever reported it, investigated it, or worked a task on it is barred from signing it closed —
> so a deviation is finished by a QA Head who is clear of all of those. In a team with a single QA Head,
> a **second** QA Head is needed to close.

## 3. The process, step by step

### Step 1 — Report the deviation
- **Who:** any working role (QA Head, QA, CSV/Validation Lead, Regulatory Affairs, QC Lab Director,
  IT/CDO, Operations Head).
- **Opens and clicks:** **Deviation Management** → **Report Deviation**.
- **Fills in:** **title**, **description**, **type** (planned or unplanned), **category**, **severity**,
  **area**, **immediate action**, and **due date** (not in the past). All required. Multi-site roles pick
  the **site**; others have it set for them.
- **Gate:** none — this is the start.
- **Signed action?** No.
- **Status after:** **Open**. The reporter and the QA Heads can see it; most others cannot.

### Step 2 — Attach supporting documents (optional)
- **Who:** the person who reported it — **only** the reporter.
- **Opens and clicks:** the deviation → the documents area → adds a file.
- **Gate:** you reported this deviation.
- **Signed action?** No.
- **Status after:** unchanged. (QA reviews the evidence later; QA does not upload it here.)

### Step 3 — Start the investigation
- **Who:** QA Head.
- **Opens and clicks:** the deviation → **Start Investigation**.
- **Gate:** the deviation is **Open**.
- **Signed action?** No.
- **Status after:** **Under Investigation**.

### Step 4 — Record the investigation and root cause
- **Who:** a working role who is **not** the reporter — in practice a QA Head.
- **Opens and clicks:** the deviation → the Investigation section → chooses how the cause was worked out
  and writes the **root cause** → saves. Both required.
- **Gate:** you did not report this deviation; it is under investigation and not closed.
- **Signed action?** No.
- **Status after:** **Pending QA Review**.
- **Goes to:** a QA Head to decide on a corrective action and, in time, to close it. There's no work-list
  alert — the deviation is picked up from the deviation list at **Pending QA Review**.

### Step 5 — Make the corrective-action decision
- **Who:** a QA Head who is **not** the reporter and **not** the investigator.
- **Opens and clicks:** the deviation → the corrective-action decision area → chooses whether one is
  required and writes a short **reason** (required).
- **Gate:** the investigation is complete; you didn't report or investigate this deviation.
- **Signed action?** No.
- **Status after:** **Pending QA Review** (unchanged).
- **If a corrective action is required:** the QA Head raises one. The deviation moves to **CAPA Pending**
  and waits, linked, until that corrective action is signed closed — then it returns to **Pending QA
  Review** to be closed.

### Step 6 — (Low-priority alternative) Assign a task
- **Who:** QA Head.
- **Opens and clicks:** a low-priority deviation → **Assign Task** → chooses a person and writes a short
  message (required).
- **Gate:** the deviation is low priority; the person is active working staff.
- **Signed action?** No.
- **Goes to:** the person's **My Work**, and they're alerted. They do it and submit it back; a QA Head
  who is **not** that assignee reviews it and can send it back for rework.

### Step 7 — Sign and close
- **Who:** a QA Head who is **not** the reporter, **not** the investigator, and **not** a task assignee.
- **Opens and clicks:** the deviation → **Sign & Close** → writes a closing note → enters their
  **password** to sign.
- **Fills in:** a **closing note** (required) and the **password**.
- **Gate:** the investigation is complete / under QA review (or, for one that was CAPA Pending, the
  linked corrective action is closed). For a **Critical** deviation, a corrective action must have been
  raised and linked to it. And you must be clear of every earlier step.
- **Signed action?** **Yes — this asks for your password.**
- **Status after:** **Closed**.

### Step 8 — Reject (send back) — [VERIFY]
- **Who:** QA Head, with their **password**.
- **Opens and clicks:** the deviation → **Reject** → writes a reason → enters their **password**.
- **Gate:** the deviation is at **Pending QA Review**.
- **Signed action?** **Yes — this asks for your password.**
- **Status after:** **[VERIFY] — the screen and the outcome disagree.** The on-screen wording says a
  rejected deviation is *"returned to investigation,"* but in practice it reaches a terminal **Rejected**
  state and does not move on. **Do not rely on either reading until it's confirmed in the live app.**
  This is a fix-the-app item, not a wording choice — flag it to the build team.

## 4. The independence rules (who can't finish their own work)

Stated plainly, in the order they bite:

- **You cannot investigate a deviation if you reported it** — someone else must investigate it.
- **You cannot decide on, or raise, the corrective action if you reported the deviation or investigated
  it** — a different QA Head must.
- **You cannot sign a deviation closed if you reported it, investigated it, or worked a task on it** — a
  different QA Head must close it.

Together these mean a single deviation passes through at least two, and often three, different people
before it can be closed.

## 5. Signing & closing

Two actions here are **legally signed** and ask the QA Head for their **password**:

- **Sign & Close** — the QA Head confirms the closing note and that they're satisfied the deviation is
  resolved. The signature records who signed, when, and what they were agreeing to.
- **Reject** — the QA Head confirms the reason for sending it back. It is signed the same way.
  ([VERIFY] where a rejected deviation actually ends up — see Step 8.)

**If the password is wrong**, the action does not go through, nothing changes, and the attempt is
recorded. Enter the correct password and try again.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **No "Report Deviation" button** | Their role can't report deviations. | Viewers and Customer Admins view but don't report. |
| **I can't attach a document** | Only the reporter attaches a deviation's evidence. | If you're QA, you review the evidence rather than adding it. |
| **No "Start Investigation" button** | Only QA Head starts one, and only while it's Open. | Ask a QA Head. |
| **I can't record the investigation** | You reported this deviation. | Someone else must investigate it — this keeps the investigation independent. |
| **I can't make the corrective-action decision** | You reported or investigated this deviation. | A different QA Head must decide. |
| **"Sign & Close" is greyed out — not ready** | The investigation isn't complete, or (for a Critical) no corrective action is linked yet. | Finish the investigation, or raise and link the corrective action first. |
| **"Sign & Close" is greyed out — it's yours** | You reported it, investigated it, or worked its task. | A different QA Head must close it. |
| **I can't reject the deviation** | Rejecting is only possible while it's under QA review. | Wait until it reaches Pending QA Review. |
| **My password was refused** | The signature didn't confirm. | Nothing changed and the attempt is recorded; enter the correct password. |

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | Reported. The investigation hasn't started. |
| **Under Investigation** | The root cause is being worked out. |
| **Pending QA Review** | The investigation is complete and a QA Head is reviewing it, ready to close or reject. |
| **CAPA Pending** | A corrective action has been raised; the deviation stays open and linked until that corrective action is closed. |
| **Closed** | A QA Head is satisfied and has signed it closed. The end of the line. |
| **Rejected** | A QA Head has rejected it. **[VERIFY]** — the screen says it's returned to investigation, but in practice it appears to be a terminal state with no further step. Confirm the real outcome in the live app. |

---

# Process — CAPA (Corrective and Preventive Action)

## 1. What this process achieves

This process runs a corrective action from the moment it's raised to a signed close and, later, a check
that it worked. It makes sure the root cause is reviewed by someone other than the person who wrote it,
the corrective work is done and accepted, and the close is signed by someone independent. Sign-and-close
is a legally signed action, and the effectiveness check afterwards is signed too.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| **Customer Admin** | | | | | | | ✓ |
| **Viewer** | | | | | | | ✓ |

> **The doer roles work here from My Work, not on the CAPA screen.** QA, CSV/Validation Lead, QC Lab
> Director, Regulatory Affairs, IT/CDO, and Operations Head don't open the CAPA screen at all. When a QA
> Head assigns them a corrective-action task, it appears in their **My Work**, and they carry it out
> there. Only QA Head and Customer Admin can open the CAPA screen, and Customer Admin can only view.

## 3. The process, step by step

### Step 1 — Raise the corrective action
- **Who:** QA Head.
- **Opens and clicks:** **CAPA Tracker** → the option to add one.
- **Fills in:** a **title** (a real summary, required), a **description** (a proper description,
  required), the **source**, and the **risk**. Often it's raised from a finding, a deviation, or an
  inspection observation, in which case much of the detail is carried across.
- **Gate:** none — this is the start.
- **Signed action?** No.
- **Status after:** **Open**.

### Step 2 — Record the root cause and start the work
- **Who:** QA Head.
- **Opens and clicks:** the corrective action → records the **root cause** in the plan.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** moves to **In Progress** once the root cause is entered.

### Step 3 — Review the root cause
- **Who:** a QA Head who is **not** the person who raised this corrective action.
- **Opens and clicks:** the review area → marks the root cause **approved**, or sends it back, with a
  short **note** (required).
- **Gate:** the root cause has been recorded.
- **Signed action?** No.
- **Status after:** **In Progress**.

### Step 4 — Add and assign the corrective tasks
- **Who:** QA Head.
- **Opens and clicks:** the people-and-work area → adds a task → fills a **description** (required), an
  **owner**, and a **due date** (which can't be after the corrective action's own due date).
- **Gate:** the person you assign must be one of the doer roles (QA, CSV/Validation Lead, QC Lab
  Director, Regulatory Affairs, IT/CDO, Operations Head).
- **Signed action?** No.
- **Goes to:** the owner's **My Work**, and they're alerted.

### Step 5 — Do the corrective task
- **Who:** the assigned doer.
- **Opens and clicks:** **My Work** → the task → attaches evidence, adds notes → submits.
- **Gate:** the task is assigned to you.
- **Signed action?** No.
- **Goes to:** a QA Head to review.

### Step 6 — Review each person's work
- **Who:** QA Head.
- **Opens and clicks:** the task → **Accept**, or send it back with a reason.
- **Signed action?** No.
- **Status after:** the task is marked accepted, or returns to the doer's **My Work**.

### Step 7 — Get ready and submit for review
- **Who:** QA Head (or the person driving the corrective action).
- **Opens and clicks:** **Submit for review**, once the readiness checklist is complete:
  1. the **root cause** is approved,
  2. the **action-plan alignment** is reviewed,
  3. the **data-integrity check** is cleared — only when one applies,
  4. **all corrective tasks** are complete,
  5. **at least one evidence category** is answered,
  6. **at least one effectiveness measure** is defined.
- **Gate:** every item on that checklist. The app keeps the option unavailable and shows what's missing.
- **Signed action?** No.
- **Status after:** **Pending QA Review**.

### Step 8 — Sign and close
- **Who:** a QA Head who has **signing authority** and who is **not** the person who raised this
  corrective action.
- **Opens and clicks:** **Sign & Close** → writes a closing note → enters their **password** to sign.
- **Fills in:** a **closing note** (required) and the **password**.
- **Gate:** the corrective action is at **Pending QA Review**; every task is accepted or skipped; there
  is no unresolved concern in the discussion; you didn't raise this corrective action; you have signing
  authority.
- **Signed action?** **Yes — this asks for your password.**
- **Status after:** **Closed**.

### Step 9 — (Alternative to Step 8) Reject back for rework
- **Who:** QA Head.
- **Opens and clicks:** the reject option → writes a **reason** (required).
- **Gate:** the corrective action is at **Pending QA Review**.
- **Signed action?** No.
- **Status after:** back to **In Progress**, for the outstanding work to be redone and resubmitted.

### Step 10 — Record effectiveness (after closure)
- **Who:** someone with the right authority who is **not** the person who signed the closure.
- **Opens and clicks:** the closed corrective action → records whether it was effective, with notes
  (required) → enters their **password** to sign.
- **Gate:** the corrective action is closed. The app sets a date around 90 days on for this check.
- **Signed action?** **Yes — this asks for your password.**
- **Status after:** **Closed** (the effectiveness result is recorded against it).

## 4. The independence rules (who can't finish their own work)

- **You cannot review the root cause of a corrective action you raised** — a different colleague must
  review it.
- **You cannot sign closed a corrective action you raised** — a different QA Head must close it.
- **You cannot record the effectiveness check if you signed the closure** (or signed an earlier
  verification of it) — a different person must do the effectiveness check.

**[VERIFY] — older records.** For corrective actions raised before the original author was firmly
recorded, the app decides "who raised it" by matching **names**. Names are not a reliable way to tell
people apart, so on those older records the "must be a different person" check is weaker than on new
ones. Confirm who actually raised an older corrective action before relying on it to keep the sign-off
independent. This is a fix-the-app item for old records.

## 5. Signing & closing

Two actions here are **legally signed** and ask the signer for their **password**:

- **Sign & Close** — the QA Head confirms the closing note and that the corrective action is complete.
  It needs **signing authority**, and the signer must not be the person who raised the corrective
  action. The signature records who signed, when, and what they agreed to.
- **Record effectiveness** — the later check that the fix worked. It is signed the same way, by someone
  who did not sign the closure.

**If the password is wrong**, the action does not go through, nothing changes, and the attempt is
recorded. Enter the correct password and try again. (See the [VERIFY] in section 4 about how the
"different person" rule is checked on older records.)

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **I can't find CAPA in my menu** | The screen is for QA Head and Customer Admin only. | Do your corrective-action tasks from **My Work**. |
| **I can view but can't change anything** | You're a Customer Admin, who views corrective actions but doesn't author them. | The quality roles do the work. |
| **There's no option to raise one** | Only QA Head raises a corrective action. | Ask a QA Head. |
| **"Submit for review" is greyed out** | The readiness checklist isn't complete. | The screen lists what's missing — the root cause not approved, alignment not reviewed, the data-integrity check not cleared, tasks unfinished, no evidence answered, or no effectiveness measure. Complete those. |
| **I can't review the root cause** | You raised this corrective action. | A different colleague must review it. |
| **"Sign & Close" is greyed out — tasks** | Not every task is accepted or skipped. | Work through them first. |
| **"Sign & Close" is greyed out — a concern** | There's an unresolved concern in the discussion. | Resolve the concern, then close. |
| **"Sign & Close" is greyed out — it's yours** | You raised this corrective action. | A different QA Head must close it. |
| **"Sign & Close" is greyed out — signing** | You don't have signing authority. | Ask your Customer Admin to grant it (a signed change). |
| **I can't be assigned a task** | Only the doer roles can be assigned corrective tasks. | QA Head and admins assign the work rather than doing it. |
| **I can't edit after submitting** | Once submitted, it's locked while under review. | If it needs changes, a QA Head sends it back, which reopens it. |
| **My password was refused** | The signature didn't confirm. | Nothing changed and the attempt is recorded; enter the correct password. |

## 7. Statuses

| Status | What it means in practice |
|---|---|
| **Open** | Raised. The root cause hasn't been recorded yet. |
| **In Progress** | The root cause is in and the corrective work is under way. |
| **Pending QA Review** | Submitted, and a QA Head is reviewing it — ready to sign closed or send back. |
| **Closed** | A QA Head has signed and closed it. An effectiveness check follows around 90 days later. |

---

# Process — Inspections & Regulatory Responses

## 1. What this process achieves

This process runs a regulatory inspection from the moment it's recorded to the regulator's final
decision. It captures each observation, works out its root cause, raises a corrective action, and then
drafts, signs, and submits the formal response. Signing and submitting the response is a legally signed
action, and recording the outcome is signed too.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | ✓ | — | ✓ | ✓ | |
| **Regulatory Affairs** | ✓ | ✓ | | — | ✓ [VERIFY] | ✓ [VERIFY] | |
| **QA** | | ✓* | | — | | | |
| **CSV / Validation Lead** | | ✓* | | — | | | |
| **QC Lab Director** | | ✓* | | — | | | |
| **IT / CDO** | | ✓* | | — | | | |
| **Operations Head** | | ✓* | | — | | | |
| **Customer Admin** | | | | — | | | ✓ |
| **Viewer** | | | | — | | | ✓ |

- **Raise** — register the inspection. **Fill** — add observations, record their root causes, and draft
  the response. **Assign** — raise a corrective action from an observation (only QA Head). **Sign /
  Close** — sign and submit the response, and record the outcome.
- **✓\*** — a working role may add observations, investigate them, and draft only if they can see the
  inspection; in practice that means the person who registered it or a QA Head.
- **Sign / Close [VERIFY]** — the audit allows both **QA Head and Regulatory Affairs** to sign the
  response, but the on-screen wording may say only QA Head. Confirm in the live app (checklist row 5).

## 3. The process, step by step

### Step 1 — Register the inspection
- **Who:** QA Head or Regulatory Affairs.
- **Opens and clicks:** **Inspections & Regulatory** → **Register Event**.
- **Fills in:** the **type**, the **site**, the **inspection date**, the **response deadline**, and the
  internal **owner**. All required.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** inspection **Open**.

### Step 2 — Add observations
- **Who:** a working role who can see the inspection.
- **Opens and clicks:** **Observations** → **Add observation**.
- **Fills in:** the observation **text** (required), its **number**, and its **severity**; the area and
  regulation reference are optional.
- **Gate:** none beyond being able to see the inspection.
- **Signed action?** No.
- **Status after:** observation **Open**.

### Step 3 — Record the observation's root cause
- **Who:** a working role who can see the inspection.
- **Opens and clicks:** **Investigation** → the observation → records how the cause was worked out and
  the **root cause**.
- **Gate:** the observation exists.
- **Signed action?** No.
- **Status after:** the observation carries a root cause. [VERIFY] the exact status label at this point
  (checklist).

### Step 4 — Raise a corrective action from an observation
- **Who:** QA Head only.
- **Opens and clicks:** the observation → raises a corrective action → confirms the owner and due date.
- **Gate:** the observation exists.
- **Signed action?** No.
- **Status after:** observation **CAPA Linked**. A corrective action is created and then runs like any
  other (see the CAPA process).

### Step 5 — Draft the response
- **Who:** a working role who can see the inspection.
- **Opens and clicks:** **Response** → drafts the reply.
- **Gate:** the draft stays locked until **every** observation has both a root cause **and** a linked
  corrective action.
- **Signed action?** No.
- **Status after:** inspection **Response Drafted**.

### Step 6 — Sign and submit the response
- **Who:** QA Head or Regulatory Affairs [VERIFY row 5].
- **Opens and clicks:** **Sign & Submit** → confirms the meaning of the signature → enters their
  **password**.
- **Fills in:** the signature **meaning** and the **password**.
- **Gate:** the readiness steps are all met — every observation has a root cause, every observation has
  a linked corrective action, at least one response document is attached, the draft is written, and all
  commitments are complete or withdrawn.
- **Signed action?** **Yes — this asks for the signer's password.**
- **Status after:** inspection **Response Submitted**. The inspection is now locked.

### Step 7 — Record the outcome
- **Who:** QA Head or Regulatory Affairs [VERIFY row 5].
- **Opens and clicks:** **Record Outcome** → chooses the regulator's result → enters their **password**.
- **Gate:** the response has been submitted.
- **Signed action?** **Yes — this asks for the signer's password.**
- **Status after:** the matching outcome — **FDA Acknowledged**, **Closed**, or **Warning Letter**;
  or **Response Drafted** again if the regulator asks for follow-up.

## 4. The independence rules

- **Only a QA Head can raise the corrective action from an observation** — the person who drafts the
  response cannot create the fix themselves unless they are a QA Head.
- The audit records **no** separate rule that the person who signs the response must be different from
  the person who drafted it. If your own procedures require an independent signer, treat that as a
  process point to confirm against your standard — the app does not enforce it.

## 5. Signing & closing

Two actions here are **legally signed** and ask the signer for their **password**:

- **Sign & Submit the response** — the signer confirms the response and the meaning of their signature.
- **Record the outcome** — the signer confirms the regulator's result.

Both are open to **QA Head and Regulatory Affairs** according to the audit, though the on-screen wording
may name only QA Head — **[VERIFY] (checklist row 5)**. **If the password is wrong**, the action does
not go through, nothing changes, and the attempt is recorded. Once the response is submitted, the whole
inspection is locked.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **"Register Event" doesn't work for me** | Only QA Head and Regulatory Affairs create an inspection. | Ask one of them to set it up. |
| **I can't start the response draft** | Every observation must have both a root cause and a linked corrective action first. | Complete those, then draft. |
| **"Sign & Submit" is greyed out** | The readiness steps aren't all met. | The screen shows what's outstanding — a missing root cause or corrective action, no response document, or an open commitment. |
| **I can't change anything on the inspection** | Once the response is submitted, the inspection is locked. | It's now a signed, submitted record. |
| **I drafted the response but can't sign it** | Signing is for QA Head and Regulatory Affairs. | [VERIFY] the on-screen wording, which may mention only QA Head (checklist row 5). |
| **I can't raise the corrective action** | Only QA Head can. | Ask your QA Head. |
| **My password was refused** | The signature didn't confirm. | Nothing changed and the attempt is recorded; enter the correct password. |

## 7. Statuses

**Inspection**

| Status | What it means in practice |
|---|---|
| **Open** | Recorded. Work hasn't started. |
| **Response Drafted** | A draft response has been written. |
| **Response Submitted** | The signed response has gone to the regulator. |
| **FDA Acknowledged** | The regulator has confirmed receipt. |
| **Closed** | The regulator is satisfied; no further action. |
| **Warning Letter** | The regulator has escalated. Immediate senior attention. |

You may also see **Response Due** shown as a reminder when the deadline is near.

**Observation**

| Status | What it means in practice |
|---|---|
| **Open** | Not addressed yet. |
| **CAPA Linked** | A corrective action has been raised for it. |
| **Response Drafted** | Its part of the response has been drafted. |

---

# Process — Evidence & Documents

## 1. What this process achieves

This process keeps your library of supporting documents. You add documents, find and download them, and
remove the ones you manage. The evidence that backs a specific record is attached inside that record —
not from the library — and shows here only for reference.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | — | — | — | — | |
| **CSV / Validation Lead** | ✓ | ✓ | — | — | — | — | |
| **Regulatory Affairs** | ✓ | ✓ | — | — | — | — | |
| **QA** | | | — | — | — | — | ✓ |
| **QC Lab Director** | | | — | — | — | — | ✓ |
| **IT / CDO** | | | — | — | — | — | ✓ |
| **Operations Head** | | | — | — | — | — | ✓ |
| **Customer Admin** | | | — | — | — | — | ✓ |
| **Viewer** | | | — | — | — | — | ✓ |

- **Raise** — add a document. **Fill** — edit its details. There is **no signed step** in the library,
  so the Sign and Close columns are not used here.
- **Removing** a document is **QA Head's** (see step 4). Everyone with access can **download**.
- **View only** roles can browse and download, but not add, edit, or remove.

## 3. The process, step by step

### Step 1 — Add a document
- **Who:** QA Head, CSV/Validation Lead, or Regulatory Affairs.
- **Opens and clicks:** **Evidence & Documents** → **Add document**.
- **Fills in:** a **file** or a **web link** — one of the two is required — plus a **name**; a category
  and description are optional.
- **Gate:** none. A file must be within the size limit and an allowed type; the screen says if it isn't.
- **Signed action?** No.
- **Status after:** the document is in the library.

### Step 2 — Edit a document's details
- **Who:** the roles that can add documents.
- **Opens and clicks:** the document's details → **Edit** → changes the name, type, or description.
- **Gate:** the document was added in the library (not one mirrored from another record). The file
  itself and where it came from can't be changed.
- **Signed action?** No.

### Step 3 — Download a document
- **Who:** anyone with access to the library.
- **Opens and clicks:** the document → downloads it; or selects several → **Download Selected**
  (web-link-only items are skipped, as there's no file to fetch).
- **Signed action?** No.

### Step 4 — Remove a document
- **Who:** QA Head.
- **Opens and clicks:** the document's details → **Delete** → confirms.
- **Gate:** the document was added in the library.
- **Signed action?** No — removing a document does **not** ask for a password.
- **Status after:** removed from the library; its record is retained.

### Attaching evidence to a record (the important rule)
- **Who:** the person doing the work on that record (from **My Work** or inside the record).
- **How:** you attach evidence **inside** the corrective action, finding, or deviation it supports — not
  from the library. Those documents then appear in the library as **Locked**, for reference only.

## 4. The independence rules

The library itself has no separate-person rule. The one cross-cutting rule about evidence lives in the
Deviations process: **on a deviation, only the person who reported it may attach its evidence — QA
reviews the evidence rather than uploading it.**

## 5. Signing & closing

**None.** The library has **no** legally signed step. Adding, editing, and removing a document do not
ask for a password.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **No "Add document" button** | Only QA Head, CSV/Validation Lead, and Regulatory Affairs add documents. | Ask one of them. |
| **I can't edit or remove a document** | It came from another record (locked here), or your role doesn't allow it. | Manage it from the record it belongs to. |
| **There's nowhere to link this document to a record** | You attach evidence inside the record, not from the library. | Open the corrective action, finding, or deviation and add it there. |
| **I can't see a document a colleague mentioned** | Most people see only the documents they uploaded. | QA Head and Customer Admin see all of the site's documents. |
| **"Delete" isn't available to me** | Only QA Head removes a document. | Ask your QA Head. |

## 7. Statuses

The library separates the documents you manage from documents that belong to other records.
[VERIFY] the exact status labels shown on your screen (checklist).

| What you see | What it means in practice |
|---|---|
| **A document you added** | Yours to edit or remove, as your role allows. |
| **Locked** | It belongs to another record and is shown for reference only. Manage it from that record. |

---

# Process — Governance & KPIs

## 1. What this process achieves

This process runs your oversight records: the risk register, the record of management reviews, and the
quality scorecards. You raise and manage risks, turn a risk into real quality work when it needs one,
and minute management meetings. Unlike every other quality area, **Customer Admin may create and change
records here**, because these are oversight records, not quality records.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | — | — | — | ✓ | |
| **Customer Admin** | ✓ | ✓ | — | — | — | ✓ | |

- **Raise** — add a risk or minute a meeting. **Fill** — edit a risk or amend a meeting. **Close** —
  archive a risk or meeting. There is **no signed step** here, so the Sign column is not used.
- **Turning a risk into quality work (converting it) is QA Head's alone** — see step 4 and section 4.
- **No other role reaches this screen.** Governance is available only to QA Head and Customer Admin;
  everyone else never sees it, which is why the working roles and Viewer aren't in this table.

## 3. The process, step by step

### Step 1 — Raise a risk
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** **Governance & KPIs** → **Risk Register** → **Add Risk**.
- **Fills in:** a **title**, a **description**, the **category**, the **severity**, the **likelihood**,
  and the **owner**. All required. A site, target date, and mitigation plan are optional.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** **Open**.

### Step 2 — Edit a risk
- **Who:** QA Head or Customer Admin (as managing roles), or the person who raised or owns the risk.
- **Opens and clicks:** the risk → **Edit** → changes what's needed.
- **Gate:** the risk hasn't been converted (a converted risk is fixed).
- **Signed action?** No.

### Step 3 — Archive a risk
- **Who:** a managing role — QA Head or Customer Admin.
- **Opens and clicks:** the risk → **Archive** → confirms.
- **Gate:** the person who only raised or owns a risk can edit it but **not** archive it.
- **Signed action?** No.
- **Status after:** archived (removed from the active list). [VERIFY] whether the screen confirms this
  clearly — it may not (checklist row 8).

### Step 4 — Turn a risk into quality work
- **Who:** QA Head only.
- **Opens and clicks:** the risk's detail → the **Convert** section → chooses a **gap**, a **deviation**,
  or a **corrective action** → fills in the details and confirms.
- **Gate:** the risk is live (Open or Mitigating), not closed or already converted.
- **Signed action?** No.
- **Status after:** the risk is **Converted** (final); a real quality record is created and linked back,
  and then follows its own process.

### Step 5 — Minute a management review
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** **Management Reviews** → **Record Decision**.
- **Fills in:** a **topic**, a **meeting date**, the **attendees**, and at least one decision or
  follow-up item. All required.
- **Signed action?** No.

### Step 6 — Amend a meeting or tick off a follow-up item
- **Who:** a managing role, or the person who minuted the meeting.
- **Opens and clicks:** the meeting → **Amend**, or ticks a follow-up item done or open again.
- **Signed action?** No.

### Step 7 — Export the scorecard report
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** the **KPIs** view → the export option. [VERIFY] the exact report name (checklist).

## 4. The independence rules

- **Only a QA Head can convert a risk into quality work.** A Customer Admin can raise and manage a risk,
  but cannot convert it — because conversion creates a real quality record, which must be authored by a
  quality authority.
- **Archiving is for the managing roles.** The person who only raised or owns a risk can edit it but
  cannot archive it; archiving anyone's risk is a managing-role action.

## 5. Signing & closing

**None.** Governance has **no** legally signed step — nothing here asks for a password. When a risk is
converted, the real quality record it becomes carries its own signing later, in its own process.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **I can't find Governance in my menu** | It's available only to QA Head and Customer Admin. | Ask one of them. |
| **"Archive" isn't available on a risk** | Archiving is for the managing roles. | A creator or owner can edit but not archive; ask a managing role. |
| **The Convert options are greyed out** | Only QA Head can convert a risk. | Ask your QA Head. |
| **I can't convert a closed risk** | A closed risk can't be converted. | Reopen it first, then convert. |
| **I can't edit a converted risk** | Once converted it's fixed. | Open the record it became and continue there. |
| **I archived something and nothing seemed to happen** | [VERIFY] archiving may not always confirm (checklist row 8). | Refresh the list to check; if it's still there, try again or ask QA Head. |

## 7. Statuses

**Risk**

| Status | What it means in practice |
|---|---|
| **Open** | Raised and being watched. |
| **Mitigating** | Work is under way to reduce it. |
| **Closed** | No longer needs active management. Can be reopened if it returns. |
| **Converted** | Turned into a gap, deviation, or corrective action. Final — the work now lives in that record. |

**Follow-up item (in a management review)**

| Status | What it means in practice |
|---|---|
| **Open** | Still needs doing. |
| **Done** | Complete. |

---

# Process — Training & Awareness (Inspection Readiness)

> **A lighter process than the others.** This chapter covers only the parts that actually do something:
> setting up an inspection to prepare for, marking readiness tasks complete, running practice drills,
> and closing out an inspection. There isn't much for a working role to do here beyond viewing.

## 1. What this process achieves

This process helps you get ready for an inspection and see how prepared you are. Setting up an inspection
creates a standard set of readiness tasks; completing them raises a readiness score. You can also
schedule and score practice drills.

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **QA Head** | ✓ | ✓ | — | — | — | ✓ | |
| **Customer Admin** | | ✓ | — | — | — | | |
| **QA** | | | — | — | — | | ✓ |
| **CSV / Validation Lead** | | | — | — | — | | ✓ |
| **Regulatory Affairs** | | | — | — | — | | ✓ |
| **QC Lab Director** | | | — | — | — | | ✓ |
| **IT / CDO** | | | — | — | — | | ✓ |
| **Operations Head** | | | — | — | — | | ✓ |
| **Viewer** | | | — | — | — | | ✓ |

- **Raise** — set up an inspection to prepare for (QA Head). **Fill** — mark readiness tasks complete and
  run practice drills (QA Head and Customer Admin). **Close** — close out an inspection (QA Head).
- There is **no signed step** here, so the Sign column is not used.
- Everyone else can open the screen to see the readiness picture, but doesn't change it.

## 3. The process, step by step

### Step 1 — Set up an inspection to prepare for
- **Who:** QA Head.
- **Opens and clicks:** **Training & Awareness** → **New Inspection**.
- **Fills in:** a **title**, a **site**, a **lead**, and an expected **date**. All required.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** the inspection is created with a standard set of readiness tasks, all **Not Started**.

### Step 2 — Mark a readiness task complete
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** **Tasks** → the task → **Mark complete**.
- **Gate:** none.
- **Signed action?** No.
- **Status after:** the task is **Complete**, and the readiness score goes up. [VERIFY] whether a
  completed task can be reopened — the audit indicates it can't (checklist row 4).

### Step 3 — Schedule and score a practice drill
- **Who:** QA Head or Customer Admin.
- **Opens and clicks:** **Training** → **Schedule simulation** (gives it a title → **Scheduled**), then
  **Score & complete** (enters a score → **Completed**).
- **Signed action?** No.

### Step 4 — Close out the inspection
- **Who:** QA Head.
- **Opens and clicks:** **Complete Inspection** → chooses the **outcome** (required) → confirms.
- **Gate:** an outcome must be chosen.
- **Signed action?** No.
- **Status after:** the inspection is closed out.

## 4. The independence rules

None. This process has no separate-person requirements.

## 5. Signing & closing

**None.** Nothing here is a legally signed action; no step asks for a password.

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **I can open the screen but can't change anything** | Readiness is kept current by QA Head (and Customer Admin for some steps). | Everyone else views the picture. |
| **There's no "New Inspection" for me** | Only QA Head sets one up. | Ask your QA Head. |
| **I can't reopen a task I marked complete** | Completing a readiness task appears to be final. | [VERIFY] this in the live app (checklist row 4). |
| **"Complete Inspection" won't finish** | Closing out is QA Head's, and it needs an outcome. | Choose the outcome first. |

## 7. Statuses

**Readiness task**

| Status | What it means in practice |
|---|---|
| **Not Started** | Not done yet. |
| **Complete** | Done, and counted towards the readiness score. |

You may also see **Overdue** on a task whose due date has passed. [VERIFY] whether readiness tasks carry
due dates (checklist row 13).

**Practice drill**

| Status | What it means in practice |
|---|---|
| **Scheduled** | Booked, not yet run. |
| **Completed** | Run and scored. |

---

# Process — Support

> **This chapter is thin on purpose.** Support was **not** part of the review that the rest of this
> manual is built on. Only the few points that are genuinely supported are stated below; everything else
> is marked **[VERIFY: not covered by audit — confirm in live app]** rather than guessed. Treat this
> chapter as a skeleton to complete once someone walks Support in the running app.

## 1. What this process achieves

Support is where anyone raises a request for help and follows it to a resolution. A request is raised by
a user, answered by a handler, and closed when it's resolved. [VERIFY: not covered by audit — confirm
the exact purpose and shape of the Support process in the live app.]

## 2. Who takes part

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Everyone** | ✓ | [VERIFY] | [VERIFY] | [VERIFY] | — | [VERIFY] | |

- **Raise** — anyone can open a support request; Support appears in every role's menu, including Viewer.
  This is the one point the review confirms.
- **Handling** a request appears to sit with an administrator level and a platform level, but who may
  reply, escalate, resolve, or close is **[VERIFY: not covered by audit — confirm in live app]**.
- No signed step is known here, so the Sign column is dashed — **[VERIFY]** that nothing in Support asks
  for a password.

## 3. The process, step by step

> Each step below is a skeleton. The order looks right from how the app tells people about updates, but
> the fields, gates, and statuses are **not confirmed**.

### Step 1 — Raise a support request
- **Who:** anyone.
- **Opens and clicks:** **Support** → opens a new request.
- **Fills in:** [VERIFY: not covered by audit — confirm the required fields.]
- **Signed action?** No (assumed).
- **Note:** raising a request does **not** alert the handler — that one point is confirmed. The handler
  finds new requests by looking, not by an alert.

### Step 2 — Reply / hold a conversation
- **Who:** the person who raised it and the handler.
- **What happens:** a reply from one side alerts the other. This is confirmed.
- **[VERIFY: not covered by audit — confirm how replies are entered and what else happens.]**

### Step 3 — Escalate
- **What happens:** an escalation alerts the platform-level administrators. This is confirmed.
- **Who may escalate, and when:** [VERIFY: not covered by audit — confirm in live app.]

### Step 4 — Resolve and close
- **What happens:** resolving a request alerts the person who raised it; a change of status alerts both
  sides. These alerts are confirmed.
- **Who may resolve, close, reopen, or cancel, and the exact steps:** [VERIFY: not covered by audit —
  confirm in live app.]

## 4. The independence rules

[VERIFY: not covered by audit — confirm whether Support has any separate-person requirements. None are
known.]

## 5. Signing & closing

No signed step is known in Support. **[VERIFY: not covered by audit — confirm that no Support action
asks for a password.]**

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **I raised a request and no one responded** | Raising a request does not alert the handler (confirmed). | Handlers find requests by looking; allow time, or follow up. |
| **Anything else** | [VERIFY: not covered by audit.] | Confirm the real blockers in the live app. |

## 7. Statuses

The app clearly tracks a request through changes of status, and supports resolving, closing, reopening,
and cancelling — that much is visible from how it notifies people. **The exact status names and what
each means are [VERIFY: not covered by audit — confirm in live app.]**

---

# Process — CSV / CSA Validation

> **This chapter is partly grounded, partly thin.** CSV/CSA Validation was **not** part of the review
> the rest of this manual is built on. The **roles** and the **statuses** below come from the app's own
> shared definitions and are reliable; the **step-by-step process and the screens are not confirmed** and
> are marked **[VERIFY: not covered by audit — confirm in live app]**. Treat the flow as a well-informed
> skeleton to finish in the running app.

## 1. What this process achieves

This process validates a computer system, stage by stage. A validation specialist prepares each stage's
documents, submits them for review, and a QA Head approves or rejects the stage; the system is signed
off when its stages are complete. [VERIFY: not covered by audit — confirm the overall shape in the live
app.]

## 2. Who takes part

*(Roles are from the app's shared definitions and are reliable. What each does at each screen is
[VERIFY].)*

| Role | Raise | Fill | Assign | Review | Sign | Close | View only |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **CSV / Validation Lead** | ✓ | ✓ | [VERIFY] | | [VERIFY] | | |
| **QA Head** | ✓ | ✓ | [VERIFY] | ✓ | ✓ [VERIFY] | ✓ [VERIFY] | |
| **QA** | | | | | | | ✓ |
| **Regulatory Affairs** | | | | | | | ✓ |
| **QC Lab Director** | | | | | | | ✓ |
| **IT / CDO** | | | | | | | ✓ |
| **Operations Head** | | | | | | | ✓ |
| **Customer Admin** | | | | | | | ✓ |
| **Viewer** | | | | | | | ✓ |

- **Raise / Fill** — creating a system and preparing its validation stages is for the **CSV/Validation
  Lead and QA Head**. **Review** — approving or rejecting a stage is **QA Head's**. **Sign** — signing
  off is **QA Head's**.
- Whether the sign-off asks for a **password** is **[VERIFY: not covered by audit — confirm in live
  app]**.
- A person can also be given a **stage rework task**, which appears in their **My Work** — see step 4.

## 3. The process, step by step

> The order and the roles are well-informed; the exact fields, buttons, and gates are **[VERIFY: not
> covered by audit]**.

### Step 1 — Prepare a validation stage
- **Who:** CSV/Validation Lead (or QA Head).
- **Opens and clicks:** **CSV/CSA Validation** → the system → the stage → prepares its documents.
- **Fills in:** [VERIFY: not covered by audit.]
- **Signed action?** No.
- **Status after:** the stage is **Draft**.

### Step 2 — Submit the stage for review
- **Who:** CSV/Validation Lead.
- **Gate:** the stage's documents are prepared. [VERIFY exact gate.]
- **Signed action?** No.
- **Status after:** the stage is **In Review**.

### Step 3 — Approve or reject the stage
- **Who:** QA Head.
- **Opens and clicks:** the stage → approves or rejects it.
- **Signed action?** [VERIFY: not covered by audit — confirm whether approval asks for a password.]
- **Status after:** **Approved** or **Rejected**.

### Step 4 — (Where needed) work a stage rework task
- **Who:** the person a rework task is assigned to.
- **What happens:** a stage rework task appears in that person's **My Work**; they work it and submit it
  back, and a reviewer who is **not** the assignee reviews it. This much is confirmed.
- **[VERIFY: not covered by audit — confirm who assigns the task and the exact steps.]**

### Step 5 — Sign off the system
- **Who:** QA Head.
- **Gate:** the system's stages are complete. [VERIFY exact gate.]
- **Signed action?** [VERIFY: not covered by audit — confirm whether sign-off asks for a password.]

## 4. The independence rules

- **A stage rework task cannot be reviewed by the person it was assigned to** — a different colleague
  must review it. This one rule is confirmed.
- [VERIFY: not covered by audit — confirm any other separate-person rules, for example whether the
  person who prepared a stage may also approve it.]

## 5. Signing & closing

Signing off a validation stage or system appears to be a QA Head action. **Whether it is a
password-signed action is [VERIFY: not covered by audit — confirm in live app.]**

## 6. Where it can stall

| What the user sees | Why | What to do |
|---|---|---|
| **A stage won't submit** | Its documents may not be prepared. | [VERIFY the exact requirement]; complete the stage's documents. |
| **I can't approve a stage** | Approving is QA Head's. | Ask your QA Head. |
| **A rework task is waiting on me** | You've been assigned stage rework. | Open it in **My Work** and submit it back. |
| **Anything else** | [VERIFY: not covered by audit.] | Confirm the real blockers in the live app. |

## 7. Statuses

*(These stage statuses come from the app's shared definitions and are reliable.)*

| Status | What it means in practice |
|---|---|
| **Not Started** | The stage hasn't begun. |
| **Draft** | The specialist is preparing the stage's documents. |
| **In Review** | Submitted to QA Head to approve or reject. |
| **Approved** | QA Head approved it; the stage is complete. |
| **Rejected** | QA Head rejected it; rework is needed. |
| **Skipped** | Not applicable for this system. |
