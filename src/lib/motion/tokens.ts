/**
 * Motion tokens — the single source of truth for durations, easings, and
 * stagger delays. Every animation in the app reads from here so tempo and feel
 * stay consistent (and tunable in one place). Durations are in SECONDS because
 * framer-motion works in seconds; the cubic-bezier easings are plain 4-number
 * arrays so the same curves can be reused in CSS if ever needed.
 */

// Durations (seconds). Entrances never exceed `moderate` (0.3s) — the app's
// tempo is deliberately fast/snappy.
export const DURATION = {
  fast: 0.2, // hover, tap, focus (kept quick — instant feedback)
  base: 0.4, // page entrance, tab indicator, most reveals
  moderate: 0.45, // modal open, drawer slide
} as const;

// Easings as cubic-bezier arrays (control points), consistent across CSS and
// framer-motion.
export const EASE = {
  standard: [0.4, 0, 0.2, 1] as const, // most animations (symmetric)
  out: [0, 0, 0.2, 1] as const, // entrances (decelerate in)
  in: [0.4, 0, 1, 1] as const, // exits (accelerate out)
} as const;

// Stagger delays for lists (seconds between successive children).
export const STAGGER = {
  fast: 0.04, // table row stagger (rows shouldn't drag)
  base: 0.06, // stat card cascade (more deliberate)
} as const;

export type DurationToken = keyof typeof DURATION;
export type EaseToken = keyof typeof EASE;
export type StaggerToken = keyof typeof STAGGER;
