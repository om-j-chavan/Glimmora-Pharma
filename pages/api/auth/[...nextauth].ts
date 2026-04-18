import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { neon } from "@neondatabase/serverless";
import { isTenantEffectivelyActive } from "@/lib/tenantStatus";

/**
 * NextAuth configuration — in-app authentication.
 *
 * AUTH-01: Login (Credentials provider → Neon DB lookup)
 * AUTH-02: JWT session strategy — real signed HS256 JWT via NEXTAUTH_SECRET,
 *          stored in an HttpOnly cookie, verified on every protected route.
 * AUTH-03: Logout — POST /api/auth/signout clears the session cookie.
 *          Frontend calls signOut() from "next-auth/react".
 * AUTH-04: Current user — GET /api/auth/session (built-in) returns the JWT
 *          payload. Also see /api/auth/me for a richer shape.
 */

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  gxpSignatory: boolean;
  tenantId: string;
  orgId: string;
  username?: string;
}

/** Platform-level bootstrap super admin that always exists. */
const BOOTSTRAP_SUPERADMIN: SessionUser & { password: string } = {
  id: "u-platform-sa",
  name: "Platform Super Admin",
  email: "superadmin",
  username: "superadmin",
  role: "super_admin",
  gxpSignatory: true,
  tenantId: "tenant-glimmora",
  orgId: "org-platform",
  password: "1",
};

