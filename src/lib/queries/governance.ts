import { cache } from "react";
import { Prisma, type AuditLog } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { frameworkLabel } from "@/constants/frameworks";

export const getRAIDItems = cache(async (tenantId: string) => {
  return prisma.rAIDItem.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
});

export const getDocuments = cache(async (tenantId: string) => {
  // Soft-deleted documents are retained but hidden from the library view.
  return prisma.document.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
});

/* ── Platform audit: server-side paginated + filtered feed ─────────────────
   Backs the super_admin /admin/audit view. Scope is preserved — rows are
   always `where.tenantId === <caller's platform tenantId>` (platform events
   TENANT_/PLAN_/MFA_ are logged under the super_admin's own tenant). The
   AFFECTED account (recordId → Tenant) is resolved for DISPLAY only; that
   spans tenants but never widens which rows are returned. Filtering AND
   pagination run in the database (the AuditLog table can be large). */

export interface PlatformAuditFilters {
  /** Exact audit action string (e.g. "TENANT_SUSPENDED"). */
  action?: string;
  /** Actor contains-match against the denormalised userName. */
  username?: string;
  /** Affected account = the tenant id stored in recordId. */
  accountId?: string;
  /** Inclusive date range (YYYY-MM-DD) on createdAt. */
  dateFrom?: string;
  dateTo?: string;
  /** Free-text across target/entity + action + actor. */
  search?: string;
}

/** An AuditLog row enriched with the joined actor username + affected account
 *  name. Both are id→label lookups scoped to the current page's rows only. */
export type PlatformAuditRow = AuditLog & {
  /** Actor's login username (AuditLog.userId → User.username), or null. */
  username: string | null;
  /** Affected organisation name (AuditLog.recordId → Tenant.name), or null. */
  accountName: string | null;
};

