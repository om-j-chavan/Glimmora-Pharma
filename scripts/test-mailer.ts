/**
 * Manual mailer smoke test.
 *
 * Usage:
 *   npm run test:mailer -- you@example.com
 *
 * Sends a verification code (hardcoded "123456") via `sendOtpEmail`. Prints
 * the returned messageId on success, or the error and exits non-zero.
 *
 * With GMAIL_USER + GMAIL_APP_PASSWORD set: sends a real email.
 * Without creds (dev fallback): logs `[mailer:dev] ...` and returns
 * messageId "dev-mode".
 */

import "dotenv/config";

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npm run test:mailer -- <recipient-email>");
    process.exit(1);
  }

  // Dynamic import — must happen after the loader hook is registered above.
  const { sendOtpEmail } = await import("../src/lib/mailer");

  console.log(`[test:mailer] sending code 123456 to ${to} ...`);
  try {
    const result = await sendOtpEmail(to, "123456");
    console.log(`[test:mailer] ✓ success — messageId: ${result.messageId}`);
  } catch (err) {
    console.error("[test:mailer] ✗ failed:");
    console.error(err);
    process.exit(2);
  }
}

main();
