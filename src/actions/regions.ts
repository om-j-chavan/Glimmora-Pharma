"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveUserFk } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/permissions/roleSets";
import { getActiveRegions, getRegionLabelMap, type RegionOption } from "@/lib/queries";
import { isReservedRegion, deriveRegionValue, GLOBAL_REGION_VALUE } from "@/constants/regulatoryRegions";
import { sanitizeServerError } from "@/lib/errors";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Region reference data for client hydration (Item #3, Stage 2). Returns the
 * active dropdown options + the full value→label map (incl. archived). Regions
 * are platform reference data, not tenant-scoped, so no tenant gate applies —
 * any authenticated session may read them. On failure the underlying queries
 * fall back to the REGULATORY_REGIONS constant.
 */
export async function loadRegions(): Promise<{ active: RegionOption[]; labelMap: Record<string, string> }> {
  await requireAuth();
  const [active, labelMap] = await Promise.all([getActiveRegions(), getRegionLabelMap()]);
  return { active, labelMap };
}

/* ── Super Admin — Region CRUD (Item #3, Stage 3) ─────────────────────────────
 * Regions are platform reference data, so there is no tenant gate — but the CRUD
 * surface is Super-Admin-only, enforced here via isPlatformAdmin (never an inline
 * role string). The region VALUE is an IMMUTABLE key: add/edit-label/archive
 * never change it; a value change is archive-and-alias WITH reference re-pointing
 * (supersedeRegionValue). Every write is audit-first. */

/** Region values are codes (FDA, EMA, EMA_EU) — NOT lowercased slugs. Slug-safe =
 *  alphanumerics + dash/underscore, no spaces/punctuation, must start alnum. */
function isValidRegionValue(v: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(v);
}

async function regionActor(session: Awaited<ReturnType<typeof requireAuth>>) {
  return resolveUserFk(session.user.id, session.user.tenantId, session.user.role);
}

async function auditRegion(
  session: Awaited<ReturnType<typeof requireAuth>>,
  actor: Awaited<ReturnType<typeof resolveUserFk>>,
  action: string,
  regionId: string,
  label: string,
  oldValue: unknown,
  newValue: unknown,
  tx: Pick<typeof prisma, "auditLog"> = prisma,
) {
  await tx.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: actor.userId, userName: actor.displayName, userRole: actor.role,
      module: "Admin", action,
      recordId: regionId, recordTitle: label,
      oldValue: oldValue == null ? null : JSON.stringify(oldValue),
      newValue: newValue == null ? null : JSON.stringify(newValue),
    },
  });
}

export async function addRegion(input: { value: string; label: string }): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const value = (input?.value ?? "").trim();
  const label = (input?.label ?? "").trim();
  if (!value || !isValidRegionValue(value)) {
    return { success: false, error: "Enter a valid value (letters, numbers, dash or underscore).", fieldErrors: { value: ["Invalid value."] } };
  }
  if (label.length < 2) {
    return { success: false, error: "Label must be at least 2 characters.", fieldErrors: { label: ["Too short."] } };
  }
  const actor = await regionActor(session);
  try {
    // Unique across active + archived (value is @unique globally).
    const clash = await prisma.regulatoryRegion.findUnique({ where: { value }, select: { archivedAt: true } });
    if (clash) {
      return { success: false, error: `The value "${value}" already exists (${clash.archivedAt ? "archived" : "active"}).`, fieldErrors: { value: ["Already in use."] } };
    }
    const region = await prisma.regulatoryRegion.create({ data: { value, label } });
    await auditRegion(session, actor, "REGION_CREATED", region.id, label, null, { value, label });
    revalidatePath("/admin/regions");
    return { success: true, data: { id: region.id, value } };
  } catch (err) {
    console.error("[action] addRegion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to add region") };
  }
}

