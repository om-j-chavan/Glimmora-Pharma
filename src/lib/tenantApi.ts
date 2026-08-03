import type { Tenant } from "@/store/auth.slice";
import { getSession } from "next-auth/react";
import {
  createTenant as createTenantAction,
  updateTenant as updateTenantAction,
  deleteTenant as deleteTenantAction,
  assignPlan as assignPlanAction,
  listTenants as listTenantsAction,
} from "@/actions/tenants";

/**
 * Error thrown when a server action rejects a write. Carries the raw
 * server error string and (when the failure was a Zod schema rejection)
 * a per-field error map so the form can light up the offending inputs
 * instead of showing the generic "Validation failed" toast.
 */
export class TenantApiError extends Error {
  fieldErrors?: Record<string, string[]>;
  /** True when the tenant row was created/updated but its plan assignment
   *  failed — lets the caller surface a plan-specific message (and still show
   *  the tenant, which exists) instead of reporting a creation failure. */
  planAssignmentFailed?: boolean;
  constructor(message: string, fieldErrors?: Record<string, string[]>, planAssignmentFailed?: boolean) {
    super(message);
    this.name = "TenantApiError";
    this.fieldErrors = fieldErrors;
    this.planAssignmentFailed = planAssignmentFailed;
  }
}

function formatFieldErrors(fieldErrors: Record<string, string[]> | undefined): string {
  if (!fieldErrors) return "";
  const parts = Object.entries(fieldErrors)
    .map(([field, msgs]) => `${field}: ${(msgs ?? []).join(", ")}`)
    .filter(Boolean);
  return parts.join(" · ");
}

/** Logs the success/failure outcome of an API call with timing. */
async function logCall<T>(
  method: string,
  path: string,
  fn: () => Promise<T>,
  opts: { silent?: boolean } = {},
): Promise<T> {
  const tag = `[tenantApi] ${method} ${path}`;
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  console.info(`${tag} → sending`);
  try {
    const result = await fn();
    const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
    console.info(`${tag} ✓ ok (${ms}ms)`, result);
    return result;
  } catch (err) {
    const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
    (opts.silent ? console.warn : console.error)(`${tag} ✗ failed (${ms}ms)`, err);
    throw err;
  }
}

/**
 * Ensures a valid next-auth session exists before making an API call.
 * Returns headers with the session cookie (credentials: include handles that)
 * but also adds a custom header the API can use as a fallback.
 */
async function authHeaders(): Promise<HeadersInit> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return { "Content-Type": "application/json" };
}

export async function fetchTenants(): Promise<Tenant[]> {
  return logCall("GET", "/tenants (server action)", async () => {
    await authHeaders(); // ensure a session exists before the call
    try {
      return await listTenantsAction();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Super Admin")) {
        throw new Error("Insufficient permissions — Super Admin only");
      }
      if (msg.toLowerCase().includes("not authenticated")) {
        throw new Error("Not authenticated — please log in again");
      }
      throw err;
    }
  });
}

/**
 * Persist a newly created tenant to Neon by invoking the createTenant server
 * action. The Redux Tenant shape is flattened: the customer_admin user from
 * config.users[0] supplies email/username/password. The human-readable Tenant
 * ID (customerCode, TEN-YYYY-NNNN) is allocated server-side and returned here
 * so the caller can reflect it on the optimistic row immediately.
 *
 * After the tenant row exists, the tenant's single plan (if any) is assigned
 * via assignPlan so the plan gate (AppShell) sees a live plan for the new
 * account.
 *
 * Returns the server-authoritative id + customerCode.
 */
