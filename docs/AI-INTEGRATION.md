# Pharma Glimmora — AI / API Integration Re-Implementation Guide

> Single-source rebuild doc. Hand this to one engineer. After running through it once, the app talks to the deployed FastAPI AI backend end-to-end (auth, chat, voice, CAPA lifecycle, audit, users) with **zero console errors** in dev. No other doc is required.
>
> Scope: this is a frontend (Next.js 16 App Router + React 19 + Redux Toolkit) integration. The backend is already deployed and is **not** modified here.

---

## 0. Why this doc exists

A force-push wiped a set of integration fixes. They are non-trivial because they involve:

1. A **same-origin Next.js proxy** to dodge CORS preflight failures when the Render free-tier backend cold-starts.
2. A **silent-404 pattern** for lifecycle-stage GETs that are *expected* to 404 before each stage is submitted (and a proxy-level 404→204 collapse so the browser stops logging them as errors).
3. Robust `detail` parsing for FastAPI errors (string / array / object shapes).
4. Lifecycle gating by `status` field, not the unreliable `stage` field.
5. Stage-status enum alignment with backend (`On Track | In Progress | Overdue | Completed`).
6. Removing a dead `POST /api/audit` client call that was 404’ing.
7. Token plumbing (`aiAccessToken`) on the Redux user record + helpers to read it everywhere.

Skip any of these and the dev console fills with red.

---

## 1. Backend reference

- **Upstream base URL**: `https://pharma-glimmora-ai-backend.onrender.com`
- **Swagger / OpenAPI**: `https://pharma-glimmora-ai-backend.onrender.com/docs`
- **Auth header**: protected endpoints take `auth: <access_token>` (NOT `Authorization: Bearer …`). The token is the `access_token` returned by `/api/v1/auth/login` or `/api/v1/auth/signup`.
- **Hosting**: Render free-tier. Cold starts take ~30–60s and intermittently break CORS preflight (`net::ERR_FAILED`). This is the single biggest reason we proxy.
- **Storage**: SQLite, non-persistent across cold starts → user list / CAPA list can vanish; treat it as ephemeral demo data.

### Endpoint map (all integrated)