export async function editRegionLabel(id: string, input: { label: string }): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const label = (input?.label ?? "").trim();
  if (label.length < 2) {
    return { success: false, error: "Label must be at least 2 characters.", fieldErrors: { label: ["Too short."] } };
  }
  const actor = await regionActor(session);
  try {
    const existing = await prisma.regulatoryRegion.findUnique({ where: { id }, select: { label: true, value: true } });
    if (!existing) return { success: false, error: "Region not found" };
    if (existing.label === label) return { success: true, data: { id, unchanged: true } };
    // LABEL only — the value is deliberately absent from the update payload.
    await prisma.regulatoryRegion.update({ where: { id }, data: { label } });
    await auditRegion(session, actor, "REGION_UPDATED", id, label, { label: existing.label }, { label });
    revalidatePath("/admin/regions");
    return { success: true, data: { id } };
  } catch (err) {
    console.error("[action] editRegionLabel failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update region label") };
  }
}

/**
 * Create a region from the merged module's modal (Stage 2). The admin supplies a
 * NAME (required, unique) + optional DESCRIPTION; the immutable VALUE is DERIVED
 * from the name server-side (the readable REG-<VALUE> id follows from it). Value
 * must be unique across active + archived. Audit-first. Super-Admin-only.
 */
export async function createRegion(input: { name: string; description?: string }): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const name = (input?.name ?? "").trim();
  const description = (input?.description ?? "").trim() || null;
  if (name.length < 2) {
    return { success: false, error: "Region name must be at least 2 characters.", fieldErrors: { name: ["Too short."] } };
  }
  const value = deriveRegionValue(name);
  if (!value || !isValidRegionValue(value)) {
    return { success: false, error: "That name can't be turned into a valid region id — use letters or numbers.", fieldErrors: { name: ["Invalid name."] } };
  }
  const actor = await regionActor(session);
  try {
    // Duplicate-NAME guard (case-insensitive) — a clearer, name-based message
    // than the value-clash backstop below. SQLite has no case-insensitive
    // `equals`, so compare labels in code over the small region set.
    const nameLc = name.toLowerCase();
    const allRegions = await prisma.regulatoryRegion.findMany({ select: { label: true } });
    if (allRegions.some((r) => r.label.trim().toLowerCase() === nameLc)) {
      return { success: false, error: `A region named "${name}" already exists.`, fieldErrors: { name: ["A region with this name already exists."] } };
    }
    // Value is @unique globally (active OR archived) — so this also blocks a
    // duplicate name that derives to an existing value.
    const clash = await prisma.regulatoryRegion.findUnique({ where: { value }, select: { archivedAt: true } });
    if (clash) {
      return { success: false, error: `A region with the id "${regionIdOf(value)}" already exists (${clash.archivedAt ? "archived" : "active"}).`, fieldErrors: { name: ["Already in use."] } };
    }
    const region = await prisma.regulatoryRegion.create({ data: { value, label: name, description } });
    await auditRegion(session, actor, "REGION_CREATED", region.id, name, null, { value, label: name, description });
    revalidatePath("/admin/regions");
    return { success: true, data: { id: region.id, value } };
  } catch (err) {
    console.error("[action] createRegion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to add region") };
  }
}

/** Small helper so audit/error copy shows the readable id without importing the
 *  UI-layer displayIds into a server action. */
function regionIdOf(value: string): string {
  return `REG-${value}`;
}

/**
 * Update a region's NAME (label) + DESCRIPTION from the merged module's modal
 * (Stage 2). The VALUE is NEVER touched (immutable key). Audit-first.
 */
