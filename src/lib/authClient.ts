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
  const tag = `[authClient] signIn(credentials)`;
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  console.info(`${tag} → sending`);
  let result;
  try {
    result = await signIn("credentials", {
      redirect: false,
      username: username.trim(),
      password,
    });
  } catch (err) {
    const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
    console.error(`${tag} ✗ network error (${ms}ms)`, err);
    throw err;
  }
  const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;

  if (!result) {
    console.error(`${tag} ✗ no response (${ms}ms)`);
    return { ok: false, error: "No response from auth server" };
  }
  if (result.error) {
    console.error(`${tag} ✗ ${result.error} (${ms}ms)`);
    return { ok: false, error: result.error };
  }
  console.info(`${tag} ✓ ok (${ms}ms)`);
  return { ok: true };
}

export async function logout(): Promise<void> {
  const tag = `[authClient] signOut`;
  console.info(`${tag} → sending`);
  try {
    // `redirect: false` — we handle navigation manually from the caller so
    // React Router state can be reset first.
    await signOut({ redirect: false });
    console.info(`${tag} ✓ ok`);
  } catch (err) {
    console.error(`${tag} ✗ failed`, err);
    throw err;
  }
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
  const tag = `[authClient] GET /api/auth/me`;
  const startedAt = typeof performance !== "undefined" ? performance.now() : 0;
  console.info(`${tag} → sending`);
  try {
    const res = await fetch("/api/auth/me");
    const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
    if (res.status === 401) {
      console.info(`${tag} ✓ 401 unauthenticated (${ms}ms)`);
      return null;
    }
    if (!res.ok) {
      console.error(`${tag} ✗ ${res.status} (${ms}ms)`);
      return null;
    }
    const data = await res.json();
    console.info(`${tag} ✓ ${res.status} (${ms}ms)`, data);
    return data.user;
  } catch (err) {
    const ms = typeof performance !== "undefined" ? Math.round(performance.now() - startedAt) : 0;
    console.error(`${tag} ✗ network error (${ms}ms)`, err);
    return null;
  }
}
