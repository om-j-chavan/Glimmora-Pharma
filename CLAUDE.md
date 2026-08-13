# CLAUDE.md — Pharma Glimmora

This project's architecture is documented in [README.md](./README.md). Read that file before making changes.

## Key facts

- **Framework:** Next.js 16 App Router (Turbopack in dev), React 19, TypeScript 5.9.
- **Database:** Prisma 6 + SQLite (dev: `prisma/dev.db`) / PostgreSQL (CI + prod).
- **Auth:** NextAuth v4 Credentials provider with tenant-level email-OTP MFA. Handler at [app/api/auth/[...nextauth]/route.ts](./app/api/auth/[...nextauth]/route.ts). Server-side helpers in [src/lib/auth.ts](./src/lib/auth.ts).
- **AI service:** Separate FastAPI app in its **own repo** — `baarez-technology/pharma_glimmora_ai_backend`, branch `ai_develop`. OpenAI only; retrieval is an in-process embedding index over the approved SOP corpus (`app/rag/rag_service.py`) — Pinecone was removed. Reached via [app/api/ai-proxy/[...path]/route.ts](./app/api/ai-proxy/[...path]/route.ts). It is **not** vendored into this repo: a `backend/` copy used to live here and silently drifted months behind, so every newer AI endpoint 404'd in production. Deploy config for it lives in [.do/app.yaml](./.do/app.yaml) under the `api` service.
- **AI architecture — ALL AI execution is backend-side.** No AI SDK, provider call, prompt, embedding, vector query, model config, or credential may live in this repo's client code. The flow is `UI → Next.js route → FastAPI → LLM/Vector DB → back`.
  - **Credentials:** the browser holds none. [app/api/ai-proxy/[...path]/route.ts](./app/api/ai-proxy/[...path]/route.ts) authenticates the NextAuth session, mints a short-lived HS256 token ([src/lib/aiToken.server.ts](./src/lib/aiToken.server.ts), signed with `AI_JWT_SECRET` = the AI service's `SECRET_KEY`), and attaches it. Any client-supplied `auth` header is dropped. Never add a `NEXT_PUBLIC_` AI variable.
  - **Client code may only** call these routes and render the result. [src/lib/ai/index.ts](./src/lib/ai/index.ts) is the typed gateway; [src/lib/aiBackend.ts](./src/lib/aiBackend.ts) / [src/lib/aiChat.ts](./src/lib/aiChat.ts) are transport. None of them take a token.
  - **Degradation is the server's job.** Each AI route falls back deterministically in the AI service's `app/fallbacks/` and stamps `source: "backend" | "fallback"`; pass that to [`<AIBadge>`](./src/components/ai/AIBadge.tsx) so non-live output never wears the AI colour. Do not add a client-side fixture fallback — one existed (`src/lib/ai/mockData.ts`) and let the browser decide when an answer was real.
  - **Prisma is the single CAPA system of record.** The AI service used to own a
    parallel CAPA/RCA/action-plan/effectiveness/closure lifecycle in its own tables. It
    is gone: an LLM produced the effectiveness score and the flag that closed regulated
    records, no submit endpoint carried a role check, and the "electronic signature" was
    any non-blank string. The AI service is an **analysis service** — it reads what a BFF
    sends it and returns advice. Never give it lifecycle state again.
  - **Three BFF routes** exist because they add context only this app has:
    [app/api/ai/assistant/route.ts](./app/api/ai/assistant/route.ts) (tenant compliance
    figures), [app/api/ai/voice-chat/route.ts](./app/api/ai/voice-chat/route.ts) (same,
    for the spoken path — the two MUST stay behaviourally identical), and
    [app/api/ai/capa-recurrence/route.ts](./app/api/ai/capa-recurrence/route.ts) (the
    tenant's real closed CAPAs, read under the caller's session). Plus the proxy itself.
  - **AI agent policy is server state.** `TenantAgiPolicy` + [src/actions/agi-policy.ts](./src/actions/agi-policy.ts),
    enforced in the proxy via [src/lib/permissions/agiPolicy.ts](./src/lib/permissions/agiPolicy.ts).
    It was a localStorage Redux slice no server read, so disabling an agent disabled
    nothing. A new agent endpoint must be added to `AGENT_PATHS` or it is ungoverned.
  - **Every AI call is audited** through `app/observability/ai_trace.py` — wrap the work,
    the row is written on the way out, including on failure. Do not hand-place audit calls.
  - **`AI_JWT_SECRET` is required.** Both server routes and `suggestTriage` FAIL CLOSED (503) without it — they never forward an unidentified request. The AI service has no anonymous path in any environment, so an unattributed AI action is impossible by construction. Every AI call is written to `ai_audit_trail` with the real username + tenant.
  - **Deterministic ≠ AI.** The dashboard's compliance-signal panels ([ComplianceSignalsWidget](./src/modules/dashboard/widgets/ComplianceSignalsWidget.tsx)) are threshold rules over tenant records and are deliberately unbranded. Do not put an AI label, Sparkles/Bot icon, or fake latency on client-side logic — if it should be AI, give it a backend endpoint.
- **Compliance:** Part 11 e-signature ledger lives in the `SignedRecord` model in [prisma/schema.prisma](./prisma/schema.prisma); signing pipeline in [src/lib/signing.ts](./src/lib/signing.ts).
- **Writes:** Server Actions in [src/actions/](./src/actions/) — each compliance mutation pairs with an `auditLog()` entry.
- **Reads:** Cached Prisma queries in [src/lib/queries/](./src/lib/queries/) (React `cache()`-wrapped).

For per-module conventions, check each module's own `CLAUDE.md` (e.g. [src/modules/settings/CLAUDE.md](./src/modules/settings/CLAUDE.md)).
