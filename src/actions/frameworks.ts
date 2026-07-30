"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions/roleSets";
import { RESERVED_FRAMEWORK_KEYS } from "@/constants/frameworks";
import { effectiveFrameworksForTenant, getTenantFrameworkSettings, regionsEmptiedByDisabling, type TenantFrameworkSetting } from "@/lib/queries/frameworks";
import { getFrameworkAuditLogs, type FrameworkAuditResult, type FrameworkAuditScope } from "@/lib/queries";
import { sanitizeServerError } from "@/lib/errors";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Framework server actions (Phase 1). Every write is audit-first. Platform
 * catalog writes are Super-Admin-only (isPlatformAdmin — never an inline role
 * string check). Per-tenant enablement is scoped to the caller's own tenant.
 */

/* ── Client hydration source ──────────────────────────────────────────────
 * Read-only: the effective enabled framework list for the CALLER. Super Admin
 * has no tenant context (isPlatformAdmin) → the full platform-enabled catalog.
 * Everyone else → their tenant-scoped effective list. Not a write; no audit. */
export async function loadEffectiveFrameworks(): Promise<{ key: string; name: string }[]> {
  const session = await requireAuth();
  if (isPlatformAdmin(session.user.role)) {
    const rows = await prisma.framework.findMany({
      where: { platformEnabled: true, archivedAt: null }, // archived → invisible
      select: { key: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    return rows;
  }
  const list = await effectiveFrameworksForTenant(session.user.tenantId);
  return list.map((f) => ({ key: f.key, name: f.name }));
}

/* ── Customer Admin — Frameworks tab data (read) ──────────────────────────
 * Session-scoped: every platform-enabled + region-matched framework for the
 * caller's tenant, with its current per-tenant enabled state. The tab is
 * customer_admin-only; a platform admin (no tenant context) gets []. */
export async function loadTenantFrameworkSettings(): Promise<TenantFrameworkSetting[]> {
  const session = await requireAuth();
  if (isPlatformAdmin(session.user.role)) return [];
  return getTenantFrameworkSettings(session.user.tenantId);
}

/* ── Super Admin — framework activity (audit) view (read) ─────────────────
 * Read-only, cross-tenant slice of the immutable audit log scoped to the five
 * framework action codes. Super-Admin-only — gated via the shared isPlatformAdmin
 * helper (never an inline role string, and no tenant-status/plan gate that could
 * block the plan-less platform account). Creates no audit data. */
export async function loadFrameworkAuditLogs(
  opts: { page?: number; scope?: FrameworkAuditScope } = {},
): Promise<FrameworkAuditResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { rows: [], total: 0, page: 1, pageSize: 25 };
  }
  return getFrameworkAuditLogs({ page: opts.page, scope: opts.scope, pageSize: 25 });
}

/* ── Super Admin — catalog ────────────────────────────────────────────────── */

const AddFrameworkSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  appliesToAllRegions: z.boolean().default(true),
  // Region values (Tenant.regulatoryRegion strings) — only used when NOT global.
  regions: z.array(z.string().min(1)).optional(),
  // Optional grouping label (Item #5) — display metadata.
  category: z.string().optional(),
});

/** Slug base for a NEW custom framework key. Format: a lowercase kebab-case
 *  slug of the name — ASCII alphanumerics only, single hyphens between words,
 *  ≤40 chars, no leading/trailing hyphen (re-trimmed after the length cut so a
 *  40-char truncation can't leave a dangling "-"). Uniqueness (a "-2"/"-3" bump)
 *  and reserved-key avoidance are handled by allocateFrameworkKey. */
function baseSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "framework"
  );
}

/** Allocate a unique, non-reserved key from a base slug (uniqueness bump only —
 *  the reserved-collision case is rejected earlier in addFramework). */
