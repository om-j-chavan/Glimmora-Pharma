import type { Tenant } from "@/store/auth.slice";
import { getSession } from "next-auth/react";

const BASE = "/api";

/** Logs the success/failure outcome of an API call with timing. */
async function logCall<T>(method: string, path: string, fn: () => Promise<T>): Promise<T> {
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
    console.error(`${tag} ✗ failed (${ms}ms)`, err);
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
  return logCall("GET", "/tenants", async () => {
    const headers = await authHeaders();
    const res = await fetch(`${BASE}/tenants`, { credentials: "include", headers });
    if (res.status === 401) throw new Error("Not authenticated — please log in again");
    if (res.status === 403) throw new Error("Insufficient permissions — Super Admin only");
    if (!res.ok) throw new Error(`Failed to fetch tenants: ${res.status}`);
    const data = await res.json();
    return data.tenants as Tenant[];
  });
}

export async function createTenantApi(tenant: Tenant): Promise<void> {
  return logCall("POST", "/tenants", async () => {
    const headers = await authHeaders();
    const res = await fetch(`${BASE}/tenants`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(tenant),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Failed to create tenant: ${res.status}`);
    }
  });
}

export async function updateTenantApi(
  id: string,
  patch: Partial<Tenant>,
): Promise<void> {
  return logCall("PATCH", `/tenants (id=${id})`, async () => {
    const headers = await authHeaders();
    const res = await fetch(`${BASE}/tenants`, {
      method: "PATCH",
      credentials: "include",
      headers,
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Failed to update tenant: ${res.status}`);
    }
  });
}

export async function deleteTenantApi(id: string): Promise<void> {
  return logCall("DELETE", `/tenants?id=${id}`, async () => {
    await authHeaders(); // ensure session
    const res = await fetch(`${BASE}/tenants?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Failed to delete tenant: ${res.status}`);
    }
  });
}

export interface LoginResult {
  ok: true;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    gxpSignatory: boolean;
    orgId: string;
    tenantId: string;
  };
  tenant: Tenant;
}

export async function loginApi(
  username: string,
  password: string,
): Promise<LoginResult | null> {
  return logCall("POST", "/auth/login", async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.status === 401) return null;
    if (res.status === 403) {
      const body = (await res.json().catch(() => ({}))) as { reason?: string; error?: string };
      const err = new Error(body.reason ?? body.error ?? "Login blocked");
      (err as Error & { reason?: string }).reason = body.reason;
      throw err;
    }
    if (!res.ok) throw new Error(`Login failed: ${res.status}`);
    return (await res.json()) as LoginResult;
  });
}
