import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../app/api/auth/[...nextauth]/route";

/**
 * AUTH-04: Current User API
 *
 * GET /api/auth/me
 *
 * Returns the currently authenticated user's profile + role from the JWT.
 * This is a richer wrapper around next-auth's built-in /api/auth/session,
 * matching the shape the frontend Redux store already expects.
 *
 * Responses:
 *   200 { user: { id, name, email, role, gxpSignatory, tenantId, orgId } }
 *   401 { error: "Not authenticated" }
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const u = session.user as Record<string, unknown>;
  return res.status(200).json({
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
