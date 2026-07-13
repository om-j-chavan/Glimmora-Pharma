/**
 * Reusable framer-motion variants for the app's standard entrance/exit patterns.
 * Every animated surface pulls from here so motion is consistent and swappable
 * in one place. All variants read their durations/easings/stagger from
 * `tokens.ts`.
 *
 * Reduced motion: the full variants below carry transforms (y / scale / x). When
 * the user prefers reduced motion, callers resolve to `opacityOnly` (and a
 * zero-delay stagger) via the `resolve*` helpers — motion collapses to a plain,
 * fast opacity fade. The <Motion*> primitives in
 * `src/components/motion/Motion.tsx` do this automatically; the raw variants are
 * exported too for direct use.
 */

import type { Variants } from "framer-motion";
import { DURATION, EASE, STAGGER } from "./tokens";

/** Default for cards, sections, most content — fade + a small upward rise. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
};

/** Opacity only — lists and simple content. */
export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.base, ease: EASE.standard } },
};

/** Modals, popovers — fade + a subtle scale-up. */
export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: { duration: DURATION.moderate, ease: EASE.out } },
};

/** Drawers and side panels — slide in from the right. */
export const slideRight: Variants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.moderate, ease: EASE.out } },
};

/** Parent variant — triggers a staggered reveal of its children. */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER.base, delayChildren: 0.02 } },
};

/** Child variant — paired with `staggerContainer` (rise + fade per item). */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.out } },
};

/* ── Reduced-motion counterparts ─────────────────────────────────────────── */

/** The single reduced-motion variant — a fast opacity fade, no transforms. */
export const opacityOnly: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast, ease: EASE.standard } },
};

/** Reduced-motion container — children reveal together (no stagger, no delay). */
export const staggerContainerReduced: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0, delayChildren: 0 } },
};

/* ── Resolvers ───────────────────────────────────────────────────────────────
 * Pick the reduced-motion-appropriate variant. Callers pass the user's
 * preference (from usePrefersReducedMotion) and get back the right Variants. */

/** Named entrance variants selectable by the <Motion*> primitives. */
export const ENTRANCE_VARIANTS = { fadeUp, fade, scaleFade, slideRight } as const;
export type EntranceVariantName = keyof typeof ENTRANCE_VARIANTS;

/** Entrance variant for a name, collapsed to opacity-only under reduced motion. */
export function resolveEntrance(name: EntranceVariantName, reduced: boolean): Variants {
  return reduced ? opacityOnly : ENTRANCE_VARIANTS[name];
}

/** Stagger container, collapsed to a no-stagger reveal under reduced motion. */
export function resolveStaggerContainer(reduced: boolean): Variants {
  return reduced ? staggerContainerReduced : staggerContainer;
}

/** Stagger item, collapsed to opacity-only under reduced motion. */
export function resolveStaggerItem(reduced: boolean): Variants {
  return reduced ? opacityOnly : staggerItem;
}
