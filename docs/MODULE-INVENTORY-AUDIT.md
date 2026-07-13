# Module Inventory Audit — Pharma Glimmora

> **Type:** Planning / documentation rung. **Read-only** — no code, schema, or
> migration changes were made. This is ground-truth inventory to inform a
> product-owner + SME consolidation decision.
>
> **Date:** 2026-06-03 · **Branch:** devAI · **Method:** four parallel read-only
> recon passes (sidebar/routes, module components, server actions, schema
> models) cross-checked against the source.

---

## 1. Executive summary

- **18 user-facing surfaces** exist in code. **10** are exposed in the sidebar;
  **6** more have routes + UI but **no nav entry** (`/change-control`,
  `/ai-capa`, `/ai-tools`, `/ai-policy`, `/agi-console`, `/inspection`); **2**
  are the admin shell (`/admin`, `/admin/customer/[id]`).
- **38 Prisma models**, **29 server-action files** (~160 exported actions).
  Compliance core (CAPA, FDA-483, Deviation, CSV/CSA, Change Control,
  Gap/Findings, Evidence) is **wired end-to-end**.
- **Biggest finding:** **Change Control is fully built** (route + UI + 12
  actions + 2 models) but is **invisible** — no sidebar entry and no in-app
  navigation link. It is one line of nav config away from LIVE.
- **Genuinely absent** (referenced in product asks, zero code): **Complaint
  Handling** and **OOS / Out-of-Spec**. No model, no action, no UI for either.
- **`/inspection`** is an orphaned 3-line stub; the real inspection-readiness
  UI lives at **`/readiness`**.

---

## 2. Module Matrix

Legend — STATUS: **LIVE** (sidebar+route+UI+actions+model, wired) ·
**PARTIAL** (exists with a gap) · **SERVER-ONLY** (actions/model, no UI) ·
**UI-ONLY** (UI, no real backing) · **STUB** (placeholder) · **ORPHAN** (code
exists, nothing reaches it) · **ABSENT** (asked-for, no code).

