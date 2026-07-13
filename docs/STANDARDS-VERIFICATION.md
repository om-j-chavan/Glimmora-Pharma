# Standards Verification — Code vs "Shared Standards" (Phase 1)

Date: 2026-06-04 · Branch: feat/plan-model · **Read-only audit — no code changed.**

> **Provenance:** The named document **"Pharma Glimmora — Shared Standards" is not present in this repository.** A full search of `*.md`/`*.docx`/`*.pdf` and grep of its distinctive tokens (`capa_owner`, `training_coord`, `auditor` as a role, `MFA_ENROLED`, "Grace Period") found nothing in code or `docs/`. This report verifies the code against the spec **as transcribed in the audit request**. Where the request states an exact value it is treated as authoritative; where it only names a concept, the code's behaviour is reported and the count flagged. If the real document exists, point to it and this will be re-diffed.

Disposition legend: **FIX-CODE** (code is wrong) · **FIX-DOC** (code is a deliberate decision; doc should catch up) · **DECIDE** (needs a product call) · **MATCH** (aligned) · **BLOCKED** (can't act without the doc).

---

## Section results

### 1. Roles — DRIFT → **FIX-CODE**
Code role picker has **9**: super_admin, customer_admin, qa_head, qc_lab_director, regulatory_affairs, csv_val_lead, **it_cdo**, **operations_head**, viewer ([UsersTab.tsx:43-51](../src/modules/settings/tabs/UsersTab.tsx#L43)). Doc wants 10.
- EXTRA: `it_cdo`, `operations_head` (doc says NOT roles).
- MISSING: `capa_owner`, `training_coord`, `auditor`.
- MATCH: the other 7. Roles are free `String` (no enum); `COMPLIANCE_AUTHOR_ROLES` at [auth.ts:100](../src/lib/auth.ts#L100).

### 2. Lifecycle states — MATCH, one EXTRA
CAPA / Deviation / Change Control / Validation / FDA-483 / Tenant state sets all MATCH (Tenant = Active/Suspended only). **EXTRA:** `reopenCAPA`/`reopenCommitment`/`reopenRAIDItem` + `*_REOPENED` audit events exist in Phase-1 code — **DECIDE** whether "Reopened" is Phase-2 in the doc (lean FIX-DOC).

### 3. Plan tiers — **MATCH** ✅
ESSENTIALS 10/2/1, PROFESSIONAL 30/5/3, ENTERPRISE 100/10/7, TAILORED ceilings 1000/50/10, display-name fallback "TAILORED" — [plans.ts:24-31](../src/lib/plans.ts#L24).

### 4. Audit categories — DRIFT
**180 distinct `action` strings** vs doc's 22. No "category" field exists — only action verbs. **MFA event = `MFA_ENABLED`/`MFA_DISABLED`** ([tenants.ts:192](../src/actions/tenants.ts#L192)), doc wants `MFA_ENROLED`. Phase-2-leak candidates: `SUBSCRIPTION_BLOCKED`, `SUBSCRIPTION_INACTIVE`, `AGI_*`, `SYSTEM_STATUS_AUTO_*`.
- 180-vs-22 → **FIX-DOC** (map actions to categories; don't flatten the code).
- `SUBSCRIPTION_*` strings → **FIX-CODE** (rename to Plan terminology).
- `MFA_ENABLED` spelling → **FIX-DOC** (changing emitted strings breaks historical audit queries).

### 5. Severity — DRIFT
- General scale is **4-point** (Critical/High/Medium/Low) [severity.ts:37](../src/lib/severity.ts#L37); doc says 5-point → **DECIDE**.
- **CAPA risk is a string enum, not S×P×D 1–125** ([lifecycle.ts:39](../src/actions/capas/lifecycle.ts#L39)) → **DECIDE** (feature build, not a patch).
- No complaint module; a 3-point **FDA** scale (Critical/Major/Minor) exists instead → **MISSING/DECIDE**.

### 6. Source types — PARTIAL
CAPA source = Gap Assessment, Deviation, FDA 483, Internal Audit, External Audit, Customer Complaint ([lifecycle.ts:29-36](../src/actions/capas/lifecycle.ts#L29)). Deviation `type` planned/unplanned + `category` (8). No Complaint record. **BLOCKED** on doc's exact trigger lists to confirm MATCH.

### 7. Frameworks — DRIFT → **BLOCKED/FIX-CODE**
**9** present (p210, p11, annex11, annex15, ichq9, ichq10, gamp5, who, mhra) [settings.slice.ts:8-16](../src/store/settings.slice.ts#L8). Doc wants 12 — **which 3 are missing is unknowable without the doc.**

### 8. Signatures — DRIFT
Signing enforces: reason (`signatureMeaning`) ✓, version-binding (`computeContentHash`) ✓, audit-logged (`*_SIGNED`) ✓, identity via **password re-auth** ✓ — but **no MFA re-challenge at signing** → **DECIDE** (is MFA-at-signing required, or is password re-auth acceptable Part-11 practice?). 9 distinct canonicalizers vs doc's "5 types" → **DECIDE/FIX-DOC**. [signing.ts](../src/lib/signing.ts)

### 9. Evidence — PARTIAL MATCH
`EvidenceFile` soft-deleted (Part 11) + `EvidenceNoteVersion` history = immutability/versioning ✓. Attachment-type count vs doc's 8 needs the `EvidenceCategory` enum cross-check — **verify**.

### 10. Naming / IDs — MOSTLY MATCH, one DRIFT
`{PREFIX}-{site?}-{year}-{seq3}`; CAPA/DEV/FND site-scoped, CC `CC-{year}-{seq3}` global, 483 ✓ ([reference.ts:47,74-83](../src/lib/reference.ts#L47)). **Validation refs = `SYS-{site}-{NNNN}`, doc says `VAL`** ([systems.ts:264](../src/actions/systems.ts#L264)) → **FIX-DOC** (refs immutable once issued). CMP/SOP absent.

### 11. Time / date — MATCH
ISO 8601 UTC storage; `DD MMM YYYY` display (22 sites); `dayjs.utc` logic; **T+90** effectiveness binding ([signing.ts:180](../src/lib/signing.ts#L180)). T-30/T-7/T-0 reminder constants not located → **verify**.

### 12. Privacy / scope — DRIFT → **FIX-CODE (critical)**
Cross-tenant isolation MATCH (12/14 query files filter `tenantId`). **super_admin bright-line VIOLATED:** `getTenants`/`getTenant` `include: { users: true, sites: true }` ([queries/tenants.ts:10-11,23-24](../src/lib/queries/tenants.ts#L10)) and `CustomerDetailPage.tsx` renders full user + site rosters — super_admin sees record contents, not metadata only.

### 13. Server-side enforcement — MIXED
| Control | Status | Disposition |
|---|---|---|
| super_admin cannot author | MATCH — `requireGxPAuthor` **138 sites/19 files**, `resolveUserFk` **172**, `auditLog.create` **181**, total actions **154** (coverage exceeds the claimed "111/178") | — |
| SoD (self-approval, RCA self-review, verifier≠approver, stage self-approval, deviation decider≠reporter≠investigator) | **MATCH (strong)** — approvals.ts:154, rca-review.ts:139, verification.ts:186, systems.ts:411/447 | — |
| **No hard deletes** | **DRIFT** — 15 hard `prisma.X.delete` (see below) | **FIX-CODE** |
| No edits to closed | MATCH — RCA lock + evidence-lock.ts | — |
| Append-only audit | MATCH — zero `auditLog.update/delete` | — |
| 7-yr retention | PARTIAL — `retainUntil=+7y` on EvidenceFile/StageDocument; promise only, no purge; audit log unbounded | DECIDE |
| Caps + expiry → Suspended | DRIFT — expiry gates login ✓ but **cap enforcement is UI-only** (no server count in createUser/createSite) | FIX-CODE (already flagged "next prompt") |

**15 hard-delete sites:** CAPA [lifecycle.ts:853](../src/actions/capas/lifecycle.ts#L853), Deviation [deviations.ts:960](../src/actions/deviations.ts#L960), Finding [findings.ts:321](../src/actions/findings.ts#L321), FDA483 Event/Obs/Commitment/Doc [fda483.ts:435/1023/1130/1422](../src/actions/fda483.ts#L435), Document [documents.ts:243](../src/actions/documents.ts#L243), Criteria [effectiveness-criteria.ts:260](../src/actions/effectiveness-criteria.ts#L260), Playbook [inspections.ts:573](../src/actions/inspections.ts#L573), RAID [raid.ts:215](../src/actions/raid.ts#L215), Site [settings.ts:153](../src/actions/settings.ts#L153), User [settings.ts:293](../src/actions/settings.ts#L293), Tenant [tenants.ts:227](../src/actions/tenants.ts#L227), CC-link [change-control.ts:1114](../src/actions/change-control.ts#L1114). Soft-delete already used by Comment / ChangeControl / System / StageDocument / EvidenceFile.

---

## Drift watchlist
- **Creator term not unified** — `createdBy` string on records; "Reporter" in Deviation UI, "Author" in GxP guards. (DECIDE canonical term.)
- **Site vs Location** — model `Site` with a `location` attribute; UI says "Site." MATCH.
- **"Subscription" NOT fully retired** — `SUBSCRIPTION_BLOCKED`/`SUBSCRIPTION_INACTIVE` + error code in [route.ts:198,208,355,365,462](../app/api/auth/%5B...nextauth%5D/route.ts#L198) and a LoginPage message. Data layer is fully Plan. **FIX-CODE.**
- **Severity reuse** — two scales reused widely; no S×P×D.

## Open standards — current code assumptions
- Severity: two scales (4-pt generic + 3-pt FDA), no risk score.
- Tenant slug: `customerCode @unique` **global**; record refs **per-tenant** (CC collisions possible across tenants).
- Creator naming: denormalized `createdBy` string.
- Plan-cap hard/soft: **soft** (UI-only).
- Cap thresholds: 80% near / 100% at (`usePlanLimits`, `>=0.8`); no 95%.
- MFA: **per-tenant** (`Tenant.mfaEnabled`); not always-on.
- AI-run quota reset: none found.

## Gaps the doc is silent on (code has, no standard)
180 granular audit verbs incl. `*_BLOCKED_*` (logging rejected attempts); Reopen flows; `SYS-` validation refs + auto-derived system status; AGI/AI-governance events + toggles; global `customerCode` uniqueness semantics.

---

## Proposed fix sequence (smallest aligned set — NOT yet executed)
1. **🔴 super_admin roster bright-line** (smallest, highest compliance value) — strip `users`/`sites` from the admin tenant loaders for super_admin; gate the rosters in `CustomerDetailPage`. ~2 files.
2. **🔴 Hard deletes → soft-delete + restore** — schema `deletedAt` + convert the 15 sites + filter reads. Recommend phasing: GxP records first (CAPA/Deviation/Finding/FDA-483/Criteria/RAID/Document), then admin (User/Site/Tenant). Large; own rung.
3. **🟠 Roles → 10** — drop it_cdo/operations_head, add capa_owner/training_coord/auditor across UsersTab, CLAUDE.md, role-sets, seed.
4. **🟠 "Subscription" residue → Plan** — rename the 5 auth-route strings + LoginPage copy.
5. **🟠 Server-side caps** — count vs plan caps in createUser/createSite (the deferred "next prompt").
6. **🟡 Frameworks 9→12** — BLOCKED on the doc's 3 missing framework identities.
7. **DECIDE:** S×P×D risk score (feature), MFA-at-signing, 5-pt vs 4-pt severity, reopen scope.
8. **FIX-DOC (no code):** 180-vs-22 audit mapping, MFA_ENABLED spelling, SYS-vs-VAL prefix.

*No changes made. Awaiting go-ahead before editing.*
