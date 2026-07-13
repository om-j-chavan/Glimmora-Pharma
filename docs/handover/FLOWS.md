# FLOWS — end-to-end

> Step-by-step flows with diagrams. File:line references verified this session.

## Auth + MFA login

Key files: `app/api/auth/[...nextauth]/route.ts` (provider + `authorize()`), `src/lib/auth.ts` (server helpers), `src/components/auth/LoginPage.tsx` + `src/lib/authClient.ts` (client), `src/lib/otp.ts` + `src/lib/mailer.ts` (OTP), `proxy.ts` (edge gate).

```
Browser LoginPage ──signIn("credentials",{redirect:false,email,password})──▶ NextAuth authorize()
                                                                                   │
   assertProductionSecret() (prod: refuse if NEXTAUTH_SECRET missing/placeholder/<32 chars)
                                                                                   │
   ┌───────────────────────────── DUAL LOOKUP ──────────────────────────────┐
   │ 1) Tenant table  (super_admin / customer_admin)  — include:{plan}        │
   │      >1 match → AMBIGUOUS_EMAIL ; isActive? ; bcrypt.compare(pw, hash)    │
   │      plan gate: super_admin & customer_admin EXEMPT; others need active  │
   │ 2) else User table (qa_head, csv_val_lead, ... ) — include tenant+plan   │
   │      isActive? ; bcrypt.compare ; plan gate (NO exemption) ; lastLogin    │
   └─────────────────────────────────────────────────────────────────────────┘
                                                                                   │
   MFA gate (keyed on Tenant.mfaEnabled; super_admin always bypasses):
      no otp supplied → generateOtp() [6-digit, bcrypt-hashed, 10-min TTL, EmailOTP row]
                         + sendOtpEmail() [Gmail SMTP; dev logs code to console]
                         → throw OTP_REQUIRED
      otp supplied     → verifyOtp() [most-recent unconsumed; 5-attempt lock] → ok
                                                                                   │
   success → SessionUser {id,name,email,role,gxpSignatory,tenantId,orgId,siteId}
            → JWT + session callbacks
                                                                                   │
   client → GET /api/auth/me → Redux setCredentials → route by role
            (super_admin→/admin, customer_admin→/, others→site-picker)
```

- **`sessionsValidAfter`** (Tenant column): the `jwt` callback reads it on every authenticated request; if the token was issued before it, returns an **empty token** → forces re-login. Stamped to `now()` by `toggleTenantMFA` on a false→true MFA flip, so enabling MFA logs out all that tenant's users. Does **not** fail open on DB error.
- 🚩 **MFA login is unfinished on the CLIENT.** `LoginPage`/`authClient` only send `email`+`password` — there is **no OTP input field** and `otp` is never sent. The server OTP flow is complete but unreachable end-to-end; for an `mfaEnabled` tenant the UI just shows "Incorrect email or password". **Needs a client OTP step to be usable.** (See [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md).)

### Edge gate — `proxy.ts`
Reads the JWT via `getToken` (Edge-safe). No token → APIs 401, pages redirect to `/login`. `/admin*` requires super_admin/customer_admin; a super_admin on a non-admin page is bounced to `/admin`. **`NEXTAUTH_SECRET` unset → fail CLOSED in production** (500 / redirect), **fail open with a loud warning in development**. Defense-in-depth — pages still call `requireAuth()`.

## Read path (Server Component → cached query)

```
app/(app)/<route>/page.tsx  (Server Component, async)
   └─ requireAuth()  → session {user.tenantId, role, ...}
   └─ await Promise.all([ getX(tenantId), getY(tenantId) ])   ← src/lib/queries/* (React cache())
   └─ render <ModulePage initialData={rows} />                 ← client component (src/modules/*)
        └─ useEffect seeds Redux data slices (findings/capa/deviation/systems)
        └─ widgets read slices via useTenantData() (tenant/site-filtered)
```
- Queries are `cache()`-wrapped, tenant-scoped, `deletedAt:null`.
- Data slices are **not** persisted to localStorage — they re-seed from the server each load (`src/store/persistence.ts`).

## Write path (Server Action → ActionResult → audit)

```
client form (react-hook-form + Zod schema)  ──▶  src/actions/<domain>.ts  ("use server")
   1. requireAuth()                          → session
   2. role / GxP guard                       → roleSets.ts / requireGxPAuthor (blocks super_admin)
   3. resolveUserFk(session.user.id, ...)    → real User.id for FK columns (admins are Tenant rows!)
   4. Schema.safeParse(input)                → { success:false, fieldErrors } on failure
   5. domain guards (SoD, caps, status)      → e.g. assignee≠reviewer, cap≥usage
   6. prisma.$transaction([...write...])     → the mutation
   7. prisma.auditLog.create({ action, ... })→ append-only audit row
   8. revalidatePath("/...")                 → refresh the server cache
   9. return ActionResult                    → { success:true, data } | { success:false, error }
        └─ client maps fieldErrors to inputs / shows toast
```
`ActionResult` shape (in every action):
```ts
{ success: true, data: T } | { success: false, error: string, fieldErrors?: Record<string,string[]> }
```

