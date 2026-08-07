"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk, requireGxPAuthor } from "@/lib/auth";
import { assertTenantOwnsParent } from "@/lib/tenantScope";
import { canWriteCSV } from "@/lib/permissions/roleSets";
import { deriveSiteCode, isReferenceConflict } from "@/lib/reference";
import { signOffLockError, signOffLockErrorForRtmEntry } from "@/lib/csv-signoff-lock";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateRTMSchema = z.object({
  systemId: z.string().min(1),
  ursId: z.string().min(1),
  ursRequirement: z.string().min(10),
  ursRegulation: z.string().optional(),
  ursPriority: z.enum(["critical", "high", "medium"]).default("high"),
  fsReference: z.string().optional(),
  dsReference: z.string().optional(),
  iqTestId: z.string().optional(),
  oqTestId: z.string().optional(),
  pqTestId: z.string().optional(),
});

const Result = z.enum(["pass", "fail", "pending", "na"]);
const UpdateRTMSchema = z.object({
  fsReference: z.string().optional(),
  dsReference: z.string().optional(),
  iqTestId: z.string().optional(),
  oqTestId: z.string().optional(),
  pqTestId: z.string().optional(),
  iqResult: Result.optional(),
  oqResult: Result.optional(),
  pqResult: Result.optional(),
  // RUNG 2.8 — the requirement text is now editable from the RTM modal.
  ursRequirement: z.string().min(10, "Requirement must be at least 10 characters").optional(),
  // RUNG 1 (Finding #6) — first wired field for updateRTMEntry.
  notes: z.string().max(2000).optional(),
  // NOTE: evidenceStatus / traceabilityStatus are NOT accepted from the
  // client — they are auto-derived server-side (Phase 9 #31) below.
});

/**
 * RUNG 2 (Phase 9 #31) — derive RTM coverage from the FS/IQ/OQ/PQ chain.
 * Coverage counts the 4 trace points (FS reference present; IQ/OQ/PQ have a
 * test id AND a PASS result). DS is treated as optional (not penalised).
 */
function deriveRtmCoverage(r: {
  fsReference?: string | null;
  iqTestId?: string | null; iqResult?: string | null;
  oqTestId?: string | null; oqResult?: string | null;
  pqTestId?: string | null; pqResult?: string | null;
}): { evidenceStatus: string; traceabilityStatus: string } {
  const fsOk = !!r.fsReference?.trim();
  const iqOk = !!r.iqTestId?.trim() && r.iqResult === "pass";
  const oqOk = !!r.oqTestId?.trim() && r.oqResult === "pass";
  const pqOk = !!r.pqTestId?.trim() && r.pqResult === "pass";
  const done = [fsOk, iqOk, oqOk, pqOk].filter(Boolean).length;
  if (done === 4) return { evidenceStatus: "complete", traceabilityStatus: "complete" };
  if (done > 0) return { evidenceStatus: "partial", traceabilityStatus: "partial" };
  return { evidenceStatus: "missing", traceabilityStatus: "broken" };
}

/**
 * Next per-site URS reference: URS-<SITE_CODE>-<NNNN> (4-digit, zero-padded,
 * sequential per site within the tenant). Mirrors the SYS allocator in
 * src/actions/systems.ts — RTMEntry has no tenantId column, so it scopes via
 * system.tenantId. Caller wraps create() in a P2002 retry loop (reference is
 * globally @unique). Throws past 9999.
 */
