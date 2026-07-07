import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateOtp, verifyOtp } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/mailer";
import { auditAuthEvent } from "@/lib/auditServer";
import { isTenantAccessible } from "@/lib/permissions/roleSets";

/**
 * Production guard for NEXTAUTH_SECRET (audit findings 3.6 + 11.3).
 *
 * Called inside authorize() so it fires at request-time, not at module
 * evaluation — Next.js build does not have runtime secrets available and
 * would crash during page-data collection if this ran at the top level.
 */
const PLACEHOLDER_SECRET = "replace-with-a-32-byte-base64-secret";
function assertProductionSecret(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.NEXTAUTH_SECRET) {
    throw new Error("NEXTAUTH_SECRET must be set in production.");
  }
  if (process.env.NEXTAUTH_SECRET === PLACEHOLDER_SECRET) {
    throw new Error(
      "NEXTAUTH_SECRET is still set to the .env.example placeholder. " +
        "Generate a real secret with: openssl rand -base64 32",
    );
  }
  if (process.env.NEXTAUTH_SECRET.length < 32) {
    throw new Error("NEXTAUTH_SECRET must be at least 32 characters.");
  }
}

// Best-effort client IP extraction from NextAuth's authorize() req param.
// Walks the standard proxy headers; returns null if nothing usable. The
// concrete value (when present) lands in AuditLog.ipAddress.
function extractClientIp(
  req:
    | { headers?: Record<string, string | string[] | undefined> | undefined }
    | undefined,
): string | null {
  const xff = req?.headers?.["x-forwarded-for"];
  if (typeof xff === "string") {
    const first = xff.split(",")[0]?.trim();
    return first || null;
  }
  if (Array.isArray(xff)) {
    const first = xff[0]?.split(",")[0]?.trim();
    return first || null;
  }
  const xri = req?.headers?.["x-real-ip"];
  if (typeof xri === "string") return xri || null;
  if (Array.isArray(xri)) return xri[0] ?? null;
  return null;
}

