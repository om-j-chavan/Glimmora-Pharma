# SOW Gap Analysis — What's Built, What's Missing, What's Unclear

> Audit date: 27 Mar 2026
> Compared: CLAUDE.md spec + USER-MANUAL.md flows vs actual codebase at commit `81ddeab`

---

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Complete — functional and matches spec |
| ⚠️ | Partial — exists but missing features |
| ❌ | Missing — not built or placeholder only |
| 🔴 | Broken — exists but will not render on production |

---

## 1. Critical Production Issues

These are bugs that are live on the deployed Vercel site right now.

| # | Issue | File | Detail |
|---|---|---|---|
| 1 | **Dashboard is a blank placeholder** | `src/modules/dashboard/DashboardPage.tsx` | 5-line file: `export default function DashboardPage()` — renders just the text "DashboardPage". Router expects named export `{ DashboardPage }`, but the file uses `export default`, so the page renders **nothing** (undefined Component). |
| 2 | **Inspection Readiness is a blank placeholder** | `src/modules/inspection/InspectionPage.tsx` | Same issue — 5-line placeholder with `export default`. Router expects `{ InspectionPage }`. Page is broken. |
| 3 | **Governance & KPIs is a blank placeholder** | `src/modules/governance/GovernancePage.tsx` | Same issue — 7-line placeholder with `export default`. Router expects `{ GovernancePage }`. Page is broken. |
| 4 | **Persistence layer removed but file still exists** | `src/store/persistence.ts` | The file exports `loadPersistedState` and `persistMiddleware`, but `store/index.ts` no longer imports them. Dead code — should be removed or reconnected. |

---

## 2. Module-by-Module Status

### 2.1 Authentication & Site Selection ✅

| Feature | Status | Notes |
|---|---|---|
| Login form (email/password) | ✅ | Mock accounts with all 8 roles |
| SSO button | ⚠️ | Button exists but no actual SSO integration |
| Site picker | ✅ | Filters active sites, risk-based styling |
| Auth loader (route guards) | ✅ | `authLoader`, `siteLoader`, `makeRoleLoader` |
| Role-based route protection | ✅ | `makeRoleLoader` checks `allowedPaths` |

### 2.2 Executive Dashboard 🔴

| Feature | Status | Notes |
|---|---|---|
| Readiness Score (0-100) | ❌ | Placeholder — was fully built in prior commit but replaced by remote merge |
| KPI stat cards (5 cards) | ❌ | Same — lost in merge |
| Area vs Readiness heatmap | ❌ | Same |
| Observation volume & severity chart | ❌ | Same |
| AGI Insights panel | ❌ | Same |
| 90-day action plan table | ❌ | Same |
| Filters (timeframe, site, severity) | ❌ | Same |
| Export action plan | ❌ | Same |

**Action required:** Restore the full DashboardPage.tsx from commit `f8660f6` or earlier, and change `export default` to `export function DashboardPage`.

### 2.3 Settings ✅

| Feature | Status | Notes |
|---|---|---|
| Org & Sites tab | ✅ | companyName, timezone, dateFormat, regulatoryRegion |
| Sites tab | ✅ | CRUD, GMP scope, risk level |
| Users & Roles tab | ✅ | 8 roles, GxP signatory toggle |
| Frameworks tab | ✅ | 9 regulation toggles |
| AGI Policy tab | ✅ | Mode (autonomous/assisted/manual), confidence slider, 7 agent toggles |

### 2.4 Gap Assessment ✅

| Feature | Status | Notes |
|---|---|---|
| Findings register (table) | ✅ | CRUD, filtering, severity badges |
| Finding detail modal | ✅ | Requirement, AGI summary, evidence ref |
| Link finding to CAPA | ✅ | `closeFinding` / `linkCapa` actions |
| Evidence Index tab | ⚠️ | Not clear if fully wired — need to verify area/completeness status is live |
| Audit logging on mutations | ✅ | `auditLog()` calls present |

