# Pharma Glimmora

GxP / GMP inspection-readiness SaaS for pharma and biotech companies.

Built for compliance with **21 CFR 210/211/11**, **EU GMP Annex 11/15**, **ICH Q9/Q10**, **GAMP 5**, **WHO GMP**, and **MHRA** guidelines. Multi-tenant — each pharma customer is a separate tenant with its own users, sites, findings, CAPAs, deviations, FDA 483 events, validation programs, audit trail, and RAID log.

For deeper architectural detail, conventions, and module-by-module specs, read [CLAUDE.md](./CLAUDE.md) after this file.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router; Turbopack dev) |
| Language | TypeScript 5.9 |
| UI | React 19, Tailwind CSS v4, Lucide icons, Recharts |
| Forms | React Hook Form + Zod |
| Server state | Server Components + Server Actions; per-request `cache()` for reads |
| Client state | Redux Toolkit (ephemeral UI + tenant config mirror) |
| Auth | NextAuth v4 (Pages Router shim at `pages/api/auth/[...nextauth].ts`) |
| MFA | Email OTP via Nodemailer (Gmail SMTP) — tenant-level toggle |
| ORM | Prisma 6 (SQLite in dev: `prisma/dev.db`; switch via `DATABASE_URL`) |
| Testing | Playwright (e2e — see Testing section for current status) |
| Date | Day.js + utc/timezone/relativeTime plugins |

The auth route lives in the Pages Router (`pages/api/auth/[...nextauth].ts`) because next-auth v4 doesn't fully support App Router route handlers. Everything else is App Router.

---

## Prerequisites

- **Node.js 20 LTS or higher** (no `.nvmrc` yet — pin locally if you like)
- **npm 10+** (ships with Node 20)
- **SQLite** is bundled via Prisma; no separate install needed for dev
- **Gmail account with App Password** if you want real OTP email delivery in dev (otherwise the mailer logs codes to the console — see Email section)

---

## Setup

```bash
git clone <repo-url>
cd Glimmora-Pharma

npm install

cp .env.example .env
# Fill in NEXTAUTH_SECRET (see env section); GMAIL_* are optional in dev.

npx prisma migrate dev      # creates prisma/dev.db and applies all migrations
npm run db:seed             # populates seed users (see Test credentials)

npm run dev                 # starts on http://localhost:3000
```

First request bootstraps NextAuth's JWT session. Logged-out users are bounced to `/login` by `proxy.ts` (the centralized auth middleware).

---

## Environment variables

