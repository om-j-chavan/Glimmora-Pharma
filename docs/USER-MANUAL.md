# Glimmora Pharma — User Manual

> Platform: GxP / GMP Inspection Readiness & Digital Compliance
> Version: 1.0 | Date: March 2026

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Role-Based Access — Who Can Do What](#2-role-based-access)
3. [Module Flows](#3-module-flows)
   - [Login & Site Selection](#31-login--site-selection)
   - [Executive Dashboard](#32-executive-dashboard)
   - [Gap Assessment & Findings](#33-gap-assessment--findings)
   - [QMS & CAPA Tracker](#34-qms--capa-tracker)
   - [CAPA Detail & Closure](#35-capa-detail--closure)
   - [CSV/CSA & Systems Risk](#36-csvcsa--systems-risk)
   - [Inspection Readiness Program](#37-inspection-readiness-program)
   - [FDA 483 / Warning Letter Support](#38-fda-483--warning-letter-support)
   - [AGI & Autonomy Console](#39-agi--autonomy-console)
   - [Evidence & Document Workspace](#310-evidence--document-workspace)
   - [Governance & KPIs](#311-governance--kpis)
   - [Settings & Admin](#312-settings--admin)
4. [Role-Specific Task Guides](#4-role-specific-task-guides)
   - [Super Admin](#41-super-admin)
   - [QA Head](#42-qa-head)
   - [QC/Lab Director](#43-qclab-director)
   - [Regulatory Affairs](#44-regulatory-affairs)
   - [CSV/Val Lead](#45-csvval-lead)
   - [IT/CDO](#46-itcdo)
   - [Operations Head](#47-operations-head)
   - [Viewer](#48-viewer)
5. [Key Compliance Rules](#5-key-compliance-rules)
6. [Glossary](#6-glossary)

---

## 1. Getting Started

### 1.1 Accessing the Platform

1. Open your browser and go to the Glimmora Pharma URL (provided by your Super Admin).
2. On the **Welcome Back** login screen, you can sign in with **Google**, **Microsoft**, or enter your **Username** and **Passcode** manually. Use the "Remember me" checkbox to stay signed in, or click "Forgot passcode?" to reset.
3. After login you will see the **Select your site** dialog. Choose your facility (e.g., "Mumbai API Manufacturing"). Your role is tied to your site assignment.
4. You land on the **Executive Overview Dashboard**.

### 1.2 Navigation

The left sidebar is your main navigation. Modules are grouped into collapsible sections. Click a group header to expand or collapse it. The group containing your current page is automatically expanded.

| Group | Modules |
|---|---|
| **QMS & Compliance** | Dashboard, Gap Assessment, CAPA Tracker, Evidence |
| **Validation & Inspection** | CSV/CSA, Inspection Readiness, FDA 483 / WL |
| **Intelligence** | AGI Console, Governance & KPIs |
| **Administration** | Settings |

Only modules your role is permitted to access are shown within each group.

### 1.3 Top Bar

From left to right:

| Element | Description |
|---|---|
| **Hamburger menu** | Toggle sidebar visibility |
| **Date / Time pills** | Separate date and time displays (updates every minute) |
| **Search** | Global search — keyboard shortcut `Ctrl K` |
| **Color theme picker** | Choose from 14 accent color themes |
| **Dark / Light toggle** | Switch between dark and light mode |
| **Help** | Amber-styled help button for documentation and support |
| **Notifications bell** | Alerts from the AGI layer and overdue items |
| **Avatar + Name / Role** | Current user identity with name and role label |

### 1.4 Color Themes

Click the color palette icon in the top bar to pick an accent color. There are 14 options (Sky Blue, Ocean Blue, Teal, Emerald, Forest Green, Indigo Navy, Royal Purple, Rose Pink, Crimson Red, Orange, Amber Gold, Coffee Brown, Terracotta, Slate Gray).

The selected color applies to: active nav item highlight, primary buttons, links, focus rings, badges, and toggle controls. Page backgrounds and sidebar backgrounds are **not** affected by the color theme — only interactive and accent elements change.

---

## 2. Role-Based Access

### 2.1 Role Overview

| # | Role | Label | Primary responsibilities |
|---|---|---|---|
| 1 | `super_admin` | Super Admin | Full platform access, user management, AGI policy, all modules |
| 2 | `customer_admin` | Customer Admin | Full platform access identical to Super Admin — manages tenant workspace |
| 3 | `qa_head` | QA Head | CAPA closure, QMS oversight, batch disposition, management review |
| 3 | `qc_lab_director` | QC/Lab Director | Lab compliance, OOS/OOT, data integrity controls, evidence |
| 4 | `regulatory_affairs` | Regulatory Affairs | 483/WL support, agency commitments, response coordination |
| 5 | `csv_val_lead` | CSV/Val Lead | Computerized systems validation, Part 11/Annex 11, CSV roadmap |
| 6 | `it_cdo` | IT/CDO | AGI governance, security, system architecture |
| 7 | `operations_head` | Operations Head | Site performance, operational discipline, inspection readiness |
| 8 | `viewer` | Viewer | Read-only access to dashboard and governance reports |

### 2.2 Module Access by Role

| Module | super_admin | qa_head | qc_lab_director | regulatory_affairs | csv_val_lead | it_cdo | operations_head | viewer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gap Assessment | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| QMS & CAPA | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| CSV/CSA | ✅ | — | — | — | ✅ | — | — | — |
| Inspection Readiness | ✅ | — | — | — | ✅ | — | ✅ | — |
| FDA 483 / WL | ✅ | ✅ | — | ✅ | — | — | — | — |
| AGI Console | ✅ | — | — | — | — | ✅ | — | — |
| Evidence & Docs | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Governance & KPIs | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Settings | ✅ | ✅ | — | — | — | ✅ | — | — |

### 2.3 Action Permissions

| Action | Roles permitted |
|---|---|
| Close a CAPA (e-signature) | `qa_head`, `super_admin` |
| Approve documents | Users with `gxpSignatory = true` |
| Edit AGI policy | `super_admin`, `it_cdo` |
| Manage users / roles | `super_admin` |
| View FDA 483 / WL | `regulatory_affairs`, `qa_head`, `super_admin` |
| Access AGI Console | `it_cdo`, `super_admin` |
| View all (read-only) | `viewer` + all permitted modules |

---

## 3. Module Flows

### 3.1 Login & Site Selection

**Flow:**
```
Open URL → Sign In (email/SSO) → Select Organisation / Site → Dashboard
```

**Notes:**
- If you have access to multiple sites, you will see multiple cards on the site picker. Select the relevant site for this session.
- Your role is site-specific. Switching sites may change available modules.
- If you are denied access to a module, your role does not include that path. Contact your Super Admin.
- **Inactive accounts** — users whose status is set to Inactive in Settings → Users & Roles cannot sign in. They will see the message "Your account is inactive. Please contact your administrator to reactivate it." Re-activation is done by a Super Admin or Customer Admin from Settings → Users & Roles.

---

### 3.2 Executive Dashboard

**Who uses it:** All roles.

**What it shows:**
- **Readiness Score** — Overall GxP/GMP inspection readiness (0–100).
- **KPI Cards** — Critical findings count, CAPA overdue %, high-risk CSV systems, training compliance %.
- **Area Heatmap** — Risk level (HIGH/MED/LOW) by site and functional area. Cells are colour-coded: green ≥ 80%, amber 60–79%, red < 60%, and grey dashed "—" when no findings, CAPAs, or systems have been logged yet for that area + site (i.e. not assessed, not 100% ready).
- **Observation Trend Chart** — Monthly observation volume by severity (Critical/Major/Minor).
- **AGI Insights Panel** — Active only when AGI mode is Assisted or Autonomous. Shows top 3 risks with module links.
- **90-Day Action Plan** — Prioritised actions with owners, due dates, status, and AGI risk scores.

**Filters:**
- Timeframe (30 / 60 / 90 days / this year)
- Site (if multi-site access)
- Severity threshold

**Flow:**
```
Dashboard loads → Review KPI cards → Check heatmap for red areas
→ Read AGI Insights (if enabled) → Drill into action items via module links
→ Export action plan (Download button)
```

---

### 3.3 Gap Assessment & Findings

**Who uses it:** `super_admin`, `qa_head`, `qc_lab_director`, `regulatory_affairs`, `csv_val_lead`

**Tabs:**
1. **Findings Register** — Full list of GxP/GMP findings with filters.
2. **Evidence Index** — Documents grouped by area with completeness status.

**Flow — Findings Register:**
```
Open Gap Assessment → Apply filters (area, severity, status)
→ Search by ID, area, or regulation
→ Click Eye icon on a row → Detail panel opens on right
→ View: requirement, AGI summary, evidence reference, risk level
→ Click "Link to CAPA" (if not viewer) to connect finding to a CAPA
```

**Flow — Evidence Index:**
```
Click "Evidence Index" tab
→ See areas (QC Lab, QMS, CSV/IT, Training, Manufacturing)
→ Each area shows documents and Evidence Pack Status (Complete / Partial / Missing)
→ Missing/Partial areas require attention before inspection
```

**Key fields:**
- **Severity:** Critical (immediate action) / Major (30 days) / Minor (90 days)
- **Status:** Open / In Progress / Closed
- **Evidence Pack Status:** Complete ✅ / Partial ⚠ / Missing ❌

---

### 3.4 QMS & CAPA Tracker

**Who uses it:** `super_admin`, `qa_head`, `qc_lab_director`, `regulatory_affairs`, `csv_val_lead`

**What it shows:**
- **Stats bar** — Overdue, Open, Closed, On-time rate.
- **AGI CAPA Intelligence** — Pattern detection, escalation alerts (when AGI enabled).
- **CAPA table** — Filterable by risk, status, source. Columns: ID, Source, Description, Risk, Owner, Due date, Status, Effectiveness check, RCA method, DI gate.
- **Management review metrics** — On-time closure %, repeat observation rate, DI coverage, effectiveness check status.

**Flow — Reviewing CAPAs:**
```
Open QMS & CAPA → Filter by status "Overdue" → Identify critical items
→ Click "View" on a row → Opens CAPA Detail page
→ Review root cause, action plan, history
→ Track progress of individual action steps
```

**Flow — Creating a CAPA:**
```
Click "New CAPA" (not available to viewer) → Fill: Source, Description, Risk, Owner, Due date
→ Select RCA method → Indicate if DI gate required
→ Save → CAPA appears in list with status "Open"
```

**Important:** CAPA sources include: FDA 483, Internal Audit, Deviation, OOS, Management Review, Supplier Audit.

---

### 3.5 CAPA Detail & Closure

**Who uses it:** All roles with CAPA access. Closure: `qa_head`, `super_admin` only.

**What it shows:**
- CAPA header with ID, status badge, risk badge, DI gate indicator.
- **Details panel** — Source, area, regulation, owner, due date, effectiveness check date, RCA method.
- **Root cause section** — Full root cause statement (5-Why, Fishbone, etc.).
- **Action plan** — Numbered steps with owner, due date, and status.
- **AGI Analysis panel** — Risk summary, links to related findings, effectiveness check status.
- **Activity history** — Timestamped log of all actions including AGI-triggered alerts.

**Flow — CAPA Closure (QA Head / Super Admin only):**
```
Open CAPA Detail → Verify all action steps are "Closed"
→ Review root cause completeness
→ Click "Close CAPA (e-sign)"
→ Enter e-signature credentials (username + meaning of signature + timestamp)
→ Confirm → Status changes to "Closed" → Audit trail entry created
```

**Compliance note:** CAPA closure is a Part 11 / Annex 11 regulated action. The e-signature is bound to the record with signer identity, intent, and timestamp. This cannot be undone without a new CAPA record.

---

### 3.6 CSV/CSA & Systems Risk

**Who uses it:** `super_admin`, `csv_val_lead`

**Tabs:**
1. **System Inventory & Risk Register** — All computerized systems with risk and validation status.
2. **CSV/CSA Roadmap** — Planned validation activities with timelines.

**Flow — System Inventory:**
```
Open CSV/CSA → Apply type filter (e.g., LIMS) or risk filter (e.g., High)
→ Click "Detail" on a system row → Side panel opens
→ View: GxP relevance, Part 11 status, validation status, owner, last review, notes
→ Identify systems with Part 11 "Gap" — these need remediation CAPAs
```

**Flow — Roadmap:**
```
Click "CSV/CSA Roadmap" tab
→ View validation activities sorted by priority (Critical first)
→ Each row: System, Activity, Start date, End date, Priority
→ Use this to track validation sprint progress
```

**Key statuses:**
- **Part 11:** Compliant ✅ / Partial ⚠ / Gap ❌ / Not Applicable
- **Validation:** Validated ✅ / Qualified ✅ / Partial Validation ⚠ / Not Started ❌ / Requires Remediation ❌

---

### 3.7 Inspection Readiness Program

**Who uses it:** `super_admin`, `csv_val_lead`, `operations_head`

**Tabs:**
1. **Readiness Roadmap** — Swimlane view by area (People, Process, Data, Systems, Documentation) across 3 time buckets.
2. **Inspection Playbooks** — Front room, back room, SME, and DIL handling procedures.
3. **Training & Simulations** — Training matrix and simulation launch.

**Flow — Roadmap:**
```
Open Inspection Readiness → Click "Readiness Roadmap" tab
→ Select time bucket: Immediate (0–30d) / 31–60d / 61–90d
→ Review action cards for each lane (People, Process, Data, Systems, Documentation)
→ Items shown are the actions required in that time window
```

**Flow — Playbooks:**
```
Click "Inspection Playbooks" tab
→ Select a playbook card (Front Room / Back Room / SME / DIL)
→ Right panel shows: description, numbered steps, do/don't rules, attachments
→ Print or download attached templates for inspection day
```

**Flow — Training Matrix:**
```
Click "Training & Simulations" tab
→ View matrix: Role × Training Module × Completion Status
→ Identify "Open" status items — these need scheduling
→ Click "Launch Simulation" to initiate a mock inspection exercise (QA Head / Super Admin)
```

**Playbook quick reference:**

| Playbook | Key rule |
|---|---|
| Front Room | Answer only what is asked. Never volunteer extra information. |
| Back Room | QA review required before submitting any document to inspectors. |
| SME Guide | "I will confirm and follow up" is always acceptable. Never guess. |
| DIL Handling | Acknowledge within 5 minutes. QA review before submission. |

---

### 3.8 FDA 483 / Warning Letter Support

**Who uses it:** `regulatory_affairs`, `qa_head`, `super_admin`

**What it shows:**
- Card per enforcement event (FDA 483, EMA/MHRA finding).
- Each card expandable to show: observations, commitment matrix, RCA workspace.

**Flow — Reviewing an event:**
```
Open FDA 483 / WL → Click on event card to expand
→ Review Observations section:
   - Observation number, area, severity
   - Linked CAPA reference
   - RCA status and response status
→ Review Commitment Matrix:
   - Each commitment with owner, due date, status
→ Open RCA Workspace (active events only):
   - Click a template (5-Why, Fishbone, Fault Tree) to begin analysis
```

**Flow — Response tracking:**
```
For each observation, check:
  - RCA status: Complete / In Progress / Not Started
  - Response status: Accepted / Drafting / Not Started
→ Overdue commitments show as badge-red in the matrix
→ Export commitment matrix for agency submission via "Export" button
```

**Compliance note:** No response or commitment may be submitted to an agency directly from this platform. All external communications require human review and sign-off per SOW Section 9.2.

---

### 3.9 AGI & Autonomy Console

**Who uses it:** `it_cdo`, `super_admin`

**Tabs:**
1. **AGI Overview** — Capability tiles with mode (Autonomous / Assisted) and enabled status.
2. **Intended Use & Boundaries** — Table of AGI functions, allowed actions, and prohibited scope.
3. **Human Oversight Model** — HITL gate list and role-to-approval mapping.
4. **Drift & Monitoring** — Confidence/drift trend chart and alert table.

**Flow — Reviewing AGI capabilities:**
```
Open AGI Console → Check KPI cards at top:
  AI insights generated / Autonomous actions / HITL approvals / Drift alerts
→ Click "AGI Overview" tab
→ Review each capability tile: name, mode, description, enabled/disabled
→ Disabled capabilities (greyed) can be enabled via Settings → AGI Policy
```

**Flow — Monitoring drift:**
```
Click "Drift & Monitoring" tab
→ Review confidence trend line — threshold is 90%
→ Review drift score line — higher = more deviation from baseline
→ Check Drift Alerts table for open items
→ Assign open alerts to IT/CDO for investigation
```

**HITL gate reference:**

| Gate | Who approves | Requirement |
|---|---|---|
| CAPA closure | QA Head / Super Admin | E-signature |
| Batch release decision | QA Head | E-signature + review |
| Regulatory commitment | Regulatory Affairs + QA Head | Dual approval |
| Model/prompt update | IT/CDO + Super Admin | Change order + validation |
| Access control change | IT/CDO | Logged + approved |

**Critical rule:** AGI NEVER autonomously performs: batch disposition, QP release, final QA decisions, CAPA closure, external regulator communications, or unsupervised training on production data.

---

### 3.10 Evidence & Document Workspace

**Who uses it:** `super_admin`, `qa_head`, `qc_lab_director`, `regulatory_affairs`, `csv_val_lead`

**What it shows:**
- Document grid with compliance tags, area, type, system, status.
- Search by name, ID, or tag.
- Filter by area and document type.
- Evidence Pack Builder mode for inspection preparation.

**Flow — Finding a document:**
```
Open Evidence & Docs → Type in search bar (document name, ID, tag e.g. "Part 11")
→ Apply area filter (QC Lab / QMS / CSV/IT / Training / etc.)
→ Apply type filter (Audit Trail / SOP / CAPA Record / Validation / etc.)
→ Click document card to view detail
```

**Flow — Building an Evidence Pack:**
```
Click "Evidence Pack Builder" button → Banner appears (pack mode active)
→ Click document cards to select (checkbox appears) — selected cards highlight in blue
→ Selected count shown in banner and button
→ Scroll down to "Evidence Pack Preview" table
→ Click "Generate Pack" → Pack includes: document metadata, SHA-256 hash, version, retrieval timestamp, compliance tags
```

**Document statuses:**
- **Verified** ✅ — Reviewed and approved. Ready for inspection.
- **Pending Review** ⚠ — Requires QA review before inclusion in evidence pack.

---

### 3.11 Governance & KPIs

**Who uses it:** All roles with governance access.

**Tabs:**
1. **KPIs & Scorecards** — Key metrics with targets, trend charts.
2. **RAID & Risks** — Risks, Actions, Issues, Decisions log.
3. **Reports & Exports** — Report templates for download.

**Flow — KPI review:**
```
Open Governance & KPIs → "KPIs & Scorecards" tab (default)
→ Review scorecard cards — red = below target, green = on target
→ Review CAPA on-time & training trend chart (line chart)
→ Review CSV drift & DI exceptions chart (bar chart)
→ Compare against targets shown in each card
```

**Flow — RAID log:**
```
Click "RAID & Risks" tab
→ Filter by type: Risk / Action / Issue / Decision
→ Review Open risks (badge-red) — these need mitigation action
→ Impact column: High = requires immediate management attention
→ Export full log via "Export report" button at top
```

**Flow — Report generation:**
```
Click "Reports & Exports" tab
→ Select report type (Weekly Status / Monthly Governance / Evidence Pack / etc.)
→ Click "Generate" → Report produced in specified format (PDF/XLSX/ZIP)
```

**RAID type guide:**

| Type | Meaning | When to raise |
|---|---|---|
| Risk | Something that may happen and affect readiness | When a potential issue is identified |
| Action | A task that needs to be done | When an owner is assigned to a specific task |
| Issue | Something that has already happened | When a problem is active/confirmed |
| Decision | A choice that has been made | When a significant decision affects scope or approach |

---

### 3.12 Settings & Admin

**Who uses it:** `super_admin` (full), `qa_head` and `it_cdo` (partial)

**Tabs:**

| Tab | Who | What |
|---|---|---|
| Org & Sites | super_admin | Tenant name, contact, site list, site metadata |
| Sites | super_admin | Add/edit/remove sites, GMP scope, country, risk level. Inactive sites remain listed here so they can be re-activated, but are hidden from every other dropdown, heatmap, and picker across the app. |
| Users & Roles | super_admin | Add/invite users, assign roles, set GxP signatory flag |
| Regulatory Frameworks | super_admin | Toggle which regulations apply (21 CFR 210/211, Part 11, Annex 11/15, ICH Q9/Q10, WHO GMP) |
| AGI Policy | super_admin, it_cdo | AGI mode (Autonomous / Assisted / Manual), agent-by-agent toggles, logging, retention |

**Flow — Adding a new user:**
```
Settings → Users & Roles tab
→ Click "Invite user"
→ Enter: name, email, role, site assignment
→ Tick "GxP Signatory" if user needs to perform e-signatures
→ Send invite → User receives email with login link
```

**Flow — Configuring AGI mode:**
```
Settings → AGI Policy tab
→ Toggle overall AGI mode: Autonomous / Assisted / Manual (off)
→ Per-agent toggles: enable/disable CAPA Agent, Deviation Agent, etc.
→ Set confidence threshold (default 85%)
→ Set logging detail (Standard / Verbose) and retention period
→ Save → Changes require IT/CDO acknowledgment if in production
```

**Important:** Changes to AGI policy in PROD must follow the change control process (Section 14 of SOW). Capture as a Change Order before activating.

---

## 4. Role-Specific Task Guides

### 4.1 Super Admin

**Daily tasks:**
- Check dashboard for new Critical findings or CAPA overdue alerts.
- Review AGI insights panel and act on escalations.
- Verify system and user access are current.

**Weekly tasks:**
- Review RAID log — update mitigation status on open risks.
- Check CAPA on-time rate — escalate if below 80%.
- Review drift monitoring tab in AGI Console.

**Key flows:**
- Add/remove users → Settings → Users & Roles
- Enable/disable AGI agents → Settings → AGI Policy
- Close escalated CAPAs → QMS & CAPA → CAPA Detail → Close CAPA (e-sign)
- Generate governance report → Governance & KPIs → Reports

---

### 4.2 QA Head

**Primary module:** QMS & CAPA

**Daily tasks:**
- Review overdue CAPAs — escalate or reassign.
- Check AGI CAPA Intelligence panel for pattern alerts.
- Monitor FDA 483 commitment matrix for approaching deadlines.

**Key flows:**

**Closing a CAPA:**
1. Navigate to QMS & CAPA → click "View" on target CAPA.
2. Verify all action steps are marked "Closed".
3. Review root cause and effectiveness check date.
4. Click "Close CAPA (e-sign)".
5. Enter e-signature (identity + intent + confirm).
6. Record enters audit trail as a regulated event.

**Approving evidence for inspection:**
1. Open Evidence & Docs.
2. Filter by "Pending Review" status.
3. Review documents — change status to Verified if approved.
4. Build evidence pack for inspection readiness kit.

**Management review prep:**
1. Governance & KPIs → KPIs & Scorecards.
2. Screenshot or export scorecard for management meeting.
3. RAID → filter by type "Risk" and status "Open" — present to leadership.

---

### 4.3 QC/Lab Director

**Primary modules:** Gap Assessment, QMS & CAPA, Evidence & Docs

**Key tasks:**
- Monitor F-001 (LIMS audit trail finding) — track CAPA-0042 progress.
- Review OOS/OOT related findings in Gap Assessment (filter: Area = QC Lab).
- Assemble lab-related evidence for inspection readiness.

**Key flows:**

**Reviewing lab findings:**
1. Gap Assessment → Filter: Area = "QC Lab", Severity = "Critical".
2. Click Eye on each finding → Review requirement, AGI summary, evidence ref.
3. Check Evidence Index tab → Ensure "QC Lab" node is "Complete" before inspection.

**Tracking DI-gated CAPAs:**
1. QMS & CAPA → Filter: DI Gate column shows purple "DI" badge.
2. These CAPAs require data integrity controls verification before closure.
3. View CAPA detail → confirm DI gate step in action plan is "Closed" before escalating to QA Head.

---

### 4.4 Regulatory Affairs

**Primary modules:** FDA 483 / WL, Gap Assessment, QMS & CAPA

**Key tasks:**
- Track all enforcement events and commitment deadlines.
- Coordinate response drafting for active 483 observations.
- Monitor RCA completion status for each observation.

**Key flows:**

**Managing a 483 response:**
1. FDA 483 / WL → click the FDA 483 event card to expand.
2. Review each observation: RCA status and response status.
3. For observations with "Drafting" response — coordinate with QA Head for content.
4. Track commitment matrix — flag "Overdue" items immediately.
5. Export commitment matrix → send to legal/regulatory team for agency submission.

**Linking observations to CAPAs:**
1. For each observation, note the CAPA reference (e.g., CAPA-0042).
2. Navigate to QMS & CAPA → search CAPA ID.
3. Track RCA completion and action plan progress.
4. Report status to site leadership via Governance & KPIs → Reports.

---

### 4.5 CSV/Val Lead

**Primary modules:** CSV/CSA, Inspection Readiness, Gap Assessment

**Key tasks:**
- Manage the validation roadmap — track IQ/OQ progress.
- Maintain system inventory with up-to-date Part 11 status.
- Support inspection readiness for computerized systems.

**Key flows:**

**Updating system inventory:**
1. CSV/CSA → System Inventory tab.
2. Click "Detail" on a system → review and note required updates.
3. Systems with Part 11 = "Gap" must have linked CAPAs.
4. Coordinate remediation timelines with the roadmap tab.

**Tracking validation roadmap:**
1. CSV/CSA → Roadmap tab.
2. Priority = Critical items must be completed before inspection window.
3. Update progress status in the linked CAPA (e.g., CAPA-0041 for HPLC).

**Inspection readiness for CSV:**
1. Inspection Readiness → Roadmap tab → Select "Systems" lane.
2. Action items per time bucket show required CSV actions.
3. Ensure all high-risk systems have current validation packages in Evidence & Docs.

---

### 4.6 IT/CDO

**Primary modules:** AGI Console, Settings

**Key tasks:**
- Monitor AGI model confidence and drift.
- Manage AGI policy — enable/disable agents, set confidence thresholds.
- Approve access control changes.
- Ensure change control is followed for any AGI logic changes.

**Key flows:**

**Monitoring drift:**
1. AGI Console → Drift & Monitoring tab.
2. Watch confidence trend — flag if below 90%.
3. Drift alerts table — assign and resolve open alerts within 24h.
4. Any resolved drift event requires documentation in the change log.

**Updating AGI policy:**
1. Settings → AGI Policy tab.
2. Toggle AGI mode: Autonomous / Assisted / Manual.
3. Enable/disable individual agents (CAPA Agent, Deviation Agent, etc.).
4. Adjust confidence threshold — changes below 80% require Super Admin approval.
5. Any production change must follow change control (document as Change Order).

**Managing user access:**
1. Settings → Users & Roles.
2. Review active users — deactivate any leavers immediately.
3. Review GxP Signatory assignments — only qualified users should have e-signature rights.

---

### 4.7 Operations Head

**Primary modules:** Inspection Readiness, Governance & KPIs, Dashboard

**Key tasks:**
- Monitor site operational readiness for inspection.
- Track People and Process action lanes in the readiness roadmap.
- Contribute to RAID log for operational risks.

**Key flows:**

**Reviewing site readiness:**
1. Dashboard → Review heatmap for operational areas (Manufacturing, Warehouse, Utilities).
2. High (red) areas require immediate attention.
3. Click on 90-Day Action Plan rows linked to Inspection Readiness module.

**Managing the readiness roadmap:**
1. Inspection Readiness → Roadmap tab.
2. Focus on "People" and "Process" lanes.
3. Immediate bucket (0–30d): ensure all front-room/back-room assignments confirmed.
4. 31–60d: GMP refresher training completion, DI awareness sessions.

**RAID contribution:**
1. Governance & KPIs → RAID & Risks tab.
2. Filter by Type = "Risk" — add operational risks (SME unavailability, facility constraints).
3. Assign owner and mitigation strategy.

---

### 4.8 Viewer

**Primary modules:** Dashboard, Governance & KPIs (read-only)

**What you can do:**
- View Executive Dashboard (all KPIs, heatmap, action plan — read only).
- View Governance & KPIs (scorecards, RAID log, reports — read only).
- Cannot create, edit, or sign any records.

**Key flows:**

**Monitoring compliance status:**
1. Dashboard → Review readiness score and KPI cards.
2. Area heatmap shows high-risk areas — escalate to your manager if you see new red areas.
3. AGI Insights panel (if visible) — note critical risk messages.

**Accessing reports:**
1. Governance & KPIs → Reports & Exports tab.
2. Click "Generate" on the relevant report to download.

---

## 5. Key Compliance Rules

| Rule | Details |
|---|---|
| CAPA closure requires e-signature | Only `qa_head` or `super_admin`. E-signature = identity + intent + timestamp (21 CFR Part 11). |
| No autonomous batch release | Platform never releases batches. Final disposition is always human. |
| No direct agency communication | All 483/WL responses are prepared in platform but submitted by humans outside the system. |
| AGI outputs require human review | Any AGI recommendation used in a GxP decision must be reviewed and approved by a qualified person. |
| Evidence packs include hash | All generated evidence packs contain SHA-256 hashes for integrity verification (ALCOA+). |
| AGI changes need change control | Any update to AGI model logic, prompts, or confidence thresholds must follow the change order process. |
| Audit trail is immutable | All actions (create, edit, sign, approve) are logged with user, timestamp, and data involved. Cannot be deleted. |
| DI gate CAPAs | CAPAs with "DI gate" badge require data integrity verification step before closure. |

---

## 6. Glossary

| Term | Definition |
|---|---|
| AGI | Artificial General Intelligence — Glimmora's AI compliance layer. |
| ALCOA+ | Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available. Data integrity standard. |
| Annex 11 | EU GMP Annex 11 — computerized systems validation guidance. |
| CAPA | Corrective and Preventive Action. |
| CDS | Chromatography Data System (e.g., Empower 3). |
| CMMS | Computerized Maintenance Management System. |
| CAPA | Corrective and Preventive Action. |
| CSV | Computer System Validation (traditional approach). |
| CSA | Computer Software Assurance (risk-based, FDA 2022 draft guidance). |
| DI | Data Integrity — ensuring data is ALCOA+ compliant. |
| DIL | Document Inventory List — inspector's evidence request list. |
| eDMS | Electronic Document Management System. |
| EMA | European Medicines Agency. |
| ERP | Enterprise Resource Planning system (e.g., SAP). |
| FDA 483 | Inspectional Observations issued by FDA at end of inspection. |
| GAMP 5 | Good Automated Manufacturing Practice — risk-based CSV guidance (ISPE, 2nd Ed.). |
| GMP | Good Manufacturing Practice. |
| GxP | Good x Practice (covers GMP, GLP, GCP, GDP, etc.). |
| HITL | Human-In-The-Loop — mandatory human review gate for AGI outputs affecting GxP decisions. |
| ICH Q9 | International quality risk management guideline. |
| ICH Q10 | International pharmaceutical quality system guideline. |
| IQ/OQ/PQ | Installation Qualification / Operational Qualification / Performance Qualification. |
| LIMS | Laboratory Information Management System. |
| LMS | Learning Management System. |
| MES | Manufacturing Execution System. |
| MHRA | UK Medicines and Healthcare products Regulatory Agency. |
| OOS | Out of Specification — laboratory result outside accepted limits. |
| OOT | Out of Trend — laboratory result outside expected trend. |
| Part 11 | FDA 21 CFR Part 11 — electronic records and electronic signatures regulation. |
| QMS | Quality Management System. |
| RAID | Risks, Actions, Issues, Decisions — project tracking log. |
| RBAC | Role-Based Access Control. |
| RCA | Root Cause Analysis. |
| SOP | Standard Operating Procedure. |
| URS | User Requirements Specification. |
| VMP | Validation Master Plan. |
| WL | Warning Letter — formal FDA enforcement action more serious than 483. |
