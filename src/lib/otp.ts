// NOTE: cannot use `import "server-only"` here — this file is consumed by
// pages/api/auth/[...nextauth].ts (Pages Router), and the server-only
// package's runtime check throws when imported from any non-App-Router
// context. Server-side use is enforced by convention and by the fact that
// every consumer is a server file (`pages/api/*` or `"use server"` action).

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * One-time-password helpers for tenant-level MFA.
 *
 * Identifier semantics:
 *   - Lowercased email of the row being authenticated.
 *   - tenantId === null  → identifier resolves against the Tenant table
 *                          (super_admin / customer_admin login path).
 *   - tenantId === <id>  → identifier resolves against the User table
 *                          scoped to that tenant.
 *
 * The (identifier, tenantId) pair is the natural key under which OTPs are
 * stored and verified. No FK on EmailOTP — see the model comment in
 * prisma/schema.prisma for rationale.
 *
 * Codes: cryptographically random 6 digits, bcrypt-hashed (cost 10),
 * 10-minute expiry, max 5 verify attempts before the row is consumed.
 *
 * Cleanup of expired rows is intentionally NOT done here — that's a
 * separate hygiene job.
 */

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const BCRYPT_COST = 10;

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Issues a fresh OTP for (identifier, tenantId). Any prior unconsumed OTP
 * for the same key is invalidated in the same transaction so resends and
 * re-issues never leave more than one live code outstanding.
 */
export async function generateOtp(
  identifier: string,
  tenantId: string | null,
): Promise<string> {
  const id = identifier.toLowerCase();
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.$transaction([
    prisma.emailOTP.updateMany({
      where: { identifier: id, tenantId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.emailOTP.create({
      data: {
        identifier: id,
        tenantId,
        codeHash,
        expiresAt,
        attempts: 0,
      },
    }),
  ]);

  return code;
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "invalid" | "locked" | "no_otp" };

/**
 * Verifies a code against the most recent unconsumed OTP for (identifier,
 * tenantId). Side effects:
 *   - Expired or attempt-locked rows are consumed in place.
 *   - On a wrong code, attempts is incremented; if it reaches MAX_ATTEMPTS
 *     the row is consumed and the result is "locked".
 *   - On a correct code, the row is consumed.
 */
export async function verifyOtp(
  identifier: string,
  tenantId: string | null,
  code: string,
): Promise<VerifyOtpResult> {
  const id = identifier.toLowerCase();

  const otp = await prisma.emailOTP.findFirst({
    where: { identifier: id, tenantId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { ok: false, reason: "no_otp" };

  if (otp.expiresAt.getTime() < Date.now()) {
    await prisma.emailOTP.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: "expired" };
  }

  if (otp.attempts >= MAX_ATTEMPTS) {
    await prisma.emailOTP.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, reason: "locked" };
  }

  const match = await bcrypt.compare(code, otp.codeHash);

  if (!match) {
    const nextAttempts = otp.attempts + 1;
    const reachedLimit = nextAttempts >= MAX_ATTEMPTS;
    await prisma.emailOTP.update({
      where: { id: otp.id },
      data: {
        attempts: nextAttempts,
        ...(reachedLimit ? { consumedAt: new Date() } : {}),
      },
    });
    return { ok: false, reason: reachedLimit ? "locked" : "invalid" };
  }

  await prisma.emailOTP.update({
    where: { id: otp.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true };
}