| Module / Feature | Sidebar? | Route? | UI component? | Server actions? | Schema model? | STATUS |
|---|---|---|---|---|---|---|
| **Dashboard** | ✅ `/` | ✅ | ✅ `DashboardPage` | ➖ reads only | ➖ aggregates | **LIVE** |
| **Gap Assessment** | ✅ `/gap-assessment` | ✅ | ✅ `GapPage` | ✅ `findings.ts` | ✅ `Finding` | **LIVE** |
| **Deviation** | ✅ `/deviation` | ✅ | ✅ `DeviationPage` | ✅ `deviations.ts` (11) | ✅ `Deviation` | **LIVE** |
| **CAPA Tracker** | ✅ `/capa` | ✅ `/capa/[id]` | ✅ `CAPAPage` (29 files) | ✅ `capas/*` (~40) | ✅ `CAPA` +5 | **LIVE** |
| **CSV/CSA Validation** | ✅ `/csv-csa` | ✅ `/systems/[reference]` | ✅ `CSVPage` | ✅ `systems.ts`, `rtm.ts` | ✅ `GxPSystem` +4 | **LIVE** |
| **FDA 483 & Regulatory** | ✅ `/fda-483` | ✅ | ✅ `FDA483Page` (17 files) | ✅ `fda483.ts` (21) | ✅ `FDA483Event` +4 | **LIVE** |
| **Evidence & Documents** | ✅ `/evidence` | ✅ | ✅ `EvidencePage` | ✅ `evidence.ts`, `documents.ts` | ✅ `Document`, `EvidenceItem` +2 | **LIVE** |
| **Readiness** (sidebar: "Training & Awareness") | ✅ `/readiness` | ✅ | ✅ `ReadinessPage` | ✅ `inspections.ts` (9) | ✅ `Inspection`, `TrainingRecord`, `Playbook` +3 | **PARTIAL** |
| **Governance & KPIs** (incl. RAID) | ✅ `/governance` | ✅ | ✅ `GovernancePage` | ✅ `raid.ts` (5) | ✅ `RAIDItem` | **PARTIAL** |
| **Audit Trail** | ✅ `/audit-trail` (role-gated) | ✅ | ✅ `AuditTrailPage` | ✅ `auditLogs.ts` + all writers | ✅ `AuditLog` | **LIVE** |
| **Settings** | ✅ `/settings` | ✅ | ✅ `SettingsPage` (8 files) | ✅ `settings.ts` | ✅ `Site`, `User`, `Tenant` | **LIVE** |
| **Admin (Customer Accounts)** | ✅ admin shell | ✅ `/admin`, `/admin/customer/[id]` | ✅ `CustomerAccountsPage` | ✅ `tenants.ts` (6) | ✅ `Tenant`, `Subscription` | **LIVE** |
| **Change Control** | ❌ | ✅ `/change-control` | ✅ `ChangeControlListPage` (13 files) | ✅ `change-control.ts` (12) | ✅ `ChangeControl`, `CAPAChangeControlLink` | **PARTIAL** |
| **AI CAPAs** | ❌ | ✅ `/ai-capa`, `/ai-capa/[capaId]` | ✅ `AiCapaIndex` | ➖ AI-backend proxy | ➖ reads `CAPA` + backend | **PARTIAL** |
| **AI Tools** | ❌ | ✅ `/ai-tools` | ✅ `AiToolsPage` | ➖ AI-backend proxy | ❌ none | **PARTIAL** |
| **AGI Console** | ❌ | ✅ `/agi-console` | ✅ `AGIPage` | ✅ `agiConsole.ts` (2) | ➖ `AuditLog` only | **PARTIAL** |
| **AI Policy** | ❌ | ✅ `/ai-policy` | ✅ `AIPolicyPage` (also a Settings tab) | ✅ `toggleAGIAgent` | ➖ `AuditLog` only | **PARTIAL** |
| **Inspection (playbook)** | ❌ | ✅ `/inspection` | 🔴 3-line stub | ➖ (readiness actions, unused here) | ➖ `Inspection` (used by /readiness) | **ORPHAN / STUB** |
| **Complaint Handling** | ❌ | ❌ | ❌ | ❌ | ❌ | **ABSENT** |
| **OOS / Out-of-Spec** | ❌ | ❌ | ❌ | ❌ | ❌ | **ABSENT** |

### "What's missing" notes (every non-LIVE row)

- **Readiness → PARTIAL:** training *tracking* is live (`TrainingRecord`,
  `createTrainingRecord`/`completeTrainingRecord`, `TrainingPrismaTab`), but
  there is **no SOP-version control** (no `SopVersion` model/action). The
  sidebar calls it "Training & Awareness" while the module is readiness-shaped;
  the "Training" promise is only partially met.
- **Governance & KPIs → PARTIAL:** RAID is fully wired (`RAIDItem` + 5 actions).
  The **KPI Scorecard** and **Reports** tabs are largely computed/presentational
  with no dedicated persistence — verify before treating KPIs as a record of
  truth.
- **Change Control → PARTIAL:** end-to-end built but **not discoverable** — no
  sidebar entry, no in-app `<Link>`/`router.push` to `/change-control`
  anywhere (only an `actions` import in CAPA's
  `LinkedChangeControlsSection.tsx:16`). Reachable by typing the URL only. One
  nav-config line from LIVE.
- **AI CAPAs → PARTIAL:** separate surface from CAPA Tracker; data comes from
  the FastAPI AI backend via the proxy, not local Prisma actions. No sidebar
  entry; no local model of its own.
- **AI Tools → PARTIAL:** raw AI-backend endpoint console (RCA status, action
  plan, monitoring, etc.). No local model; no sidebar entry. Effectively a
  developer/diagnostic surface.
- **AGI Console → PARTIAL:** monitoring tabs (overview, drift, intended-use,
  oversight) backed only by `AuditLog`; no first-class AGI model. Not in nav.
- **AI Policy → PARTIAL:** duplicated surface — same content as the Settings
  `AGIPolicyTab`; also routed standalone at `/ai-policy`. Not in nav.
- **Inspection → ORPHAN/STUB:** `InspectionPage.tsx` returns
  `<div>InspectionPage</div>`. Route `/inspection` exists but is not linked
  anywhere. The real inspection UX is `/readiness`. Candidate for deletion or
  build-out.