export async function updateRegion(id: string, input: { name: string; description?: string }): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const name = (input?.name ?? "").trim();
  const description = (input?.description ?? "").trim() || null;
  if (name.length < 2) {
    return { success: false, error: "Region name must be at least 2 characters.", fieldErrors: { name: ["Too short."] } };
  }
  const actor = await regionActor(session);
  try {
    const existing = await prisma.regulatoryRegion.findUnique({ where: { id }, select: { label: true, description: true, value: true } });
    if (!existing) return { success: false, error: "Region not found" };
    if (existing.label === name && (existing.description ?? null) === description) {
      return { success: true, data: { id, unchanged: true } };
    }
    // Duplicate-NAME guard (case-insensitive), excluding this region. Only when
    // the label actually changed.
    if (name.toLowerCase() !== existing.label.trim().toLowerCase()) {
      const others = await prisma.regulatoryRegion.findMany({ where: { id: { not: id } }, select: { label: true } });
      if (others.some((r) => r.label.trim().toLowerCase() === name.toLowerCase())) {
        return { success: false, error: `A region named "${name}" already exists.`, fieldErrors: { name: ["A region with this name already exists."] } };
      }
    }
    // LABEL + DESCRIPTION only — the value is deliberately absent from the payload.
    await prisma.regulatoryRegion.update({ where: { id }, data: { label: name, description } });
    await auditRegion(
      session, actor, "REGION_UPDATED", id, name,
      { label: existing.label, description: existing.description ?? "—" },
      { label: name, description: description ?? "—" },
    );
    revalidatePath("/admin/regions");
    return { success: true, data: { id } };
  } catch (err) {
    console.error("[action] updateRegion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to update region") };
  }
}

/**
 * PERMANENT delete of an ARCHIVED region (Stage 2), gated on the acting Super
 * Admin re-entering THEIR OWN password — verified SERVER-SIDE against the real
 * super_admin credential (Tenant.passwordHash; super_admin authenticates via the
 * Tenant table so session.user.id is their Tenant.id). Mirrors
 * deleteTenantWithPassword. Guards, in order:
 *   - reserved (GLOBAL) → never purgeable;
 *   - must be archived (only archived regions are purgeable);
 *   - must have ZERO references (Tenant.regulatoryRegion + FrameworkRegion) —
 *     Stage 3 auto-reassigns those to GLOBAL on archive, so a purge-ready region
 *     is clean; if any remain, block and name them;
 *   - password verified server-side (wrong password is itself audited).
 * Audit-first: REGION_PERMANENTLY_DELETED is written BEFORE the row is deleted.
 */
export async function permanentlyDeleteRegion(id: string, password: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const actor = await regionActor(session);
  const region = await prisma.regulatoryRegion.findUnique({ where: { id }, select: { value: true, label: true, archivedAt: true } });
  if (!region) return { success: false, error: "Region not found" };
  if (isReservedRegion(region.value)) {
    return { success: false, error: `"${region.label}" is a protected system region and can't be deleted.` };
  }
  if (!region.archivedAt) {
    return { success: false, error: "Only archived regions can be permanently deleted. Archive it first." };
  }
  // Zero-reference precondition (defence-in-depth; Stage 3 keeps it clean).
  const [tenantCount, fwCount] = await Promise.all([
    // Multi-region: references now live in the TenantRegion set (shim mirrors it).
    prisma.tenantRegion.count({ where: { region: region.value } }),
    prisma.frameworkRegion.count({ where: { region: region.value } }),
  ]);
  if (tenantCount || fwCount) {
    const parts: string[] = [];
    if (tenantCount) parts.push(`${tenantCount} tenant(s)`);
    if (fwCount) parts.push(`${fwCount} framework link(s)`);
    return { success: false, error: `Can't permanently delete "${region.label}" — it still has ${parts.join(" and ")} pointing at it.` };
  }
  // Server-side re-auth against the acting Super Admin's own credential.
  if (!password) return { success: false, error: "Enter your password to confirm." };
  const me = await prisma.tenant.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  const valid = !!me && (await bcrypt.compare(password, me.passwordHash));
  if (!valid) {
    await auditRegion(session, actor, "REGION_PURGE_DENIED", id, region.label, null, "wrong_password");
    return { success: false, error: "Incorrect password. Permanent delete cancelled." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      // Audit-first: write the record BEFORE the row disappears.
      await auditRegion(session, actor, "REGION_PERMANENTLY_DELETED", id, region.label, { value: region.value, status: "Archived" }, { status: "Deleted" }, tx);
      // Detach any lineage pointers so the delete never trips a self-FK.
      await tx.regulatoryRegion.updateMany({ where: { aliasOfId: id }, data: { aliasOfId: null } });
      await tx.regulatoryRegion.delete({ where: { id } });
    });
    revalidatePath("/admin/regions");
    return { success: true, data: { id } };
  } catch (err) {
    console.error("[action] permanentlyDeleteRegion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to permanently delete region") };
  }
}