async function allocateFrameworkKey(base: string): Promise<string> {
  for (let n = 0; n < 100; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    if (RESERVED_FRAMEWORK_KEYS.has(candidate)) continue; // never collide with reserved keys
    const clash = await prisma.framework.findUnique({ where: { key: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function addFramework(input: z.input<typeof AddFrameworkSchema>): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage the framework catalog." };
  }
  const parsed = AddFrameworkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Reserved-key collision guard (verify e): a name that slugs to one of the 9
  // reserved keys is REJECTED — those keys are the stable Finding.framework
  // contract and can only ever belong to the built-in frameworks.
  const base = baseSlug(parsed.data.name);
  if (RESERVED_FRAMEWORK_KEYS.has(base)) {
    return {
      success: false,
      error: "That name collides with a built-in framework key. Choose a different name.",
      fieldErrors: { name: ["Collides with a reserved framework key."] },
    };
  }
  // Duplicate-NAME guard (case-insensitive). Names aren't the immutable id, but
  // two frameworks sharing a display name is confusing, so block it. SQLite has
  // no case-insensitive `equals`, so compare in code over the small catalog.
  const newNameLc = parsed.data.name.trim().toLowerCase();
  const existingNames = await prisma.framework.findMany({ select: { name: true } });
  if (existingNames.some((f) => f.name.trim().toLowerCase() === newNameLc)) {
    return {
      success: false,
      error: `A framework named "${parsed.data.name.trim()}" already exists.`,
      fieldErrors: { name: ["A framework with this name already exists."] },
    };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const key = await allocateFrameworkKey(base);
    const global = parsed.data.appliesToAllRegions;
    const regions = global ? [] : [...new Set((parsed.data.regions ?? []).map((r) => r.trim()).filter(Boolean))];
    const category = parsed.data.category?.trim() || null;
    // Append new frameworks at the end of the manual order (Item #5).
    const maxOrder = (await prisma.framework.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
    const framework = await prisma.framework.create({
      data: {
        key,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        platformEnabled: true,
        appliesToAllRegions: global,
        category,
        sortOrder: maxOrder + 1,
        regions: global ? undefined : { create: regions.map((region) => ({ region })) },
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: "FRAMEWORK_CREATED",
        recordId: framework.id,
        recordTitle: framework.name,
        newValue: JSON.stringify({ key, appliesToAllRegions: global, regions, category }),
      },
    });
    revalidatePath("/admin/frameworks");
    return { success: true, data: { id: framework.id, key } };
  } catch (err) {
    console.error("[action] addFramework failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to add framework") };
  }
}

const EditFrameworkSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().optional(),
  appliesToAllRegions: z.boolean().default(true),
  // Region values (Tenant.regulatoryRegion strings) — only used when NOT global.
  regions: z.array(z.string().min(1)).optional(),
  // Optional grouping label (Item #5) — display metadata; "" clears it.
  category: z.string().optional(),
});

/**
 * Edit a framework's DISPLAY metadata + region scope. The stable `key` is NEVER
 * touched here (it is the immutable Finding.framework contract) — only name,
 * description, and the Global/FrameworkRegion scope change. Works for reserved
 * frameworks too: their labels are editable, their keys are not (there is no
 * code path that rewrites a key). Audit-first (FRAMEWORK_UPDATED, before/after
 * of the changed fields). Super-Admin-only via isPlatformAdmin — no inline role.
 */
export async function editFramework(
  id: string,
  input: z.input<typeof EditFrameworkSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage the framework catalog." };
  }
  const parsed = EditFrameworkSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const existing = await prisma.framework.findUnique({
      where: { id },
      include: { regions: { select: { region: true } } },
    });
    if (!existing) return { success: false, error: "Framework not found" };

    const name = parsed.data.name.trim();
    // Duplicate-NAME guard (case-insensitive), excluding this framework. Only
    // checked when the name actually changed.
    if (name.toLowerCase() !== existing.name.trim().toLowerCase()) {
      const others = await prisma.framework.findMany({ where: { id: { not: id } }, select: { name: true } });
      if (others.some((f) => f.name.trim().toLowerCase() === name.toLowerCase())) {
        return {
          success: false,
          error: `A framework named "${name}" already exists.`,
          fieldErrors: { name: ["A framework with this name already exists."] },
        };
      }
    }
    const description = parsed.data.description?.trim() || null;
    const category = parsed.data.category?.trim() || null;
    const global = parsed.data.appliesToAllRegions;
    const newRegions = global
      ? []
      : [...new Set((parsed.data.regions ?? []).map((r) => r.trim()).filter(Boolean))];
    if (!global && newRegions.length === 0) {
      return { success: false, error: "Select at least one region, or make the framework Global." };
    }
    const oldRegions = [...new Set(existing.regions.map((r) => r.region))].sort();
    const sortedNew = [...newRegions].sort();

    // Nothing to do — avoid a no-op audit entry.
    const unchanged =
      name === existing.name &&
      description === existing.description &&
      category === existing.category &&
      global === existing.appliesToAllRegions &&
      JSON.stringify(sortedNew) === JSON.stringify(oldRegions);
    if (unchanged) return { success: true, data: { id, unchanged: true } };

    // Update fields + reconcile the FrameworkRegion rows to match the submitted
    // scope. GLOBAL clears all specific-region rows; otherwise add/remove the
    // delta. The `key` is deliberately absent from the update payload.
    await prisma.$transaction(async (tx) => {
      await tx.framework.update({
        where: { id },
        data: { name, description, category, appliesToAllRegions: global },
      });
      if (global) {
        if (oldRegions.length) await tx.frameworkRegion.deleteMany({ where: { frameworkId: id } });
      } else {
        const toRemove = oldRegions.filter((r) => !sortedNew.includes(r));
        const toAdd = sortedNew.filter((r) => !oldRegions.includes(r));
        if (toRemove.length) await tx.frameworkRegion.deleteMany({ where: { frameworkId: id, region: { in: toRemove } } });
        if (toAdd.length) await tx.frameworkRegion.createMany({ data: toAdd.map((region) => ({ frameworkId: id, region })) });
      }
    });

    const scopeText = (isGlobal: boolean, regions: string[]) => (isGlobal ? "Global" : regions.join(", ") || "—");
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: "FRAMEWORK_UPDATED",
        recordId: id,
        recordTitle: name,
        oldValue: JSON.stringify({ name: existing.name, description: existing.description ?? "—", category: existing.category ?? "—", regionScope: scopeText(existing.appliesToAllRegions, oldRegions) }),
        newValue: JSON.stringify({ name, description: description ?? "—", category: category ?? "—", regionScope: scopeText(global, sortedNew) }),
      },
    });
    revalidatePath("/admin/frameworks");
    return { success: true, data: { id } };
  } catch (err) {
    console.error("[action] editFramework failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update framework") };
  }
}