### 2.5 QMS & CAPA ✅

| Feature | Status | Notes |
|---|---|---|
| QMS Blueprint tab | ✅ | Deviation, Change Control, Complaint processes |
| CAPA Tracker tab | ✅ | Full CRUD, risk/status badges, owner assignment |
| CAPA Metrics tab | ✅ | Charts and stats |
| RCA methods (5-Why, Fishbone, etc.) | ✅ | Selectable RCA method per CAPA |
| DI gate indicator | ✅ | Badge on CAPAs |
| CAPA closure (e-sign) | ⚠️ | `closeCAPA` action exists, but **no dedicated e-signature modal** — see §3.1 |
| Effectiveness check scheduling | ⚠️ | Date field exists but no reminder/trigger system |
| Audit logging | ✅ | `auditLog()` calls present |

### 2.6 CAPA Detail Page ✅

| Feature | Status | Notes |
|---|---|---|
| Detail view with all fields | ✅ | Redirects to /capa with `openCapaId` state |
| Action plan steps | ✅ | Numbered steps with owner, due date, status |
| Activity history / timeline | ⚠️ | Not verified — may be mock data only |

### 2.7 CSV/CSA ✅

| Feature | Status | Notes |
|---|---|---|
| System Inventory table | ✅ | Full CRUD, GAMP5 category, risk, validation status |
| Part 11 / Annex 11 compliance columns | ✅ | Status badges |
| CSV/CSA Roadmap tab | ✅ | Validation activities with timelines |
| Risk heatmap | ✅ | Color-coded risk display |
| Audit logging | ✅ | Present |

### 2.8 Inspection Readiness 🔴

| Feature | Status | Notes |
|---|---|---|
| Readiness Roadmap (swimlanes) | ❌ | Placeholder file — no content |
| Inspection Playbooks (4 types) | ❌ | Not built |
| Training & Simulations matrix | ❌ | Not built |
| Mock inspection launcher | ❌ | Not built |

**Action required:** Build the full InspectionPage with 3 tabs as specified in USER-MANUAL §3.7.

### 2.9 FDA 483 / Warning Letters ✅

| Feature | Status | Notes |
|---|---|---|
| Event creation (483, EMA/MHRA) | ✅ | Full CRUD |
| Observation entry per event | ✅ | Severity, area, linked CAPA |
| Commitment matrix | ✅ | Owner, due date, status tracking |
| RCA workspace | ⚠️ | Templates referenced but not clear if interactive (5-Why, Fishbone, Fault Tree) |
| AGI draft suggestions | ✅ | `setAGIDraft` action exists |
| Export commitment matrix | ⚠️ | Button exists but no actual PDF/XLSX generation |

### 2.10 AGI Console ✅

| Feature | Status | Notes |
|---|---|---|
| AGI Overview (capability tiles) | ✅ | 14 capabilities with mode and enabled status |
| Intended Use & Boundaries tab | ✅ | 6 use cases with allowed/prohibited scope |
| Human Oversight Model (HITL gates) | ⚠️ | Listed but no interactive gate management |
| Drift & Monitoring tab | ✅ | Confidence/drift trend chart and alert table |
| KPI cards (insights, actions, approvals, alerts) | ✅ | Present |

### 2.11 Evidence & Document Workspace ✅

| Feature | Status | Notes |
|---|---|---|
| Document registry | ✅ | CRUD, compliance tags, area, type, status |
| Search & filter (area, type) | ✅ | Present |
| Evidence Pack Builder | ✅ | Selection mode, pack preview, generate |
| SHA-256 hash on packs | ⚠️ | Structure exists but actual hashing not verified |

### 2.12 Governance & KPIs 🔴

| Feature | Status | Notes |
|---|---|---|
| KPI Scorecards tab | ❌ | Placeholder file — no content |
| CAPA on-time / training trend charts | ❌ | Not built |
| CSV drift / DI exceptions chart | ❌ | Not built |
| RAID & Risks tab | ❌ | Not built |
| Reports & Exports tab | ❌ | Not built |