async function nextRtmReference(tenantId: string, prefix: string): Promise<string> {
  const latest = await prisma.rTMEntry.findFirst({
    where: { reference: { startsWith: `${prefix}-` }, system: { tenantId } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  let next = 1;
  const m = latest?.reference?.match(/-(\d+)$/);
  if (m) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  if (next > 9999) throw new Error(`URS reference sequence exhausted for ${prefix} (>9999).`);
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

export async function createRTMEntry(
  input: z.input<typeof CreateRTMSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateRTMSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // IDOR guard — verify the caller's tenant owns the parent system.
  // RTMEntry has no tenantId column (scopes via system.tenantId), so the
  // child row inherits its tenant from the verified parent at FK level.
  const parent = await assertTenantOwnsParent<{
    id: string;
    tenantId: string;
    name: string;
    siteId: string | null;
  }>(session, "gxpSystem", parsed.data.systemId, { name: true, siteId: true });
  if (!parent) return { success: false, error: "FORBIDDEN" };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  // canWriteQuality (not a bare viewer test) — customer_admin is read-only
  // outside Settings, so the tenant admin may view this module but never
  // write in it. super_admin is separately blocked by requireGxPAuthor.
  if (!canWriteCSV(session.user.role)) {
    return { success: false, error: "Your role does not permit this action." };
  }
  // C2 — post-sign-off lock. Adding a requirement changes the DENOMINATOR of
  // rtmCoverage, a hashed input: a new entry starts "broken", so appending one
  // to a signed system drops its attested coverage below 100%.
  {
    const locked = await signOffLockError(parsed.data.systemId);
    if (locked) return { success: false, error: locked };
  }
  try {
    // RUNG 2.8 — allocate a per-site URS-<SITE_CODE>-<NNNN> reference. Site.code
    // is canonical (same source as SYS references); name-derived fallback for a
    // misconfigured site so creation never blocks.
    const site = parent.siteId
      ? await prisma.site.findFirst({ where: { id: parent.siteId, tenantId: parent.tenantId }, select: { code: true, name: true } })
      : null;
    const siteCode = site?.code?.trim() || deriveSiteCode(site?.name);
    const prefix = `URS-${siteCode}`;

    const MAX_REF_RETRIES = 5;
    let entry: Awaited<ReturnType<typeof prisma.rTMEntry.create>> | null = null;
    for (let attempt = 0; attempt < MAX_REF_RETRIES; attempt++) {
      const reference = await nextRtmReference(parent.tenantId, prefix);
      try {
        entry = await prisma.rTMEntry.create({
          data: {
            ...parsed.data,
            reference,
            fsStatus: parsed.data.fsReference ? "linked" : "missing",
            dsStatus: parsed.data.dsReference ? "linked" : "na",
            evidenceStatus: "missing",
            traceabilityStatus: "broken",
          },
        });
        break;
      } catch (err) {
        if (isReferenceConflict(err) && attempt < MAX_REF_RETRIES - 1) continue;
        throw err;
      }
    }
    await prisma.auditLog.create({
      data: {
        tenantId: parent.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CSV/CSA",
        action: "RTM_ENTRY_CREATED",
        recordId: entry!.id,
        recordTitle: `${parent.name} — ${entry!.reference ?? parsed.data.ursId}`,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: entry };
  } catch (err) {
    console.error("[action] createRTMEntry failed:", err);
    return { success: false, error: "Failed to create RTM entry" };
  }
}

export async function updateRTMEntry(
  id: string,
  input: z.input<typeof UpdateRTMSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  // RUNG 2 (Phase 12) — viewers are read-only; any other compliance role may edit.
  // canWriteQuality (not a bare viewer test) — customer_admin is read-only
  // outside Settings, so the tenant admin may view this module but never
  // write in it. super_admin is separately blocked by requireGxPAuthor.
  if (!canWriteCSV(session.user.role)) {
    return { success: false, error: "Your role does not permit editing RTM entries." };
  }
  const parsed = UpdateRTMSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Load the current row (also enforces tenant scope) so coverage can be
  // derived from the merged FS/IQ/OQ/PQ state.
  const current = await prisma.rTMEntry.findFirst({
    where: session.user.role === "super_admin" ? { id } : { id, system: { tenantId: session.user.tenantId } },
    select: { fsReference: true, iqTestId: true, iqResult: true, oqTestId: true, oqResult: true, pqTestId: true, pqResult: true },
  });
  if (!current) return { success: false, error: "FORBIDDEN" };
  // C2 — post-sign-off lock. Editing FS/IQ/OQ/PQ re-derives traceabilityStatus,
  // which moves rtmCoverage — a hashed input.
  {
    const locked = await signOffLockErrorForRtmEntry(id);
    if (locked) return { success: false, error: locked };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    requireGxPAuthor(actor);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Not authorized to author GxP records." };
  }
  try {
    const merged = { ...current, ...parsed.data };
    const derived = deriveRtmCoverage(merged);
    const entry = await prisma.rTMEntry.update({
      where: { id },
      data: { ...parsed.data, ...derived },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "CSV/CSA",
        action: "RTM_ENTRY_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/csv-csa");
    return { success: true, data: entry };
  } catch (err) {
    console.error("[action] updateRTMEntry failed:", err);
    return { success: false, error: "Failed to update RTM entry" };
  }
}
