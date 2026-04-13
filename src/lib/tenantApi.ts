import type { Tenant } from "@/store/auth.slice";

const BASE = "/api";

export async function fetchTenants(): Promise<Tenant[]> {
  const res = await fetch(`${BASE}/tenants`);
  if (!res.ok) throw new Error(`Failed to fetch tenants: ${res.status}`);
  const data = await res.json();
  return data.tenants as Tenant[];
}

export async function createTenantApi(tenant: Tenant): Promise<void> {
  const res = await fetch(`${BASE}/tenants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tenant),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to create tenant: ${res.status}`);
  }
}

export async function updateTenantApi(
  id: string,
  patch: Partial<Tenant>,
): Promise<void> {
  const res = await fetch(`${BASE}/tenants`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to update tenant: ${res.status}`);
  }
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
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  return (await res.json()) as LoginResult;
}
