/**
 * Server-side auth helper.
 *
 * Provides `auth()` for Server Components and Server Actions
 * that returns the current session, and `requireAuth()` that
 * redirects to /login if not authenticated.
 *
 * This wraps the existing NextAuth v4 config so both the
 * Pages Router API routes and new Server Components can share
 * the same session.
 */

import { getServerSession } from "next-auth/next";
import { redirect } from "next/navigation";
import { authOptions } from "../../app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { canCreateAcrossSites } from "@/lib/permissions/roleSets";

// Re-export authOptions for use in API routes
export { authOptions };

export interface AuthSession {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    tenantId: string;
    gxpSignatory?: boolean;
  };
}

/**
 * Get current session in Server Components / Server Actions.
 * Returns null if not authenticated.
 */
export async function auth(): Promise<AuthSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const user = session.user as Record<string, unknown>;
  return {
    user: {
      id: (user.id as string) ?? "",
      name: (user.name as string) ?? "",
      email: (user.email as string) ?? "",
      role: (user.role as string) ?? "viewer",
      tenantId: (user.tenantId as string) ?? "",
      gxpSignatory: (user.gxpSignatory as boolean) ?? false,
    },
  };
}

/**
 * Require authentication — redirects to /login if no session.
 * Use in Server Components that must be protected.
 */
export async function requireAuth(): Promise<AuthSession> {
  const session = await auth();
  if (!session) redirect("/login");
  return session;
}

export type ResolveSiteResult =
  | { ok: true; siteId: string }
  | { ok: false; error: string };

/**
 * Enforce the SITE-FIELD rule server-side for the four Add flows (Gap /
 * Deviation / CSV / CAPA). Single authority so client and server can't drift:
 *
 *  - super_admin / customer_admin (canCreateAcrossSites) CHOOSE a site — the
 *    provided id is REQUIRED and validated to belong to the caller's tenant.
 *  - Every other role is AUTO-SCOPED to its OWN assigned site; the client-
 *    supplied siteId is IGNORED (defense in depth — never trust the client).
 *    The session token carries no siteId, so the actor's site is read from the
 *    User row. A non-admin with no site assignment is rejected with a clear
 *    message rather than silently creating a site-less record.
 *
 * Returns a discriminated result the ActionResult callers surface directly.
 */
export async function resolveCreateSiteId(
  session: AuthSession,
  providedSiteId: string | null | undefined,
): Promise<ResolveSiteResult> {
  const { id, role, tenantId } = session.user;

  if (canCreateAcrossSites(role)) {
    if (!providedSiteId) return { ok: false, error: "Site is required." };
    const site = await prisma.site.findFirst({
      where: { id: providedSiteId, tenantId },
      select: { id: true },
    });
    if (!site) return { ok: false, error: "Selected site is not part of your organization." };
    return { ok: true, siteId: site.id };
  }

  // Non-admins: ignore whatever the client sent; scope to the actor's own site.
  const user = await prisma.user.findFirst({
    where: { id, tenantId },
    select: { siteId: true },
  });
  if (!user?.siteId) {
    return { ok: false, error: "Your account is not assigned to a site. Contact your admin." };
  }
  return { ok: true, siteId: user.siteId };
}

/* ════════════════════════════════════════════════════════════════════
 * USER-FK RESOLUTION — AUDIT-GLOBAL-PATTERNS.md Finding #2 (CRITICAL)
 * ════════════════════════════════════════════════════════════════════
 * NextAuth resolves logins against TWO tables:
 *   • Tenant table — super_admin / customer_admin (route.ts authorize()
 *     "Path 1"). For these, `session.user.id` is a *Tenant.id*, NOT a row
 *     in the User table.
 *   • User table — site users (qa_head, csv_val_lead, …). For these,
 *     `session.user.id` IS a real User.id.
 *
 * Writing `session.user.id` straight into a `*ById` User foreign key
 * (createdById / completedById / capaDecisionById …) therefore throws a
 * FK-violation for admins — a latent crash class. `resolveUserFk` maps a
 * session id to a real User.id (or null for non-User actors) so callers
 * can populate (nullable) User FK columns safely.
 *
 * WHICH HELPER TO USE:
 *   • resolveUserFk()    — always: derive the actor's real User.id, display
 *                          name, and admin flags. Audit-log writers use the
 *                          resolution's displayName/role directly (audit
 *                          userId is a plain String, never blocks).
 *   • requireGxPAuthor() — before writing a GxP authorship record. Blocks
 *                          super_admin (platform admin manages tenants, does
 *                          not act inside them — project decision). It does
 *                          NOT block customer_admin, who currently has no
 *                          User row (Rung 3E Q-1F seed gap) and authors with
 *                          a null FK + name denorm — matching the long-
 *                          standing fda483 / systems behaviour for admins.
 * ════════════════════════════════════════════════════════════════════ */

