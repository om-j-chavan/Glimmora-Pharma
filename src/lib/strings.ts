/**
 * Title-case a free-text string: the first letter of every word is upper-cased
 * and the rest lower-cased. Word boundaries are the start of the string and any
 * space, comma, hyphen or slash — so "hyderabad, india" → "Hyderabad, India"
 * and "unit-2/block a" → "Unit-2/Block A". Whitespace is trimmed and internal
 * runs collapsed to single spaces.
 */
export function titleCase(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|[\s,\-/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
