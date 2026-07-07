/**
 * Per-tenant per-year reference allocator. Generates strings like
 * "CAPA-2026-014" or "CC-2026-003" by reading the highest existing
 * reference for the tenant + prefix + year, parsing its trailing
 * sequence number, and adding 1.
 *
 * Pure helper — does no Prisma access itself. The caller passes a count
 * callback that runs inside the calling transaction so the count + insert
 * happen atomically. The caller is also responsible for the retry-on-P2002
 * loop: race-safe sequence allocation requires it because two concurrent
 * inserts can read the same count and both compute the same reference.
 *
 * Cross-tenant note: the reference column on both CAPA and ChangeControl
 * is globally @unique (not @@unique([tenantId, reference])) to keep the
 * SQLite index simple. The per-tenant count means tenant A's first CC in
 * 2026 and tenant B's first CC in 2026 both compute "CC-2026-001" — one
 * succeeds, the other gets P2002 and the caller's retry loop bumps its
 * own count to 2. End state: each tenant's references are approximately
 * sequential, gaps possible across cross-tenant collisions.
 *
 * Why max-based, not count-based: count() over rows whose createdAt falls
 * inside the current year can disagree with the existing reference values
 * for that year (seed data, manual inserts, or rows whose createdAt was
 * back-dated for any reason). Counting 0 while CAPA-2026-001 already
 * exists guarantees P2002 on every attempt and the retry loop converges
 * on the same dead value. Reading the max reference of the tenant for
 * the year is independent of createdAt, so the next number is always
 * strictly above any existing one.
 */
export async function generateReference(
  prefix: string,
  now: Date,
  findLatestForYear: (prefix: string, year: number) => Promise<string | null>,
  // Zero-pad width for the trailing sequence. Defaults to 3 ("-001") to keep
  // every existing caller unchanged; support tickets pass 5 ("-00042").
  pad = 3,
): Promise<string> {
  const year = now.getUTCFullYear();
  const latest = await findLatestForYear(prefix, year);
  let nextNum = 1;
  if (latest) {
    // Trailing run of digits — tolerant of any future "-XYZ" suffix
    // formats while still parsing today's "-NNN" cleanly.
    const m = latest.match(/-(\d+)$/);
    if (m) {
      const parsed = Number.parseInt(m[1], 10);
      if (Number.isFinite(parsed)) nextNum = parsed + 1;
    }
  }
  return `${prefix}-${year}-${String(nextNum).padStart(pad, "0")}`;
}

/**
 * Display helper for a record's human-readable reference. Falls back to a
 * stable "<PREFIX>-LEGACY-<8>" label for rows whose reference is null (legacy
 * rows that predate the column). Mirrors the CAPA module's display pattern.
 */
export function formatReference(
  prefix: string,
  record: { reference?: string | null; id: string },
): string {
  return record.reference ?? `${prefix}-LEGACY-${record.id.slice(0, 8)}`;
}

/**
 * Helper that detects the specific Prisma error indicating a unique
 * constraint collision on the `reference` column. Use to decide whether
 * to retry or rethrow inside the caller's create loop.
 */
export function isReferenceConflict(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: string[] } } | null;
  return e?.code === "P2002" && (e?.meta?.target?.includes("reference") ?? false);
}

/**
 * Build the segmented prefix used by the new per-site reference format
 * (e.g. "DEV-CHN"). Trims the site code defensively — uppercase 2-6
 * chars are validated at the schema/UI layer, but a stray null falls
 * back to the legacy 2-segment format ("DEV-2026-001") so a misconfigured
 * site doesn't block record creation entirely.
 *
 * Module codes: "DEV" | "CAPA" | "FND" | "483" | "CC" — kept as plain
 * strings (not an enum) because each create-action passes its own
 * literal and TS narrows at the call site.
 */
export function buildReferencePrefix(
  moduleCode: string,
  siteCode: string | null | undefined,
): string {
  return siteCode ? `${moduleCode}-${siteCode}` : moduleCode;
}

/**
 * Derive a 3-letter SITE_CODE fallback from a site name when Site.code is
 * unset. Strips accents/non-ASCII, takes the first three letters uppercased,
 * pads with "X" if the name has fewer than three letters. Site.code is the
 * canonical source (used by every module's reference); this only covers a
 * misconfigured site so reference generation never blocks record creation.
 */
export function deriveSiteCode(name: string | null | undefined): string {
  if (!name) return "XXX";
  const letters = name.normalize("NFKD").replace(/[^a-zA-Z]/g, "");
  if (!letters) return "XXX";
  return letters.slice(0, 3).toUpperCase().padEnd(3, "X");
}
