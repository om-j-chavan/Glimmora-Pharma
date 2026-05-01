import { signOut } from "next-auth/react";

/**
 * Client-side auth helpers that wrap NextAuth.
 *
 * Login is handled directly by `src/components/auth/LoginPage.tsx` via
 * `signIn("credentials", …)` from `next-auth/react`. This module only
 * exposes the helpers used by the rest of the app (sign-out + current
 * user fetch).
 */

export async function logout(): Promise<void> {
  // `redirect: false` — caller handles navigation so React state can be
  // reset before leaving the page.
  await signOut({ redirect: false });
}

/**
 * Fetch the current authenticated user from the server.
 * Returns null if not authenticated.
 */
export async function fetchCurrentUser(): Promise<{
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  gxpSignatory: boolean;
  tenantId: string;
  orgId: string;
} | null> {
  try {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}
