import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../[...nextauth]/route";

/**
 * AUTH-04: Current User API (App Router)
 *
 * GET /api/auth/me
 *
 * Returns the currently authenticated user's profile + role from the JWT.
 * Richer wrapper around next-auth's built-in /api/auth/session, matching
 * the shape the frontend Redux store already expects.
 *
 * Migrated from pages/api/auth/me.ts so that the Pages Router no longer
 * holds any file under /api/auth/* — that namespace is now owned entirely
 * by the App Router catch-all in app/api/auth/[...nextauth]/route.ts. In
 * next dev --turbopack, mixing routers under the same namespace caused
 * Turbopack to route all unmatched /api/auth/* paths to Pages Router's
 * 404, which broke every NextAuth client fetch (CLIENT_FETCH_ERROR with
 * "Unexpected token '<'" — HTML error page parsed as JSON).
 *
 * Responses:
 *   200 { user: { id, name, email, username, role, gxpSignatory, tenantId, orgId } }
 *   401 { error: "Not authenticated" }
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }

  const u = session.user as Record<string, unknown>;
  return NextResponse.json({
    user: {
      id: String(u.id ?? ""),
      name: String(u.name ?? ""),
      email: String(u.email ?? ""),
      username: (u.username as string) ?? null,
      role: String(u.role ?? "viewer"),
      gxpSignatory: Boolean(u.gxpSignatory),
      tenantId: String(u.tenantId ?? ""),
      orgId: String(u.orgId ?? ""),
    },
  });
}