export async function createTenantApi(tenant: Tenant): Promise<{ id: string; customerCode: string | null }> {
  return logCall("POST", "/tenants (server action)", async () => {
    const admin = tenant.config?.users?.find((u) => u.role === "customer_admin")
      ?? tenant.config?.users?.[0];
    if (!admin) throw new Error("Tenant must include a customer_admin user");
    if (!admin.password) {
      throw new Error("New customer admin must have a password");
    }
    const result = await createTenantAction({
      // Persist the client-generated id AS the DB primary key so Redux/UI and
      // the DB agree — otherwise a later edit targets an id Prisma never stored
      // and fails with P2025 ("No record found for an update").
      id: tenant.id,
      name: tenant.name,
      email: admin.email,
      username: admin.username ?? admin.email,
      password: admin.password,
      timezone: tenant.config?.org?.timezone ?? "Asia/Kolkata",
      // Multi-region: the SET is the source of truth (server derives the shim =
      // regions[0]). Fall back to the single shim for older callers. An empty set
      // is passed through so the server-side required check (Stage 5) rejects it.
      regulatoryRegions: tenant.config?.org?.regions ?? (tenant.config?.org?.regulatoryRegion ? [tenant.config.org.regulatoryRegion] : []),
      regulatoryRegion: tenant.config?.org?.regulatoryRegion ?? "",
      isActive: tenant.active ?? true,
    });
    if (!result.success) {
      const detail = formatFieldErrors(result.fieldErrors);
      const msg = detail ? `${result.error} — ${detail}` : result.error;
      throw new TenantApiError(msg, result.fieldErrors);
    }
    const created = result.data as { id: string; customerCode: string | null } | undefined;
    if (!created?.id) return { id: tenant.id, customerCode: null };

    // Plan: assign the tenant's single plan (if one was configured).
    const plan = tenant.plan;
    if (plan) {
      const planRes = await assignPlanAction({
        tenantId: created.id,
        tier: plan.tier,
        displayName: plan.displayName ?? undefined,
        maxUsers: plan.maxUsers,
        maxSites: plan.maxSites,
        minRetentionYears: plan.minRetentionYears,
        durationMonths: plan.durationMonths,
        startDate: plan.startDate,
      });
      if (!planRes.success) {
        // Surface the failure instead of swallowing it; planAssignmentFailed
        // lets the caller show a plan-specific message. NOTE: the tenant row
        // already exists at this point, so this makes the "Active tenant with
        // no plan" state VISIBLE but does not prevent it — an atomic
        // create+assign (or a rollback delete) server-side would. Flagged here,
        // not done in this change.
        throw new TenantApiError(planRes.error, planRes.fieldErrors, true);
      }
    }
    return { id: created.id, customerCode: created.customerCode ?? null };
  });
}

export async function updateTenantApi(
  id: string,
  patch: Partial<Tenant>,
): Promise<void> {
  return logCall("PATCH", `/tenants (server action, id=${id})`, async () => {
    // Only forward fields the server action understands. Most Redux Tenant
    // mutations are UI-local (config.sites, config.frameworks, etc.) and don't
    // need to persist back here — the dedicated server actions handle them.
    const data: Parameters<typeof updateTenantAction>[1] = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.adminEmail !== undefined) data.email = patch.adminEmail;
    if (patch.active !== undefined) data.isActive = patch.active;
    // Regulatory region (super_admin-owned) lives in config.org — forward it when
    // the patch carries it. Multi-region: prefer the SET; the server derives the
    // shim = regions[0]. Fall back to the single field for older callers.
    if (patch.config?.org?.regions !== undefined) data.regulatoryRegions = patch.config.org.regions;
    else if (patch.config?.org?.regulatoryRegion !== undefined) data.regulatoryRegion = patch.config.org.regulatoryRegion;
    if (Object.keys(data).length === 0) return;
    const result = await updateTenantAction(id, data);
    if (!result.success) {
      const detail = formatFieldErrors(result.fieldErrors);
      const msg = detail ? `${result.error} — ${detail}` : result.error;
      throw new TenantApiError(msg, result.fieldErrors);
    }
  });
}

export async function deleteTenantApi(id: string): Promise<void> {
  return logCall("DELETE", `/tenants (server action, id=${id})`, async () => {
    const result = await deleteTenantAction(id);
    if (!result.success) {
      throw new TenantApiError(result.error);
    }
  });
}

