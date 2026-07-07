/**
 * Regulatory Region — the ONE fixed, centrally-stored list, shared by every role
 * and module (Super Admin tenant create/edit, Customer Admin read-only Org view,
 * and anywhere else the region is displayed). No one adds values at runtime.
 *
 * Kept in a plain (non-"use server") constants module so it can be imported by
 * both client and server code. The value codes are the exact set Customer Admin
 * already used in Settings → Organisation; the labels are the friendly forms
 * that were mapped there.
 */
export interface RegulatoryRegionOption {
  value: string;
  label: string;
}

export const REGULATORY_REGIONS: readonly RegulatoryRegionOption[] = [
  { value: "FDA", label: "FDA (United States)" },
  { value: "EMA", label: "EMA (European Union)" },
  { value: "India", label: "India — CDSCO + WHO GMP" },
  { value: "CDSCO", label: "CDSCO (India)" },
  { value: "PMDA", label: "PMDA (Japan)" },
  { value: "TGA", label: "TGA (Australia)" },
  { value: "WHO", label: "WHO (Global)" },
  { value: "MHRA", label: "MHRA (United Kingdom)" },
] as const;

/**
 * GLOBAL — the reserved, system-protected region (Stage 1). It is a real
 * RegulatoryRegion row (seeded), the reassignment target when another region is
 * archived, and the region a "Global" framework conceptually belongs to. Its
 * VALUE is "GLOBAL" (immutable, like every region value) and it is PROTECTED:
 * it can never be archived, superseded, or permanently deleted — the exact
 * parallel to the reserved framework keys.
 */
export const GLOBAL_REGION_VALUE = "GLOBAL";
export const GLOBAL_REGION_LABEL = "Global";

/** Reserved region values — protected from archive / supersede / hard-delete
 *  server-side, mirroring RESERVED_FRAMEWORK_KEYS. */
export const RESERVED_REGION_VALUES: ReadonlySet<string> = new Set([GLOBAL_REGION_VALUE]);

/** True when a region value is reserved/system-protected (currently GLOBAL). */
export function isReservedRegion(value: string): boolean {
  return RESERVED_REGION_VALUES.has(value);
}

/** Canonical labels for reserved regions — lets `regulatoryRegionLabel` resolve
 *  GLOBAL even without a DB label map (pure-constant callers). */
const RESERVED_REGION_LABELS: Record<string, string> = { [GLOBAL_REGION_VALUE]: GLOBAL_REGION_LABEL };

/**
 * Derive an immutable region VALUE (uppercase underscore slug) from a display
 * name — "European Union" → "EUROPEAN_UNION", "EMA" → "EMA". The value is the
 * permanent key stored on Tenant.regulatoryRegion + FrameworkRegion.region and
 * the basis for the readable REG-<VALUE> id. Plain-TS so the create modal can
 * preview the exact id the server will assign.
 */
export function deriveRegionValue(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

/** Prettify a slug-ish value ("eu-annex-1" → "Eu Annex 1"); leaves plain codes
 *  like "FDA"/"EMA" intact (single token → first char upper, rest preserved). */
function prettifyRegion(value: string): string {
  if (!/[-_]/.test(value)) return value; // codes (FDA, EMA, …) unchanged
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Human-readable label for a stored region value. Resolution order (Item #3,
 * Stage 2): DB label map (when provided — includes ARCHIVED regions, so a tenant
 * on an archived/removed region still labels) → the REGULATORY_REGIONS constant
 * → a prettified value.
 *
 * `labelMap` is the DB-sourced value→label map (from the regions slice or a
 * server query). Callers without it fall through to the constant, which —
 * post-seed — is byte-identical for the 8 active regions.
 */
export function regulatoryRegionLabel(value: string, labelMap?: Record<string, string>): string {
  if (!value) return value;
  return (
    labelMap?.[value] ??
    RESERVED_REGION_LABELS[value] ??
    REGULATORY_REGIONS.find((r) => r.value === value)?.label ??
    prettifyRegion(value)
  );
}
