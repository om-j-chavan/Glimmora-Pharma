# Server-First Migration Guide

## Overview

This guide documents the pattern for migrating Pharma Glimmora modules
from client-side Redux + mock data to server-first Next.js patterns.

## Current Architecture (Client-Side SPA)

```
User → App Router page.tsx ("use client")
     → Redux store (mock data / localStorage)
     → Module component (500+ lines, client)
     → useEffect + dispatch for data
```

## Target Architecture (Server-First)

```
User → App Router page.tsx (Server Component)
     → Prisma query (direct DB access)
     → Server Component renders HTML
     → Client islands for interactivity only
```

## Foundation Layer (DONE)

### `src/lib/auth.ts`
Server-side auth helper wrapping NextAuth v4:
- `auth()` — returns session or null
- `requireAuth()` — returns session or redirects to /login

### `src/lib/queries/`
Cached Prisma query functions using `React.cache()`:
- `getFindings(tenantId)` — all findings, newest first
- `getFinding(id, tenantId)` — single finding with tenant guard
- `getFindingStats(tenantId)` — computed stats for page header
- Same pattern for: capas, deviations, fda483, systems, governance, inspections

### `src/actions/findings.ts`
Reference Server Actions for Gap Assessment:
- `createFinding(input)` — validates with Zod, creates in Prisma, audit logs, revalidates
- `updateFinding(id, input)` — partial update with validation
- `deleteFinding(id)` — delete with tenant guard
- `closeFinding(id)` — status change shortcut

## Migration Pattern (Per Module)

### Step 1: Create Server Actions

```
src/actions/{module}.ts
```

Each action:
1. Calls `requireAuth()` for session
2. Validates with Zod schema
3. Mutates via Prisma
4. Creates audit log
5. Calls `revalidatePath()`
6. Returns `{ success, data }` or `{ success: false, error }`

### Step 2: Convert page.tsx to Server Component

```tsx
// app/(app)/gap-assessment/page.tsx
// NO "use client" — this is a Server Component

import { requireAuth } from "@/lib/auth";
import { getFindings } from "@/lib/queries";
import { GapPage } from "@/modules/gap-assessment/GapPage";

export default async function Page() {
  const session = await requireAuth();
  const findings = await getFindings(session+.user.tenantId);

  // Pass data as props — no Redux needed
  return <GapPage findings={findings} session={session} />;
}
```

### Step 3: Split module into server + client parts

Server Components (NO "use client"):
- Data display (tables, lists, cards)
- Static layout
- Stats that derive from props

Client Components ("use client"):
- Forms (need onChange, onSubmit)
- Modals (need useState for open/close)
- Interactive filters (need useState)
- Detail panels (need selection state)

### Step 4: Remove Redux slice

Only after verifying:
- Page loads data from Prisma (not Redux)
- Mutations use Server Actions (not dispatch)
- `revalidatePath` refreshes the data

Then delete:
- `src/store/{module}.slice.ts`
- Remove from `src/store/index.ts`
- Remove mock data import

## What NOT to Migrate

Keep Redux for:
- `theme.slice.ts` — dark/light mode (client-only)
- `notifications.slice.ts` — toast queue (client-only)
- `auth.slice.ts` — client session cache (until NextAuth v5)
- `settings.slice.ts` — org config cache

Keep as-is:
- `src/components/ui/` — pure presentational
- `src/components/shared/` — reusable wrappers
- `src/components/layout/AppShell.tsx` — stays client (has Sidebar, state)

## Files Created

```
src/lib/auth.ts              — Server auth helper
src/lib/queries/
  index.ts                   — Barrel export
  findings.ts                — Finding queries
  capas.ts                   — CAPA queries
  deviations.ts              — Deviation queries
  fda483.ts                  — FDA 483 queries
  systems.ts                 — CSV/CSA queries
  governance.ts              — RAID + Documents + Audit queries
  inspections.ts             — Inspection queries
src/actions/
  findings.ts                — Gap Assessment Server Actions
```