/**
 * Read-only preview of what archiving a region will move (Stage 3). Powers the
 * confirmation dialog: the tenant names + framework-link count that will be
 * reassigned to GLOBAL. Super-Admin-only; no writes, no audit.
 */
export async function previewRegionArchive(id: string): Promise<ActionResult<{ label: string; reserved: boolean; tenants: string[]; frameworkLinks: number }>> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const region = await prisma.regulatoryRegion.findUnique({ where: { id }, select: { value: true, label: true } });
  if (!region) return { success: false, error: "Region not found" };
  const [trRows, frameworkLinks] = await Promise.all([
    // Multi-region: tenants whose SET includes this region (not just the shim).
    prisma.tenantRegion.findMany({ where: { region: region.value }, select: { tenant: { select: { name: true } } }, orderBy: { tenant: { name: "asc" } } }),
    prisma.frameworkRegion.count({ where: { region: region.value } }),
  ]);
  return { success: true, data: { label: region.label, reserved: isReservedRegion(region.value), tenants: trRows.map((r) => r.tenant.name), frameworkLinks } };
}

/**
 * Archive a region (Stage 3) — REVERSES the Phase-2 in-use block. Archiving an
 * in-use region now ARCHIVES it AND auto-reassigns every live reference to
 * GLOBAL, all-or-nothing in ONE $transaction:
 *   1. archivedAt = now on the region;
 *   2. remove <value> from every tenant's region SET (multi-region boundary):
 *      other regions are KEPT; GLOBAL is added ONLY when a tenant's set empties.
 *      The shim (regulatoryRegion) is re-derived only when the archived region was
 *      that tenant's primary. [FDA,EMA] losing EMA keeps [FDA], never flattens;
 *   3. every FrameworkRegion.region = <value> → "GLOBAL", with DEDUPE: if the
 *      framework already applies globally (appliesToAllRegions=true) OR already
 *      has a FrameworkRegion row for "GLOBAL", the link is DROPPED instead of
 *      re-pointed — otherwise the re-point would create a redundant GLOBAL row
 *      and violate @@unique([frameworkId, region]). Otherwise the row is moved.
 *   4. audit-first (atomic with the change): REGION_ARCHIVED +
 *      REGION_TENANTS_REASSIGNED (counts of tenants moved, links moved, links
 *      dropped). Finding.framework is NEVER touched.
 * The reserved GLOBAL region can never be archived (Stage 1 guard).
 */