export async function setFrameworkPlatformEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage the framework catalog." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const existing = await prisma.framework.findUnique({ where: { id }, select: { name: true, platformEnabled: true, key: true } });
    if (!existing) return { success: false, error: "Framework not found" };
    // Reserved built-ins are permanent — they can never be platform-disabled
    // (mirrors the guard in archiveFramework). Enabling a reserved key stays
    // allowed; this is additional to the ≥1-per-region guard below, not a
    // replacement. Runs before that guard so a reserved key returns this message.
    if (!enabled && RESERVED_FRAMEWORK_KEYS.has(existing.key)) {
      return { success: false, error: "Built-in (reserved) frameworks can't be disabled — they are permanent." };
    }
    // Stage 4 guard — every region must keep ≥1 active framework. Only on the
    // enabled→disabled transition, and only the REAL guard (server-side). Uses
    // the same active-for-region resolver the Stage-2 view uses, so the guard and
    // the displayed list never disagree. A GLOBAL framework empties EVERY region
    // it would leave with nothing; a region-specific one only its own region(s).
    if (!enabled && existing.platformEnabled) {
      const emptied = await regionsEmptiedByDisabling(id);
      if (emptied.length) {
        const names = emptied.map((r) => r.label).join(", ");
        const one = emptied.length === 1;
        return {
          success: false,
          error: `Can't disable “${existing.name}” — every region must keep at least one active framework. Disabling it would leave ${one ? names : `${emptied.length} region(s) (${names})`} with no active framework. Enable another framework for ${one ? "that region" : "those regions"} first.`,
        };
      }
    }
    const framework = await prisma.framework.update({ where: { id }, data: { platformEnabled: enabled } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Admin",
        action: enabled ? "FRAMEWORK_PLATFORM_ENABLED" : "FRAMEWORK_PLATFORM_DISABLED",
        recordId: id,
        recordTitle: existing.name,
        oldValue: String(existing.platformEnabled),
        newValue: String(enabled),
      },
    });
    revalidatePath("/admin/frameworks");
    return { success: true, data: framework };
  } catch (err) {
    console.error("[action] setFrameworkPlatformEnabled failed:", err);
    return { success: false, error: "Failed to update framework" };
  }
}

