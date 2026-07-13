"use server";

import { headers } from "next/headers";

/**
 * Cross-domain server helper for the four CAPA action files (lifecycle,
 * closure, alignment, approvals).
 *
 * The companion `_types.ts` carries non-async-function exports (the
 * ActionResult type and audit module string constants) — those can't
 * live here because "use server" files in Next 16 must export only
 * async functions.
 */

/**
 * Read x-forwarded-for + user-agent from the current request headers,
 * if available. Server actions in Next 16 expose headers() — but the
 * function is async and the call may fail in non-request contexts (e.g.
 * test harnesses). Returns null on either dimension if unavailable;
 * signing must not fail just because provenance is unrecoverable.
 */
export async function readSigningProvenance(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    // x-forwarded-for is a comma-separated chain when proxies are in
    // play; the first entry is the original client. Fall back to
    // x-real-ip then null.
    const xff = h.get("x-forwarded-for");
    const ipAddress = xff
      ? (xff.split(",")[0]?.trim() ?? null)
      : (h.get("x-real-ip") ?? null);
    const userAgent = h.get("user-agent");
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}
