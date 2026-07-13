# SCHEMA — Prisma data model

> Source of truth: `prisma/schema.prisma`. Provider: **SQLite** (all environments). **46 models** (was 43; +`DeviationTask`, +`DeviationTaskMessage`, +`FindingMessage`). Verified against the schema this session.

## How the database is managed (read this first)

- **Provider is `sqlite`** for every environment (datasource block, `prisma/schema.prisma`). This was a deliberate decision this session — the project briefly attempted a PostgreSQL cutover and then reverted. See [SETUP-AND-CONFIG.md](./SETUP-AND-CONFIG.md) and [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md).
- **Local dev** syncs the schema with `npx prisma db push` (no migrations involved). `dev.db` lives at `prisma/dev.db` (gitignored).
- **Deploys** run `npx prisma db push` on Render too (per `render.yaml`), OR `prisma migrate deploy` against the regenerated SQLite baseline.
- **Migration baseline:** the old Postgres-era migrations were deleted and replaced this session by a single clean SQLite baseline **`prisma/migrations/20260629054845_init/migration.sql`** (43 `CREATE TABLE`s, pure SQLite, `migration_lock.toml = sqlite`). This fixed **Bug 18** (the Support tables had no usable migration). A fresh `migrate deploy` on an empty SQLite file now produces all 43 tables.
- ⚠️ **`dev.db` has no `_prisma_migrations` history** (it was built by `db push`). So `migrate deploy` against `dev.db` *itself* would fail ("table already exists"); local keeps using `db push`. See [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md#known-limitations--tech-debt).
- **SQLite has no native enums** → fields like `Plan.tier`, status fields, severities are **`String`**, validated at the app layer with Zod (see `src/lib/plans.ts`, `src/constants/statusTaxonomy.ts`).
- **The FastAPI backend has its OWN separate SQLAlchemy database** (`backend/`). It is NOT this Prisma schema and is not covered here beyond this note.

## Cross-cutting patterns

### Multi-tenancy
Almost every model carries `tenantId` + a `tenant Tenant @relation(... onDelete: Cascade)`. Reads/writes are tenant-scoped by `session.user.tenantId`. **`Tenant` doubles as the account for `super_admin` and `customer_admin`** (those identities are Tenant rows, not `User` rows — see the dual-lookup note below).

### Soft-delete (Part 11 retention)
GxP records are never hard-deleted. The CAPA-family convention is four columns:
```
deletedAt DateTime?  deletedById String?  deletedByName String?  deletionReason String?
```
Present on `CAPA`, `Deviation`, `Finding`, `CAPAActionItem`, `CAPAEffectivenessCriterion`, `Document`, etc. Read paths filter `where: { deletedAt: null }`.

### SoD identity columns (ID-based)
Records that need Segregation of Duties carry **userId FK columns** that get compared in server actions (never name strings). Examples: `Deviation.createdById / investigationCompletedById / capaDecisionById`; `CAPA.createdById`; `CAPAApproval.approverId`. See [ROLES-AND-PERMISSIONS.md](./ROLES-AND-PERMISSIONS.md#segregation-of-duties-sod).

### Denormalized name caches
Many records store both `createdById` (authoritative FK) and `createdBy` (display-name cache) so list reads avoid joins. The **FK is authoritative**; the name is display-only.

## The full model list (46)

`AuditLog`, `CAPA`, `CAPAActionItem`, `CAPAApproval`, `CAPAChangeControlLink`, `CAPAComment`, `CAPADocument`, `CAPAEffectivenessCriterion`, `ChangeControl`, `Deviation`, **`DeviationTask`**, **`DeviationTaskMessage`**, `Document`, `EmailOTP`, `EvidenceFile`, `EvidenceItem`, `EvidenceNoteVersion`, `FDA483Commitment`, `FDA483CommitmentDocument`, `FDA483Document`, `FDA483Event`, `FDA483Observation`, `Finding`, `FindingEdit`, **`FindingMessage`**, `GxPSystem`, `Inspection`, `Notification`, `Plan`, `Playbook`, `RAIDItem`, `RTMEntry`, `ReadinessAction`, `ReadinessCard`, `RoadmapActivity`, `SignedRecord`, `Simulation`, `Site`, `StageDocument`, `Tenant`, `Ticket`, `TicketActivity`, `TicketMessage`, `TrainingRecord`, `User`, `ValidationStage`.

> The three **bold** models were added across the deviation-redesign + gap-finding-workflow work (see [MODULES.md](./MODULES.md) and the "Work-loop models" section below).

## Core models

### Tenant
The customer organization **and** the account row for `super_admin` / `customer_admin`. Key fields: `customerCode @unique`, `name`, `username @unique`, `email @unique`, `passwordHash`, `role` (default `customer_admin`), `isActive`, `mfaEnabled`, `sessionsValidAfter`, `logoUrl`, `timezone`, `language`. Relations: `plan Plan?`, `sites Site[]`, `users User[]`, and back-relations to every compliance model. `sessionsValidAfter` is bumped on MFA enable to force re-login.

### User
A tenant-scoped staff member (qa_head, csv_val_lead, operations_head, etc.). Key fields: `tenantId`, `name`, `email`, `username`, `passwordHash`, `role String` (one of the 9 roles — see [ROLES-AND-PERMISSIONS.md](./ROLES-AND-PERMISSIONS.md)), `isActive`, `gxpSignatory` (required for e-signature actions), `siteId?`. **Note:** `super_admin`/`customer_admin` are **Tenant** rows, not Users — auth and signing look up Tenant first, then User (the "dual lookup").

### Plan (subscription — heavily extended this session)
Exactly one per Tenant (`tenantId @unique`). Fields:
```
tier String              // ESSENTIALS | PROFESSIONAL | ENTERPRISE | TAILORED (Zod-validated; SQLite has no enum)
displayName String?      // TAILORED label
maxUsers Int             // frozen cap
maxSites Int             // frozen cap
minRetentionYears Int    // retention PROMISE (no purge logic) — TAILORED floor = 7 (this session)
durationMonths Int @default(12)   // subscription term (this session)
startDate DateTime
expiryDate DateTime      // DERIVED = startDate + durationMonths, then stored (this session)
createdAt / updatedAt
```
- Caps are **frozen** onto the row at assignment (copied from `PLAN_TIERS` for fixed tiers, or custom within `TAILORED_CEILINGS` for TAILORED — see `src/lib/plans.ts`).
- `expiryDate` is computed by `resolveExpiry(startISO, months)` (dayjs calendar-month math) — never hand-entered (this session's duration feature).
- Plan business rules all live in `src/lib/plans.ts`; the write path is `assignPlan` in `src/actions/tenants.ts`. See [FLOWS.md](./FLOWS.md#plansubscription-flow).

### SignedRecord (Part 11 e-signature ledger)
Immutable signature rows. Fields (from `src/lib/signing.ts` `CreateSignedRecordOptions` + writes): `tenantId`, `recordType` (e.g. `CAPA_CLOSURE`, `DEVIATION_CLOSURE`, `CAPA_APPROVAL`, `FDA483_RESPONSE`, `DOCUMENT_APPROVAL`, `CHANGE_CONTROL_TRANSITION`, `CSV_VALIDATION_SIGNOFF`, …), `recordId`, `signerId/Name/Role/Email`, `signatureMeaning`, **`contentHash`** (SHA-256 of canonicalized content), `contentSummary`, `passwordVerifiedAt`, `ipAddress?`, `userAgent?`. One-to-one back-links exist on signed records (e.g. `Deviation.closureSignatureId @unique`). See [FLOWS.md](./FLOWS.md#part-11-e-signature-flow).

### AuditLog
Append-only audit trail. Fields (from `auditLog.create` calls): `tenantId`, `userId`, `userName`, `userRole`, `module`, `action` (e.g. `PLAN_ASSIGNED`, `PLAN_RENEWED`, `TENANT_SUSPENDED`, `DEVIATION_CREATED`, `CAPA_*`), `recordId`, `newValue` (JSON string), and old-value where relevant. Human labels for actions live in `src/lib/labels/auditEvents.ts`. Read via `src/lib/queries/governance.ts`; surfaced in the Audit Trail module.

## Compliance domain models (summaries)

### Finding (Gap Assessment)
A compliance gap. Key: `tenantId`, `siteId`, `area`, `requirement`, `severity` (generic taxonomy), `status` (now **`Open | In Progress | Submitted | Rework | Closed`** — the work loop, default `"Open"`), **`owner String`** (a **userId, NOT a User FK** — resolved client-side from the users list; this is why finding→CAPA carryover must re-resolve it to a real `User`), `targetDate`, `capaId?` / `linkedCAPAId?` (link to a CAPA), `createdById`, soft-delete. Work-loop fields: **`completionNotes String?`** (assignee's work notes), `submittedAt`/`submittedById`, `reworkReason` (current "ask"), and `messages FindingMessage[]` (the QA↔assignee thread). `FindingEdit` records edit history. Closing a CAPA cascades the linked Finding → `closed` (`src/actions/capas/closure.ts`).

### CAPA + family
`CAPA` (the corrective/preventive action) with `deviationId @unique` (authoritative FK to its source Deviation, relation `CAPADeviationSource`), **`findingId @unique`** (FK to a source Finding, the gap-finding carryover), `status`, `ownerId` (the single **assignee** — drives worklist), `risk`, `createdById`, soft-delete. **Status note:** the `CAPAStatus` union (`src/types/capa.ts`) still lists `pending_verification`, but it is **legacy-only** — independent verification was removed and closure now runs directly from `pending_qa_review` (one approval → signed close). See [MODULES.md](./MODULES.md#capa--complete-reshaped--one-approval-closure-independent-verification-removed) + the per-env backfill `scripts/backfill-capa-retire-verification.ts`. Children/links:
- `CAPAActionItem` — the assignable task: `ownerId` (worklist key), `description`, `dueDate`, `status` (`pending|in_progress|complete|skipped|rework`), `completedById/At/completionNotes`, `reworkReason/RequestedById/At`.
- `CAPAApproval` — tiered approval ledger (`approverId`, `revokedAt?`).
- `CAPAEffectivenessCriterion` — 90-day effectiveness review.
- `CAPAComment` — QA↔fixer thread.
- `CAPADocument`, `CAPAChangeControlLink` — links.
See [FLOWS.md](./FLOWS.md#capa-lifecycle).

### Deviation (redesign BUILT — see STATUS-AND-BACKLOG.md)
A quality deviation. Notable fields: `severity` (FDA: `Critical|Major|Minor`), **`priority String?`** (`Low|Medium|High`, QA-set, prefilled from severity — added by the redesign, nullable so legacy rows are unaffected), `status` (now **`open → under_investigation → pending_qa_review → capa_pending → closed|rejected`**), `owner String` (a userId), RCA fields (`rootCause`, `rcaMethod`, `rcaData`, `investigationCompletedAt/ById`), CAPA-decision fields, `linkedCAPAId String?` (legacy link; authoritative side is `CAPA.deviationId`), `previousCAPAId?` (recurrence), `closureSignatureId @unique`, `tasks DeviationTask[]`, SoD FKs, soft-delete. The priority-split flow is now implemented (see "Work-loop models" below + [FLOWS.md](./FLOWS.md#deviation-flow-priority-split)).

### Work-loop models (DeviationTask, DeviationTaskMessage, FindingMessage) — NEW
The shared "assign → work → submit → QA review → rework" loop, mirrored across deviations and findings:
- **`DeviationTask`** (low-priority deviation work; mirrors `CAPAActionItem`): `tenantId`, `deviationId` (FK, `onDelete: Cascade`), **`assigneeId` (the Worklist key) + `assignee` name cache**, `message` (QA instruction), `dueDate?`, `status` (default `pending`; values `pending | in_progress | submitted | rework | closed | cancelled` — `cancelled` is set when a CAPA escalation supersedes the task), submission (`completionNotes`, `submittedAt/ById`), review (`reviewedById/At`, `reworkReason`, `reworkRequestedById/At`), `messages DeviationTaskMessage[]`, `createdBy/ById`, soft-delete quartet. Task documents are `Document` rows with `linkedModule: "Deviation Task"` + a GxP **`category`**.
- **`DeviationTaskMessage`** — flat (no threading) QA↔worker conversation: `tenantId`, `deviationTaskId` (FK Cascade), `authorId?`, `authorName`, `authorRole`, `body`, `createdAt`.
- **`FindingMessage`** — the finding equivalent: `tenantId`, `findingId` (FK Cascade), `authorId?`, `authorName`, `authorRole`, `body`, `createdAt`, `@@index([tenantId, findingId])`.

> **`Document.category`** is now used to bucket task/finding evidence into the 7 GxP `EVIDENCE_CATEGORIES` (`src/lib/queries/evidence.ts`); on carryover those map 1:1 to CAPA `EvidenceItem` categories.

### FDA 483 family
`FDA483Event` (an inspection observation event) + `FDA483Observation`, `FDA483Document`, `FDA483Commitment`, `FDA483CommitmentDocument`. Response submission is Part 11-signed (`FDA483_RESPONSE`).

### CSV/CSA validation
`GxPSystem` (computerized system) + `ValidationStage`, `StageDocument`, `RTMEntry` (requirements traceability matrix), `RoadmapActivity`. Validation sign-off is Part 11-signed (`CSV_VALIDATION_SIGNOFF`).

### ChangeControl
Change-control records; consequential transitions (In Review→Approved/Rejected, Implemented→Closed) are Part 11-signed (`CHANGE_CONTROL_TRANSITION`).

### Evidence / Documents
`Document` (the generic file record — `linkedModule`/`linkedRecordId` link it to any module, `retainUntil`, `storageKey`, `sha256`, soft-delete). `EvidenceItem` (a CAPA evidence category) + `EvidenceFile` (`retainUntil = +7y`, SHA-256) + `EvidenceNoteVersion` (insert-only immutable note history).

### Inspection Readiness / Governance / Misc
`Inspection`, `ReadinessCard`, `ReadinessAction` (readiness scoring); `RAIDItem` (governance Risks/Assumptions/Issues/Dependencies); `TrainingRecord`; `Playbook`, `Simulation` (AI/scenario surfaces — **(unverified)** depth); `Notification` (in-app bell, not persisted to the data slices); `Site` (tenant site/plant).

### Support (ticketing — Bug 18 tables)
`Ticket` + `TicketMessage` + `TicketActivity`. These existed in the schema but had **no migration** until this session's baseline regen (Bug 18). `Ticket` has its own `assigneeId`, `status`, `priority`, `category`, `reference`.

### EmailOTP
One-time passcodes for MFA login (generated/verified during the email-OTP MFA flow — see [FLOWS.md](./FLOWS.md#auth--mfa-login)).

## Entity relationship highlights

```
Tenant 1───1 Plan
Tenant 1───* User, Site, Finding, CAPA, Deviation, Document, AuditLog, SignedRecord, ...
Deviation 1───1 CAPA        (CAPA.deviationId @unique, "CAPADeviationSource"; legacy Deviation.linkedCAPAId mirrors it)
Deviation 1───* DeviationTask ───* DeviationTaskMessage   (low-priority work loop)
Finding   1───1 CAPA        (CAPA.findingId @unique; gap-finding carryover. Also Finding.capaId; CAPA close cascades Finding→closed)
Finding   1───* FindingMessage                            (finding QA↔assignee thread)
CAPA      1───* CAPAActionItem, CAPAApproval, CAPAEffectivenessCriterion, CAPAComment, EvidenceItem
GxPSystem 1───* ValidationStage, RTMEntry, RoadmapActivity
FDA483Event 1───* FDA483Observation, FDA483Document, FDA483Commitment
* compliance close/approve/sign events ───1 SignedRecord (recordType + recordId + contentHash)
```