/**
 * Bulk platform enable/disable (Item #5). Applies the SAME audited platform
 * toggle to each selected framework — one FRAMEWORK_PLATFORM_ENABLED/DISABLED
 * audit row per framework whose state actually changes (no-ops are skipped, so
 * no audit noise). The effect is identical to N individual toggles: a bulk
 * disable propagates exactly like N single disables (gone from tenants + Gap
 * dropdown). Super-Admin-only via isPlatformAdmin.
 */
export async function bulkSetFrameworkPlatformEnabled(ids: string[], enabled: boolean): Promise<ActionResult<{ changed: number; skipped: number }>> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage the framework catalog." };
  }
  const unique = [...new Set((ids ?? []).filter(Boolean))];
  if (unique.length === 0) return { success: false, error: "No frameworks selected." };
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const rows = await prisma.framework.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, platformEnabled: true, key: true } });
    // Reserved built-ins can't be platform-disabled — reject the whole batch
    // (fail-closed, mirroring the single-toggle guard). Enabling is unaffected.
    if (!enabled) {
      const reserved = rows.filter((r) => RESERVED_FRAMEWORK_KEYS.has(r.key));
      if (reserved.length) {
        return { success: false, error: `Built-in (reserved) frameworks can't be disabled: ${reserved.map((r) => r.name).join(", ")}.` };
      }
    }
    const toChange = rows.filter((r) => r.platformEnabled !== enabled); // skip no-ops
    for (const r of toChange) {
      await prisma.framework.update({ where: { id: r.id }, data: { platformEnabled: enabled } });
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId, userName: actor.displayName, userRole: actor.role,
          module: "Admin",
          action: enabled ? "FRAMEWORK_PLATFORM_ENABLED" : "FRAMEWORK_PLATFORM_DISABLED",
          recordId: r.id, recordTitle: r.name,
          oldValue: String(r.platformEnabled), newValue: String(enabled),
        },
      });
    }
    revalidatePath("/admin/frameworks");
    return { success: true, data: { changed: toChange.length, skipped: rows.length - toChange.length } };
  } catch (err) {
    console.error("[action] bulkSetFrameworkPlatformEnabled failed:", err);
    return { success: false, error: "Failed to update frameworks" };
  }
}

/**
 * Move a framework one step up/down in the manual display order (Item #5) by
 * swapping its sortOrder with the adjacent framework in the current ordering.
 * Display metadata only — no key/enablement change. Audit-first
 * (FRAMEWORK_REORDERED, before/after sortOrder). Super-Admin-only.
 */
export async function reorderFramework(id: string, direction: "up" | "down"): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage the framework catalog." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    // Order over the ACTIVE catalog (what's displayed/ordered everywhere) so a
    // swap always moves relative to the visible neighbour. Archived rows keep
    // their sortOrder (irrelevant — they're excluded from tenant-facing reads).
    const all = await prisma.framework.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, sortOrder: true } });
    const idx = all.findIndex((f) => f.id === id);
    if (idx === -1) return { success: false, error: "Framework not found" };
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) return { success: true, data: { id, atEdge: true } };

    const a = all[idx];
    const b = all[swapIdx];
    // Swap sortOrder values in one transaction. If they tie (legacy 0s), fall
    // back to explicit neighbouring integers so the swap still reorders them.
    const aOrder = a.sortOrder === b.sortOrder ? (direction === "up" ? b.sortOrder - 1 : b.sortOrder + 1) : b.sortOrder;
    const bOrder = a.sortOrder;
    await prisma.$transaction([
      prisma.framework.update({ where: { id: a.id }, data: { sortOrder: aOrder } }),
      prisma.framework.update({ where: { id: b.id }, data: { sortOrder: bOrder } }),
      prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId, userName: actor.displayName, userRole: actor.role,
          module: "Admin", action: "FRAMEWORK_REORDERED",
          recordId: a.id, recordTitle: a.name,
          oldValue: JSON.stringify({ sortOrder: a.sortOrder }),
          newValue: JSON.stringify({ sortOrder: aOrder, movedBefore: direction === "up" ? b.name : undefined, movedAfter: direction === "down" ? b.name : undefined }),
        },
      }),
    ]);
    revalidatePath("/admin/frameworks");
    return { success: true, data: { id } };
  } catch (err) {
    console.error("[action] reorderFramework failed:", err);
    return { success: false, error: "Failed to reorder framework" };
  }
}