## Part 11 e-signature flow

Key file: `src/lib/signing.ts`. Used by CAPA approve/verify/close, deviation close, FDA 483 response, document approval, change-control transitions, CSV sign-off.

```
user clicks a consequential action (e.g. "Sign & Close CAPA") + enters PASSWORD
   └─ server action, inside a $transaction:
        1. verifyPasswordForSigning(userId, password)   ← bcrypt re-auth (Tenant table, then User)
              fail → audit SIGNING_PASSWORD_FAILED, abort
        2. canonicalize<Record>Content(...)               ← deterministic JSON (sorted keys, ISO dates)
        3. contentHash = SHA-256(canonical string)        ← computeContentHash()
        4. tx.signedRecord.create({                        ← immutable ledger row
              recordType, recordId, signerId/Name/Role/Email,
              signatureMeaning, contentHash, contentSummary,
              passwordVerifiedAt, ipAddress, userAgent })
        5. update the underlying record (status=closed, closureSignatureId=signed.id, ...)
        6. auditLog.create(...)
```
- The **contentHash binds the signature to the exact record state** — an inspector can recompute it from the snapshot and detect post-signing tampering. CAPA closure even hashes the action-item summary + effectiveness-due date.
- Canonicalizers are treated like a wire format: changing one invalidates historical signatures → version via `recordType` bump (e.g. `CAPA_APPROVAL_V2`), never edit in place.

## CAPA lifecycle

```
create (COMPLIANCE_AUTHOR_ROLES + GxP) ──▶ open
   │  optionally createCAPA({ linkedDeviationId })  ← links Deviation (both sides, in a tx)
   │  or          createCAPA({ linkedFindingId })   ← links Finding + carries docs/owner/RCA (gap escalation)
   ▼
in_progress ── RCA review ── action items assigned (CAPAActionItem.ownerId → Worklist)
   │             (rca-review.ts)   the single ASSIGNEE (CAPA.ownerId) uploads per-category
   │                               evidence in the Worklist; QA can reject PER CATEGORY
   │                               (rejectEvidenceCategory) → that category reworks
   ▼
submitForReview (assignee/author; readiness checklist) ──▶ pending_qa_review
   │  rejectCAPA (qa_head) → back to in_progress, flag items status="rework" (+reworkReason) → Worklist band
   ▼
tiered APPROVAL (approvals.ts; qa_head all tiers, + regulatory_affairs for Critical) [SIGNED]
   ▼
signAndCloseCAPA (closure.ts) ──▶ closed   [SIGNED: CAPA_CLOSURE]   ← ONE approval is enough
   │  cascades linked Finding → "closed"
   ▼
90-day EFFECTIVENESS review (effectiveness.ts; verdict effective|ineffective|partial) [SIGNED]
```
- **Independent verification was REMOVED this work.** One QA approval → signed close directly from `pending_qa_review` (`closure.ts:110-115`). `verifyCAPA`/`pending_verification` are **legacy-only**: closure still *accepts* a CAPA parked in `pending_verification` (and normalizes it), and `scripts/backfill-capa-retire-verification.ts` migrates legacy rows (**run per-env**).
- Module access (`/capa`) = qa_head + customer_admin; other roles work items via the Worklist.

## Deviation flow (priority split — BUILT)

The investigation-first / priority-split flow (`src/actions/deviations.ts` + `src/actions/deviation-tasks.ts`; worker UI `src/modules/worklist/DeviationTaskPanel.tsx`):
```
create (any non-viewer) ──▶ open ── (investigation as needed) ──▶ pending_qa_review
   │  QA sets priority (Low|Medium|High; prefilled from FDA severity, overridable)
   ├── LOW ──▶ assign a DeviationTask (assigneeId + message + notify) ──▶ Worklist
   │            assignee: categorized docs (7 GxP cats) + completion notes + submit
   │            QA review → Close [SIGNED: DEVIATION_CLOSURE]  | Rework (reason → DeviationTaskMessage thread)
   │            "Raise CAPA" escalation → CANCELS the open task, routes to ↓
   └── HIGH/MED ──▶ createCAPA({ linkedDeviationId }) ; deviation → capa_pending (stays open + linked)
                    when the CAPA closes → deviation UNBLOCKS → QA SIGN-closes (no auto-close)
```
- SoD: task reviewer ≠ assignee (ID-based). Low-priority QA close **is** Part 11-signed too.

## Gap Assessment finding flow (clones the deviation loop — BUILT)