export async function archiveRegion(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const actor = await regionActor(session);
  try {
    const region = await prisma.regulatoryRegion.findUnique({ where: { id }, select: { value: true, label: true, archivedAt: true } });
    if (!region) return { success: false, error: "Region not found" };
    // Reserved regions (GLOBAL) are permanent — never archivable (Stage 1). It is
    // the reassignment target for archiving other regions, so it must always exist.
    if (isReservedRegion(region.value)) {
      return { success: false, error: `"${region.label}" is a protected system region and can't be archived.` };
    }
    if (region.archivedAt) return { success: true, data: { id, alreadyArchived: true } };
    const value = region.value;

    const result = await prisma.$transaction(async (tx) => {
      // 1) Archive the region.
      await tx.regulatoryRegion.update({ where: { id }, data: { archivedAt: new Date() } });

      // 2) Multi-region boundary: remove ONLY this region from each tenant's set.
      //    Keep their other regions; add GLOBAL only if a set empties. Re-derive the
      //    shim only when the archived region was that tenant's primary.
      const affected = await tx.tenantRegion.findMany({ where: { region: value }, select: { tenantId: true } });
      const affectedIds = [...new Set(affected.map((a) => a.tenantId))];
      let tenantsReassigned = 0;
      let emptiedToGlobal = 0;
      if (affectedIds.length) {
        await tx.tenantRegion.deleteMany({ where: { region: value } });
        for (const tenantId of affectedIds) {
          const remaining = await tx.tenantRegion.findMany({ where: { tenantId }, select: { region: true }, orderBy: { region: "asc" } });
          if (remaining.length === 0) {
            // Set emptied → fall back to GLOBAL (set + shim together).
            await tx.tenantRegion.create({ data: { tenantId, region: GLOBAL_REGION_VALUE } });
            await tx.tenant.update({ where: { id: tenantId }, data: { regulatoryRegion: GLOBAL_REGION_VALUE } });
            emptiedToGlobal++;
          } else {
            // Other regions remain; only re-point the shim if the primary was archived.
            const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { regulatoryRegion: true } });
            if (t?.regulatoryRegion === value) {
              await tx.tenant.update({ where: { id: tenantId }, data: { regulatoryRegion: remaining[0].region } });
            }
          }
          tenantsReassigned++;
        }
      }

      // 3) Re-point framework links to GLOBAL, DROPPING redundant ones.
      const links = await tx.frameworkRegion.findMany({ where: { region: value }, select: { id: true, frameworkId: true } });
      let linksMoved = 0;
      let linksDropped = 0;
      if (links.length) {
        const frameworkIds = [...new Set(links.map((l) => l.frameworkId))];
        const [frameworks, existingGlobal] = await Promise.all([
          tx.framework.findMany({ where: { id: { in: frameworkIds } }, select: { id: true, appliesToAllRegions: true } }),
          tx.frameworkRegion.findMany({ where: { region: GLOBAL_REGION_VALUE, frameworkId: { in: frameworkIds } }, select: { frameworkId: true } }),
        ]);
        const isGlobalFlag = new Map(frameworks.map((f) => [f.id, f.appliesToAllRegions]));
        const hasGlobalLink = new Set(existingGlobal.map((g) => g.frameworkId));
        for (const link of links) {
          // A GLOBAL FrameworkRegion row is redundant when the framework already
          // applies to all regions, or already has a GLOBAL link.
          const redundant = isGlobalFlag.get(link.frameworkId) === true || hasGlobalLink.has(link.frameworkId);
          if (redundant) {
            await tx.frameworkRegion.delete({ where: { id: link.id } });
            linksDropped++;
          } else {
            await tx.frameworkRegion.update({ where: { id: link.id }, data: { region: GLOBAL_REGION_VALUE } });
            hasGlobalLink.add(link.frameworkId); // guard duplicate re-points (defensive)
            linksMoved++;
          }
        }
      }

      // 4) Audit-first (atomic with the writes).
      await auditRegion(session, actor, "REGION_ARCHIVED", id, region.label, { status: "Active" }, { status: "Archived" }, tx);
      if (tenantsReassigned || linksMoved || linksDropped) {
        await auditRegion(
          session, actor, "REGION_TENANTS_REASSIGNED", id, region.label,
          { region: value },
          { removedFrom: value, tenantsAffected: tenantsReassigned, emptiedToGlobal, frameworkLinksMoved: linksMoved, frameworkLinksDropped: linksDropped },
          tx,
        );
      }
      return { tenantsReassigned, emptiedToGlobal, frameworkLinksMoved: linksMoved, frameworkLinksDropped: linksDropped };
    });

    revalidatePath("/admin/regions");
    return { success: true, data: { id, ...result } };
  } catch (err) {
    console.error("[action] archiveRegion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to archive region") };
  }
}

export async function unarchiveRegion(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const actor = await regionActor(session);
  try {
    const region = await prisma.regulatoryRegion.findUnique({ where: { id }, select: { label: true, archivedAt: true } });
    if (!region) return { success: false, error: "Region not found" };
    if (!region.archivedAt) return { success: true, data: { id, alreadyActive: true } };
    await prisma.regulatoryRegion.update({ where: { id }, data: { archivedAt: null } });
    await auditRegion(session, actor, "REGION_UNARCHIVED", id, region.label, { status: "Archived" }, { status: "Active" });
    revalidatePath("/admin/regions");
    return { success: true, data: { id } };
  } catch (err) {
    console.error("[action] unarchiveRegion failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to un-archive region") };
  }
}

