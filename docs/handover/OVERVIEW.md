# OVERVIEW

> Part of the `/docs/handover/` set. Start at [README.md](./README.md).
> Every claim here was verified against the code on branch `devAI` (this session). Anything not verifiable from code is marked **(unverified)**.

## What the app is

**Pharma Glimmora** is a multi-tenant SaaS **pharmaceutical quality-management / inspection-readiness platform**. It helps regulated drug manufacturers run GxP quality processes — gap assessments, CAPA (Corrective and Preventive Action), deviations, FDA 483 responses, CSV/CSA computer-system validation, change control, evidence/document control, and audit-trail/e-signature compliance — with an AI assistant layered on top.

It is a **B2B SaaS**: a platform operator (super_admin) provisions customer organizations ("tenants"), each on a subscription **Plan**; each tenant's quality staff (QA, regulatory, validation, ops) work their compliance records inside an isolated tenant scope.

## Who it's for

- **Platform operator** (`super_admin`) — provisions tenants, assigns/renews subscription plans, sees the cross-tenant admin console + support queue. Never authors GxP records (hard "GxP bright line").
- **Customer organizations (tenants)** — pharma manufacturers. Inside each tenant:
  - `customer_admin` — tenant admin (users, sites, settings).
  - `qa_head` — quality authority: reviews, approves, signs, closes compliance records.
  - `qc_lab_director`, `regulatory_affairs`, `csv_val_lead`, `it_cdo`, `operations_head` — quality/operational staff who author and work records.
  - `viewer` — read-only.
  - See [ROLES-AND-PERMISSIONS.md](./ROLES-AND-PERMISSIONS.md) for the full 9-role model.

## Compliance context (this is the whole point)

The product is built around **US FDA 21 CFR Part 11** (electronic records / electronic signatures) and **GxP** record-keeping. Concretely, in code:

- **Electronic signatures** — consequential actions (CAPA approve/verify/close, deviation close, FDA 483 response submit, document approval, change-control transitions, CSV sign-off) require **password re-authentication** and mint an immutable **`SignedRecord`** ledger row carrying a SHA-256 **content hash** of the canonicalized record state. See `src/lib/signing.ts` and [FLOWS.md](./FLOWS.md#part-11-e-signature-flow).
- **Audit trail** — every compliance mutation writes an **`AuditLog`** row (actor id/name/role, module, action, recordId, before/after JSON). See `src/lib/queries/governance.ts` (audit reads) and the `auditLog.create(...)` calls throughout `src/actions/`.
- **Soft-delete / retention** — GxP records are never hard-deleted; they carry `deletedAt/deletedById/deletedByName/deletionReason`. Evidence files carry `retainUntil = upload + 7 years` (the "Part 11 retention floor").
- **Segregation of Duties (SoD)** — enforced by **ID-based FK comparisons** (e.g. a CAPA verifier must differ from its creator and every approver; a deviation investigator must differ from the reporter). See [ROLES-AND-PERMISSIONS.md](./ROLES-AND-PERMISSIONS.md#segregation-of-duties-sod).

## High-level architecture

```
                          Browser (React 19 client components, Redux)
                                     │
                                     ▼
            ┌───────────────────────────────────────────────┐
            │   Next.js 16 App Router  (the "web" app)       │
            │                                                │
            │  • Server Components  ─ read via cached         │
            │    Prisma queries (src/lib/queries/*)          │
            │  • Server Actions     ─ writes return           │
            │    ActionResult + write AuditLog (src/actions/*)│
            │  • NextAuth v4 credentials + email-OTP MFA      │
            │  • proxy.ts  ─ edge auth gate                   │
            └───────────────┬───────────────────┬────────────┘
                            │                   │
                  Prisma 6  │                   │ HTTP (server-side proxy
                            ▼                   │  app/api/ai-proxy/*,
                   ┌──────────────────┐         │  JWT handoff)
                   │  SQLite database │         ▼
                   │  prisma/dev.db   │  ┌──────────────────────────┐
                   │  (file-based)    │  │  FastAPI AI backend       │
                   └──────────────────┘  │  (backend/ — Python)      │
                                         │  • OpenAI gpt-4o          │
                                         │  • Pinecone RAG           │
                                         │  • OWN SQLAlchemy DB       │
                                         │    (separate from Prisma) │
                                         └──────────────────────────┘
```

Three moving parts:

1. **Next.js web app** (this repo root) — the entire product UI + business logic + the Prisma/SQLite database. This is where ~all the code is.
2. **FastAPI AI backend** (`backend/`) — a **separate** Python service for AI features (OpenAI gpt-4o + Pinecone vector RAG). It has its **own SQLAlchemy database**, separate from the Prisma SQLite DB. The web app reaches it server-side through `app/api/ai-proxy/[...path]/route.ts` with a JWT handoff. **Out of scope for code changes** in this handover — documented for context only. See [FLOWS.md](./FLOWS.md#ai-request-path).
3. **SQLite database** — the committed database for **all** environments (a deliberate decision this session — see [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md) and [SETUP-AND-CONFIG.md](./SETUP-AND-CONFIG.md)). Managed via `prisma db push` locally + a regenerated SQLite migration baseline for deploys.

## Tech stack (versions from `package.json` / `backend/requirements.txt`)

### Web app (`package.json`)
| Area | Tech | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack dev) | ^16.2.4 |
| UI runtime | React / React-DOM | ^19.2.5 |
| Language | TypeScript | ~5.9.3 |
| ORM | Prisma + @prisma/client | ^6.19.3 |
| Database | SQLite (file-based) | — (via Prisma) |
| Auth | NextAuth | ^4.24.14 |
| State | Redux Toolkit + react-redux | ^2.11.2 / ^9.2.0 |
| Forms | react-hook-form + @hookform/resolvers | ^7.71.2 / ^5.2.2 |
| Validation | Zod | ^4.3.6 |
| Styling | Tailwind CSS v4 | ^4.2.1 |
| Charts | Recharts | ^3.8.0 |
| Icons | lucide-react | ^0.577.0 |
| Dates | dayjs | ^1.11.20 |
| Mail | nodemailer (Gmail SMTP, MFA OTP) | ^8.0.6 |
| Hashing | bcryptjs | ^3.0.3 |
| File storage | @aws-sdk/client-s3 (DO Spaces) or local FS | ^3.1046 |
| Tests | Playwright | ^1.59.1 |
| Lint | ESLint 9 + typescript-eslint | ^9.39 / ^8.56 |

### AI backend (`backend/requirements.txt`)
| Tech | Version |
|---|---|
| FastAPI | 0.115.0 |
| Uvicorn | 0.30.6 |
| SQLAlchemy | 2.0.36 |
| OpenAI SDK | 1.30.0 |
| Pinecone | >=5.0.0 |
| Pydantic | 2.8.2 |
| PyJWT | 2.8.0 |
| psycopg2-binary | >=2.9.9 (its own DB driver — separate from the web app's SQLite) |

## Where to go next
- Find your way around the code → [CODEBASE-MAP.md](./CODEBASE-MAP.md)
- The data model → [SCHEMA.md](./SCHEMA.md)
- What each feature does and its state → [MODULES.md](./MODULES.md)
- How requests flow → [FLOWS.md](./FLOWS.md)
- Run it locally → [SETUP-AND-CONFIG.md](./SETUP-AND-CONFIG.md)
- Current state, what's next, the deviation redesign → [STATUS-AND-BACKLOG.md](./STATUS-AND-BACKLOG.md)
