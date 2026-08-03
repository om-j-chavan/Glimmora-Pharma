# AUDIT SUMMARY — Pharma Glimmora (post-merge)

**Date:** 2026-07-28 · **Branch:** devAI · Read-only audit. Full detail + every `file:line` in
[`docs/AUDIT_FULL.md`](./AUDIT_FULL.md). Companion functional map: [`docs/USER_FLOW_AUDIT.md`](./USER_FLOW_AUDIT.md).

## Bottom line
The **application security and GxP design are fundamentally sound** — every server action authorizes
server-side, Separation of Duties is enforced by **user id** (not name) and fails closed, file
download is authenticated + tenant-scoped, and the Part 11 signature ledger captures who/when/meaning
with password re-auth. **The risk in this branch is not the app logic — it's merge/config drift,
dependency advisories, and a couple of GxP-records-retention edges.** No code-level auth bypass or
client-trusted-identity was found.

## Counts by severity *(this pass; sections 2b/2e/4e/5a/5b/5d/6b partial — see "UNCLEAR" in full report)*
| Severity | Count | Notes |
|---|---|---|
| **CRITICAL** | 1 | `next-auth` advisory (dependency) |
| **HIGH** | 5 code/config + 6 dependency | cascade, append-only, `.env` drift, CI-not-enforced + 6 npm highs |
| **MEDIUM** | ~16 | route gating, orphans, status drift, double-submit-unverified, IDOR-consistency, missing env vars, no CSP |
| **LOW / MODERATE** | ~11 | UI polish, dead-code cleanup, 1 npm moderate (`uuid`) |
| **Clean/PASS checks** | — | server-action authz, SoD, file read-back authz, secrets, N+1, transactions, no conflict markers |

## Top 10 findings by risk
1. **[CRITICAL] `next-auth` advisory** — `getToken()` crashes on a malformed Bearer header. It's the
   auth library on a regulated app. → **Upgrade.** (`AUDIT_FULL.md` §6b)
2. **[HIGH] The audit trail can be cascade-deleted.** `AuditLog.tenant … onDelete: Cascade`
   (`schema.prisma:~1801`); a raw tenant delete would wipe AuditLog + cascade signed records. Normal
   archival re-parents them first (`tenants.ts:460-461`), but the DB default is destructive. →
   **Change to `onDelete: Restrict`** on AuditLog/SignedRecord→Tenant. (§2c)
3. **[HIGH] `.env.example` still ships a SQLite `DATABASE_URL` (`file:…`)** while schema +
   `migration_lock.toml` are `postgresql`. Copying it → `.env` fails `prisma validate` (the P1012
   we hit). → **Fix the placeholder to `postgresql://`.** (§6a)
4. **[HIGH] `next` (middleware bypass) + `sharp` (libvips CVEs) advisories.** `sharp` processes
   uploaded evidence images, so it's runtime-exposed; `next`'s bug is a *middleware* bypass and this
   app has **no** middleware, lowering exposure — patch both anyway. (§6b)
5. **[HIGH] CI (lint→tsc→build) is red and has been overridden.** `strict: true` is set but not
   enforced, so type errors are shipping — a bypassed verification signal on a GxP product. →
   **Make CI green and gate merges.** (§6d)
6. **[HIGH] Append-only nuance:** tenant archival `updateMany`s `tenantId` on **SignedRecord** and
   AuditLog rows (`tenants.ts:460-461`) — mutating otherwise-immutable ledger rows. → **Model archival
   without editing signed rows, or wrap it in its own audited migration event.** (§3b)
7. **[MEDIUM, high-consequence] Double-submit guards unverified on sign/close modals.** Many modals
   disable on `!isValid`, which is **not** an in-flight latch; a double-clicked close/sign could write
   two `SignedRecord`s. `LoginPage` does it right (`inFlightRef`). → **Audit every create/close/sign
   modal for `disabled={submitting}`.** (§5b)
8. **[MEDIUM] No middleware + UI-only role gating** on `/gap-assessment`, `/deviation`, `/readiness`,
   `/settings` (route calls `requireAuth()` but no role gate). Data stays visibility-scoped so no
   leak, but there's no route-level defense-in-depth. → **Add `requireRoleOrDeny` + a `middleware.ts`
   backstop.** (§1b)
9. **[MEDIUM] Read-back IDOR consistency.** `/api/documents/[id]` and `/api/evidence/files/[id]`
   enforce **tenant** scope but not the per-record visibility their list queries apply (the findings
   route does). A co-tenant user could fetch a doc by id they can't see in the list. → **Re-apply the
   visibility predicate on read-back.** (§1c)
10. **[MEDIUM] Legacy name-based SoD fallback.** CAPA close/RCA-review fall back to comparing display
    **names** when `createdById` is null on old rows (`closure.ts:123`, `rca-review.ts:131`). Names
    aren't identities. → **Backfill `createdById`, drop the name fallback.** (§3d)

## What to fix BEFORE this branch goes near `main`
**Blockers (do these first):**
- [ ] Upgrade `next-auth` (CRITICAL) and `next`, `sharp`, `postcss` (HIGH); re-run type/build. (§6b)
- [ ] Fix `.env.example` `DATABASE_URL` → `postgresql://` placeholder; add the 6 missing vars. (§6a)
- [ ] Get CI (lint→tsc→build) **green** and gate the merge on it — this is a GxP verification signal. (§6d)
- [ ] Set `onDelete: Restrict` on AuditLog/SignedRecord→Tenant so a tenant delete can't wipe the
      ledger; keep the archival re-parent as the deliberate path. (§2c)
- [ ] Verify (and fix) in-flight double-submit guards on every **sign/close** modal — a duplicate
      signed record is a Part 11 problem. (§5b)

**Strongly recommended before main (records-integrity / access):**
- [ ] Re-model or re-audit the tenant-archival re-parent of signed rows. (§3b)
- [ ] Add `requireRoleOrDeny` to the 4 UI-only-gated pages + a `middleware.ts` backstop. (§1b)
- [ ] Re-apply per-record visibility on the document/evidence download routes. (§1c)
- [ ] Backfill `createdById` and drop the name-based SoD fallback. (§3d)

**Can follow in a cleanup pass (not blockers):**
- Delete merge-orphaned dead code (CAPA V1/approval modals, `verifyCAPA`, 6 FDA-483 actions, document
  approve/reject/restore, `DeviationTaskPanel`, types-only `actions/worklist.ts`). (§4b)
- Drop orphaned columns/models (deviation impact fields, `CAPAApproval`, verification fields). (§2a)
- Prune the status taxonomy to reachable states; fix the CAPA `diGateStatus` drift + phantom
  "Failed"; fix the deviation "rejected"/"returned to investigation" copy. (§4d)
- Add a Content-Security-Policy header; remove the stale `KEYCLOAK_*` example vars. (§6a/§6c)
- Surface the silent create/archive failures to the user. (§4f)

## Honesty note
Six section-agents died together on a transient network error mid-run; findings were re-verified
directly, but these sub-areas got only a **partial** pass and are flagged **UNCLEAR** in the full
report (not asserted as clean): exhaustive missing-index review, full nullable-vs-required diff, the
complete `any`/`!`/`@ts-ignore` sweep, full loading/error-sibling coverage, the per-modal double-submit
sweep, the `use client` sweep, unused-dependency enumeration, and the exact current `tsc` error count.
Each has a concrete next-step command in `AUDIT_FULL.md`.