| # | Router         | Method | Path                                              | Client function           | Used in                                                               |
|---|----------------|--------|---------------------------------------------------|---------------------------|-----------------------------------------------------------------------|
| 1 | auth           | POST   | `/api/v1/auth/signup`                             | `aiSignup`                | settings on user/tenant create, optional bootstrap                    |
| 2 | auth           | POST   | `/api/v1/auth/login`                              | `aiLogin`                 | `LoginPage` (silently refreshes `aiAccessToken` on every app sign-in) |
| 3 | ai             | POST   | `/api/ai/chat`                                    | `aiChatSend`              | `AIChatbot` (floating widget)                                         |
| 4 | ai             | GET    | `/api/ai/health`                                  | `aiHealth`                | `AiToolsPage` health card                                             |
| 5 | ai/voice       | POST   | `/api/ai/voice/transcribe`                        | `aiVoiceTranscribe`       | `AIChatbot` mic flow                                                  |
| 6 | ai/voice       | POST   | `/api/ai/voice/speak`                             | `aiVoiceSpeak`            | `AIChatbot` text-to-speech                                            |
| 7 | ai/voice       | POST   | `/api/ai/voice/chat`                              | `aiVoiceChat`             | `AIChatbot` one-shot voice round-trip                                 |
| 8 | ai/voice       | GET    | `/api/ai/voice/health`                            | `aiVoiceHealth`           | `AiToolsPage` health card                                             |
| 9 | capa           | POST   | `/api/v1/capa/create`                             | `capaCreate`              | `AIGenerateCAPAModal`                                                 |
| 10| capa           | GET    | `/api/v1/capa/all`                                | `capaListAll`             | `AiCapaIndex`                                                         |
| 11| capa           | GET    | `/api/v1/capa/customer/{cid}`                     | `capaListByCustomer`      | `AiCapaIndex` (when scoped to a customer)                             |
| 12| capa           | GET    | `/api/v1/capa/status/{id}`                        | `capaStatus`              | `AiCapaPage` — source of truth for lifecycle gating                   |
| 13| capa           | POST   | `/api/v1/capa/dismiss-alert`                      | `capaDismissAlert`        | `AiCapaIndex` recurrence-alert banner                                 |
| 14| rca            | POST   | `/api/v1/rca/submit`                              | `rcaSubmit`               | `AiCapaPage` RCA modal                                                |
| 15| rca            | GET    | `/api/v1/rca/capa/{id}`                           | `rcaByCapa`               | `AiCapaPage` (gated, silent-404)                                      |
| 16| rca            | GET    | `/api/v1/rca/status/{id}`                         | `rcaStatus`               | `AiCapaPage`                                                          |
| 17| action-plan    | POST   | `/api/v1/action-plan/submit`                      | `actionPlanSubmit`        | `AiCapaPage` Action Plan modal                                        |
| 18| action-plan    | GET    | `/api/v1/action-plan/capa/{id}`                   | `actionPlanByCapa`        | `AiCapaPage` (gated, silent-404)                                      |
| 19| action-plan    | GET    | `/api/v1/action-plan/status/{id}`                 | `actionPlanStatus`        | `AiCapaPage`                                                          |
| 20| monitoring     | POST   | `/api/v1/monitoring/check`                        | `monitoringCheck`         | `AiCapaPage` Monitoring modal                                         |
| 21| monitoring     | GET    | `/api/v1/monitoring/capa/{id}`                    | `monitoringByCapa`        | `AiCapaPage` (gated, silent-404)                                      |
| 22| monitoring     | GET    | `/api/v1/monitoring/status/{id}`                  | `monitoringStatus`        | `AiCapaPage`                                                          |
| 23| effectiveness  | POST   | `/api/v1/effectiveness/check`                     | `effectivenessCheck`      | `AiCapaPage` Effectiveness modal                                      |
| 24| effectiveness  | GET    | `/api/v1/effectiveness/capa/{id}`                 | `effectivenessByCapa`     | `AiCapaPage` (gated, silent-404)                                      |
| 25| effectiveness  | GET    | `/api/v1/effectiveness/status/{id}`               | `effectivenessStatus`     | `AiCapaPage`                                                          |
| 26| closure        | POST   | `/api/v1/closure/initiate`                        | `closureInitiate`         | `AiCapaPage` Closure modal                                            |
| 27| closure        | GET    | `/api/v1/closure/capa/{id}`                       | `closureByCapa`           | `AiCapaPage` (gated, silent-404)                                      |
| 28| closure        | GET    | `/api/v1/closure/status/{id}`                     | `closureStatus`           | `AiCapaPage`                                                          |
| 29| audit          | GET    | `/api/v1/audit/all`                               | `auditAll`                | `AuditTrailPage`                                                      |
| 30| audit          | GET    | `/api/v1/audit/record/{id}`                       | `auditRecord`             | `AuditTrailPage` record-drilldown                                     |
| 31| users          | GET    | `/api/v1/users/`                                  | `usersList`               | `AiToolsPage` (lists demo users from backend)                         |

Total: **31 endpoints** wired through one unified client.

---

## 2. Environment

### 2.1 `.env.local` (frontend)

```env
# Optional override. If unset:
#   - Browser uses /api/ai-proxy (same-origin) → no CORS, no preflight
#   - Server-side (Next route handlers / SSR) uses the upstream directly
# Set this ONLY if you want the browser to bypass the proxy (e.g. local backend).
# NEXT_PUBLIC_AI_API_URL=http://localhost:8000

# Legacy Vite var, kept for compatibility with the few old hooks under src/.
VITE_API_URL=http://localhost:4000/api
```

> The default is intentional: **do not** set `NEXT_PUBLIC_AI_API_URL` in production. Same-origin proxying is the whole point.

### 2.2 No backend env required

The deployed backend is already configured. We do not run a local backend.

---

## 3. Files to create / restore

All paths are relative to the repo root.

### 3.1 Same-origin proxy — `app/api/ai-proxy/[...path]/route.ts` (NEW)

```ts
import { NextRequest } from "next/server";

const AI_BASE = "https://pharma-glimmora-ai-backend.onrender.com";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${AI_BASE}/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("accept-encoding");
  let body: BodyInit | undefined;
  if (!["GET", "HEAD"].includes(req.method)) {
    const buf = await req.arrayBuffer();
    body = buf.byteLength ? buf : undefined;
  }
  let res: Response;
  try {
    res = await fetch(target, { method: req.method, headers, body, redirect: "manual" });
  } catch (err) {
    return new Response(JSON.stringify({ detail: `Proxy error: ${(err as Error).message}` }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
  const respHeaders = new Headers(res.headers);
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");
  // Lifecycle by-capa GETs 404 before a stage is submitted. Collapse to 204
  // so the browser doesn't paint a red line. Client treats both as "not started".
  if (
    res.status === 404 &&
    req.method === "GET" &&
    /^api\/v1\/(rca|action-plan|monitoring|effectiveness|closure)\/capa\//i.test(path.join("/"))
  ) {
    return new Response(null, { status: 204, headers: respHeaders });
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: respHeaders });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
```

