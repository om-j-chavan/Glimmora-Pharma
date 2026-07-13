# CLAUDE.md — Pharma Glimmora

This project's architecture is documented in [README.md](./README.md). Read that file before making changes.

## Key facts

- **Framework:** Next.js 16 App Router (Turbopack in dev), React 19, TypeScript 5.9.
- **Database:** Prisma 6 + SQLite (dev: `prisma/dev.db`) / PostgreSQL (CI + prod).
- **Auth:** NextAuth v4 Credentials provider with tenant-level email-OTP MFA. Handler at [app/api/auth/[...nextauth]/route.ts](./app/api/auth/[...nextauth]/route.ts). Server-side helpers in [src/lib/auth.ts](./src/lib/auth.ts).
- **AI service:** Separate FastAPI app under [backend/](./backend/) (OpenAI gpt-4o + Pinecone RAG). Reached via [app/api/ai-proxy/[...path]/route.ts](./app/api/ai-proxy/[...path]/route.ts).
- **Compliance:** Part 11 e-signature ledger lives in the `SignedRecord` model in [prisma/schema.prisma](./prisma/schema.prisma); signing pipeline in [src/lib/signing.ts](./src/lib/signing.ts).
- **Writes:** Server Actions in [src/actions/](./src/actions/) — each compliance mutation pairs with an `auditLog()` entry.
- **Reads:** Cached Prisma queries in [src/lib/queries/](./src/lib/queries/) (React `cache()`-wrapped).

For per-module conventions, check each module's own `CLAUDE.md` (e.g. [src/modules/settings/CLAUDE.md](./src/modules/settings/CLAUDE.md)).
