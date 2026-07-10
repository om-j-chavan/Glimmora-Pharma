# Glimmora Pharma — Security & Compliance Audit

> Read-only audit (branch `devAI`). Every finding below is verified against source with file+line evidence. **No code was changed.** Severity is weighted for a 21 CFR Part 11 / GxP system: auth bypass, tenant-isolation leak, e-signature bypass, and audit-trail/record-durability gaps are treated as Critical even when the code delta is small.

**Headline:** The **Next.js web app is in good shape** — e-signature integrity is sound, tenant isolation is consistently enforced (evidence of a prior hardening pass), and file up/download is safe. The serious exposure is concentrated in the **FastAPI AI backend** (`backend/`): an open signup endpoint, an environment-dependent hardcoded JWT secret, a fail-open tenant filter, and a public network surface that bypasses the same-origin proxy. Compounding this: **SQLite in all environments with `prisma db push` on every boot and no backup story**, and **weak seeded credentials with no seed guard**.

---

## Investigated items — verdicts

| # | Item | Verdict |
|---|------|---------|
| 1 | JWT secret mismatch / forgeable tokens | **CONFIRMED** (Critical on the DigitalOcean path; boot-crash on Render) |
| 2 | AI backend auth strictness / proxy bypass | **CONFIRMED** (Critical — open signup + public surface; anonymous fallback off-Render) |
| 3 | SQLite in prod + `db push` on boot + durability | **CONFIRMED** (Critical for Part 11 record durability) |
| 4 | Seed safety / weak creds reachable | **CONFIRMED** (High — no guard; weak creds reachable if seeded in prod) |
| 5 | Tenant isolation (frontend + AI DB) | **Frontend: NOT AN ISSUE. AI `ai_db_handler`: CONFIRMED fail-open (Medium–High)** |
| 6 | Part 11 signing integrity | **NOT AN ISSUE** (signing is sound; two *process-control* reductions flagged separately) |
| 7 | Inert role limits | **NOT AN ISSUE — the overview was wrong; caps ARE enforced at creation** |

---

## CRITICAL