Critical details:
- **`runtime = "nodejs"`**. Edge runtime cannot pass arbitrary headers (e.g. `auth`) reliably and breaks the multipart streams used by voice endpoints.
- **Header stripping**. `host`, `connection`, `content-length`, `accept-encoding` MUST be deleted from the forwarded request; otherwise undici rejects or double-counts. `content-encoding`/`content-length` must be stripped from the response or the browser will choke on decoded bodies.
- **Body**: only set for non-GET/HEAD AND only when the buffer is non-empty (some preflight-less POSTs from forms send empty bodies, which 500 if you pass a `Uint8Array(0)`).
- **404→204 collapse**: limited to `GET /api/v1/{rca|action-plan|monitoring|effectiveness|closure}/capa/...`. Do **not** widen this — a 404 on POST or on `*/status/{id}` is a real bug.

### 3.2 Auth client — `src/lib/aiAuth.ts`

Same code as the current file in repo. Key points to preserve verbatim:

- The base URL resolver:
  ```ts
  const AI_UPSTREAM = "https://pharma-glimmora-ai-backend.onrender.com";
  export const AI_API_BASE =
    process.env.NEXT_PUBLIC_AI_API_URL ??
    (typeof window === "undefined" ? AI_UPSTREAM : "/api/ai-proxy");
  ```
  *Browser → proxy, server → upstream, env override → both.*
- `postJson` takes a `silent` flag. The login call from `LoginPage` passes `silent=true` so an expected 401 (user has no AI account yet) is logged as `warn`, not `error`.
- `aiLogin(username, password, silent?)` and `aiSignup(body)` are the only exports. No tokens are stored here — that’s the caller’s job.
- `generateCustomerId()` returns `CUST_<8 hex>`, `generateUserId()` returns `USER-<8 hex>`. Used when creating tenants/users so the AI backend has consistent IDs.

### 3.3 Chat / voice client — `src/lib/aiChat.ts`

Key points:

- Re-export `AI_API_BASE` from `./aiAuth` so all three clients share **one** base. Never re-declare.
- `authedFetch(path, init, token)` injects `auth` header (not `Authorization`).
- `aiVoiceChat()` returns `{ audio: Blob, userText, aiReply, intent }` — text comes from CORS-exposed response headers `x-user-text`, `x-ai-reply`, `x-intent`. URI-decode each.
- `aiVoiceTranscribe()` and `aiVoiceChat()` send `multipart/form-data` with field name `audio`. Filename `speech.webm` if the Blob isn’t a File.
- `aiVoiceSpeak({ text, voice })` returns an audio Blob.
- `flattenDetail()` handles array-of-validation-errors *and* string detail. Object-detail handled by the richer flattener in `aiBackend.ts`.

### 3.4 Unified backend client — `src/lib/aiBackend.ts`

This is the main module the rest of the app imports. Re-exports `aiAuth` + `aiChat` so callers only need one import.

Critical pieces to preserve:

- **`AiBackendError`** — thrown on every non-2xx. Carries `status` and the parsed `body` so the UI can render a useful message.
- **`flattenDetail()`** — handles **three** shapes of FastAPI `detail`:
  1. `Array<{loc, msg}>` (pydantic validation errors)
  2. `string`
  3. `{ error?, message?, incomplete_fields?[] }` (custom CAPA backend errors). Joins them with ` — `.