**Action required:** Build the full GovernancePage with 3 tabs as specified in USER-MANUAL §3.11.

---

## 3. Cross-Cutting Features Missing

### 3.1 E-Signature Component ❌

**Required by:** CAPA closure, document approval, 483 response submission, batch release (future)

**What spec says (CLAUDE.md):**
> E-signatures — on CAPA close, doc approve, 483 submit. Must capture `signerId`, `meaning`, `contentHash`. Timestamp from server.

**What exists:** `closeCAPA` action in Redux sets status to "Closed", but there is no dedicated e-signature modal that captures:
- Signer identity (username + confirmation)
- Meaning of signature (text field)
- Content hash (SHA-256 of the record being signed)
- Server-side timestamp

**This is a compliance requirement (21 CFR Part 11) — not optional.**

### 3.2 Notification Panel ❌

**What exists:** Bell icon in Topbar (visual only — no dropdown, no notification list, no badge count)

**What's needed:**
- Dropdown panel showing recent alerts
- AGI-triggered notifications
- CAPA overdue reminders
- Read/unread state
- Notification count badge on bell

### 3.3 Global Search ❌

**What exists:** Search input in Topbar with "Ctrl K" label (visual only — no functionality)

**What's needed:**
- Search across all modules (findings, CAPAs, systems, documents, etc.)
- Keyboard shortcut (Ctrl+K to focus)
- Results dropdown with module-tagged results

### 3.4 PDF/Report Export ❌

**What spec says (CLAUDE.md):**
> All PDF exports — `settings.org.companyName` + `settings.org.timezone`

**What exists:** Export/Download buttons in several modules (visual only — no actual PDF/XLSX generation)

**What's needed:**
- PDF generation for: evidence packs, commitment matrices, governance reports, action plans
- Company name + timezone in headers
- Proper file download

### 3.5 Skip Link (Accessibility) ❌

**What spec says (CLAUDE.md):**
> `<a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>` — must be first in DOM

**What exists:** Not present in AppShell or main.tsx.

### 3.6 Audit Trail Viewer ❌

**What exists:** `auditLog()` function posts to `/audit` API endpoint (client-side). No UI to view audit trail.

