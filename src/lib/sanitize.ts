/**
 * Filename sanitization for user-uploaded files.
 *
 * Hardening goals:
 *   - Strip path components (no traversal).
 *   - Strip null bytes / ASCII control characters.
 *   - Strip Unicode RTL/LTR override marks (used in extension-spoofing
 *     attacks, e.g. "report‮xfdp.exe" rendering as "report.pdfxe").
 *   - Allowlist alphanumerics + safe punctuation; everything else → "_".
 *   - Cap length so storage layers don't reject the path.
 *   - Reject pathological results ("", ".", "..") with a deterministic
 *     timestamped fallback.
 *   - Lowercase the extension for consistent matching.
 *
 * Examples (also enforced by spec):
 *   "../../etc/passwd"             → "passwd"
 *   "evil‮‭exe.pdf"      → "evilexe.pdf"
 *   "file\x00.pdf"                 → "file.pdf"
 *   "...."                          → "file_<timestamp>"
 *   "good_file.pdf"                → "good_file.pdf"
 *   "C:\\Users\\thiru\\evil.pdf"   → "evil.pdf"
 */
export function sanitizeFilename(input: string): string {
  // 1. Strip path components — only keep the basename.
  const basename = input.split(/[/\\]/).pop() ?? "file";

  // 2. Remove null bytes and ASCII control characters (0x00-0x1F, 0x7F).
  // eslint-disable-next-line no-control-regex
  const noControl = basename.replace(/[\x00-\x1f\x7f]/g, "");

  // 3. Remove Unicode bidi override marks (used in spoofing).
  const noBidi = noControl.replace(/[‪-‮⁦-⁩]/g, "");

  // 4. Allowlist: alphanumeric, dot, hyphen, underscore, space.
  //    Collapse runs of whitespace into a single space; trim edges.
  const allowed = noBidi
    .replace(/[^a-zA-Z0-9._\- ]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  // 5. Strip leading dots (hidden files) and collapse traversal patterns.
  const noDotPrefix = allowed.replace(/^\.+/, "");
  const noTraversal = noDotPrefix.replace(/\.{2,}/g, ".");

  // 6. Length cap (filesystem max is typically 255; leave room for hash prefix).
  const capped = noTraversal.slice(0, 200);

  // 7. Reject empty / pathological results.
  if (!capped || capped === "." || capped === "..") {
    return `file_${Date.now()}`;
  }

  // 8. Lowercase the extension if present and well-formed.
  const lastDot = capped.lastIndexOf(".");
  if (lastDot > 0 && lastDot < capped.length - 1) {
    const name = capped.slice(0, lastDot);
    const ext = capped.slice(lastDot).toLowerCase();
    return `${name}${ext}`;
  }
  return capped;
}
