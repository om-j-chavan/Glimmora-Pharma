import { signIn, signOut } from "next-auth/react";

/**
 * Client-side auth helpers that wrap next-auth.
 *
 * The SPA login page calls `login()` with a username and password. This
 * delegates to next-auth's Credentials provider which verifies against
 * Neon, issues a real JWT, and sets an HttpOnly session cookie.
 *
 * `logout()` clears that cookie via next-auth's /api/auth/signout.
 */

export interface LoginResult {
  ok: boolean;
  error?: string;
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResult> {
  const result = await signIn("credentials", {
    redirect: false,
    username: username.trim(),
    password,
  });

  if (!result) {
    return { ok: false, error: "No response from auth server" };
  }
  if (result.error) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

export async function logout(): Promise<void> {
  // `redirect: false` — we handle navigation manually from the caller so
  // React Router state can be reset first.
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
