import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Centralized edge auth gating (Next 16 `proxy` convention).
 *
 * Runs ahead of every matched route and:
 *   1. Reads the NextAuth JWT via getToken (Edge-safe; getServerSession is not).
 *   2. Unauthenticated → page requests redirect to /login?callbackUrl=…; /api/*
 *      requests get a 401 (defense-in-depth — each route also checks auth()).
 *   3. /admin pages require role super_admin ONLY (customer_admin manages its
 *      own tenant via /settings, not the cross-tenant admin console — H1 fix).
 *   4. super_admin's world is the admin console ONLY — it is bounced off every
 *      non-/admin page to /admin (the (app) layout enforces the same server-side).
 *
 * Pages still call `requireAuth()` for the session object (tenantId for Prisma);
 * this proxy is defense-in-depth, not a replacement for the per-page lookup.
 *
 * Missing-secret guard: without NEXTAUTH_SECRET we cannot verify ANY token, so
 * every request is effectively unauthenticated. Production mandates the secret
 * via assertProductionSecret in the NextAuth route; this is the edge-layer
 * backstop and it FAILS CLOSED — a prod request without the secret is refused
 * (401/500 for APIs, /login redirect for pages) rather than waved through.
 * Development still allows the request through (so a missing local secret can't
 * desync from the cookie NextAuth signed and cause a false redirect loop) but
 * logs a loud warning. MFA session invalidation is enforced in the JWT callback
 * (an invalidated token decodes empty → getToken returns null → the standard
 * /login redirect below).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Fail closed in production — refuse rather than serve protected content.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[proxy] NEXTAUTH_SECRET is not set in production — refusing all requests. " +
          "Set NEXTAUTH_SECRET (32+ bytes) to restore service.",
      );
      if (isApi) {
        return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
    // Development only — allow through, but make the disabled gate impossible to miss.
    console.warn(
      "[proxy] NEXTAUTH_SECRET is unset — edge auth gate DISABLED (development only). " +
        "Production refuses all requests without it.",
    );
    return NextResponse.next();
  }

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

    // Admin route role gate — super_admin ONLY (H1 fix). customer_admin manages
    // its own tenant via /settings, never the cross-tenant admin console; it is
    // redirected to the dashboard here (each /admin page re-checks server-side).
    if (pathname.startsWith("/admin") && role !== "super_admin") {
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
