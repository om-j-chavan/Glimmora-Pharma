# Glimmora Pharma — Technical Handover

> A complete, **current** handover for branch `devAI`, written from the actual code (not the stale root `HANDOVER.md`). Generated this session, which added: bug fixes (2, 8, 11, 17, 18 + cap-input validation), a full plan-subscription feature set (duration, renew, cap-vs-usage guard, retention floor), the **SQLite-as-the-database** decision + a regenerated migration baseline, and a **deviation redesign** that is **designed but not yet built**.
>
> **Principle:** where any older doc disagrees with the code, **the code wins**. Anything not verifiable from code is marked **(unverified)**.

## Start here (new developer, zero prior context)

Read in this order:

1. **[OVERVIEW.md](./OVERVIEW.md)** — what the app is, who it's for, the GxP/Part 11 compliance context, the 3-part architecture (Next.js web + FastAPI AI backend + SQLite), and the tech stack with versions. *(~5 min)*
2. **[SETUP-AND-CONFIG.md](./SETUP-AND-CONFIG.md)** — get it running: `npm install` → `prisma db push` → `db:seed` → `dev`. Env vars, npm scripts, **seeded test logins**, the SQLite decision, deployment. *(do this in parallel — get a local instance up)*
3. **[CODEBASE-MAP.md](./CODEBASE-MAP.md)** — the folder structure + the conventions you must internalize: **reads** (`src/lib/queries/*`, cached) vs **writes** (`src/actions/*`, the `ActionResult` + audit pattern), modules, mappers, the auth identity model.
   - then **[REUSABLES.md](./REUSABLES.md)** — what already exists (components, patterns, helpers) so you reuse instead of duplicate. **Read this before writing any new feature**, and especially before the Deviation rebuild (it maps every needed piece to an existing reusable).
4. **[ROLES-AND-PERMISSIONS.md](./ROLES-AND-PERMISSIONS.md)** — the 9 roles, `roleSets.ts`, the tenant model, and the ID-based Segregation-of-Duties pattern. (Auth is gated on this everywhere.)
5. **[SCHEMA.md](./SCHEMA.md)** — the 43-model Prisma data model, soft-delete + `SignedRecord`/audit Part 11 machinery, and how the DB is managed (SQLite via `db push` + the `20260629054845_init` baseline).
6. **[FLOWS.md](./FLOWS.md)** — trace a request end-to-end: login/MFA, the read path, the write path, Part 11 e-signature, the CAPA lifecycle, the plan/subscription flow, and the AI request path. ASCII diagrams.
7. **[MODULES.md](./MODULES.md)** — every feature module, its state (complete / in-progress / stubbed), key files, and main flow. Use this as the "where is X" index.
8. **[STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md)** — **read before doing any new work.** What changed this session, what's verified vs needs browser eyes (Bugs 1 & 19), known limitations/tech-debt, and the **full agreed deviation redesign + 4-stage build plan** (resumable from this doc alone).

**Fastest path to productivity:** read OVERVIEW + CODEBASE-MAP, get it running via SETUP, then jump to the MODULES entry for whatever you're touching and follow its key files. For the next planned work, go straight to the deviation redesign in STATUS-AND-BACKLOG.

## The documents

| File | One-line summary |
|---|---|
| [README.md](./README.md) | This index + reading order for a new developer. |
| [OVERVIEW.md](./OVERVIEW.md) | What the product is, the GxP/Part 11 context, the Next.js + FastAPI + SQLite architecture, and the versioned tech stack. |
| [CODEBASE-MAP.md](./CODEBASE-MAP.md) | Annotated folder/file structure + conventions (queries vs actions, `ActionResult`, mappers, auth identity). |
| [REUSABLES.md](./REUSABLES.md) | Catalogue of reusable UI components, UI patterns, and server/lib logic (with exact paths/props/signatures) + a "for the Deviation rebuild" reuse map. Read before building anything new. |
| [SCHEMA.md](./SCHEMA.md) | The 43-model Prisma schema, soft-delete + `SignedRecord`/`AuditLog` Part 11 machinery, SQLite/`db push`/baseline management. |
| [MODULES.md](./MODULES.md) | Per-module purpose, state, key files, and flow — the "where is X" map. |
| [FLOWS.md](./FLOWS.md) | End-to-end flows with diagrams: auth/MFA, read, write, e-signature, CAPA lifecycle, plans, AI. |
| [ROLES-AND-PERMISSIONS.md](./ROLES-AND-PERMISSIONS.md) | The 9 roles, `roleSets.ts` enforcement, the tenant model, and ID-based SoD. |
| [SETUP-AND-CONFIG.md](./SETUP-AND-CONFIG.md) | Run locally (web + AI), env vars, npm scripts, seeded credentials, the SQLite decision, deployment. |
| [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md) | Honest current state: session changes, verify-in-browser items, tech-debt, and the resumable deviation redesign. |

## Important caveats baked into these docs
- **SQLite is the database for all environments** (the Postgres path was abandoned this session). See SETUP-AND-CONFIG.
- **`backend/` (FastAPI AI service) is a separate app with its own database** — documented for context; **no code changes** to it are part of this handover.
- **MFA login is not completable on the client yet** (no OTP input) — don't enable MFA on a tenant you need UI access to. See STATUS-AND-BACKLOG.
- The **deviation redesign is designed, not built.** Its full spec + build plan are in STATUS-AND-BACKLOG.
- The old root **`HANDOVER.md` is stale** — this set supersedes it.
