# SETUP & CONFIG

> How to run, configure, seed, and deploy. Verified against `package.json`, `.env.example`, `render.yaml`, `prisma/seed.ts` this session.

## Prerequisites
- **Node 24** (`render.yaml` pins `NODE_VERSION=24`; works on recent LTS too).
- **Python 3.11+** only if you want the AI backend (`backend/`) running locally.
- No external database — the web app uses **file-based SQLite** (`prisma/dev.db`).

## Run locally (web app)

```bash
npm install
npx prisma generate            # generate the Prisma client
npx prisma db push             # create/sync prisma/dev.db from schema (NO migrations locally)
npm run db:seed                # seed tenants, users, plans, sample records
npm run dev:web                # Next.js dev (Turbopack) on http://localhost:3000
```

- `npm run dev` runs **web + AI backend together** via `concurrently` (`next dev --turbopack` + `node scripts/dev-api.mjs`). Use `npm run dev:web` for web-only.
- ⚠️ On **Windows**, `prisma generate` / `db push` can hit `EPERM` renaming the query-engine DLL if a dev server is holding it — stop `next dev` first, then run them.

## Run the AI backend locally (optional)
The FastAPI service in `backend/` is **separate** (own Python deps + own SQLAlchemy DB). `scripts/dev-api.mjs` launches it during `npm run dev`. To run it standalone:
```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # (or source .venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Needs (per `.do/app.yaml`): `OPENAI_API_KEY`, optionally `PINECONE_API_KEY` (RAG falls back to plain OpenAI if absent), `JWT_SECRET`/`SECRET_KEY`, `ALLOWED_ORIGINS`, its own `DATABASE_URL` (defaults to `sqlite:///./glimmora.db`). Without it, AI surfaces error or use their mock fallbacks; the rest of the app is unaffected.

## npm scripts (`package.json`)
| Script | Does |
|---|---|
| `dev` | web + AI backend together (concurrently) |
| `dev:web` / `dev:api` | web only / AI backend only |
| `build` / `start` | `next build` / `next start` |
| `lint` | `eslint .` |
| `db:seed` | `tsx prisma/seed.ts` |
| `db:studio` | Prisma Studio |
| `db:migrate` | `prisma migrate dev` — ⚠️ would try to manage `dev.db`; local convention is **`db push`**, not migrate (see below) |
| `db:reset` | `prisma migrate reset` — **destructive**, wipes `dev.db` |
| `test` / `test:smoke` | Playwright |

## Environment variables (`.env.example` → copy to `.env`)
| Var | Purpose |
|---|---|
| `DATABASE_URL` | SQLite path. Local: `file:./dev.db` (resolves to `prisma/dev.db`). Render: `file:/data/glimmora.db`. ⚠️ `.env.example` still mentions a Postgres URL — **stale**; SQLite is the decision (see below). |
| `NEXTAUTH_SECRET` | NextAuth signing secret. **Production refuses to boot** with the placeholder / empty / <32 chars. Generate: `openssl rand -base64 32`. Dev allows the placeholder. |
| `NEXTAUTH_URL` | Base URL (`http://localhost:3000` dev). |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail SMTP for transactional mail + MFA OTP. **Blank in dev → OTP code is logged to the server console** (no email sent). Production throws if missing. |
| `NEXT_PUBLIC_API_URL` | Public AI backend URL the browser uses (with `/api`). |
| `BACKEND_URL` | Server-side base for the AI proxy (no `/api`). DO sets this to the internal private URL. Dev defaults to `http://localhost:8000`. |
| `FILE_STORAGE_BACKEND` | `local` (`./uploads/`) or `do-spaces` (DO Spaces / S3). |
| `DO_SPACES_*` | endpoint/region/key/secret/bucket — required when `FILE_STORAGE_BACKEND=do-spaces`. |
| `KEYCLOAK_*` | optional OIDC (blank = disabled). **(unverified)** how wired. |
| (backend) `OPENAI_API_KEY`, `PINECONE_API_KEY`, `JWT_SECRET`/`SECRET_KEY`, `ALLOWED_ORIGINS` | AI backend only. |

