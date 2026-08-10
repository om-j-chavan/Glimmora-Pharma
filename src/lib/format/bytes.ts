/**
 * Byte-size display formatters.
 *
 * DISPLAY-ONLY formatters. NEVER pass a value through these into a
 * canonicaliser/signing input or an audit-log value — doing so changes
 * signature hashes. Canonicaliser inputs must stay raw Date.toISOString().
 *
 * Matches the plain-TS convention of src/lib/labels/* (no deps).
 */

/**
 * Human-readable file size: `B` under 1 KiB, else `KB`/`MB` to ONE decimal.
 *
 * The single decimal is the contract — "512.0 KB", not "512 KB". A separate
 * copy in src/components/documents/DocumentUpload.tsx renders KB with
 * `.toFixed(0)` and is deliberately NOT merged here: absorbing it would change
 * what that uploader displays. Leave it local until someone decides that
 * difference is unwanted.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
