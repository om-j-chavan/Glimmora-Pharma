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