/**
 * NextAuth — Credentials provider backed by Prisma SQLite.
 *
 * Lookup order:
 *   1. Tenant table (super_admin / customer_admin) — by email.
 *   2. User table   (qa_head, regulatory_affairs, etc.) — by email.
 *
 * Subscription gate: blocks login when the tenant has no active or
 * non-expired subscription, EXCEPT for super_admin (they are the ones
 * who renew billing). When blocked we throw `SUBSCRIPTION_INACTIVE`
 * so the client can show a specific message.
 *
 * MFA: tenant-level. If Tenant.mfaEnabled is true, every login from that
 * tenant (Tenant-row OR User-row) is gated by an emailed OTP — except
 * super_admin, which always bypasses.
 *
 * Errors thrown to the client (via `result.error` on signIn):
 *   - SUBSCRIPTION_INACTIVE   — tenant has no active sub
 *   - AMBIGUOUS_EMAIL         — multiple Tenant or User rows match the
 *                               same email; refuse to silently pick one
 *   - OTP_REQUIRED            — credentials valid; OTP issued + emailed
 *   - OTP_INVALID             — wrong code
 *   - OTP_EXPIRED             — code older than 10 minutes
 *   - OTP_LOCKED              — 5 wrong attempts; resend required
 *   - OTP_NO_OTP              — no live code on file; resend required
 *
 * Auth-event audit logging (Part 11 §11.10(e)): every outcome of this
 * callback emits an `auditAuthEvent` call. The helper has its own
 * try/catch and never throws, so logging failures cannot surface as
 * sign-in errors. Branches without a resolvable tenantId (no-such-email,
 * cross-tenant ambiguous email) log to stderr only — see auditServer.ts.
 */

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  gxpSignatory: boolean;
  tenantId: string;
  orgId: string;
  siteId?: string | null;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "Verification code", type: "text" },
      },
      async authorize(credentials, req) {
        assertProductionSecret();
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase().trim();
        const password = credentials.password;
        const otp = credentials.otp?.trim() ?? "";

        const ipAddress = extractClientIp(req);

        try {
          // ── Path 1: Tenant table (super_admin / customer_admin) ──
          // findMany + length guard: refuse to silently pick one when the
          // unique constraint is violated (shouldn't happen — Tenant.email
          // and Tenant.username are both @@unique — but the guard makes the
          // failure mode loud).
          // Accept either email or username (e.g. "superadmin"). When the
          // input has no "@" we treat it as a username; otherwise email.
          const isEmail = email.includes("@");
          const tenantMatches = await prisma.tenant.findMany({
            where: isEmail ? { email } : { username: email },
            include: { plan: true },
          });
          if (tenantMatches.length > 1) {
            await auditAuthEvent({
              action: "LOGIN_AMBIGUOUS_EMAIL",
              tenantId: null,
              userName: email,
              recordTitle: email,
              ipAddress,
              newValue: {
                email,
                matchCount: tenantMatches.length,
                path: "tenant",
              },
            });
            throw new Error("AMBIGUOUS_EMAIL");
          }
          const tenant = tenantMatches[0];

          if (tenant) {
            // Lifecycle gate — a SUSPENDED (isActive=false) or soft-DELETED
            // (deletedAt set) tenant is blocked with a specific message so the
            // client can tell the user to contact the platform admin. Distinct
            // from wrong-password (generic) on purpose.
            //
            // The super_admin exemption lives in isTenantAccessible() (the
            // shared, single-source-of-truth predicate in roleSets.ts): it
            // returns true for a platform admin WITHOUT reading tenant status,
            // so a null/placeholder/non-active platform row can never trip this
            // block. The audit emit + throw stay HERE (the helper is
            // decision-only). Behaviour is identical to the prior inline check.
            if (!isTenantAccessible(tenant, tenant.role)) {
              await auditAuthEvent({
                action: "LOGIN_ACCOUNT_SUSPENDED",
                tenantId: tenant.id,
                userId: tenant.id,
                userName: tenant.name,
                userRole: tenant.role,
                recordId: tenant.id,
                recordTitle: tenant.email,
                ipAddress,
                newValue: { email, path: "tenant", deleted: !!tenant.deletedAt },
              });
              throw new Error("ACCOUNT_SUSPENDED");
            }

            const valid = await bcrypt.compare(password, tenant.passwordHash);
            if (!valid) {
              await auditAuthEvent({
                action: "LOGIN_FAILED",
                tenantId: tenant.id,
                userId: tenant.id,
                userName: tenant.name,
                userRole: tenant.role,
                recordId: tenant.id,
                recordTitle: tenant.email,
                ipAddress,
                newValue: {
                  email,
                  reason: "wrong_password",
                  path: "tenant",
                },
              });
              return null;
            }

            // Plan gate. Two roles are exempt from needing an active (present,
            // non-expired) plan to LOG IN:
            //   - super_admin: the platform account has no plan at all.
            //   - customer_admin: allowed in even with an expired / no plan so they
            //     can reach the read-only Subscription view (which explains the
            //     expiry and says to contact the platform admin). Their WRITES are
            //     blocked separately by server-side cap enforcement
            //     (assertCanAddUser / assertCanAddSite), so login itself is safe.
            // Any other tenant-path role without an active plan IS blocked here.
            // (Lifecycle suspension is handled separately by tenant.isActive above.)
            const planExempt = tenant.role === "super_admin" || tenant.role === "customer_admin";
            if (!planExempt) {
              const plan = tenant.plan;
              const hasActiveSub = !!plan && new Date(plan.expiryDate) > new Date();
              if (!hasActiveSub) {
                await auditAuthEvent({
                  action: "SUBSCRIPTION_BLOCKED",
                  tenantId: tenant.id,
                  userId: tenant.id,
                  userName: tenant.name,
                  userRole: tenant.role,
                  recordId: tenant.id,
                  recordTitle: tenant.email,
                  ipAddress,
                  newValue: { email, role: tenant.role, path: "tenant" },
                });
                throw new Error("SUBSCRIPTION_INACTIVE");
              }
            }

            // ── MFA gate ──
            // super_admin always bypasses MFA. For everyone else (customer_admin
            // here in the Tenant path), gate on Tenant.mfaEnabled.
            if (tenant.role !== "super_admin" && tenant.mfaEnabled) {
              if (!otp) {
                const code = await generateOtp(email, null);
                await sendOtpEmail(tenant.email, code);
                await auditAuthEvent({
                  action: "OTP_SENT",
                  tenantId: tenant.id,
                  userId: tenant.id,
                  userName: tenant.name,
                  userRole: tenant.role,
                  recordId: tenant.id,
                  recordTitle: tenant.email,
                  ipAddress,
                  newValue: { email, path: "tenant" },
                });
                throw new Error("OTP_REQUIRED");
              }
              const v = await verifyOtp(email, null, otp);
              if (!v.ok) {
                await auditAuthEvent({
                  action: "OTP_FAILED",
                  tenantId: tenant.id,
                  userId: tenant.id,
                  userName: tenant.name,
                  userRole: tenant.role,
                  recordId: tenant.id,
                  recordTitle: tenant.email,
                  ipAddress,
                  newValue: { email, reason: v.reason, path: "tenant" },
                });
                throw new Error(`OTP_${v.reason.toUpperCase()}`);
              }
              await auditAuthEvent({
                action: "OTP_VERIFIED",
                tenantId: tenant.id,
                userId: tenant.id,
                userName: tenant.name,
                userRole: tenant.role,
                recordId: tenant.id,
                recordTitle: tenant.email,
                ipAddress,
                newValue: { email, path: "tenant" },
              });
            }

            await auditAuthEvent({
              action: "LOGIN_SUCCESS",
              tenantId: tenant.id,
              userId: tenant.id,
              userName: tenant.name,
              userRole: tenant.role,
              recordId: tenant.id,
              recordTitle: tenant.email,
              ipAddress,
              newValue: {
                email,
                role: tenant.role,
                mfaUsed: tenant.role !== "super_admin" && tenant.mfaEnabled,
                path: "tenant",
              },
            });

            const result: SessionUser = {
              id: tenant.id,
              name: tenant.name,
              email: tenant.email,
              role: tenant.role,
              gxpSignatory: false,
              tenantId: tenant.id,
              orgId: tenant.id,
              siteId: null,
            };
            return result as unknown as SessionUser;
          }

          // ── Path 2: User table (site users) ──
          // Same ambiguity guard. User.email is unique only within a tenant
          // (@@unique([tenantId, email])), so cross-tenant duplicates are
          // structurally possible — refuse rather than guess.
          // Accept username as well: User.username also has @@unique with
          // tenantId, so the same ambiguity guard applies.
          const userMatches = await prisma.user.findMany({
            where: isEmail ? { email } : { username: email },
            include: { tenant: { include: { plan: true } } },
          });
          if (userMatches.length > 1) {
            await auditAuthEvent({
              action: "LOGIN_AMBIGUOUS_EMAIL",
              tenantId: null,
              userName: email,
              recordTitle: email,
              ipAddress,
              newValue: {
                email,
                matchCount: userMatches.length,
                path: "user",
              },
            });
            throw new Error("AMBIGUOUS_EMAIL");
          }
          const user = userMatches[0];

          if (user) {
            // Parent-tenant lifecycle gate — if the tenant is SUSPENDED or
            // soft-DELETED, ALL its users are blocked (item: "suspended tenant
            // OR any of its users"), with the same specific message.
            //
            // Exemption via the shared isTenantAccessible() (super_admin is
            // never evaluated for tenant status). The `user.tenant &&` guard is
            // kept so the lifecycle block is only considered when a parent
            // tenant is actually loaded — behaviour is identical to the prior
            // inline check (a user with no loaded tenant is not blocked here).
            if (user.tenant && !isTenantAccessible(user.tenant, user.role)) {
              await auditAuthEvent({
                action: "LOGIN_ACCOUNT_SUSPENDED",
                tenantId: user.tenantId,
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                recordId: user.id,
                recordTitle: user.email,
                ipAddress,
                newValue: { email, path: "user", deleted: !!user.tenant.deletedAt },
              });
              throw new Error("ACCOUNT_SUSPENDED");
            }
            if (!user.isActive) {
              await auditAuthEvent({
                action: "LOGIN_ACCOUNT_INACTIVE",
                tenantId: user.tenantId,
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                recordId: user.id,
                recordTitle: user.email,
                ipAddress,
                newValue: { email, path: "user" },
              });
              return null;
            }

            const valid = await bcrypt.compare(password, user.passwordHash);
            if (!valid) {
              await auditAuthEvent({
                action: "LOGIN_FAILED",
                tenantId: user.tenantId,
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                recordId: user.id,
                recordTitle: user.email,
                ipAddress,
                newValue: { email, reason: "wrong_password", path: "user" },
              });
              return null;
            }

            const plan = user.tenant?.plan;
            const hasActiveSub =
              !!plan &&
              new Date(plan.expiryDate) > new Date();
            if (!hasActiveSub) {
              await auditAuthEvent({
                action: "SUBSCRIPTION_BLOCKED",
                tenantId: user.tenantId,
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                recordId: user.id,
                recordTitle: user.email,
                ipAddress,
                newValue: { email, role: user.role, path: "user" },
              });
              throw new Error("SUBSCRIPTION_INACTIVE");
            }

            // ── MFA gate (User path) ──
            // Tenant.mfaEnabled lives on the parent Tenant row.
            if (user.tenant?.mfaEnabled) {
              if (!otp) {
                const code = await generateOtp(email, user.tenantId);
                await sendOtpEmail(user.email, code);
                await auditAuthEvent({
                  action: "OTP_SENT",
                  tenantId: user.tenantId,
                  userId: user.id,
                  userName: user.name,
                  userRole: user.role,
                  recordId: user.id,
                  recordTitle: user.email,
                  ipAddress,
                  newValue: { email, path: "user" },
                });
                throw new Error("OTP_REQUIRED");
              }
              const v = await verifyOtp(email, user.tenantId, otp);
              if (!v.ok) {
                await auditAuthEvent({
                  action: "OTP_FAILED",
                  tenantId: user.tenantId,
                  userId: user.id,
                  userName: user.name,
                  userRole: user.role,
                  recordId: user.id,
                  recordTitle: user.email,
                  ipAddress,
                  newValue: { email, reason: v.reason, path: "user" },
                });
                throw new Error(`OTP_${v.reason.toUpperCase()}`);
              }
              await auditAuthEvent({
                action: "OTP_VERIFIED",
                tenantId: user.tenantId,
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                recordId: user.id,
                recordTitle: user.email,
                ipAddress,
                newValue: { email, path: "user" },
              });
            }

            await prisma.user.update({
              where: { id: user.id },
              data: { lastLogin: new Date() },
            });

            await auditAuthEvent({
              action: "LOGIN_SUCCESS",
              tenantId: user.tenantId,
              userId: user.id,
              userName: user.name,
              userRole: user.role,
              recordId: user.id,
              recordTitle: user.email,
              ipAddress,
              newValue: {
                email,
                role: user.role,
                mfaUsed: !!user.tenant?.mfaEnabled,
                path: "user",
              },
            });

            const result: SessionUser = {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              gxpSignatory: user.gxpSignatory,
              tenantId: user.tenantId,
              orgId: user.tenantId,
              siteId: user.siteId,
            };
            return result as unknown as SessionUser;
          }

          await auditAuthEvent({
            action: "LOGIN_NO_SUCH_ACCOUNT",
            tenantId: null,
            userName: email,
            ipAddress,
            newValue: { email, reason: "no_match" },
          });
          return null;
        } catch (err) {
          if (err instanceof Error) {
            // Bubble up specific signals the client UI handles explicitly.
            if (
              err.message === "ACCOUNT_SUSPENDED" ||
              err.message === "SUBSCRIPTION_INACTIVE" ||
              err.message === "AMBIGUOUS_EMAIL" ||
              err.message === "OTP_REQUIRED" ||
              err.message === "OTP_INVALID" ||
              err.message === "OTP_EXPIRED" ||
              err.message === "OTP_LOCKED" ||
              err.message === "OTP_NO_OTP"
            ) {
              throw err;
            }
          }
          await auditAuthEvent({
            action: "LOGIN_INTERNAL_ERROR",
            tenantId: null,
            userName: email,
            ipAddress,
            newValue: {
              email,
              error: err instanceof Error ? err.message : String(err),
            },
          });
          console.error("[auth] authorize failed:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const su = user as unknown as SessionUser;
        token.id = su.id;
        token.role = su.role;
        token.gxpSignatory = su.gxpSignatory;
        token.tenantId = su.tenantId;
        token.orgId = su.orgId;
        token.siteId = su.siteId ?? null;
      }

      // ── MFA session-invalidation enforcement ──
      // On every JWT decode (= every authenticated request that touches the
      // session), compare the token's iat against the parent tenant's
      // sessionsValidAfter. If the tenant's MFA flag was flipped on after
      // this token was issued, sessionsValidAfter > token.iat and we return
      // an empty token, which the proxy/getServerSession see as no session
      // and redirect to /login.
      //
      // This adds one Prisma read per authenticated request. Acceptable for
      // a multi-tenant SaaS at this scale; revisit with a cache if needed.
      // The check lives here (Pages Router = Node runtime) because the Edge
      // proxy can't import the Prisma client.
      //
      // SCOPE (by design): this is the MFA session-invalidation cutoff ONLY —
      // it reads sessionsValidAfter and applies to ALL roles, super_admin
      // included (intentional; unchanged). It deliberately does NOT enforce
      // tenant lifecycle (isActive/deletedAt), so it cannot lock a platform
      // admin out on a suspended/deleted platform row. If a tenant-lifecycle
      // read is ever added below, it MUST be routed through
      // isTenantAccessible(tenant, token.role) (or guarded by isPlatformAdmin)
      // so super_admin stays exempt by design — the same rule the login gates
      // now use. Keep the null-safe `t && …` shape below regardless.
      const tenantId = token.tenantId as string | undefined;
      const iat = typeof token.iat === "number" ? token.iat : undefined;
      if (tenantId && iat) {
        try {
          const t = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { sessionsValidAfter: true },
          });
          if (t && iat * 1000 < t.sessionsValidAfter.getTime()) {
            return {} as typeof token;
          }
        } catch (err) {
          // Don't fail-open on a transient DB hiccup — log and let the
          // existing token through. The next request will retry.
          console.error("[auth] sessionsValidAfter check failed:", err);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const u = session.user as Record<string, unknown>;
        u.id = token.id;
        u.role = token.role;
        u.gxpSignatory = token.gxpSignatory;
        u.tenantId = token.tenantId;
        u.orgId = token.orgId;
        u.siteId = token.siteId ?? null;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
};

// App Router: NextAuth's handler is the GET + POST handler for this route.
// v4.22+ supports the route.ts shape — Next.js 16 stopped discovering the
// catch-all in pages/api/, so this is now the canonical location.
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