### C-1 — AI backend: open signup lets anyone mint a token for any tenant (`customer_id`)
**File:** [backend/app/routers/auth_router.py:202-231](backend/app/routers/auth_router.py#L202) (`signup`), consumed by [ai_router.py:43](backend/app/routers/ai_router.py#L43)
`POST /api/v1/auth/signup` requires **no authentication** and takes `customer_id` straight from the request body (`SignupRequest.customer_id`, line 62). It returns a signed JWT carrying that `customer_id` (`create_token`, line 100-106). Because every AI DB query is scoped by the token's `customer_id` ([ai_router.py:43](backend/app/routers/ai_router.py#L43) → [ai_db_handler.py:41](backend/app/ai_db_handler.py#L41)), an attacker can self-register with `customer_id` = a victim tenant's id and read that tenant's CAPA / RCA / effectiveness / closure data through the assistant. This works **regardless** of secret strength or `AI_AUTH_STRICT`.
**Failure scenario:** `curl -X POST .../api/v1/auth/signup -d '{"user_id":"x","username":"x","email":"x@x.co","password":"x","customer_id":"<victim-tenant-id>"}'` → returns a valid token → `POST /api/ai/chat` "list all CAPAs" returns the victim's records.
**Fix:** Signup must not be a public, self-service endpoint on a multi-tenant compliance API. Either (a) remove it and provision AI-backend users server-side only (the Next.js server mints/relays the token bound to the authenticated session's tenant), or (b) require an admin/service credential to call signup and never accept `customer_id` from the client — derive it from the authenticated caller.

### C-2 — AI backend JWT signed with a source-visible hardcoded secret on the DigitalOcean path
**File:** [backend/app/routers/auth_router.py:32-52](backend/app/routers/auth_router.py#L32) (`_load_secret_key`)
The signing key resolves to the literal `"dev-insecure-secret-do-not-use-in-production"` (line 49) whenever `SECRET_KEY` is unset **and** the environment is not detected as production. Production is detected only via `ENV/ENVIRONMENT=production` **or** the `RENDER` env var (lines 36-39). But **[.do/app.yaml:41-53](.do/app.yaml#L41) defines `JWT_SECRET`, not `SECRET_KEY`, and sets neither `ENV=production` nor `RENDER`.** So on DigitalOcean: `SECRET_KEY` is unset → not detected as production → the app signs and verifies every JWT with the public, source-visible string. Anyone can forge a token with an arbitrary `customer_id`/`sub` and it passes [`_decode_token`, line 148](backend/app/routers/auth_router.py#L148). This is a full authentication + tenant-isolation bypass.
**Name-mismatch corollary:** the code reads `SECRET_KEY` ([line 33](backend/app/routers/auth_router.py#L33)); `.do/app.yaml` and `backend/.env.example` provide `JWT_SECRET`. The configured secret is silently ignored. On Render (`RENDER` auto-set → `is_production` true) the same mismatch instead throws `RuntimeError` at boot (line 41) → hard denial of service.
**Fix:** Standardize on one variable name (`SECRET_KEY`) across code and all deploy configs; set it as a secret on every platform. Make production detection fail-closed (default to strict unless an explicit `ENV=development` is present) so a missing marker never downgrades to the dev secret. Remove the hardcoded fallback entirely — refuse to boot without a real secret in every non-local context.

### C-3 — AI backend is publicly reachable and accepts anonymous requests off-Render (proxy is not the only path)
**Files:** [backend/app/routers/auth_router.py:125-181](backend/app/routers/auth_router.py#L125) (`_auth_strict` / `_payload`); [.do/app.yaml:33-36](.do/app.yaml#L33) (public routes `/v1`, `/api/ai`, `/api/v1`); [src/lib/aiAuth.ts:17](src/lib/aiAuth.ts#L17) (`AI_UPSTREAM = "https://pharma-glimmora-ai-backend.onrender.com"`)
The same-origin proxy [app/api/ai-proxy/[...path]/route.ts](app/api/ai-proxy/[...path]/route.ts) does enforce a NextAuth session and an allowlist — **but it is not the only way to reach the backend.** The FastAPI service is exposed on the public internet (the Render URL is hardcoded in client code at [aiAuth.ts:17](src/lib/aiAuth.ts#L17) and referenced in [render.yaml:27](render.yaml#L27); DO App Platform publishes routes for it). An attacker hits FastAPI directly, skipping the proxy's session gate. When `_auth_strict()` is false (no `AI_AUTH_STRICT`, no `RENDER`, `ENV≠production` — i.e. the DO path and any misconfig), a missing/invalid token silently degrades to a shared `anonymous`/`anonymous` identity ([lines 174-181](backend/app/routers/auth_router.py#L174)), disabling both authentication and tenant isolation for the whole AI API.
**Fix:** Do not expose the AI backend publicly — bind it to the private network and require all traffic to transit the authenticated Next.js proxy (on DO, drop the public `routes:` and rely on `${api.PRIVATE_URL}`). Remove the anonymous fallback (fail closed everywhere; keep a local-only escape hatch behind an explicit `ENV=development`). Remove the hardcoded public backend URL from client bundles.

### C-4 — SQLite in all environments + `prisma db push` on every boot + no backup story (Part 11 record durability)
**Files:** [prisma/schema.prisma](prisma/schema.prisma) (`provider = "sqlite"`, all envs); [render.yaml:14](render.yaml#L14) (`startCommand: npx prisma db push && npm start`); [render.yaml:15-18](render.yaml#L15) (single 1 GB disk, no backup/PITR)
For a validated GxP system this is the most consequential compliance finding. `prisma db push` reconciles the live database to the schema **without a reviewed migration** and can drop columns/tables and lose data to resolve drift — and it runs on **every boot**. The system of record is a single SQLite file on one mounted disk with no backup, replication, or point-in-time recovery described in any config. That undermines ALCOA+ "Available/Enduring" and §11.10(c) (protection of records to enable accurate retrieval throughout the retention period). The DO path instead uses `prisma migrate deploy` ([.do/app.yaml:13](.do/app.yaml#L13)) which is correct — but the two configs conflict, and SQLite remains the engine.
**Fix:** For production, move to a managed PostgreSQL (the schema already anticipates it) with automated backups + PITR, and deploy via `prisma migrate deploy` **only** — never `db push` — so every schema change is a reviewed, versioned, auditable migration. If SQLite must remain short-term, at minimum remove `db push` from the boot command and add scheduled, verified off-disk backups with documented retention.

---

## HIGH

### H-1 — Seed script has no environment guard and writes weak, well-known credentials
**File:** [prisma/seed.ts](prisma/seed.ts) — passwords at [line 30](prisma/seed.ts#L30) (`super_admin` = `"1"`), [line 31/87](prisma/seed.ts#L31) (`Admin@123`), [line 229](prisma/seed.ts#L229) (`Demo@123`). No `NODE_ENV`/URL guard anywhere (the only `throw`/`process.exit` are a missing-fixture assertion at [line 285](prisma/seed.ts#L285) and the catch handler at [line 1147](prisma/seed.ts#L1147)).
The seed runs against whatever `DATABASE_URL` is set and performs destructive wipe-and-reseed of FDA 483 and Deviation data. It is **not** auto-invoked on deploy (Render's start command and the DO migrate job don't seed; CI seeds a throwaway `ci.db`). **But** [render.yaml:12-13](render.yaml#L12) explicitly instructs "Seed once manually via the Shell" — if that is done against production, the platform `super_admin` login becomes password **`"1"`**. Separately, an accidental local `npm run db:seed` pointed at a prod `DATABASE_URL` would wipe live compliance data.
**Fix:** Refuse to run unless the target is clearly non-production — e.g. assert `DATABASE_URL` is a local SQLite file (or require an explicit `ALLOW_SEED=1`) and `NODE_ENV !== "production"`; abort otherwise. Never seed real admin credentials; if a bootstrap admin is required in prod, force a password reset on first login. Do not document manual prod seeding.

### H-2 — AI DB tenant filter is fail-open (returns all tenants' rows if `customer_id` is falsy)
**File:** [backend/app/ai_db_handler.py:41-46](backend/app/ai_db_handler.py#L41) (`base()`)
```python
def base(db, Model, customer_id):
    q = db.query(Model)
    if customer_id:          # <-- filter applied ONLY when truthy
        q = q.filter(Model.customer_id == customer_id)
    return q
```
Every module query builds on `base()`. If `customer_id` is ever `None` or `""`, the query runs **unfiltered across all tenants**. Today the value always arrives from the token (min length 1, or the `"anonymous"` sentinel), so it isn't directly reachable — but this is a fail-open default guarding cross-tenant compliance data, one refactor away from a full leak, and it pairs badly with C-1/C-3.
**Fix:** Fail closed. Make `customer_id` required; if it is missing/empty, raise (or return zero rows) rather than dropping the filter. Reject the `"anonymous"` sentinel from any data-returning path.

### H-3 — CAPA independent-verification step retired and Change-Control dependency gate bypassed (segregation-of-duties reduction)
**File:** [src/actions/capas/closure.ts:109-115](src/actions/capas/closure.ts#L109) (verification retired), [lines 252-288](src/actions/capas/closure.ts#L252) (CC 6.4 gate commented out)
Not a signature-integrity break (see N-1), but a **process-control weakening** that an inspector will probe: a CAPA can now be signed and closed directly from `pending_qa_review` with no independent verification, and closure no longer consults linked Change Control status (the hard/soft dependency gate is entirely commented out, though the `ccBlockOverride` input is still accepted and ignored). For GxP this reduces the independent-check and change-linkage controls (§11.10(d)/(g) intent).
**Fix:** Confirm with the QMS owner that removing independent verification and the CC dependency gate is an intended, documented, risk-assessed configuration — not accidental dead code. If intended, remove the vestigial `ccBlockOverride` schema field to avoid implying a control that doesn't run; if not, restore the gates.

---

## MEDIUM

### M-1 — E-signature re-auth password accepts a 1-character secret
**File:** [src/actions/capas/closure.ts:34](src/actions/capas/closure.ts#L34) (`password: z.string().min(1)`); primitive at [src/lib/signing.ts:33](src/lib/signing.ts#L33)
The signing re-authentication (§11.200) verifies the *correct* password, so this isn't a bypass — but `min(1)` plus the seeded `super_admin` password `"1"` (H-1) means a Part 11 signing credential can be a single character. Weak signing credentials undercut the "uniqueness/strength" expectation for e-signatures.
**Fix:** Enforce a real password policy for GxP signatories (length/complexity) at set-time, independent of the login policy; never seed a 1-char credential.

### M-2 — Conflicting/duplicated deploy configs with divergent DB & storage strategies
**Files:** [.do/app.yaml](.do/app.yaml), [render.yaml](render.yaml), [vercel.json](vercel.json)
Three live-looking targets disagree: DO uses `migrate deploy` + DO Spaces + private networking; Render uses `db push` + persistent-disk SQLite + local files; Vercel is a stub. The AI backend URL is hardcoded to Render in **source** ([aiAuth.ts:17](src/lib/aiAuth.ts#L17), [aiBackend.ts:3](src/lib/aiBackend.ts#L3)) and in `render.yaml`, so the AI backend clearly runs on Render, while the web target is ambiguous. For a validated system the deployed topology must be single and documented. **NEEDS-MORE-INFO:** which config is authoritative?
**Fix:** Delete the non-authoritative deploy files; keep exactly one, documented. Move the AI backend base URL to an env var (don't compile an environment-specific URL into the client bundle).

### M-3 — AI backend auto-creates tables on startup (`create_all`)
**File:** [backend/app/main.py](backend/app/main.py) (`Base.metadata.create_all(bind=engine)` on startup)
Like C-4 on the FastAPI side: schema is materialized implicitly at boot with no migration history — no reviewed, versioned change control over the AI database's structure. Acceptable for a demo, not for a system holding GxP-adjacent records.
**Fix:** Manage the FastAPI schema with Alembic migrations; drop `create_all` from the production boot path.

---

## LOW

- **L-1 — `console.error` swallows the real error to the client (acceptable, but ensure server logs are retained).** e.g. [closure.ts:532-535](src/actions/capas/closure.ts#L532), the download routes' 500 handlers. Returning a generic message is correct; just confirm server-side logs are captured in prod for audit/incident review.
- **L-2 — `user_router.py` is a non-functional placeholder** returning a static message (per module map) — dead surface; remove or implement so it isn't mistaken for a real, unguarded endpoint.
- **L-3 — Timing side-channel in `verifyPasswordForSigning`** is documented and bounded ([signing.ts:26-31](src/lib/signing.ts#L26)) — only reveals "exists somewhere vs nowhere," same as login. No action needed; noted for completeness.

---

## Items explicitly ruled out (checked, NOT an issue)

- **File-download IDOR — NOT AN ISSUE.** All four authenticated download routes load by id, then enforce a tenant match before returning bytes (super_admin exempt), returning a 404-shaped response to avoid existence leaks: [documents/[id]/route.ts:41](app/api/documents/[id]/route.ts#L41), [evidence/files/[id]/route.ts:42-48](app/api/evidence/files/[id]/route.ts#L42) (scopes `evidenceItem → capa → tenantId`), [stage-documents/[id]/route.ts:52-58](app/api/stage-documents/[id]/route.ts#L52) (`validationStage → system → tenantId`), [findings/[id]/evidence/route.ts:40](app/api/findings/[id]/evidence/route.ts#L40).
- **Frontend tenant isolation — NOT AN ISSUE (sampled).** Reads in `src/lib/queries/*` and writes in `src/actions/*` are tenant-scoped; bare `where: { id }` writes/deletes are preceded by a tenant-ownership guard (e.g. [fda483.ts:1509-1518](src/actions/fda483.ts#L1509) `deleteObservation`, [fda483.ts:1359-1363](src/actions/fda483.ts#L1359)). `resolveUserFk` is tenant-scoped ([auth.ts:142](src/lib/auth.ts#L142)). Platform-catalog writes in `frameworks.ts` are cross-tenant *by design* (Framework/Region are shared catalogs). *Caveat: sampled across the highest-risk actions, not all 40 exhaustively.*
- **Part 11 signing integrity (N-1) — NOT AN ISSUE.** `signAndCloseCAPA` re-authenticates via `verifyPasswordForSigning` **before** any state change ([closure.ts:293-318](src/actions/capas/closure.ts#L293)); a wrong password yields an audit row and zero side effects. The `SignedRecord` mint + `status="closed"` + `closureSignatureId` link happen atomically in one `$transaction` ([closure.ts:372-410](src/actions/capas/closure.ts#L372)). The `contentHash` binds the canonical CAPA state, the action-item snapshot, and the effectiveness due date ([signing.ts:187-201](src/lib/signing.ts#L187)); the paired `CAPA_CLOSED` + `CAPA_CLOSURE_SIGNED` audit rows cross-reference the ledger. No path signs/closes without genuine password re-auth. (Process-control reductions are tracked separately as H-3.)
- **SQL injection in `ai_db_handler` — NOT AN ISSUE.** All queries use SQLAlchemy ORM with parameterized column filters; the user message is only lowercased and keyword-matched (`if "open" in msg`), never interpolated into SQL. [ai_db_handler.py:50-124](backend/app/ai_db_handler.py#L50).
- **File-upload handling — NOT AN ISSUE.** `fileStorage` resolves keys under `process.cwd()/uploads` and rejects path traversal ([fileStorage.ts:22-26](src/lib/fileStorage.ts#L22)); bytes are stored outside `./public`; server-side size caps are enforced independent of the 10 MB Server-Action `bodySizeLimit` ([evidence.ts:27-28,346](src/actions/evidence.ts#L27), [systems.ts:36-37,1041](src/actions/systems.ts#L36)).
- **Role/seat-limit enforcement (item 7) — NOT AN ISSUE; overview corrected.** Caps ARE enforced server-side at creation: `createUser` → `assertCanAddUser(tenantId, newRole, callerRole)` enforcing total `plan.maxUsers` **and** per-role caps ([settings.ts:261](src/actions/settings.ts#L261)); site creation → `assertCanAddSite` ([settings.ts:88](src/actions/settings.ts#L88)); plan edits refuse `maxUsers < currentUserCount` ([tenants.ts:619](src/actions/tenants.ts#L619)). Nuance: per-role caps only bind when a `PlanRoleLimit`/`TenantRoleLimit` row exists (else unlimited per-role), but the **total** seat cap always applies. The admin UI to *configure* per-role caps is "Phase C," which is likely what "inert" referred to — the *enforcement* is live.
- **Committed secrets / DB — NOT AN ISSUE.** `git ls-files` tracks only `.env.example` and `backend/.env.example`; the real `.env` and `dev.db` are untracked. `NEXTAUTH_SECRET` is properly guarded in production (throws if unset, if equal to the placeholder, or if shorter than 32 chars) at [app/api/auth/[...nextauth]/route.ts:20-30](app/api/auth/[...nextauth]/route.ts#L20).

---

## Top 5 fixes (ranked)

1. **Close the AI backend authentication holes (C-1 + C-2 + C-3) together.** Remove public self-service signup / never accept client `customer_id`; standardize on one real, required signing-secret variable with fail-closed production detection and no hardcoded fallback; take the backend off the public internet so all traffic transits the authenticated Next.js proxy. These three are one coherent workstream and are the biggest exposure.
2. **Fix production data durability (C-4).** Stop running `prisma db push` on boot; deploy schema changes via reviewed `migrate deploy` only; move to managed Postgres with automated backups + PITR (or, interim, verified off-disk SQLite backups). This is the finding most likely to fail an FDA inspection outright.
3. **Guard the seed and purge weak seeded credentials (H-1).** Refuse to seed against non-local `DATABASE_URL`; never seed real admin passwords (especially `super_admin` = `"1"`); force first-login reset for any bootstrap admin.
4. **Make the AI tenant filter fail closed (H-2).** Require `customer_id`; raise/return-empty when absent; reject the `anonymous` sentinel from data paths.
5. **Confirm and document the CAPA control configuration (H-3) and collapse to one deploy config (M-2).** Verify the retired verification step / bypassed CC gate are intentional and documented; delete the non-authoritative deploy files and move the backend URL to an env var.

---

## Would this fail an FDA inspection? (Part 11 callouts)

The following, on their own, would draw an observation (potential 483) if the inspected system holds GxP records:

- **C-4 (SQLite + `db push` on boot + no backup)** — §11.10(c) protection/retention of records; ALCOA+ Available/Enduring. **Most serious.** A validated system whose schema can be silently altered at boot and whose sole datastore has no backup is not defensible.
- **C-1 / C-2 / C-3 (AI backend auth bypass + tenant isolation loss)** — §11.10(d) system access limited to authorized individuals; §11.10(g) authority checks. Open signup and a public/forgeable-token surface mean the AI subsystem's tenant isolation is not enforceable.
- **H-1 (weak seeded admin credential reachable if seeded in prod)** — §11.10(d)/(g) and §11.300 (identification-code/password controls). A `super_admin` account with password `"1"` is an immediate access-control finding.
- **H-3 (independent verification retired; CC dependency gate bypassed)** — §11.10(d)/(g) intent around independent checks and controlled change linkage. Needs a documented, risk-assessed justification or restoration.
- **M-1 (1-character e-signature password permitted)** — §11.300(a)/(b) signature-credential uniqueness/strength.

**Passes (strengths to preserve):** the e-signature ledger and signing pipeline (atomic, re-authenticated, content-hash-bound — N-1), the paired audit-trail entries, frontend tenant isolation, and safe file up/download. The Part 11 *signing* mechanics are well built; the failures are in the AI subsystem's auth, the production data posture, and credential hygiene — not in the signature engine itself.

---

*Method note: four subagents were dispatched for the breadth sweeps but terminated on a session limit; all findings above were therefore verified directly against source by reading the cited files. The frontend tenant-isolation and query-layer conclusions are based on reading the highest-risk paths plus targeted pattern sweeps, not an exhaustive line-by-line pass of all ~40 action files — flagged where relevant.*
