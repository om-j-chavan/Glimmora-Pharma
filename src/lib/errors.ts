// Single sanitiser for any error that might be surfaced to a user.
//
// Server Actions and client-side catch blocks must NEVER surface raw
// `err.message` to the UI — that can include Prisma error codes (P2002
// etc.), table/column names, stack-trace fragments, or other internal
// detail. Use sanitizeServerError() in every catch block; log the raw
// error to console.error for debugging and return the sanitised string
// to the caller.
//
// Duck-typed Prisma detection (`err.code === "P2002"`) is used rather
// than `instanceof Prisma.PrismaClientKnownRequestError` so that action
// files don't have to import the Prisma namespace as a value.

import { ZodError } from "zod";

/** Map of known Prisma error codes → friendly sentence. */
const PRISMA_MESSAGES: Record<string, string> = {
  P2000: "One of the provided values is too long.",
  P2001: "Record not found.",
  P2002: "A record with this value already exists.",
  P2003: "This action conflicts with related records.",
  P2004: "A database constraint blocked this change.",
  P2025: "Record not found.",
};

function getPrismaCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null;
}

/**
 * Convert any thrown value into a user-facing string. Prisma codes are
 * mapped to a friendly sentence; ZodError surfaces the first issue
 * message; everything else falls through to `fallback`. Never returns
 * raw `err.message`, even for `Error` subclasses — message content can
 * include detail you do not want users to see.
 *
 * Call sites should still `console.error(err)` first so the original
 * stack/message lands in server logs.
 */
export function sanitizeServerError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  const prismaCode = getPrismaCode(err);
  if (prismaCode && PRISMA_MESSAGES[prismaCode]) {
    return PRISMA_MESSAGES[prismaCode];
  }
  if (err instanceof ZodError) {
    return err.issues[0]?.message ?? "Invalid input.";
  }
  return fallback;
}