- **Complaint Handling → ABSENT:** zero matches in schema, actions, or UI.
- **OOS / Out-of-Spec → ABSENT:** zero matches. `Deviation.category` is a free
  `String` (schema:406) with no OOS enum/concept; OOS is not modeled.

---

## 3. Targeted existence check (Phase 3)

| Feature | Schema | Action | UI | Nav | Verdict |
|---|---|---|---|---|---|
| **Change Control** | 🟢 `ChangeControl` (schema:1321), `CAPAChangeControlLink` (1385) | 🟢 `change-control.ts` — `createChangeControl` (327), `transitionChangeControlStatus` (549), `linkCAPAToChangeControl` (934) +9 | 🟢 `ChangeControlListPage` + 13 files | 🔴 none | **PARTIAL — built but unlinked** |
| **Complaint Handling** | 🔴 absent | 🔴 absent | 🔴 absent | 🔴 absent | **ABSENT — docs only** |
| **Training / SOP version** | 🟢 `TrainingRecord` (schema:1032), `Playbook` (1016) · 🔴 no `SopVersion` | 🟢 `createTrainingRecord` (inspections.ts:234), `completeTrainingRecord` (292) · 🔴 no SOP-version action | 🟢 `TrainingPrismaTab` under `/readiness` | 🟡 via "Training & Awareness" → `/readiness` | **PARTIAL — training LIVE, SOP-versioning absent** |
| **OOS / Out-of-Spec** | 🔴 absent | 🔴 absent | 🔴 absent | 🔴 absent | **ABSENT — not its own module, not a Deviation subtype** |

**Detail:**

- **changeControl** — touched in prior rungs (3A-bis, 3G-2, 3E.2) at the action
  layer; the UI was already there. True status: **everything exists except
  discoverability.** Not SERVER-ONLY (it has a full UI); it is PARTIAL purely
  because nothing in the nav reaches it.
- **complaintHandling** — only ever appears in product/AI-agent docs. No code
  artifact of any kind. The nearest existing analog is **Deviation**
  (unplanned-variance workflow), but it is not complaint handling.
- **training / sopVersion** — training-completion tracking is genuinely live
  inside `/readiness`. What's missing for "AI agent #11" is **SOP version
  control** — there is no `SopVersion` model or versioning action; `Playbook`
  is the closest (reusable procedure text) but carries no version ledger.
- **oosManagement** — neither a standalone module nor a folded-in Deviation
  flavor. `Deviation.category` is an unconstrained string, so an OOS could be
  *typed in* but nothing enforces, routes, or reports it. Treat as absent.

---

## 4. Duplication / overlap (Phase 4 — factual, SME decides)

- **"AI CAPAs" (`/ai-capa`) vs CAPA Tracker (`/capa`)** — **two separate
  surfaces.** `/capa` is the Prisma-backed lifecycle tracker (29 files, ~40
  actions, `CAPA` model). `/ai-capa` (`AiCapaIndex`/`AiCapaPage`) reads from the
  **FastAPI AI backend via the proxy** and renders AI-scored CAPAs; it has no
  local model and isn't in the sidebar. Overlap is conceptual (both about
  CAPAs), not structural. SME decision: surface `/ai-capa` as a tab inside
  `/capa`, or keep as a distinct AI view.
- **"Inspection Readiness" vs Dashboard** — separate. `/readiness`
  (`ReadinessPage`, ~2,135 lines: playbooks + training + roadmap) is the real
  module; the Dashboard only renders a **readiness score** summary. They share
  the score concept, not components. (Note the unrelated orphan `/inspection`
  stub — different thing.)
- **"Evidence & Documents" (`/evidence`)** — contains three tabs:
  `DocumentLibraryTab` (inventory), `DILStatusTab` (document-integrity/
  lifecycle status), `PackBuilderTab` (assemble submission packs). Backed by the
  `Document` model + `documents.ts`/`evidence.ts`. Overlaps with **CAPA evidence**
  (`EvidenceItem`/`EvidenceFile` live under CAPA) — i.e. "evidence" exists in two
  places: CAPA-scoped collection vs the standalone document library. Worth a SME
  call on whether these should converge.