- **`RequestOpts.silentStatuses?: number[]`** — statuses logged as `info` instead of `error`. Used by every `*ByCapa` GET (`silentStatuses: [404]`) and by `capaStatus` because we routinely poll a CAPA that doesn’t exist yet.
- **`request<T>()`** — single fetch wrapper. Always sets `Content-Type` for JSON bodies. Always sets `auth` header when token is present. Logs `→ sending`, `✓ status (Xms)`, `○ silent`, `✗ status (Xms) — detail`.
- **Function signatures** (do not rename — callers depend on these):
  - `capaCreate(input, token)` — sends **multipart**, not JSON. Fields: `customer_id, problem_statement, source, area_affected, equipment_product, initial_severity, document?`.
  - `capaListAll(token)`, `capaListByCustomer(customerId, token)`, `capaStatus(capaId, token)`, `capaDismissAlert(body, token)`.
  - `rcaSubmit({ capa_id, customer_id, rca_method, evidence? }, token)`, `rcaByCapa(id, token)`, `rcaStatus(id, token)`.
  - `actionPlanSubmit({ capa_id, customer_id, rca_id, actions: [{ action_description, responsible_person, due_date }] }, token)`, plus the two GETs.
  - `monitoringCheck({ capa_id, customer_id, action_plan_id, action_updates: [{ action_description, responsible_person, due_date, status, progress_note? }] }, token)`.
    - **`status` must be one of**: `On Track | In Progress | Overdue | Completed`. The earlier `Delayed | Blocked` values are **422** from the backend.
  - `effectivenessCheck({ capa_id, customer_id, action_plan_id, days_since_capa, evidence_items, trend_data, new_issues_reported, new_issue_details? }, token)`.
  - `closureInitiate({ capa_id, customer_id, effectiveness_id, approved_by, designation, electronic_signature, closure_rationale, related_capas_reviewed, document_changes_approved }, token)`.
  - `auditAll(token)`, `auditRecord(recordId, token)`.
  - `usersList()` (no token).
- **Selector helpers** (also live in this file):
  - `selectAiToken(state)` — reads `state.auth.user.aiAccessToken`, falling back to the tenant config’s user record. Returns `null` if not signed up.
  - `selectAiCustomerId(state)` — reads `state.auth.user.aiCustomerId`, falling back to the customer-admin’s `aiUserId` for that tenant, then `tenantId`.

### 3.5 Redux user/tenant fields

`src/store/auth.slice.ts` (or wherever the auth state lives) must keep these on the user record:

```ts
interface AuthUser {
  // … existing fields …
  aiUserId?: string;       // mirrors backend user_id (set on signup)
  aiAccessToken?: string;  // refreshed on every login
  aiCustomerId?: string;   // for non-admin users; admin's aiUserId
}
```

And on `LoginPage` success, dispatch a `setAiCredentials` that updates `aiAccessToken` (+ `aiUserId` / `aiCustomerId` on first login). The aiLogin call must be **silent** (`aiLogin(u, p, true)`) so 401s from users who never signed up to the AI backend don’t paint the console red.

### 3.6 Lifecycle page — `src/modules/ai-capa/AiCapaPage.tsx`

**The single biggest source of console noise pre-fix.** Required structure:

1. Fetch `capaStatus(id)` first.
2. Switch on `data.status` (NOT `data.stage`, which is unreliable):
   - `open` → only show CAPA detail + RCA modal CTA. Do **not** fetch the by-capa endpoints; they will all 404.
   - anything else → `Promise.allSettled` of `rcaByCapa`, `actionPlanByCapa`, `monitoringByCapa`, `effectivenessByCapa`, `closureByCapa` (all `silentStatuses: [404]`).
3. Render whichever stages came back populated.
4. Monitoring modal’s status `<select>` options must be exactly: `On Track`, `In Progress`, `Overdue`, `Completed`.

### 3.7 CAPA generation modal — `src/modules/capa/modals/AIGenerateCAPAModal.tsx`

- Zod schema enforces `problem_statement: z.string().min(10, "Describe the issue in at least 10 characters")` — backend rejects shorter inputs with a confusing 422.
- The `onSubmit` calls `capaCreate(input, token)` via the unified client (do **not** call `fetch` directly).
- Error toast pulls the message from `AiBackendError.message` (already flattened). Do not stringify `body` — the user sees structured JSON otherwise.

### 3.8 Audit lib — `src/lib/audit.ts`

**Remove** any `api.post("/audit", …)` call. The frontend audit trail is dispatched to Redux only; the AI backend has its own audit via `/api/v1/audit/all`. The dead POST was 404’ing on every CAPA close.

### 3.9 CAPA tracker — duplicate-key fix

`src/store/capa.slice.ts`:
- `addCAPA` reducer **upserts by `id`** instead of always pushing. Without this, React throws duplicate-key warnings when a CAPA created via AI is then re-emitted on refresh.

`src/modules/capa/tabs/CAPATrackerTab.tsx`:
- Derive `displayed` through a `Set`-based dedupe on `id` as a defensive belt-and-braces.

---

## 4. Logging convention

Every client logs three lines per call:

```
[aiBackend] POST /api/v1/capa/create → sending
[aiBackend] POST /api/v1/capa/create ✓ 200 (842ms) {...}
```

Failure variants:

