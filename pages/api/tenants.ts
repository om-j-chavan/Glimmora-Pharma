import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import handler from "../../api/tenants";

/**
 * Tenants API — protected by next-auth session.
 *
 * Only authenticated users can read/write tenants. super_admin and
 * customer_admin may mutate; everyone else gets 403 on writes.
 */
export default async function tenantsRoute(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const role = (session.user as Record<string, unknown>).role as
    | string
    | undefined;

  // Read-only endpoints (GET) are open to any authenticated user.
  // Write endpoints require super_admin or customer_admin.
  if (req.method !== "GET") {
    if (role !== "super_admin" && role !== "customer_admin") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
  }

  // Delegate to the existing handler that talks to Neon.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (handler as any)(req, res);
}