`src/actions/findings.ts` + `src/modules/gap-assessment/tabs/GapRegisterTab.tsx` (disposition) + `src/modules/worklist/FindingWorkPanel.tsx` (worker):
```
create finding ──▶ Open   (owner auto = creator; owner is a String userId)
   │  Disposition is SEVERITY-GATED:
   ├── LOW ──▶ "Assign person" (assignFinding → Open flips to In Progress) [+ Raise CAPA optional]
   │            assignee (Worklist): categorized docs (mandatory category, multi, remove-before-submit)
   │                                 + completion notes + submit-to-QA confirm
   │            submitFinding ──▶ Submitted ── QA: reviewFinding → Closed | reworkFinding → Rework
   │            FindingMessage thread (rework reason auto-posted; reviewer ≠ owner SoD)
   └── HIGH/MED/CRITICAL ──▶ "Raise CAPA" → createCAPA({ linkedFindingId })
                             carries: categorized docs → CAPA EvidenceFiles, owner → CAPA assignee, RCA text
                             (comments NOT carried — see #22c in STATUS-AND-BACKLOG.md)
```

## Plan / subscription flow (all built this session)

Key files: `src/lib/plans.ts` (rules), `src/actions/tenants.ts` (`assignPlan`), `src/modules/admin/customer-accounts/*` + `customer-detail/*` (UI). See [SCHEMA.md](./SCHEMA.md#plan-subscription--heavily-extended-this-session).

**Tiers & caps** (`PLAN_TIERS` / `TAILORED_CEILINGS` in `src/lib/plans.ts`): fixed tiers ESSENTIALS/PROFESSIONAL/ENTERPRISE have preset `{maxUsers, maxSites, minRetentionYears, durationMonths:12}`; TAILORED is admin-set within ceilings `{1000, 50, 10yr, 120mo}`.

**Assign / edit a plan** (`assignPlan`, TAILORED-only guards in **bold**):
```
admin sets tier + (TAILORED) caps + durationMonths + startDate
   └─ resolvePlanCaps(tier, custom)            ← fixed: presets; TAILORED: clamp to ceilings, floor 1
   └─ Bug-2 guard: maxUsers≥1 && maxSites≥1
   └─ **TAILORED: maxUsers ≥ current ACTIVE users, maxSites ≥ current ACTIVE sites**  (cap-vs-usage)
   └─ **TAILORED: minRetentionYears ≥ 7**  (MIN_TAILORED_RETENTION_YEARS — Part 11 retention floor)
   └─ expiryDate = resolveExpiry(startDate, durationMonths)   ← DERIVED (dayjs calendar months), then STORED
   └─ prisma.plan.upsert({ ...frozen caps, durationMonths, startDate, expiryDate })
   └─ auditLog: PLAN_ASSIGNED
```

**Renew** (time-only — `renewPlan` in `useCustomerAccounts` → `assignPlan({ renewal:true })`):
```
QA opens Renew dialog on a tenant with a plan
   newStart = max(current expiry, today)        ← keep unused days if still valid, else start today
   newTerm  = current tier preset (TAILORED: current custom term, editable)
   newExpiry = resolveExpiry(newStart, newTerm) (read-only preview)
   confirm → assignPlan({ tier, caps unchanged, durationMonths, startDate:newStart, renewal:true })
            → audited as PLAN_RENEWED (vs PLAN_ASSIGNED)
```
- **Client mirrors every server guard** in `AccountModal` (errors/canSave) so the admin sees inline errors before submit. Server is authoritative.
- **Login plan gate:** a tenant user whose plan is missing/expired is blocked at login (`SUBSCRIPTION_INACTIVE`); super_admin/customer_admin are exempt.

## AI request path

```
Browser (aiChat / aiBackend / aiAuth clients; base "/api/ai-proxy")
   │   token = Redux selectAiToken ("anonymous" if none) → sent as custom "auth" header
   ▼
Next proxy  app/api/ai-proxy/[...path]/route.ts   (runtime=nodejs)
   │   auth() gate (anonymous → 401) ; path allowlist (api/ai/*, api/v1/*) ; strips cookies
   │   upstream = BACKEND_URL → NEXT_PUBLIC_API_URL(-/api) → http://localhost:8000
   ▼
FastAPI backend (backend/app/main.py)
   │   routers: auth, ai, capa, rca, action_plan, monitoring, effectiveness, closure, audit, user, voice
   │   /api/ai/chat → detect_intent → DB_QUERY | RAG_SEARCH | GENERAL
   ▼
OpenAI gpt-4o-mini  +  (optional) Pinecone RAG (index "glimmora-docs", text-embedding-3-small)
   │
   └─ FastAPI's OWN SQLAlchemy DB (separate from Prisma) — bridged only by customer_id
```
🚩 Flags (see [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md)): the backend uses **gpt-4o-mini** (CLAUDE.md says gpt-4o); **backend JWT is permissive** (enforcement removed 2026-05-15 — the real gate is the Next proxy's `auth()`); two AI base-URL env vars exist (`BACKEND_URL`/`NEXT_PUBLIC_API_URL` for the proxy, `NEXT_PUBLIC_AI_API_URL`/hardcoded onrender for the browser clients).