```
[aiBackend] GET /api/v1/rca/capa/CAPA-2026-001 ○ 404 (123ms) — Not found     ← silent
[aiBackend] POST /api/v1/rca/submit ✗ 422 (98ms) — actions.0.due_date: invalid date
```

Symbols are deliberate: `→` sending, `✓` success, `○` silent (expected) failure, `✗` real failure. Grepping `✗` in console finds every actionable error.

---

## 5. Verification checklist

Run the dev server (`npm run dev`), open Chrome devtools console, and walk these flows. Expect **zero red lines** in the console at every step.

1. **Login** as a seeded user. Console shows `[aiAuth] POST /api/v1/auth/login ✓ 200`. If the user has no AI account yet, you’ll see one `warn` (not error) from the silent login.
2. **Dashboard** loads. No CORS errors. No `/api/audit` 404.
3. **AI CAPA → Create**. Submit the modal with a >10-char problem statement. Console shows `POST /api/v1/capa/create ✓`. CAPA appears in `/ai-capa` index without React duplicate-key warnings.
4. **Open the new CAPA**. `capaStatus` returns 200, `status: "open"`. No by-capa GETs fire.
5. **Submit RCA**. `POST /api/v1/rca/submit ✓`. Page now fans out to all five by-capa GETs; four return 204 (silent), one returns the RCA payload.
6. **Submit Action Plan**, **Monitoring** (with `On Track` status), **Effectiveness**, **Closure** in turn. Each stage’s modal accepts the form; the next stage unlocks. No 422s on Monitoring.
7. **/ai-tools** shows green for `aiHealth` and `aiVoiceHealth`.
8. **/audit-trail** loads `auditAll` without errors.
9. **AI Chatbot** floating button: text message round-trips; mic record → `voice/chat` round-trips with audio playback.

If any step shows red, do not declare done. Re-read §1 (`auth` header? same-origin proxy? `status` not `stage`?).

---

## 6. Known operational quirks

- **Render cold start**: first call after 15 min of idle can take 30–60 s. The proxy will sit waiting; just don’t set a tighter `timeout` on `fetch`.
- **SQLite reset**: Render free tier wipes the DB on every cold deploy. Demo CAPAs vanish. Re-seed via the UI.
- **Voice CORS**: only works through the proxy because the upstream doesn’t set `Access-Control-Expose-Headers` for `x-*` reliably. The proxy preserves them since it’s same-origin.
- **`stage` field**: the backend’s `stage` lags by one submit. Gate on `status` only.
- **Browser-native 4xx logs**: even with `silentStatuses`, the browser itself paints a red 404 line for cross-origin requests. The 404→204 proxy collapse is what actually keeps the console clean.

---

## 7. File-touch summary (for the implementer)

| File                                                            | Action                              |
|-----------------------------------------------------------------|-------------------------------------|
| `app/api/ai-proxy/[...path]/route.ts`                           | **Create** (verbatim from §3.1)     |
| `src/lib/aiAuth.ts`                                             | Ensure `AI_API_BASE` resolver + silent flag |
| `src/lib/aiChat.ts`                                             | Re-export `AI_API_BASE` from aiAuth |
| `src/lib/aiBackend.ts`                                          | Restore unified client + selectors  |
| `src/lib/audit.ts`                                              | Remove dead `api.post("/audit")`    |
| `src/store/auth.slice.ts`                                       | Add `aiUserId/aiAccessToken/aiCustomerId` to AuthUser |
| `src/store/capa.slice.ts`                                       | `addCAPA` upserts by id             |
| `src/modules/ai-capa/AiCapaPage.tsx`                            | Gate by-capa fetches on `status`    |
| `src/modules/ai-capa/AiCapaIndex.tsx`                           | Use `capaListAll`/`capaListByCustomer` |
| `src/modules/capa/modals/AIGenerateCAPAModal.tsx`               | Zod min(10) + `capaCreate` + error parsing |
| `src/modules/capa/tabs/CAPATrackerTab.tsx`                      | Defensive Set dedupe                |
| `src/components/auth/LoginPage.tsx`                             | Silent `aiLogin` after app login    |
| `.env.local`                                                    | Leave `NEXT_PUBLIC_AI_API_URL` unset in production |

Done correctly, this is reproducible from a clean clone in under an hour. If anything is unclear, the source of truth is the verbatim code in `aiBackend.ts`, `aiAuth.ts`, `aiChat.ts`, and the proxy route handler — copy them byte-for-byte before deviating.