/**
 * Canonical compliance-authoring role set — the roles permitted to author
 * CAPA-family GxP records (CAPA, action items, effectiveness criteria,
 * evidence) and Gap-assessment findings. Mirrors the values of
 * CAPA_WRITE_ROLES (capas/lifecycle.ts now re-exports this). super_admin is
 * listed for symmetry but is independently blocked from authorship by
 * requireGxPAuthor (Rung 3E.2). Other modules keep their own narrower
 * (SYSTEM_WRITE_ROLES) or broader ("not viewer") conventions — see Rung
 * 3A-bis Q-1F. Excludes: viewer, qc_lab_director, it_cdo, operations_head.
 */
// Canonical definitions now live in the shared, framework-agnostic role-set
// module (src/lib/permissions/roleSets.ts) so the client UI (usePermissions)
// and the server import the SAME values and can never drift. Re-exported here
// unchanged so every existing `@/lib/auth` importer keeps working.
//   COMPLIANCE_AUTHOR_ROLES — csv_val_lead, qa_head, regulatory_affairs,
//     customer_admin, super_admin (super_admin blocked at author-time by
//     requireGxPAuthor below). Excludes viewer, qc_lab_director, it_cdo,
//     operations_head.
//   ADMIN_DELETE_ROLES — customer_admin, super_admin (effective deleter is
//     customer_admin; super_admin blocked by requireGxPAuthor). Rung 3J.1.
export { COMPLIANCE_AUTHOR_ROLES, ADMIN_DELETE_ROLES } from "@/lib/permissions/roleSets";

export type UserFkResolution = {
  /** Real User.id, or null for non-User actors (platform/customer admin). */
  userId: string | null;
  /** Display name for denorm columns + audit logs. */
  displayName: string;
  /** Caller's role, echoed back for downstream checks. */
  role: string;
  /** super_admin || customer_admin — caller decides what to do with it. */
  isAdmin: boolean;
  /** super_admin specifically — blocked from GxP authorship. */
  isPlatformAdmin: boolean;
};

/**
 * Resolve a session principal to a User-table FK (or null), tenant-scoped.
 *
 * - Site user (id is a real User.id in this tenant): returns that id.
 * - super_admin: userId null, isPlatformAdmin true.
 * - customer_admin: tries a designated customer_admin User row in the tenant;
 *   if none exists (today's seed has none — see Rung 3E Q-1F), returns userId
 *   null and logs a one-line flag so the seed gap is fixable later.
 * - Any other unresolved role: userId null (defensive; shouldn't occur).
 */
export async function resolveUserFk(
  sessionUserId: string,
  tenantId: string,
  role: string,
): Promise<UserFkResolution> {
  // Site users authenticate against User — their session id IS a User.id.
  // Tenant-scoped lookup (hardening over the prior id-only findUnique copies).
  const user = await prisma.user.findFirst({
    where: { id: sessionUserId, tenantId },
    select: { id: true, name: true },
  });
  if (user) {
    return { userId: user.id, displayName: user.name, role, isAdmin: false, isPlatformAdmin: false };
  }

  if (role === "super_admin") {
    return { userId: null, displayName: "Platform Administrator", role, isAdmin: true, isPlatformAdmin: true };
  }

  if (role === "customer_admin") {
    // No User row for the acting tenant admin today (they authenticate as a
    // Tenant). Prefer a designated customer_admin User if the seed ever adds
    // one; otherwise author with a null FK + name denorm (project decision).
    const adminUser = await prisma.user.findFirst({
      where: { tenantId, role: "customer_admin" },
      select: { id: true, name: true },
    });
    if (adminUser) {
      return { userId: adminUser.id, displayName: adminUser.name, role, isAdmin: true, isPlatformAdmin: false };
    }
    console.warn(
      `[resolveUserFk] customer_admin (${sessionUserId}) has no User row in tenant ${tenantId}; ` +
        `authoring with a null User FK (name denorm preserved). Seed gap — AUDIT Finding #2 / Rung 3E Q-1F.`,
    );
    return { userId: null, displayName: "Customer Administrator", role, isAdmin: true, isPlatformAdmin: false };
  }

  return { userId: null, displayName: "Unknown user", role, isAdmin: false, isPlatformAdmin: false };
}

/**
 * Guard GxP record authorship: platform admins (super_admin) cannot author
 * GxP records — they manage tenants, they do not act inside them (project
 * decision). customer_admin IS allowed (authors with a null FK + name denorm
 * until the seed grows a customer_admin User row — Rung 3E Q-1F).
 *
 * Throws on a blocked actor; ActionResult-returning server actions catch it
 * and surface `err.message`. (No `asserts userId is string` narrowing: under
 * the Rung 3E "null FK + name denorm" decision, customer_admin legitimately
 * passes with a null userId, so narrowing would be unsound.)
 *
 * @see AUDIT-GLOBAL-PATTERNS.md Finding #2
 */
export function requireGxPAuthor(resolution: UserFkResolution): void {
  if (resolution.isPlatformAdmin) {
    throw new Error(
      "Platform admins cannot author GxP records. Please use a designated tenant user account.",
    );
  }
}
