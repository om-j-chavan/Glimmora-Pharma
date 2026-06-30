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
 * Pages can still call `requireAuth()` for the session object — proxy
 * coverage is defense-in-depth, not a replacement for the per-page session
 * lookup that supplies tenantId for Prisma queries.
 */
export async function proxy(req: NextRequest) {
  // Local dev only: when NEXTAUTH_SECRET is unset, getToken() can't decrypt the
  // cookie and would bounce every request to /login in a loop. Skip the guard so
  // it can't desync from the secret NextAuth used to sign the cookie. Production
  // mandates the secret via assertProductionSecret, so this never fires there.
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.next();

  const token = await getToken({ req, secret });

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

  const role = token.role as string | undefined;

  // 2. Admin route role gate — allow super_admin OR customer_admin (per E1=B).
  if (req.nextUrl.pathname.startsWith("/admin")) {
    if (role !== "super_admin" && role !== "customer_admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // 3. Bright-line inverse gate — super_admin's world is the admin console
  //    ONLY. Bounce it off every non-/admin route (the customer/compliance
  //    modules: /, /capa, /deviation, /gap-assessment, /csv-csa, /fda-483,
  //    /evidence, /readiness, /governance, /settings, …) to /admin. The
  //    customer-app (app) layout enforces the same server-side.
  if (role === "super_admin" && !req.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  // MFA session invalidation is enforced in the JWT callback
  // (pages/api/auth/[...nextauth].ts). When tenant.sessionsValidAfter > token.iat,
  // the JWT callback returns an empty token, which causes getToken() above to
  // return null and triggers the standard /login redirect.

  return NextResponse.next();
}

/**
 * Matcher excludes:
 *   - /login                                      (public sign-in)
 *   - /api/*                                      (each route handles its own auth; NextAuth must be reachable)
 *   - /_next/static, /_next/image, favicon.ico
 *   - manifest.json, robots.txt, sitemap.xml      (well-known static metadata; browsers fetch these unauthenticated)
 *   - any static asset by extension               (images, css, js, sourcemaps, json/txt/xml as defense-in-depth)
 *
 * Everything else — including /site-picker (E2), /(app)/*, and /(admin)/* —
 * passes through this proxy.
 *
 * Without the manifest.json carve-out, the browser's PWA-manifest fetch
 * round-trips through the auth gate and shows up in dev logs as
 * "GET /login?callbackUrl=%2Fmanifest.json 200" on every page load.
 */
export const config = {
  matcher: [
    "/((?!login|api|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|json|txt|xml)$).*)",
  ],
};