/**
 * Change a region's VALUE via archive-and-alias WITH reference re-pointing — the
 * inverse decision from framework key-supersede. The value is never mutated in
 * place: a NEW region row is created, the OLD is archived and linked forward
 * (old.aliasOfId → new), and EVERY current reference (Tenant.regulatoryRegion +
 * FrameworkRegion.region) is re-pointed to the new value — because those are
 * live CONFIG that must follow the rename (unlike immutable Finding.framework).
 * All-or-nothing in a single transaction. Hard-blocks value reuse.
 */
export async function supersedeRegionValue(oldId: string, input: { newValue: string }): Promise<ActionResult> {
  const session = await requireAuth();
  if (!isPlatformAdmin(session.user.role)) {
    return { success: false, error: "Only Super Admin can manage regions." };
  }
  const newValue = (input?.newValue ?? "").trim();
  if (!newValue || !isValidRegionValue(newValue)) {
    return { success: false, error: "Enter a valid new value (letters, numbers, dash or underscore).", fieldErrors: { newValue: ["Invalid value."] } };
  }
  const actor = await regionActor(session);
  try {
    const old = await prisma.regulatoryRegion.findUnique({ where: { id: oldId }, select: { value: true, label: true, archivedAt: true } });
    if (!old) return { success: false, error: "Region not found" };
    // Reserved regions (GLOBAL) have a permanent, immutable value — never
    // supersedable (Stage 1).
    if (isReservedRegion(old.value)) {
      return { success: false, error: `"${old.label}" is a protected system region — its value can't be changed.` };
    }
    if (old.archivedAt) return { success: false, error: "This region is archived — un-archive it before superseding its value." };
    if (newValue === old.value) {
      return { success: false, error: "The new value is the same as the current value.", fieldErrors: { newValue: ["Choose a different value."] } };
    }
    // Unique across active + archived (value is @unique globally).
    const clash = await prisma.regulatoryRegion.findUnique({ where: { value: newValue }, select: { archivedAt: true } });
    if (clash) {
      return { success: false, error: `The value "${newValue}" already exists (${clash.archivedAt ? "archived" : "active"}). Values must be unique across active and archived regions.`, fieldErrors: { newValue: ["Already in use."] } };
    }

    const result = await prisma.$transaction(async (tx) => {
      // a) NEW region — copy label from OLD.
      const created = await tx.regulatoryRegion.create({ data: { value: newValue, label: old.label } });
      // b) Archive OLD + link forward to successor (locked direction).
      await tx.regulatoryRegion.update({ where: { id: oldId }, data: { archivedAt: new Date(), aliasOfId: created.id } });
      // c) RE-POINT every live reference from oldValue → newValue. The region SET
      //    is the source of truth; the shim (regulatoryRegion) is renamed in step
      //    with it, so a tenant's primary stays primary (a pure rename never
      //    changes set membership, so no @@unique([tenantId, region]) collision).
      const trRes = await tx.tenantRegion.updateMany({ where: { region: old.value }, data: { region: newValue } });
      await tx.tenant.updateMany({ where: { regulatoryRegion: old.value }, data: { regulatoryRegion: newValue } });
      const fwRes = await tx.frameworkRegion.updateMany({ where: { region: old.value }, data: { region: newValue } });
      // d) Audit-first (inside the tx → atomic with the change).
      await auditRegion(
        session, actor, "REGION_VALUE_SUPERSEDED", created.id, old.label,
        { value: old.value },
        { value: newValue, tenantsRepointed: trRes.count, frameworkLinksRepointed: fwRes.count },
        tx,
      );
      return { oldValue: old.value, newValue, newId: created.id, tenantsRepointed: trRes.count, frameworkLinksRepointed: fwRes.count };
    });

    revalidatePath("/admin/regions");
    revalidatePath("/admin/frameworks");
    return { success: true, data: result };
  } catch (err) {
    console.error("[action] supersedeRegionValue failed:", err);
    return { success: false, error: sanitizeServerError(err, "Failed to supersede region value") };
  }
}
