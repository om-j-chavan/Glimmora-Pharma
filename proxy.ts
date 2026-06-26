import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Centralized edge auth gating (Next 16 `proxy` convention).
 *
 * Runs ahead of every matched route and:
 *   1. Reads the NextAuth JWT via getToken (Edge-safe; getServerSession is not).
 *   2. Unauthenticated → page requests redirect to /login?callbackUrl=…; /api/*
 *      requests get a 401 (defense-in-depth — each route also checks auth()).
 *   3. /admin pages require role super_admin OR customer_admin (E1=B).
 *   4. super_admin's world is the admin console ONLY — it is bounced off every
 *      non-/admin page to /admin (the (app) layout enforces the same server-side).
 *
 * Pages still call `requireAuth()` for the session object (tenantId for Prisma);
 * this proxy is defense-in-depth, not a replacement for the per-page lookup.
 *
 * Fail-open guard: when NEXTAUTH_SECRET is unset (local dev only — production
 * mandates it via assertProductionSecret in the NextAuth route), the gate is
 * skipped so it can't desync from the secret NextAuth used to sign the cookie
 * and cause a false redirect loop. MFA session invalidation is enforced in the
 * JWT callback (an invalidated token decodes empty → getToken returns null →
 * the standard /login redirect below).
 */
export async function proxy(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const token = await getToken({ req, secret });

  // 1. No session → 401 for APIs, /login redirect for pages.
  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const callbackUrl = pathname + req.nextUrl.search;
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`, req.url),
    );
  }

  // 2. Role routing applies to PAGES only — never rewrite an API response.
  if (!isApi) {
    const role = token.role as string | undefined;

    // Admin route role gate — allow super_admin OR customer_admin (E1=B).
    if (pathname.startsWith("/admin") && role !== "super_admin" && role !== "customer_admin") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    // Bright-line inverse gate — super_admin lives in the admin console only.
    if (role === "super_admin" && !pathname.startsWith("/admin")) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
  }

  return NextResponse.next();
}

/**
 * Matcher excludes:
 *   - /login                                      (public sign-in)
 *   - /api/auth/*                                 (NextAuth must be reachable
 *                                                  unauthenticated). Other /api/*
 *                                                  IS matched so the 401 above
 *                                                  applies as defense-in-depth.
 *   - /_next/static, /_next/image, favicon.ico
 *   - manifest.json, robots.txt, sitemap.xml      (browsers fetch unauthenticated)
 *   - any static asset by extension
 *
 * Everything else — /(app)/*, /(admin)/*, and non-auth /api/* — passes through.
 */
export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|json|txt|xml)$).*)",
  ],
};
