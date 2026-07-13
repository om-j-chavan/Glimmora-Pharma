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
      {/* Layer 1 — the static tilted pill. Sized as a fraction of the panel
          (width: 50% + aspect-ratio) rather than fixed px, so it stays
          proportional at every breakpoint. `border-radius: 9999px` on a 3.5:1
          box gives a true capsule, so no SVG is needed.

          The fill is white at a fixed low alpha — NOT the `opacity` property and
          not a brand tint — so it reads identically against every one of the 14
          colour themes the panel gradient can take. Anchored at left 22% (not
          15%) because at this size a 15% anchor pushed ~a third of the capsule
          past the panel's left edge. No animation on the pill itself. */}
      <div
        className="absolute"
        style={{
          left: "22%",
          top: "46%",
          width: "50%",
          aspectRatio: "3.5 / 1",
          transform: "translate(-50%, -50%) rotate(-45deg)",
          borderRadius: "9999px",
          background: "rgba(255, 255, 255, 0.09)",
          zIndex: 0,
        }}
      />

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