/** Hardcoded mock accounts (match the legacy MOCK_ACCOUNTS in LoginPage). */
const MOCK_ACCOUNTS: Array<SessionUser & { password: string }> = [
  { id: "u-001", name: "System Administrator", email: "admin@pharmaglimmora.com", role: "super_admin", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora", password: "Admin@123" },
  { id: "u-009", name: "Customer Administrator", email: "custadmin@pharmaglimmora.com", role: "customer_admin", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora", password: "CustAdmin@123" },
  { id: "u-002", name: "Dr. Priya Sharma", email: "qa@pharmaglimmora.com", role: "qa_head", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora", password: "QaHead@123" },
  { id: "u-003", name: "Rahul Mehta", email: "ra@pharmaglimmora.com", role: "regulatory_affairs", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora", password: "RegAff@123" },
  { id: "u-004", name: "Anita Patel", email: "csv@pharmaglimmora.com", role: "csv_val_lead", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora", password: "CsvVal@123" },
  { id: "u-005", name: "Dr. Nisha Rao", email: "qc@pharmaglimmora.com", role: "qc_lab_director", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora", password: "QcLab@123" },
  { id: "u-006", name: "Vikram Singh", email: "it@pharmaglimmora.com", role: "it_cdo", gxpSignatory: false, orgId: "org-1", tenantId: "tenant-glimmora", password: "ItCdo@123" },
  { id: "u-007", name: "Suresh Kumar", email: "ops@pharmaglimmora.com", role: "operations_head", gxpSignatory: false, orgId: "org-1", tenantId: "tenant-glimmora", password: "OpsHead@123" },
  { id: "u-008", name: "View Only User", email: "viewer@pharmaglimmora.com", role: "viewer", gxpSignatory: false, orgId: "org-1", tenantId: "tenant-glimmora", password: "Viewer@123" },
];

async function findTenantUser(
  username: string,
  password: string,
): Promise<SessionUser | null> {
  if (!process.env.DATABASE_URL) return null;
  const sql = neon(process.env.DATABASE_URL);
  const key = username.toLowerCase().trim();

  const rows = (await sql`
    select id, name, plan, admin_email, active, config, subscription_plans
    from tenants
  `) as Array<{
    id: string;
    name: string;
    plan: string;
    admin_email: string;
    active: boolean;
    config: { users?: Array<Record<string, unknown>> };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subscription_plans: any[] | null;
  }>;

  for (const row of rows) {
    const users = row.config?.users ?? [];
    for (const u of users) {
      const status = u.status as string | undefined;
      if (status !== "Active") continue;
      const matches =
        (typeof u.username === "string" && u.username.toLowerCase() === key) ||
        (typeof u.email === "string" && u.email.toLowerCase() === key) ||
        (typeof u.name === "string" && u.name.toLowerCase() === key);
      if (!matches) continue;
      if (typeof u.password === "string" && u.password !== password) continue;

      // Subscription gate — block login when the tenant has no active or
      // non-expired subscription. Throwing a tagged error lets next-auth
      // surface a clear message back to the login UI.
      const tenantShape = {
        active: row.active,
        subscriptionPlans: row.subscription_plans ?? [],
      };
      if (!isTenantEffectivelyActive(tenantShape)) {
        throw new Error("SUBSCRIPTION_INACTIVE");
      }

      return {
        id: String(u.id ?? ""),
        name: String(u.name ?? ""),
        email: String(u.email ?? ""),
        username: typeof u.username === "string" ? u.username : undefined,
        role: String(u.role ?? "viewer"),
        gxpSignatory: Boolean(u.gxpSignatory),
        tenantId: row.id,
        orgId: row.id,
      };
    }
  }
  return null;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 }, // 12 hours
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Username and password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username?.trim();
        const password = credentials?.password ?? "";
        if (!username || !password) return null;

        const key = username.toLowerCase();

        // 1. Platform bootstrap super admin
        if (
          key === (BOOTSTRAP_SUPERADMIN.username ?? "").toLowerCase() &&
          password === BOOTSTRAP_SUPERADMIN.password
        ) {
          const { password: _p, ...user } = BOOTSTRAP_SUPERADMIN;
          return user as SessionUser & { id: string };
        }

        // 2. Hardcoded mock accounts (dev convenience)
        const mock = MOCK_ACCOUNTS.find(
          (a) => a.email.toLowerCase() === key && a.password === password,
        );
        if (mock) {
          const { password: _p, ...user } = mock;
          return user as SessionUser & { id: string };
        }

        // 3. Tenant users stored in Neon
        try {
          const tenantUser = await findTenantUser(username, password);
          if (tenantUser) return tenantUser as SessionUser & { id: string };
        } catch (err) {
          console.error("[auth] tenant user lookup failed", err);
        }

        return null;
      },
    }),

    /* ─── Keycloak OIDC (disabled — enable when you run a realm) ───
     * Uncomment and provide env vars:
     *   KEYCLOAK_CLIENT_ID
     *   KEYCLOAK_CLIENT_SECRET
     *   KEYCLOAK_ISSUER  (e.g. https://kc.example.com/realms/glimmora)
     *
     * import KeycloakProvider from "next-auth/providers/keycloak";
     * KeycloakProvider({
     *   clientId: process.env.KEYCLOAK_CLIENT_ID!,
     *   clientSecret: process.env.KEYCLOAK_CLIENT_SECRET!,
     *   issuer: process.env.KEYCLOAK_ISSUER!,
     * }),
     */
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Persist custom user fields on the JWT
      if (user) {
        const su = user as unknown as SessionUser;
        token.id = su.id;
        token.role = su.role;
        token.gxpSignatory = su.gxpSignatory;
        token.tenantId = su.tenantId;
        token.orgId = su.orgId;
        token.username = su.username;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose custom fields on the client-side session object
      if (session.user) {
        (session.user as Record<string, unknown>).id = token.id;
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).gxpSignatory = token.gxpSignatory;
        (session.user as Record<string, unknown>).tenantId = token.tenantId;
        (session.user as Record<string, unknown>).orgId = token.orgId;
        (session.user as Record<string, unknown>).username = token.username;
      }
      return session;
    },
  },
  // NOTE: `pages.signIn` intentionally NOT set. Our custom login page is a
  // react-router route served by the Next.js catch-all `[[...all]].tsx`, so
  // Next.js doesn't see /login as a real top-level page. Setting
  // `pages.signIn: "/login"` caused next-auth to build redirects with
  // callbackUrl=/login which left users stranded on /api/auth/signin. We
  // handle redirects to /login ourselves via next.config.mjs rewrites and
  // the LoginPage component.
};

export default NextAuth(authOptions);
