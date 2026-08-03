/**
 * Server-guard tests for the platform-wide framework toggle (audit fix d).
 * These call the server actions DIRECTLY (not through the UI), with the DB,
 * auth, and query layers mocked, so the guard logic is exercised in isolation.
 *
 * Run: node --import tsx --experimental-test-module-mocks --test src/actions/frameworks.guard.test.ts
 * (wired as `npm run test:unit`).
 *
 * `@/constants/frameworks` (RESERVED_FRAMEWORK_KEYS) and `@/lib/permissions/roleSets`
 * (isPlatformAdmin) are intentionally NOT mocked — the real reserved set and the
 * real role gate are what we are asserting against.
 */
import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// Mutable state the fakes read at call time; reset before each test.
const state: {
  session: { user: { id: string; tenantId: string; role: string } };
  findUnique: { name: string; platformEnabled: boolean; key: string } | null;
  findMany: { id: string; name: string; platformEnabled: boolean; key: string }[];
  emptied: { value: string; label: string }[];
  calls: { findUnique: number; findMany: number; update: any[]; audit: any[] };
} = {} as never;

function reset() {
  state.session = { user: { id: "sa", tenantId: "sa", role: "super_admin" } };
  state.findUnique = null;
  state.findMany = [];
  state.emptied = [];
  state.calls = { findUnique: 0, findMany: 0, update: [], audit: [] };
}
reset();

const fakePrisma = {
  framework: {
    findUnique: async () => { state.calls.findUnique++; return state.findUnique; },
    findMany: async () => { state.calls.findMany++; return state.findMany; },
    update: async (args: any) => { state.calls.update.push(args); return { id: args.where.id, ...args.data }; },
    aggregate: async () => ({ _max: { sortOrder: 0 } }),
  },
  auditLog: { create: async (args: any) => { state.calls.audit.push(args); } },
};

mock.module("@/lib/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });
mock.module("@/lib/auth", {
  namedExports: {
    requireAuth: async () => state.session,
    resolveUserFk: async () => ({ userId: "u1", displayName: "Test SA", role: state.session.user.role }),
  },
});
mock.module("@/lib/queries/frameworks", {
  namedExports: {
    regionsEmptiedByDisabling: async () => state.emptied,
    effectiveFrameworksForTenant: async () => [],
    getTenantFrameworkSettings: async () => [],
  },
});
mock.module("@/lib/queries", {
  namedExports: { getFrameworkAuditLogs: async () => ({ rows: [], total: 0, page: 1, pageSize: 25 }) },
});
mock.module("@/lib/errors", { namedExports: { sanitizeServerError: (_e: unknown, msg: string) => msg } });

const { setFrameworkPlatformEnabled, bulkSetFrameworkPlatformEnabled } = await import("./frameworks");

beforeEach(reset);

test("disabling a reserved framework is rejected server-side, never mutating it", async () => {
  state.findUnique = { name: "FDA 21 CFR Part 11", platformEnabled: true, key: "p11" };
  const res = await setFrameworkPlatformEnabled("fw-p11", false);
  assert.equal(res.success, false);
  assert.match((res as { error: string }).error, /can't be disabled|reserved/i);
  assert.equal(state.calls.update.length, 0);
  assert.equal(state.calls.audit.length, 0);
});

test("disabling a non-reserved framework still succeeds and audits DISABLED", async () => {
  state.findUnique = { name: "Custom X", platformEnabled: true, key: "custom-x" };
  state.emptied = [];
  const res = await setFrameworkPlatformEnabled("fw-x", false);
  assert.equal(res.success, true);
  assert.equal(state.calls.update.length, 1);
  assert.equal(state.calls.update[0].data.platformEnabled, false);
  assert.equal(state.calls.audit.length, 1);
  assert.equal(state.calls.audit[0].data.action, "FRAMEWORK_PLATFORM_DISABLED");
});

test("enabling a reserved framework still succeeds and audits ENABLED", async () => {
  state.findUnique = { name: "FDA 21 CFR Part 11", platformEnabled: false, key: "p11" };
  const res = await setFrameworkPlatformEnabled("fw-p11", true);
  assert.equal(res.success, true);
  assert.equal(state.calls.update.length, 1);
  assert.equal(state.calls.update[0].data.platformEnabled, true);
  assert.equal(state.calls.audit[0].data.action, "FRAMEWORK_PLATFORM_ENABLED");
});

test("the >=1-per-region guard still blocks emptying a region", async () => {
  state.findUnique = { name: "Custom X", platformEnabled: true, key: "custom-x" };
  state.emptied = [{ value: "FDA", label: "FDA (United States)" }];
  const res = await setFrameworkPlatformEnabled("fw-x", false);
  assert.equal(res.success, false);
  assert.match((res as { error: string }).error, /at least one active framework/i);
  assert.equal(state.calls.update.length, 0);
});

test("a non-platform-admin caller is denied before any read", async () => {
  state.session = { user: { id: "t1", tenantId: "t1", role: "customer_admin" } };
  const res = await setFrameworkPlatformEnabled("fw-x", false);
  assert.equal(res.success, false);
  assert.match((res as { error: string }).error, /Only Super Admin/i);
  assert.equal(state.calls.findUnique, 0);
});

test("bulk disable rejects the whole batch if it contains a reserved key", async () => {
  state.findMany = [
    { id: "a", name: "Custom A", platformEnabled: true, key: "custom-a" },
    { id: "b", name: "FDA 21 CFR Part 11", platformEnabled: true, key: "p11" },
  ];
  const res = await bulkSetFrameworkPlatformEnabled(["a", "b"], false);
  assert.equal(res.success, false);
  assert.match((res as { error: string }).error, /reserved/i);
  assert.equal(state.calls.update.length, 0);
});