/**
 * Soft-archive a framework (Stage 2). Sets archivedAt=now → the resolver hides it
 * from every tenant (Customer tab + Gap dropdown), while the SA catalog still
 * lists it under Archived and a historical Finding tagged with its key still
 * resolves a label via this (retained) row. Audit-first. HARD-BLOCKS the 9
 * reserved keys — they are the immutable Finding.framework contract.
 */
export async function archiveFramework(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage the framework catalog." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const existing = await prisma.framework.findUnique({ where: { id }, select: { key: true, name: true, archivedAt: true } });
    if (!existing) return { success: false, error: "Framework not found" };
    if (RESERVED_FRAMEWORK_KEYS.has(existing.key)) {
      return { success: false, error: "Built-in (reserved) frameworks can't be archived — they are permanent." };
    }
    if (existing.archivedAt) return { success: true, data: { id, alreadyArchived: true } };

    await prisma.framework.update({ where: { id }, data: { archivedAt: new Date() } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId, userName: actor.displayName, userRole: actor.role,
        module: "Admin", action: "FRAMEWORK_ARCHIVED",
        recordId: id, recordTitle: existing.name,
        oldValue: JSON.stringify({ status: "Active" }),
        newValue: JSON.stringify({ status: "Archived" }),
      },
    });
    revalidatePath("/admin/frameworks");
    return { success: true, data: { id } };
  } catch (err) {
    console.error("[action] archiveFramework failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to archive framework") };
  }
}

/** Un-archive a framework (Stage 2): clears archivedAt → it returns to every
 *  tenant's effective list exactly as before (TenantFramework rows were left in
 *  place, so prior per-tenant enablement is preserved). Audit-first. */
export async function unarchiveFramework(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage the framework catalog." };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const existing = await prisma.framework.findUnique({ where: { id }, select: { name: true, archivedAt: true } });
    if (!existing) return { success: false, error: "Framework not found" };
    if (!existing.archivedAt) return { success: true, data: { id, alreadyActive: true } };

    await prisma.framework.update({ where: { id }, data: { archivedAt: null } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userId: actor.userId, userName: actor.displayName, userRole: actor.role,
        module: "Admin", action: "FRAMEWORK_UNARCHIVED",
        recordId: id, recordTitle: existing.name,
        oldValue: JSON.stringify({ status: "Archived" }),
        newValue: JSON.stringify({ status: "Active" }),
      },
    });
    revalidatePath("/admin/frameworks");
    return { success: true, data: { id } };
  } catch (err) {
    console.error("[action] unarchiveFramework failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to un-archive framework") };
  }
}

/**
 * Change a framework's key via ARCHIVE-AND-ALIAS (Stage 3) — NEVER an in-place
 * key mutation. Creates a NEW framework with the new key (copying name/desc/
 * platform status/region scope), archives the OLD row and points old.aliasOfId →
 * new (locked direction), and migrates per-tenant enablement to the new row. Old
 * findings keep their old key untouched and still resolve a label via the pure
 * frameworkLabel (prettified slug for custom keys). All-or-nothing in one
 * transaction. Hard-blocks reserved keys and any key reuse (active OR archived).
 */