**What's needed:**
- Searchable/filterable audit trail viewer (per SOW-OPEN-QUESTIONS #34)
- View all actions by user, module, record, or date range
- Immutable display — no edit/delete UI

### 3.7 Real-Time Data / API Integration ❌

**Current state:** The entire app uses mock data and Redux state. There is no actual backend API.

- All CRUD operations are local Redux state only
- No data persists across sessions (persistence layer was removed due to build issues)
- `auditLog()` posts to a non-existent `/audit` endpoint
- All charts use hardcoded mock data

**This is expected for Phase 1 frontend-only delivery, but should be explicitly documented as out-of-scope or in-scope.**

---

## 4. UI/UX Components Missing

| Component | Status | Notes |
|---|---|---|
| Breadcrumbs | ❌ | No breadcrumb navigation between pages |
| Pagination | ❌ | Tables show all rows — no pagination for large datasets |
| Empty states | ⚠️ | Some modules have them, others don't |
| Loading skeletons | ❌ | No loading states (will need when API is connected) |
| Error boundaries | ❌ | No React error boundaries for graceful failure |
| Toast/snackbar | ⚠️ | Popup component exists but no global toast system |
| Confirmation dialogs | ⚠️ | Modal exists but destructive actions (delete) may not all prompt |
| Responsive / mobile | ❌ | Sidebar is fixed-width, no mobile hamburger menu |

---

## 5. Questions for Stakeholders

### Architecture & Scope

| # | Question | Context |
|---|---|---|
| 1 | **Is Phase 1 frontend-only (mock data) or does it include API integration?** | All data is local Redux state. No persistence across browser sessions. Need to know if connecting to a real API is in scope. |
| 2 | **Should the persistence layer (localStorage) be restored?** | It was removed due to TypeScript build errors on Vercel. Without it, all data resets on page refresh. Is this acceptable for demo/Phase 1? |
| 3 | **The merge from remote (`87e45cc`) replaced 3 fully-built pages (Dashboard, Inspection, Governance) with empty placeholders. Was this intentional?** | These pages had full UI (heatmaps, charts, tables) and are now broken on production. Need to confirm which version to use. |

### Compliance & Regulatory

| # | Question | Context |
|---|---|---|
| 4 | **Is the e-signature modal a Phase 1 deliverable?** | Part 11 compliance requires signer identity + meaning + content hash + server timestamp. Currently CAPA closure is just a button click with no signature capture. |
| 5 | **Should audit trail entries be stored locally (for demo) or does a backend audit API need to exist?** | `auditLog()` currently posts to a non-existent API. For compliance demos, do we need a mock audit viewer? |
| 6 | **Is the Evidence Pack SHA-256 hash calculated client-side or server-side?** | Currently the evidence pack structure exists but no actual hashing logic is implemented. |

### Feature Scope

| # | Question | Context |
|---|---|---|
| 7 | **Is the Batch Review & Release module in scope for Phase 1?** | Referenced in SOW-OPEN-QUESTIONS (#31-33) but no module, route, or slice exists for it. |
| 8 | **Are notifications (in-app, email, Slack) in scope for Phase 1?** | Bell icon exists but has no functionality. SOW-OPEN-QUESTIONS #39-41 ask about delivery channels. |
| 9 | **Is global search in scope for Phase 1?** | Search bar with Ctrl+K exists in the topbar but has zero functionality. |
| 10 | **Are PDF/report exports in scope for Phase 1?** | Multiple "Export" and "Download" buttons exist but none generate actual files. |
| 11 | **Is mobile/responsive design in scope?** | Current layout is desktop-only with fixed sidebar. |

### Data & Integration

| # | Question | Context |
|---|---|---|
| 12 | **What is the data source for the Readiness Score (0-100)?** | Dashboard shows this as the hero metric but there's no formula or calculation logic — just a hardcoded "82%". |
| 13 | **Are the mock data sets in each module approved/representative, or do they need to match specific demo scenarios?** | Each module has its own hardcoded mock data. Need to know if stakeholders want specific scenarios. |
| 14 | **Does the AGI Console need to actually call an LLM, or is it purely UI for Phase 1?** | Currently shows static capability tiles and mock drift data. SOW-OPEN-QUESTIONS #25-26 are unanswered about LLM provider. |

### Design & UX

| # | Question | Context |
|---|---|---|
| 15 | **Should the sidebar be responsive (collapse to icons or hamburger on mobile)?** | Currently fixed 240px width, no mobile support. |
| 16 | **Is dark mode the primary/default, or should light mode be default?** | Currently defaults to dark. Some pharma orgs may prefer light for readability in GMP environments. |

---

## 6. Summary — Priority Actions

### P0 — Broken on Production (fix immediately)
1. Restore `DashboardPage.tsx` from pre-merge commit — change to named export
2. Restore `InspectionPage.tsx` from pre-merge commit — change to named export
3. Restore `GovernancePage.tsx` from pre-merge commit — change to named export

### P1 — Core Missing Features (build next)
4. E-Signature modal component (Part 11 compliance)
5. Reconnect persistence layer (data lost on refresh)
6. Audit trail viewer (at minimum, a read-only log page)

### P2 — Feature Gaps (build when scope confirmed)
7. Notification panel (bell icon dropdown)
8. Global search (Ctrl+K)
9. PDF/report export (evidence packs, commitment matrices)
10. Skip link for accessibility

### P3 — Polish & Robustness
11. Error boundaries
12. Loading skeletons
13. Pagination for large tables
14. Mobile responsive layout
15. Empty states for all modules

---

*See also: [SOW-OPEN-QUESTIONS.md](./SOW-OPEN-QUESTIONS.md) for 43 previously raised questions.*