export interface PlatformAuditResult {
  rows: PlatformAuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

export const getPlatformAuditLogs = cache(async (
  tenantId: string,
  opts: { page?: number; pageSize?: number; filters?: PlatformAuditFilters } = {},
): Promise<PlatformAuditResult> => {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const f = opts.filters ?? {};

  // Scope pin — never widened. Filters only ever narrow this.
  const where: Prisma.AuditLogWhereInput = { tenantId };
  if (f.action) where.action = f.action;
  if (f.accountId) where.recordId = f.accountId;
  if (f.username?.trim()) where.userName = { contains: f.username.trim() };
  if (f.dateFrom || f.dateTo) {
    where.createdAt = {};
    if (f.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(`${f.dateFrom}T00:00:00.000Z`);
    if (f.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(`${f.dateTo}T23:59:59.999Z`);
  }
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.OR = [
      { recordTitle: { contains: q } },
      { recordId: { contains: q } },
      { userName: { contains: q } },
      { action: { contains: q } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    // Same `where` as the findMany so the total honestly reflects the filtered
    // population (Part-11 honest-display).
    prisma.auditLog.count({ where }),
  ]);

  // Resolve actor username (userId → User.username) and affected account name
  // (recordId → Tenant.name) for THIS page's rows only — no roster is loaded.
  const userIds = [...new Set(logs.map((l) => l.userId).filter((v): v is string => !!v))];
  const recordIds = [...new Set(logs.map((l) => l.recordId).filter((v): v is string => !!v))];
  const [users, tenants] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : Promise.resolve([] as { id: string; username: string }[]),
    recordIds.length
      ? prisma.tenant.findMany({ where: { id: { in: recordIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.username]));
  const accountMap = new Map(tenants.map((t) => [t.id, t.name]));

  const rows: PlatformAuditRow[] = logs.map((l) => ({
    ...l,
    username: (l.userId ? userMap.get(l.userId) : undefined) ?? null,
    accountName: (l.recordId ? accountMap.get(l.recordId) : undefined) ?? null,
  }));

  return { rows, total, page, pageSize };
});

/** Distinct audit action strings present for a tenant — powers the Action
 *  filter dropdown (labels resolved client-side via auditEventLabel). */
export const getPlatformAuditActions = cache(async (tenantId: string): Promise<string[]> => {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
});

/* ── Framework activity (audit) view ──────────────────────────────────────
   A read-only, framework-scoped slice of the immutable audit log for the
   Super Admin Frameworks page. Unlike getPlatformAuditLogs (pinned to a single
   tenant), this spans tenants BY DESIGN: platform catalog events are logged
   under the platform account, while TENANT_FRAMEWORK_* events are logged under
   each CUSTOMER tenant. A single-tenant scope would therefore miss the
   per-tenant enable/disable events. This is a super-admin-only surface — the
   caller (loadFrameworkAuditLogs) gates access via isPlatformAdmin. Display
   only: nothing here mutates or creates audit data. */

/** The framework action codes emitted by src/actions/frameworks.ts, plus the
 *  region-management codes from src/actions/regions.ts (Item #3) — both are
 *  platform-config events surfaced in this Activity view. */
const PLATFORM_FRAMEWORK_ACTIONS = [
  "FRAMEWORK_CREATED", "FRAMEWORK_UPDATED", "FRAMEWORK_REORDERED", "FRAMEWORK_PLATFORM_ENABLED", "FRAMEWORK_PLATFORM_DISABLED", "FRAMEWORK_ARCHIVED", "FRAMEWORK_UNARCHIVED", "FRAMEWORK_KEY_SUPERSEDED",
  "REGION_CREATED", "REGION_UPDATED", "REGION_ARCHIVED", "REGION_UNARCHIVED", "REGION_VALUE_SUPERSEDED",
] as const;
const TENANT_FRAMEWORK_ACTIONS = ["TENANT_FRAMEWORK_ENABLED", "TENANT_FRAMEWORK_DISABLED"] as const;
const ALL_FRAMEWORK_ACTIONS = [...PLATFORM_FRAMEWORK_ACTIONS, ...TENANT_FRAMEWORK_ACTIONS];
const TENANT_FRAMEWORK_ACTION_SET = new Set<string>(TENANT_FRAMEWORK_ACTIONS);

/** Light action-type filter for the Activity view. */
export type FrameworkAuditScope = "all" | "platform" | "tenant";

export type FrameworkAuditRow = PlatformAuditRow & {
  /** Human framework name/label (recordTitle, or frameworkLabel(key) — reserved
   *  keys always resolve to their canonical label). */
  frameworkName: string;
  /** For TENANT_FRAMEWORK_* — the tenant the change applied to (row.tenantId →
   *  Tenant.name). Null for platform-wide catalog events. Mirrors accountName so
   *  the reused AuditDetailModal renders "Tenant: <name>" for tenant events. */
  tenantName: string | null;
};

export interface FrameworkAuditResult {
  rows: FrameworkAuditRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Pull the framework `key` out of a captured newValue payload, if present
 *  (FRAMEWORK_CREATED / TENANT_FRAMEWORK_* store {key,…}; the platform toggle
 *  stores a bare boolean). Never throws — audit payloads vary. */
function frameworkKeyOf(newValue: string | null): string | null {
  if (!newValue) return null;
  try {
    const p: unknown = JSON.parse(newValue);
    if (p && typeof p === "object" && !Array.isArray(p)) {
      const k = (p as Record<string, unknown>).key;
      return typeof k === "string" && k ? k : null;
    }
  } catch { /* bare scalar (e.g. "true") — no key */ }
  return null;
}

export const getFrameworkAuditLogs = cache(async (
  opts: { page?: number; pageSize?: number; scope?: FrameworkAuditScope } = {},
): Promise<FrameworkAuditResult> => {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const scope = opts.scope ?? "all";
  const actions =
    scope === "platform" ? [...PLATFORM_FRAMEWORK_ACTIONS]
    : scope === "tenant" ? [...TENANT_FRAMEWORK_ACTIONS]
    : ALL_FRAMEWORK_ACTIONS;

  const where: Prisma.AuditLogWhereInput = { action: { in: actions } };
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" }, // newest-first
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Resolve actor username (userId → User.username) and, for tenant events, the
  // affected tenant name (row.tenantId → Tenant.name) — this page's rows only.
  const userIds = [...new Set(logs.map((l) => l.userId).filter((v): v is string => !!v))];
  const tenantIds = [...new Set(logs.filter((l) => TENANT_FRAMEWORK_ACTION_SET.has(l.action)).map((l) => l.tenantId))];
  const [users, tenants] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true } })
      : Promise.resolve([] as { id: string; username: string }[]),
    tenantIds.length
      ? prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.username]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

  const rows: FrameworkAuditRow[] = logs.map((l) => {
    const isTenantEvent = TENANT_FRAMEWORK_ACTION_SET.has(l.action);
    const tenantName = isTenantEvent ? (tenantMap.get(l.tenantId) ?? null) : null;
    const key = frameworkKeyOf(l.newValue);
    // frameworkLabel resolves reserved keys to their canonical label and falls
    // back to the captured recordTitle (name) for custom frameworks.
    const frameworkName = key ? frameworkLabel(key, l.recordTitle ?? undefined) : (l.recordTitle || "—");
    return {
      ...l,
      username: (l.userId ? userMap.get(l.userId) : undefined) ?? null,
      accountName: tenantName, // drives AuditDetailModal's "Tenant: <name>" target
      frameworkName,
      tenantName,
    };
  });

  return { rows, total, page, pageSize };
});

/* ── Audit Trail view enrichment ──────────────────────────────────────────
   The audit log stores recordId (the affected entity's internal UUID) and a
   denormalised recordTitle. Neither is the entity's PROPER domain id (e.g.
   "CAPA-CHN-2026-001"). To show that — and link to the source the way the
   other modules link — we resolve recordId → the entity's reference per
   module family, tenant-scoped, and attach a navigable href.

   Deep links only exist where a per-id route exists (CAPA). The other modules
   are modal-based with no per-record URL, so they link to their list route —
   "where the other modules would link". */

type AuditFamily = "capa" | "deviation" | "changeControl" | "fda483" | "finding" | "system" | "support";

const AUDIT_LIST_ROUTE: Record<AuditFamily, string> = {
  capa: "/capa",
  deviation: "/deviation",
  changeControl: "/change-control",
  fda483: "/fda-483",
  finding: "/gap-assessment",
  system: "/csv-csa",
  support: "/support",
};

/** Map an AuditLog.module string to its domain family (or null = no entity). */
function auditModuleFamily(module: string): AuditFamily | null {
  if (module.startsWith("CAPA")) return "capa"; // covers "CAPA / Approvals" etc.
  if (module === "Deviation Management") return "deviation";
  if (module === "Change Control") return "changeControl";
  if (module === "FDA 483") return "fda483";
  if (module === "Gap Assessment") return "finding";
  if (module === "CSV/CSA") return "system";
  if (module === "Support") return "support";
  return null;
}

/** An AuditLog row enriched with a human domain id + a link to the source. */
export type AuditTrailRow = AuditLog & {
  /** Proper domain id (resolved reference) ?? recordTitle ?? short UUID ?? "—". */
  displayId: string;
  /** Navigable source-record link, or null when the module has no entity/route. */
  href: string | null;
};

/** Resolve recordId → reference for the loaded slice, batched per family. */
async function resolveAuditReferences(
  tenantId: string,
  logs: AuditLog[],
): Promise<Map<string, string>> {
  const buckets: Record<AuditFamily, Set<string>> = {
    capa: new Set(), deviation: new Set(), changeControl: new Set(),
    fda483: new Set(), finding: new Set(), system: new Set(), support: new Set(),
  };
  for (const log of logs) {
    if (!log.recordId) continue;
    const fam = auditModuleFamily(log.module);
    if (fam) buckets[fam].add(log.recordId);
  }

  const ref = new Map<string, string>();
  const set = (rows: { id: string; ref: string | null }[]) =>
    rows.forEach((r) => r.ref && ref.set(r.id, r.ref));
  const ids = (s: Set<string>) => Array.from(s);

  await Promise.all([
    buckets.capa.size
      ? prisma.cAPA.findMany({ where: { tenantId, id: { in: ids(buckets.capa) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
    buckets.deviation.size
      ? prisma.deviation.findMany({ where: { tenantId, id: { in: ids(buckets.deviation) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
    buckets.changeControl.size
      ? prisma.changeControl.findMany({ where: { tenantId, id: { in: ids(buckets.changeControl) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
    buckets.fda483.size
      ? prisma.fDA483Event.findMany({ where: { tenantId, id: { in: ids(buckets.fda483) } }, select: { id: true, referenceNumber: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.referenceNumber }))))
      : null,
    buckets.finding.size
      ? prisma.finding.findMany({ where: { tenantId, id: { in: ids(buckets.finding) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
    buckets.system.size
      ? prisma.gxPSystem.findMany({ where: { tenantId, id: { in: ids(buckets.system) } }, select: { id: true, name: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.name }))))
      : null,
    buckets.support.size
      ? prisma.ticket.findMany({ where: { tenantId, id: { in: ids(buckets.support) } }, select: { id: true, reference: true } })
          .then((r) => set(r.map((x) => ({ id: x.id, ref: x.reference }))))
      : null,
  ]);

  return ref;
}

/** Enrich a raw AuditLog with its resolved domain id + source href. Used by the
 *  server-paged getAuditTrailPage so the reference/route logic lives in exactly
 *  one place. */
function toAuditTrailRow(log: AuditLog, refMap: Map<string, string>): AuditTrailRow {
  const fam = auditModuleFamily(log.module);
  const resolved = log.recordId ? refMap.get(log.recordId) : undefined;
  const displayId = resolved ?? log.recordTitle ?? (log.recordId ? log.recordId.slice(0, 8) : "—");
  // CAPA is the only module with a per-id route — deep-link only when the
  // recordId actually resolved to a CAPA (so sub-entity ids don't 404).
  const href =
    fam === "capa" && resolved && log.recordId
      ? `/capa/${log.recordId}`
      : fam
        ? AUDIT_LIST_ROUTE[fam]
        : null;
  return { ...log, displayId, href };
}

/* ── Audit-trail: server-side paginated + filtered + sorted (tenant-scoped) ──
   Backs the /audit-trail page's <DataTable mode="server">. Scope pin:
   where.tenantId === caller's tenant — NEVER widened; a super_admin sees only
   their own/platform tenant, a tenant user sees theirs; filters only ever
   narrow. Paging + sorting + filtering all run in the DB so the (potentially
   large) AuditLog table is never loaded whole AND a column sort orders the
   WHOLE result set, not just a loaded page. */

export interface AuditTrailFilters {
  /** Exact module string (matches AuditLog.module). */
  module?: string;
  /** Exact audit action string. */
  action?: string;
  /** Actor contains-match against the denormalised userName. */
  userName?: string;
  /** Inclusive date range (YYYY-MM-DD) on createdAt. */
  dateFrom?: string;
  dateTo?: string;
  /** Free-text across target/entity + action + actor. */
  search?: string;
}

export type AuditSortKey = "createdAt" | "action" | "module" | "userName";

export interface AuditTrailPageResult {
  rows: AuditTrailRow[];
  total: number;
  page: number;
  pageSize: number;
}

const AUDIT_SORT_KEYS = new Set<AuditSortKey>(["createdAt", "action", "module", "userName"]);

export const getAuditTrailPage = cache(async (
  tenantId: string,
  opts: { page?: number; pageSize?: number; filters?: AuditTrailFilters; sort?: { key: AuditSortKey; dir: "asc" | "desc" } } = {},
): Promise<AuditTrailPageResult> => {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const f = opts.filters ?? {};

  // Scope pin — never widened. Filters only ever narrow this.
  const where: Prisma.AuditLogWhereInput = { tenantId };
  if (f.module) where.module = f.module;
  if (f.action) where.action = f.action;
  if (f.userName?.trim()) where.userName = { contains: f.userName.trim() };
  if (f.dateFrom || f.dateTo) {
    where.createdAt = {};
    if (f.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(`${f.dateFrom}T00:00:00.000Z`);
    if (f.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(`${f.dateTo}T23:59:59.999Z`);
  }
  if (f.search?.trim()) {
    const q = f.search.trim();
    where.OR = [
      { recordTitle: { contains: q } },
      { recordId: { contains: q } },
      { userName: { contains: q } },
      { action: { contains: q } },
    ];
  }

  // Whole-set sort in the DB (whitelist the key; default newest-first).
  const orderBy: Prisma.AuditLogOrderByWithRelationInput =
    opts.sort && AUDIT_SORT_KEYS.has(opts.sort.key)
      ? { [opts.sort.key]: opts.sort.dir }
      : { createdAt: "desc" };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
  ]);

  const refMap = await resolveAuditReferences(tenantId, logs);
  const rows = logs.map((log) => toAuditTrailRow(log, refMap));
  return { rows, total, page, pageSize };
});

export interface AuditTrailFilterOptions {
  modules: string[];
  actions: string[];
  actors: string[];
}

/** Distinct filter values present in a tenant's audit trail — powers the
 *  module / action / actor dropdowns (labels resolved client-side). Scoped to
 *  the same tenant pin; no roster is loaded. */
export const getAuditTrailFilterOptions = cache(async (tenantId: string): Promise<AuditTrailFilterOptions> => {
  const [modules, actions, actors] = await Promise.all([
    prisma.auditLog.findMany({ where: { tenantId }, distinct: ["module"], select: { module: true }, orderBy: { module: "asc" } }),
    prisma.auditLog.findMany({ where: { tenantId }, distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.auditLog.findMany({ where: { tenantId }, distinct: ["userName"], select: { userName: true }, orderBy: { userName: "asc" } }),
  ]);
  return {
    modules: modules.map((m) => m.module),
    actions: actions.map((a) => a.action),
    actors: actors.map((a) => a.userName).filter((n): n is string => !!n?.trim()),
  };
});

/**
 * AGI-related activity from the audit log — agent toggles + AI suggestion
 * shown/accepted/dismissed events. Used by /agi-console activity feed.
 */
export const getAGIActivityLogs = cache(async (tenantId: string) => {
  return prisma.auditLog.findMany({
    where: {
      tenantId,
      action: {
        in: [
          "AI_SUGGESTION_SHOWN",
          "AI_SUGGESTION_ACCEPTED",
          "AI_SUGGESTION_DISMISSED",
          "AGI_AGENT_TOGGLED",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
});
