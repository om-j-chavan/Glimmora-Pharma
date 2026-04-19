import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Diagnostic endpoint — reports which database-related env vars exist
 * (never leaks their values). Hit GET /api/debug-env to verify the
 * Vercel deployment has DATABASE_URL and NEXTAUTH_SECRET configured.
 */
export default function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  const url = process.env.DATABASE_URL;
  let host: string | null = null;
  if (url) {
    try {
      host = new URL(url).hostname;
    } catch {
      host = "(invalid URL format)";
    }
  }

  return res.status(200).json({
    databaseUrlSet: !!url,
    databaseUrlLength: url?.length ?? 0,
    databaseUrlHost: host,
    nextAuthSecretSet: !!process.env.NEXTAUTH_SECRET,
    nextAuthUrl: process.env.NEXTAUTH_URL ?? null,
    otherVarsPresent: {
      DATABASE_URL_UNPOOLED: !!process.env.DATABASE_URL_UNPOOLED,
      POSTGRES_URL: !!process.env.POSTGRES_URL,
      PGHOST: !!process.env.PGHOST,
      PGUSER: !!process.env.PGUSER,
      PGDATABASE: !!process.env.PGDATABASE,
    },
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
  });
}