All variables are documented in [`.env.example`](./.env.example). Copy that file to `.env` and fill in real values.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Defaults to `file:./prisma/dev.db` for SQLite. Switch to a Postgres URL for staging/prod. |
| `NEXTAUTH_SECRET` | yes (prod) | **Production refuses to boot** with the placeholder, an empty value, or anything < 32 chars. Generate with: `openssl rand -base64 32`. Dev allows the placeholder. |
| `NEXTAUTH_URL` | yes | `http://localhost:3000` in dev. The full origin (including https://) in production. |
| `GMAIL_USER` | optional in dev, required in prod | Sender address for OTP emails. In dev with this unset, the mailer logs codes to the terminal instead of sending. |
| `GMAIL_APP_PASSWORD` | optional in dev, required in prod | A Gmail **App Password** — not the account password. Generate at: Google Account → Security → 2-Step Verification → App passwords. |
| `NEXT_PUBLIC_SITE_URL` | optional | Used by SEO metadata; falls back to `https://app.glimmora.com`. |

---

## npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server (Turbopack) on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run lint` | ESLint over the project |
| `npm run db:migrate` | `prisma migrate dev` — apply migrations + regenerate the client |
| `npm run db:seed` | Run `prisma/seed.ts` to populate baseline tenants/users/sites |
| `npm run db:studio` | Launch Prisma Studio (DB browser) |
| `npm run db:reset` | **Destructive.** Drop the DB, re-apply migrations, re-seed. Dev only. |
| `npm run test:mailer` | Smoke-test the Nodemailer setup. Usage: `npm run test:mailer -- you@example.com` |

There is no `npm test` script yet — Playwright tests are currently broken. See Testing.

---

## Project structure

```
Glimmora-Pharma/
├── app/                          # Next.js App Router
│   ├── (admin)/admin/            # Super admin + customer admin
│   ├── (app)/                    # Authenticated tenant routes
│   ├── login/                    # Public sign-in
│   ├── site-picker/              # Post-login site selector
│   └── layout.tsx                # Root layout
├── pages/                        # Pages Router (auth only)
│   └── api/
│       ├── auth/[...nextauth].ts # NextAuth Credentials provider + MFA flow
│       ├── auth/me.ts            # Session reader
│       └── debug-env.ts          # Dev-only diagnostic (404 in prod)
├── proxy.ts                      # Auth gating middleware (Next 16 "proxy")
├── prisma/
│   ├── schema.prisma             # 23 models — Tenant, User, CAPA, FDA483Event, etc.
│   ├── migrations/               # Migration history
│   ├── seed.ts                   # Baseline data
│   └── dev.db                    # Gitignored
├── src/
│   ├── modules/                  # 14 feature modules (capa, fda-483, csv-csa, ...)
│   ├── components/
│   │   ├── ui/                   # Button, Modal, Dropdown, Input, ...
│   │   ├── shared/               # Cross-feature widgets
│   │   ├── auth/                 # LoginPage, SitePicker
│   │   └── layout/               # AppShell, Sidebar
│   ├── actions/                  # Server actions (writes) — tenants, capas, findings, ...
│   ├── lib/
│   │   ├── prisma.ts             # Singleton Prisma client
│   │   ├── auth.ts               # auth() / requireAuth() helpers
│   │   ├── mailer.ts             # Nodemailer transport (server-only)
│   │   ├── otp.ts                # OTP generate/verify (server-only)
│   │   ├── queries/              # Server-side cached reads
│   │   └── mappers/              # Prisma row → app shape adapters
│   ├── store/                    # Redux slices
│   ├── hooks/                    # useAppSelector, useTenantData, useRole, ...
│   ├── types/                    # Cross-module type extractions
│   ├── schemas/                  # Centralized Zod schemas (under-utilized today)
│   └── constants/                # Status taxonomy, etc.
├── scripts/
│   └── test-mailer.ts            # Manual mailer smoke test
├── tests/
│   └── migration.spec.ts         # Playwright e2e (currently broken)
└── docs/                         # SOW, gap analysis, user manual
```

**Key conventions:**
- `src/actions/` → writes (`"use server"`, returns `ActionResult`); always paired with an audit-log entry.
- `src/lib/queries/` → reads (`cache()`-wrapped Prisma calls).
- Each Server Component page calls `requireAuth()` to obtain the session and uses `session.user.tenantId` to scope queries. Defense in depth: `proxy.ts` already gates the route.
- A subset of mutations enforces an additional **tenant scope check** before mutating by id (defense against IDOR; see Wave 1 in the migration history).

---

## Authentication & authorization

Two storage paths, one auth surface:

- **Tenant table** holds the `super_admin` (platform owner) and each `customer_admin` (per-customer admin) account.
- **User table** holds tenant-scoped users: `qa_head`, `regulatory_affairs`, `csv_val_lead`, `qc_lab_director`, `it_cdo`, `operations_head`, `viewer`. Each user belongs to exactly one tenant; emails are unique **per tenant** (not globally).

### Sign-in flow

1. Submit email + password to `/login`.
2. NextAuth's Credentials provider checks the Tenant table first, then the User table. `findMany` + length guard refuses to silently pick a row when an email matches multiple records (`AMBIGUOUS_EMAIL`).
3. Subscription gate: customer_admins and tenant users are blocked if their tenant has no active subscription. super_admin bypasses (they manage billing).
4. If the resolved tenant has `mfaEnabled = true` and the user is **not** super_admin, an OTP is generated, hashed (bcrypt cost 10), stored in the `EmailOTP` table, and emailed via Gmail SMTP. The login page opens an OTP modal. The modal re-calls `signIn` with the code; the server verifies with constant-time bcrypt compare.
5. JWT session: 8-hour lifetime, stamped at issue.

### Session invalidation (MFA toggle)

When a super_admin flips a tenant's MFA from off → on, `Tenant.sessionsValidAfter` is updated to `now()`. Every subsequent JWT decode (in the NextAuth `jwt` callback) re-checks the parent tenant's `sessionsValidAfter`; if `token.iat * 1000 < tenant.sessionsValidAfter`, the callback returns an empty token and the user is bounced to `/login`. Cost: one Prisma read per authenticated request (acceptable at current scale).

### Route gating

- `proxy.ts` (the Next 16 middleware) reads the JWT via `getToken` and:
  - Redirects no-token requests to `/login?callbackUrl=<original>`.
  - Restricts `/admin/*` to `super_admin` or `customer_admin` (everyone else → `/`).
- Pages still call `requireAuth()` for the session object (defense in depth and to obtain `tenantId` for scoped queries).
- Server actions always re-check via `requireAuth()` and, where mutating by id, perform a tenant-scope check before the write.

### Test credentials (seeded)

Run `npm run db:seed` then sign in with any of these:

| Role | Email | Password |
|---|---|---|
| Super admin | `superadmin@glimmora.com` | `1` |
| Customer admin | `admin@pharmaglimmora.com` | `Admin@123` |
| QA Head | `qa@pharmaglimmora.com` | `Demo@123` |
| Regulatory Affairs | `ra@pharmaglimmora.com` | `Demo@123` |
| CSV/Val Lead | `csv@pharmaglimmora.com` | `Demo@123` |
| QC/Lab Director | `qc@pharmaglimmora.com` | `Demo@123` |
| IT/CDO | `it@pharmaglimmora.com` | `Demo@123` |
| Operations Head | `ops@pharmaglimmora.com` | `Demo@123` |

These are also auto-fillable from the dev panel on `/login` ("Show dev credentials").

---

## Testing

**Honest current status:**

- The Playwright e2e suite at [`tests/migration.spec.ts`](./tests/migration.spec.ts) (16 tests) was **written against the previous Vite + React Router architecture** and is currently broken. Selectors and routes don't match the current Next.js + NextAuth flow.
- There are **no unit tests** (no Vitest/Jest installed).
- There is **no CI** running tests automatically yet.
- A rewrite to honest minimal smoke tests is planned (covers: login renders, login succeeds, logged-out `/capa` redirects to `/login`, MFA modal opens for an MFA-enabled tenant). See in-flight Wave 2 work.

For a new test of the MFA + mailer flow only, you can use the standalone smoke runner:

```bash
npm run test:mailer -- you@example.com
```

In dev with `GMAIL_*` unset, this prints the OTP code to the terminal. With creds set, it sends a real email.

---

## Deployment

- Set `NEXTAUTH_SECRET` to a real 32+ character base64 string. **The app refuses to boot in production with the `.env.example` placeholder, an empty value, or a string shorter than 32 characters.**
- Set `NEXTAUTH_URL` to the deployed origin (including `https://`).
- Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (App Password, not account password). Without these, the mailer module throws on first import in production.
- For Postgres: change `DATABASE_URL`, run `npx prisma migrate deploy` against the target DB.
- Vercel detects Next.js automatically via `vercel.json`.

The `/api/debug-env` route returns `404` in production (it only responds in dev/non-production). Useful for verifying which env vars Vercel sees on dev/preview deploys.

---

## Migration / architectural history

The codebase migrated from a Vite + React Router + Redux-data-slices SPA to Next.js App Router with server-first data fetching. The migration is partially complete: most modules read data via server queries and mutate via server actions, with Redux holding ephemeral UI state. A few modules still seed Redux from server props during a transition window (Dashboard, AGI Console, Settings — see [CLAUDE.md](./CLAUDE.md) for the per-module status).

For the chronological history of recent security and housekeeping waves (IDOR audit, e-signature gaps, etc.), see [MIGRATION-GUIDE.md](./MIGRATION-GUIDE.md).

---

## Further reading

- [CLAUDE.md](./CLAUDE.md) — full architectural conventions, design system, per-module specs, compliance rules.
- [docs/USER-MANUAL.md](./docs/USER-MANUAL.md) — end-user documentation.
- [docs/SOW-GAP-ANALYSIS.md](./docs/SOW-GAP-ANALYSIS.md) and [docs/SOW-OPEN-QUESTIONS.md](./docs/SOW-OPEN-QUESTIONS.md) — scope and outstanding decisions.
