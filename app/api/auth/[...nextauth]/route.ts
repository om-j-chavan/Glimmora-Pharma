import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * NextAuth — Credentials provider backed by Prisma SQLite.
 *
 * Lookup order:
 *   1. Bootstrap super admin (`superadmin` / `1`) — always available,
 *      does not touch the DB. Safety net if Prisma is misconfigured.
 *   2. Tenant table — super_admin / customer_admin accounts, keyed by
 *      email OR username (case-insensitive).
 *   3. User table — site users (qa_head, regulatory_affairs, etc.),
 *      keyed by email OR username.
 *
 * Credentials field name is `username` to match the client helper in
 * [src/lib/authClient.ts] which calls
 *   signIn("credentials", { username, password }).
 * The field accepts either an email or a username.
 */

interface SessionUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  role: string;
  gxpSignatory: boolean;
  tenantId: string;
  orgId: string;
  siteId?: string | null;
}

const BOOTSTRAP_SUPERADMIN = {
  id: "u-platform-sa",
  name: "Platform Super Admin",
  email: "superadmin",
  username: "superadmin",
  role: "super_admin",
  gxpSignatory: true,
  tenantId: "tenant-glimmora",
  orgId: "org-platform",
  password: "1",
} as const;

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "Username and password",
      credentials: {
        username: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const rawUsername = credentials?.username?.trim();
        const password = credentials?.password ?? "";
        if (!rawUsername || !password) return null;
        const key = rawUsername.toLowerCase();

        // 1. Bootstrap super admin — no DB required.
        if (
          key === BOOTSTRAP_SUPERADMIN.username &&
          password === BOOTSTRAP_SUPERADMIN.password
        ) {
          const { password: _p, ...user } = BOOTSTRAP_SUPERADMIN;
          return user as unknown as SessionUser;
        }

        try {
          // 2. Tenant (super_admin / customer_admin).
          const tenant = await prisma.tenant.findFirst({
            where: {
              OR: [{ email: key }, { username: key }],
            },
            include: { subscription: true },
          });

          if (tenant) {
            if (!tenant.isActive) throw new Error("USER_INACTIVE");
            const valid = await bcrypt.compare(password, tenant.passwordHash);
            if (!valid) return null;

            const result: SessionUser = {
              id: tenant.id,
              name: tenant.name,
              email: tenant.email,
              username: tenant.username,
              role: tenant.role,
              gxpSignatory: false,
              tenantId: tenant.id,
              orgId: tenant.id,
              siteId: null,
            };
            return result as unknown as SessionUser;
          }

          // 3. User table (site users).
          const user = await prisma.user.findFirst({
            where: {
              OR: [{ email: key }, { username: key }],
            },
          });

          if (user) {
            if (!user.isActive) throw new Error("USER_INACTIVE");
            const valid = await bcrypt.compare(password, user.passwordHash);
            if (!valid) return null;

            await prisma.user.update({
              where: { id: user.id },
              data: { lastLogin: new Date() },
            });

            const result: SessionUser = {
              id: user.id,
              name: user.name,
              email: user.email,
              username: user.username,
              role: user.role,
              gxpSignatory: user.gxpSignatory,
              tenantId: user.tenantId,
              orgId: user.tenantId,
              siteId: user.siteId,
            };
            return result as unknown as SessionUser;
          }
        } catch (err) {
          if (err instanceof Error && err.message === "USER_INACTIVE") throw err;
          console.error("[auth] authorize failed:", err);
          return null;
        }

        return null;
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
        token.username = su.username;
        token.siteId = su.siteId ?? null;
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
        u.username = token.username;
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
