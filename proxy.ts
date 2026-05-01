import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Centralized auth gating.
 *
 * Runs ahead of every protected route (see `matcher` below) and:
 *   1. Reads the NextAuth JWT via getToken (works in Edge — getServerSession does not).
 *   2. Redirects unauthenticated requests to /login with a callbackUrl.
 *   3. For /admin routes, requires role === super_admin or customer_admin (E1=B).
 *
 * Pages can still call `requireAuth()` for the session object — middleware
 * coverage is defense-in-depth, not a replacement for the per-page session
 * lookup that supplies tenantId for Prisma queries.
 */
export async function proxy(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // 1. No session → bounce to login, preserving the original destination.
  if (!token) {
    const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
    return NextResponse.redirect(
      new URL(
        `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
        req.url,
      ),
    );
  }

  // 2. Admin route role gate — allow super_admin OR customer_admin (per E1=B).
  if (req.nextUrl.pathname.startsWith("/admin")) {
    const role = token.role as string | undefined;
    if (role !== "super_admin" && role !== "customer_admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // MFA session invalidation is enforced in the JWT callback
  // (pages/api/auth/[...nextauth].ts). When tenant.sessionsValidAfter > token.iat,
  // the JWT callback returns an empty token, which causes getToken() above to
  // return null and triggers the standard /login redirect.

  return NextResponse.next();
}

/**
 * Matcher excludes:
 *   - /login              (public sign-in)
 *   - /api/*              (each route handles its own auth; NextAuth must be reachable)
 *   - /_next/static, /_next/image, favicon.ico
 *   - any static asset by extension (images, css, js, sourcemaps)
 *
 * Everything else — including /site-picker (E2), /(app)/*, and /(admin)/* —
 * passes through this middleware.
 */
export const config = {
  matcher: [
    "/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)",
  ],
};
