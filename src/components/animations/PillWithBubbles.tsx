import type { CSSProperties } from "react";

/**
 * PillWithBubbles — a rich, self-contained pharma-themed background flourish for
 * the login brand panel. Layered for depth:
 *
 *   Layer 1 (panel bg)  — green gradient (lives on `.login-brand-panel`).
 *   Layer 2 — one large, softly-blurred tilted capsule ("pill") sitting behind
 *             the heading as a design element (z-0).
 *   Layer 3 — 6 glowing bubbles rising from the pill (z-1).
 *   Layer 4 — a fine noise/grain texture (mix-blend overlay, ~4%) so the panel
 *             reads as a textured surface, not a flat fill (z-1, above bubbles).
 *   Layer 5 — the caller's real content (badge/heading/copy), z-2.
 *
 * Pure CSS keyframes (`.pill-bubble` + `@keyframes pill-bubble-rise` in
 * index.css) — no JS animation loop, no animation library. Decorative only:
 * `pointer-events` are none throughout and the whole thing is aria-hidden.
 * Honors `prefers-reduced-motion` (bubbles hidden; the static pill + grain
 * stay). Animation is transforms + opacity only, so idle GPU cost stays low.
 *
 * Mount as the FIRST child of a `position: relative; overflow: hidden`
 * container (the login brand panel) and place real content above it at z-2.
 */

// Deterministic (NOT Math.random) so SSR and client render identically — a
// random value computed at render would trip a hydration mismatch. Hand-picked
// to read as an organic, staggered stream:
//   left  — % across the center-left region the tilted pill occupies.
//   dur   — 6–8s lifetime (varied so they don't march in lockstep).
//   delay — negative stagger (~1.1s apart) so several bubbles are in flight at
//           any moment and there's no empty "warm-up" on first paint.
//   size  — per-bubble diameter (12–18px); the keyframe scales .5→1, so on
//           screen they span ~8–18px.
const BUBBLES: { left: number; dur: number; delay: number; size: number }[] = [
  { left: 30, dur: 6.8, delay: 0, size: 15 },
  { left: 38, dur: 7.6, delay: -1.1, size: 18 },
  { left: 45, dur: 6.4, delay: -2.3, size: 12 },
  { left: 34, dur: 7.9, delay: -3.4, size: 16 },
  { left: 50, dur: 7.1, delay: -4.6, size: 13 },
  { left: 42, dur: 6.6, delay: -5.6, size: 17 },
];

// Fine fractal-noise grain, inlined as an SVG data URI (no extra asset / network
// request). encodeURIComponent handles the `#` in url(#n) and the angle
// brackets, so the string stays a valid data URI.
const NOISE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#n)'/></svg>";
const NOISE_URL = `url("data:image/svg+xml,${encodeURIComponent(NOISE_SVG)}")`;

export function PillWithBubbles() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Layer 2 — the static tilted pill. Sized as a fraction of the panel so it
          stays proportional at every breakpoint. The fill stays white at a fixed
          low alpha, and a subtle blur + halo keep the edge premium without adding
          motion. */}
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
          opacity: 0.08,
          filter: "blur(1.5px)",
          boxShadow: "0 10px 50px rgb(255 255 255 / 0.25)",
          zIndex: 0,
        }}
      />

      {/* Layer 3 — bubbles rising straight up (gravity; they don't inherit the
          pill's tilt). Size lives per-bubble; opacity/glow live in the CSS. */}
      {BUBBLES.map((b) => (
        <span
          key={`pb-${b.left}-${b.delay}`}
          className="pill-bubble"
          style={{
            left: `${b.left}%`,
            "--pb-dur": `${b.dur}s`,
            "--pb-delay": `${b.delay}s`,
            "--pb-size": `${b.size}px`,
          } as CSSProperties}
        />
      ))}

      {/* Layer 4 — grain. Tiled noise blended with `overlay` at low opacity so it
          textures the surface without touching legibility of the z-2 content
          above it. Static (no animation), so it's reduced-motion-safe. */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 1,
          backgroundImage: NOISE_URL,
          backgroundSize: "140px 140px",
          opacity: 0.04,
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}
