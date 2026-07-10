import type { CSSProperties } from "react";

/**
 * PillWithBubbles — a subtle, self-contained pharma-themed background flourish:
 * one large tilted capsule ("pill") sitting faintly behind the content, with
 * small bubbles continuously rising from its top edge.
 *
 * Pure CSS keyframes (`.pill-bubble` + `@keyframes pill-bubble-rise` in
 * index.css) — no JS animation loop, no animation library. Decorative only:
 * `pointer-events` are none throughout and the whole thing is aria-hidden.
 * Honors `prefers-reduced-motion` (bubbles hidden, the static pill stays).
 *
 * Mount as the FIRST child of a `position: relative; overflow: hidden`
 * container (e.g. the login brand panel) and place real content above it with a
 * higher stacking order (z-2).
 *
 * Layer stack: pill = z-index 0, bubbles = z-index 1, caller content = z-2.
 */

// Deterministic (NOT Math.random) so SSR and client render identically — a
// random value computed at render would trip a hydration mismatch. Hand-picked
// to read as an organic, staggered stream:
//   left  — % across the center-left region the tilted pill occupies.
//   dur   — 6–8s lifetime (varied so they don't march in lockstep).
//   delay — negative stagger (~0.9s apart) so ~7–8 bubbles are in flight at any
//           moment and there's no empty "warm-up" on first paint.
const BUBBLES: { left: number; dur: number; delay: number }[] = [
  { left: 16, dur: 6.5, delay: 0 },
  { left: 22, dur: 7.2, delay: -0.9 },
  { left: 28, dur: 6.8, delay: -1.8 },
  { left: 19, dur: 7.6, delay: -2.7 },
  { left: 33, dur: 6.2, delay: -3.6 },
  { left: 25, dur: 7.9, delay: -4.4 },
  { left: 30, dur: 6.6, delay: -5.2 },
  { left: 37, dur: 7.1, delay: -6.0 },
];

export function PillWithBubbles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Layer 1 — the static tilted pill (~320×90, rotate(-45deg), opacity 0.05).
          No animation on the pill itself; it just sits behind the copy. */}
      <div
        className="absolute"
        style={{ left: "15%", top: "46%", transform: "translate(-50%, -50%) rotate(-45deg)", opacity: 0.05, zIndex: 0 }}
      >
        <svg width="320" height="90" viewBox="0 0 320 90" fill="none">
          {/* rx = height/2 → a true capsule. */}
          <rect x="1" y="1" width="318" height="88" rx="44" ry="44" fill="#ffffff" />
        </svg>
      </div>

      {/* Layer 2 — bubbles rising straight up (gravity; they don't inherit the
          pill's tilt). Size / opacity / lifetime all live in the CSS keyframe. */}
      {BUBBLES.map((b) => (
        <span
          key={`pb-${b.left}-${b.delay}`}
          className="pill-bubble"
          style={{
            left: `${b.left}%`,
            "--pb-dur": `${b.dur}s`,
            "--pb-delay": `${b.delay}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}