- **RAID placement** — RAID lives as the `RAIDTab` under **Governance & KPIs**
  (`/governance`), backed by `RAIDItem` + `raid.ts`. It is **not** under Core
  Compliance and is **not** a standalone module. If the product expects RAID as
  a first-class Core-Compliance surface, that's a move, not a build.

---

## 5. Missing-module estimates (Phase 5)

Estimates are rough, honest, and caveated — they assume the existing
module patterns (Deviation/Finding as templates) are reused.

| Gap | Needs | Estimate | Notes |
|---|---|---|---|
| **Change Control → LIVE** | Nav only: 1 sidebar entry (+ optional CAPA→CC link) | **S — <1 hr** | UI/actions/model already complete. Pure discoverability wiring. Lowest-effort, highest-visibility win. |
| **Training (standalone) + SOP versioning** | New `SopVersion` model (migration) + version actions + a versioning UI; promote training out of `/readiness` if desired | **M — 2–3 days** | Training *tracking* already live. The real work is SOP **version control** (model + immutable version ledger + UI). Needed for AI agent #11. |
| **Complaint Handling** | New `Complaint` (+ investigation) model (migration), full CRUD + investigation + CAPA-link actions, new module UI (list/detail/modals), sidebar entry | **L — 3–5 days** | Greenfield. Closely mirrors the Deviation module (1 model, 11 actions, ~1,500 lines UI). Can be scaffolded from Deviation. |
| **OOS / Out-of-Spec** | New `OOS` model (migration) with Phase-I/II lab-investigation workflow, actions, UI, sidebar entry | **L — 3–5 days** (or **M** if scoped as a Deviation subtype) | True OOS (lab investigation → assignable cause → batch disposition) is its own workflow → L. If the SME accepts OOS as a *Deviation category filter* (no migration, UI-only), it drops to **M / ~1 day** but loses OOS-specific lifecycle. |

**Caveats:** estimates exclude e-signature/Part-11 wiring polish, seed data,
Playwright coverage, and review cycles — add ~30–50% for production-grade. The
Change Control number is the only near-certain one; the greenfield modules can
swing with SME scope decisions (especially OOS).

---

## 6. Honest reflection

- **Most surprising:** **Change Control is a finished module hiding from its own
  users.** 13 UI files, 12 actions, 2 models, Part-11 signed transitions — and
  not a single nav entry or link points at it. Anyone judging by the sidebar
  would conclude it doesn't exist. This is the single highest-leverage,
  lowest-risk item in the whole audit.
- **Thinner than expected:** the **AI cluster** (`/ai-tools`, `/ai-capa`,
  `/ai-policy`, `/agi-console`) is four separate unlinked routes, two of which
  (`/ai-policy` vs Settings `AGIPolicyTab`) appear to **duplicate the same
  content**, and three of which lack any first-class model (they lean on
  `AuditLog` or the external backend). Feels like accreted experiments rather
  than one coherent AI surface.
- **A model with arguably no home:** `ReadinessCard` (schema:997) exists but
  didn't surface as a clearly-used UI in recon — flagged for a closer look; it
  may be partially orphaned.
- **Evidence is bifurcated:** "evidence" means two different stores — the
  standalone `/evidence` document library and CAPA-scoped
  `EvidenceItem`/`EvidenceFile`. Not a bug, but a consolidation candidate.
- **Judgment calls I made (flagging for SME override):**
  - Classed **Change Control as PARTIAL, not LIVE** — every layer is built, but
    "LIVE" in this rubric requires a sidebar entry, and it has none.
  - Classed the **AI surfaces as PARTIAL, not UI-ONLY** — they do real work
    against the AI backend, so "UI-ONLY/mock" felt wrong even though they lack
    local models.
  - Classed **Readiness/Governance as PARTIAL** on the strength of the
    SOP-versioning gap and the presentational KPI/Reports tabs respectively;
    a stricter reviewer could call both LIVE since their primary records
    (training, RAID) are fully wired.
  - **OOS estimate** deliberately given as a range because "is OOS its own
    workflow or a Deviation flavor?" is a product decision, not a code fact.

---

*Generated read-only. No code, schema, or migration changes; nothing committed.*
