/**
 * Password / hash cost constants. One canonical location so every
 * bcrypt.hash() call site uses the same work factor — historically a
 * literal `10` was duplicated across actions/settings.ts,
 * actions/tenants.ts, prisma/seed.ts, and the OTP code-hashing path.
 *
 * Why 10: bcrypt's default. ~70-100ms on commodity server hardware,
 * fast enough that login throughput stays comfortable while slow
 * enough to be hostile to offline brute-force. Bump to 12 once
 * average login latency budget allows the extra ~250ms.
 */
export const BCRYPT_COST = 10;

/**
 * Evaluates password strength on a 0-4 scale. Used by the admin
 * Add/Edit Customer Account modal to drive the 4-segment strength
 * meter and gate the Save Account button.
 *
 * Segments earned (one per condition met):
 *   1 — length >= 12
 *   2 — contains both upper and lower case
 *   3 — contains at least one digit
 *   4 — contains at least one symbol (non-alphanumeric)
 *
 * Returns the count of conditions met (0 to 4).
 */
export function evaluatePasswordStrength(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

/**
 * Generates a 16-character (by default) strong password that always
 * satisfies all 4 strength conditions: length >= 12, mixed case, at
 * least one digit, at least one symbol.
 *
 * Uses `crypto.getRandomValues` when available (browser + modern Node)
 * for cryptographically random bytes. Falls back to Math.random only
 * if crypto is unavailable — acceptable for the legacy path because
 * the generator is only exposed in admin UX and the resulting password
 * is shown to and immediately copied by the user, not used as a long-
 * lived secret material on its own.
 *
 * Excludes visually-ambiguous characters (0/O, 1/l/I) to reduce copy
 * errors when the user types or transcribes the password.
 */
export function generateStrongPassword(length = 16): string {
  const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // skip I, O
  const LOWER = "abcdefghijkmnopqrstuvwxyz";  // skip l
  const DIGITS = "23456789";                  // skip 0, 1
  const SYMBOLS = "!@#$%^&*-_=+";
  const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

  // One char from each class first — guarantees strength === 4.
  const required = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGITS[randomInt(DIGITS.length)],
    SYMBOLS[randomInt(SYMBOLS.length)],
  ];
  // Fill remaining slots from the combined pool.
  const rest: string[] = [];
  for (let i = 0; i < Math.max(0, length - required.length); i++) {
    rest.push(ALL[randomInt(ALL.length)]);
  }
  // Fisher-Yates shuffle so the required-class chars aren't always at
  // the start (predictability hint to an attacker if the generator
  // pattern were known).
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function randomInt(maxExclusive: number): number {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}
