/**
 * Identity display — single source of truth for rendering "who" in the UI.
 *
 * Rung 3J (AUDIT-GLOBAL-PATTERNS Finding #11). Replaces ~19 copy-pasted
 * `ownerName(id) => users.find(...)?.name ?? id` helpers. The old pattern had
 * three faults this module fixes:
 *   1. It leaked the raw cuid to the UI when a user couldn't be resolved
 *      (the `?? id` fallback). These helpers NEVER return an id.
 *   2. It ignored the denormalised name columns that Rungs 3E/3E.2/3G-2
 *      populate for every actor (createdBy, detectedBy, submittedBy,
 *      signedOffByName, …) — those are now preferred via displayName().
 *   3. It conflated two distinct input types (a real User.id vs an
 *      already-a-name denorm string), causing name-as-id bugs. The two
 *      functions below keep those inputs separate.
 *
 * Post-3E identity model this handles:
 *   - real User.id  → resolves to a User.name
 *   - super_admin   → userId null, denorm name "Platform Administrator"
 *   - customer_admin→ userId null, denorm tenant-admin name
 *   - unresolvable  → the fallback string, NEVER the raw id
 */

const DEFAULT_FALLBACK = "Unknown user";

/**
 * Render a person from a record that carries a denormalised NAME (and
 * optionally a userId). The denorm name always wins; a bare userId never
 * leaks — it degrades to the fallback. Use for createdBy / detectedBy /
 * submittedBy / signedOffByName / closedByName / *By columns.
 */
export function displayName(input: {
  userId?: string | null;
  name?: string | null;
  fallback?: string;
}): string {
  const name = input.name?.trim();
  if (name) return name;
  // A row may have a userId but no denorm name (older record, or an
  // admin actor). We deliberately do NOT echo the id — show the fallback.
  return input.fallback ?? DEFAULT_FALLBACK;
}

// A Prisma `@default(cuid())` id — c + 24 lowercase alphanumerics. Used to
// detect (and hide) a raw id that failed to resolve, without mistaking a
// human name for one. Human names carry spaces/capitals and won't match.
const CUID_RE = /^c[a-z0-9]{20,}$/;

/**
 * Render a person from an "owner"-style field by resolving it against a
 * loaded users list. Replaces the old `ownerName(uid, users)` copies, which
 * were a resolve-OR-passthrough: some owner fields store a real User.id,
 * others store a free-typed name. This preserves that (so a name-valued
 * owner is NOT lost) while closing the one real bug — a raw cuid leaking to
 * the UI when an id can't be resolved:
 *   - id resolves in `users`        → that user's name
 *   - value looks like a raw cuid   → fallback (NEVER leak the id)
 *   - otherwise (a human name)      → the value, passed through
 *   - empty                         → fallback
 */
export function displayUserName(
  value: string | null | undefined,
  users: ReadonlyArray<{ id: string; name?: string | null }>,
  fallback: string = DEFAULT_FALLBACK,
): string {
  const v = value?.trim();
  if (!v) return fallback;
  const match = users.find((u) => u.id === v);
  const resolved = match?.name?.trim();
  if (resolved) return resolved;
  if (CUID_RE.test(v)) return fallback; // unresolvable id — don't leak it
  return v; // a free-typed human name — preserve it
}

/**
 * Site sibling of displayUserName — resolve a Site id against a loaded sites
 * list (Rung 3J.1, closing the parallel `siteName(id) => sites.find()?.name ?? id`
 * cuid-leak). Same cuid-aware contract:
 *   - id resolves in `sites`        → that site's name
 *   - value looks like a raw cuid   → fallback (NEVER leak the id)
 *   - otherwise (a free-typed name) → the value, passed through
 *   - empty                         → fallback
 */
export function displaySiteName(
  value: string | null | undefined,
  sites: ReadonlyArray<{ id: string; name?: string | null }>,
  fallback: string = "Unknown site",
): string {
  const v = value?.trim();
  if (!v) return fallback;
  const match = sites.find((s) => s.id === v);
  const resolved = match?.name?.trim();
  if (resolved) return resolved;
  if (CUID_RE.test(v)) return fallback; // unresolvable id — don't leak it
  return v; // a free-typed name — preserve it
}