## Seeded test credentials (`prisma/seed.ts`)
Run `npm run db:seed` first. All emails below are seeded with the noted password.

| Login | Password | Role |
|---|---|---|
| `superadmin@glimmora.com` (user `superadmin`) | `1` | super_admin (platform) |
| `admin@pharmaglimmora.com` (user `admin`) | `Admin@123` | customer_admin (demo tenant) |
| `admin@wellspring.test` | `Admin@123` | customer_admin (ESSENTIALS tenant) |
| `admin@helios.test` | `Admin@123` | customer_admin (ENTERPRISE tenant) |
| `admin@custompilot.test` | `Admin@123` | customer_admin (TAILORED tenant) |
| tenant users e.g. `ravi@wellspring.test`, `meera@helios.test`, `sana@custompilot.test` | `Admin@123` | qa_head / regulatory_affairs / csv_val_lead, etc. |

(The demo tenant also seeds users across all 9 roles, incl. `operations_head` (`suresh.kumar`) as a "non-author fixer". Passwords are reset on every seed run so re-seeding heals hash drift. **(unverified)** exact demo-user emails beyond those shown — read `prisma/seed.ts` lines ~196-208.)

## The database decision (READ THIS)

**SQLite is the committed database for ALL environments.** A PostgreSQL cutover (for DigitalOcean Managed Postgres) was attempted **and abandoned this session** in favor of SQLite. Current reality:

- `schema.prisma` provider = `sqlite`; `migration_lock.toml` = `sqlite`.
- **Local + Render** sync via **`prisma db push`** (Render runs it on every boot — `render.yaml` `startCommand: npx prisma db push && npm start`).
- A single clean **SQLite migration baseline** `prisma/migrations/20260629054845_init/` was regenerated this session (replacing the old Postgres-era migrations) so `prisma migrate deploy` also works on a fresh SQLite DB — this fixed **Bug 18** (the Support tables had no usable migration).
- ⚠️ **`dev.db` has no `_prisma_migrations` history** (built by `db push`), so `migrate deploy` against `dev.db` *itself* would fail. Local keeps using `db push`. To make an existing `db push` DB migrate-managed without data loss: `prisma migrate resolve --applied 20260629054845_init` (inserts a history row, creates no tables).
- **Why SQLite:** simplicity + a persistent-disk deploy with no managed-DB cost. Trade-off: single-writer, file-based — fine for the current scale; revisit if write concurrency grows.

## Deployment

### Render (current intended path) — `render.yaml`
- Web service on a **paid instance with a 1 GB persistent disk** mounted at `/data` (SQLite file + uploads live there, survive redeploys).
- `buildCommand: npm install && npx prisma generate && npm run build`
- `startCommand: npx prisma db push && npm start`
- `DATABASE_URL=file:/data/glimmora.db`, `FILE_STORAGE_BACKEND=local`. Secrets (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `BACKEND_URL`, `GMAIL_*`) set in the dashboard (`sync: false`).
- **Seed once** via the Render Shell after first deploy.

### DigitalOcean (`.do/app.yaml`) — LEGACY / abandoned
The repo still contains `.do/app.yaml` describing a DO App Platform deploy with **Managed PostgreSQL** + the FastAPI `api` service + DO Spaces. **The Postgres path was abandoned** — treat `.do/app.yaml`'s Postgres assumptions as stale. It remains useful for the **AI backend** service spec and Spaces config, but the web DB is SQLite now.

### CI — `.github/workflows/ci.yml`
Runs against SQLite. **(unverified)** current green/red state — confirm in GitHub Actions.

## Common gotchas
- **Windows `EPERM` on `prisma generate`** — stop `next dev`, retry.
- **AI backend `gpt-4o-mini`** (not gpt-4o as CLAUDE.md claims); RAG needs Pinecone or falls back.
- **MFA login** can't complete on the client yet (no OTP input) — don't enable MFA on a tenant you need to log into via the UI until that's wired (see [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md)).