export async function supersedeFrameworkKey(
  oldId: string,
  input: { newKey: string },
): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage the framework catalog." };
  }
  // Normalise to a canonical slug key so validation + storage are unambiguous.
  const newKey = baseSlug((input?.newKey ?? "").trim());
  if (!newKey) {
    return { success: false, error: "Enter a valid new key (letters, numbers, dashes).", fieldErrors: { newKey: ["Required."] } };
  }
  const actor = await resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
  try {
    const old = await prisma.framework.findUnique({
      where: { id: oldId },
      include: { regions: { select: { region: true } } },
    });
    if (!old) return { success: false, error: "Framework not found" };
    if (RESERVED_FRAMEWORK_KEYS.has(old.key)) {
      return { success: false, error: "Built-in (reserved) frameworks can't be superseded — their key is permanent." };
    }
    if (old.archivedAt) {
      return { success: false, error: "This framework is already archived — un-archive it first if you need to supersede it." };
    }
    if (RESERVED_FRAMEWORK_KEYS.has(newKey)) {
      return { success: false, error: `"${newKey}" is a built-in reserved key.`, fieldErrors: { newKey: ["Reserved key — choose another."] } };
    }
    if (newKey === old.key) {
      return { success: false, error: "The new key is the same as the current key.", fieldErrors: { newKey: ["Choose a different key."] } };
    }
    // key is @unique globally, so this single lookup covers BOTH active and
    // archived rows — keys are never reused, keeping historical resolution exact.
    const clash = await prisma.framework.findUnique({ where: { key: newKey }, select: { archivedAt: true } });
    if (clash) {
      return {
        success: false,
        error: `The key "${newKey}" is already in use (${clash.archivedAt ? "archived" : "active"}). Keys must be unique across active and archived frameworks.`,
        fieldErrors: { newKey: ["Already in use."] },
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      // a) NEW framework — copy display metadata + region scope from OLD.
      const created = await tx.framework.create({
        data: {
          key: newKey,
          name: old.name,
          description: old.description,
          platformEnabled: old.platformEnabled,
          appliesToAllRegions: old.appliesToAllRegions,
          regions: old.appliesToAllRegions ? undefined : { create: old.regions.map((r) => ({ region: r.region })) },
        },
      });
      // b) Archive OLD and link it forward to its successor (old.aliasOfId → new).
      await tx.framework.update({ where: { id: oldId }, data: { archivedAt: new Date(), aliasOfId: created.id } });
      // c) Migrate per-tenant enablement, preserving each tenant's enabled state.
      //    OLD's rows are left in place (harmless; OLD is archived → excluded).
      const oldTFs = await tx.tenantFramework.findMany({ where: { frameworkId: oldId }, select: { tenantId: true, enabled: true } });
      if (oldTFs.length) {
        await tx.tenantFramework.createMany({
          data: oldTFs.map((t) => ({ tenantId: t.tenantId, frameworkId: created.id, enabled: t.enabled })),
        });
      }
      // d) Finding.framework is deliberately NOT touched.
      // e) Audit-first (inside the tx so it's atomic with the change).
      await tx.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: actor.userId, userName: actor.displayName, userRole: actor.role,
          module: "Admin", action: "FRAMEWORK_KEY_SUPERSEDED",
          recordId: created.id, recordTitle: old.name,
          oldValue: JSON.stringify({ key: old.key, id: oldId }),
          newValue: JSON.stringify({ key: newKey, id: created.id }),
        },
      });
      return { oldId, oldKey: old.key, newId: created.id, newKey, migratedTenants: oldTFs.length };
    });

    revalidatePath("/admin/frameworks");
    return { success: true, data: result };
  } catch (err) {
    console.error("[action] supersedeFrameworkKey failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to supersede framework key") };
  }
}

/* ── Customer Admin — per-tenant enablement ───────────────────────────────── */

export async function setTenantFrameworkEnabled(frameworkId: string, enabled: boolean): Promise<ActionResult> {
  const session = await requireAuth();
  // Admin gate: customer_admin manages their own tenant; super_admin allowed too
  // (isPlatformAdmin covers the platform account per the shared-helper rule).
  if (session.user.role !== "customer_admin" && !isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Customer Admin can change frameworks." };
  }
  const tenantId = session.user.tenantId;
  const actor = await resolveUserFk(session.user.id, tenantId, session.user.role);
  try {
    // The framework must be platform-enabled (a disabled catalog entry cannot be
    // tenant-enabled). Tenant scope: the enablement row is keyed to THIS tenant.
    const framework = await prisma.framework.findFirst({
      where: { id: frameworkId, platformEnabled: true },
      select: { id: true, name: true, key: true },
    });
    if (!framework) return { success: false, error: "Framework not available." };

    await prisma.tenantFramework.upsert({
      where: { tenantId_frameworkId: { tenantId, frameworkId } },
      update: { enabled },
      create: { tenantId, frameworkId, enabled },
    });
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: actor.userId,
        userName: actor.displayName,
        userRole: actor.role,
        module: "Settings",
        action: enabled ? "TENANT_FRAMEWORK_ENABLED" : "TENANT_FRAMEWORK_DISABLED",
        recordId: frameworkId,
        recordTitle: framework.name,
        newValue: JSON.stringify({ key: framework.key, enabled }),
      },
    });
    revalidatePath("/settings");
    return { success: true, data: { frameworkId, enabled } };
  } catch (err) {
    console.error("[action] setTenantFrameworkEnabled failed:", err);
    return { success: false, error: "Failed to update framework setting" };
  }
}
