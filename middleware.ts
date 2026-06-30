import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Baseline edge auth guard (defense-in-depth).
 *
 * Page-level `requireAuth()` and route-level `auth()` remain the primary gate;
 * this middleware exists so that a SINGLE forgotten check isn't fully exposed
 * at the edge. It only decrypts the NextAuth JWT (Edge-safe, no DB) — all
 * role/tenant authorization still happens in the page/route/action.
 *
 * Behaviour:
 *  - No session  → page requests redirect to /login; /api/* requests get 401.
 *  - Public paths (/login, /api/auth/*) always pass.
 *  - When NEXTAUTH_SECRET is unset (local dev only — production mandates it via
 *    assertProductionSecret), the guard is skipped so it can't desync from the
 *    secret NextAuth used to sign the cookie and cause a false redirect loop.
 */

function isPublic(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  // NextAuth's own endpoints must stay reachable so users can sign in.
  if (pathname.startsWith("/api/auth")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const token = await getToken({ req, secret });
  if (token) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next internals and static assets. Auth endpoints
  // are allowed inside the handler (isPublic) so sign-in still works.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|map)$).*)",
  ],
};
