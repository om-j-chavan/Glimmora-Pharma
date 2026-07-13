"use client";

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { usePrefersReducedMotion } from "@/lib/motion/useReducedMotion";
import {
  resolveEntrance,
  resolveStaggerContainer,
  resolveStaggerItem,
  type EntranceVariantName,
} from "@/lib/motion/variants";
import { DURATION, EASE } from "@/lib/motion/tokens";

/**
 * Motion primitives — thin wrappers so pages/components animate WITHOUT importing
 * framer-motion directly. framer stays an implementation detail behind these, so
 * a future swap-out is contained to this file + `src/lib/motion/*`.
 *
 * Every primitive is reduced-motion aware: when the user prefers reduced motion,
 * transforms are dropped and motion collapses to a fast opacity fade (hover-lift
 * is disabled entirely).
 *
 * These are FOUNDATION primitives — Phase 1 does not apply them anywhere.
 */

/* ── Entrance wrappers ─────────────────────────────────────────────────────── */

interface EntranceProps extends HTMLMotionProps<"div"> {
  /** Which entrance variant to use. Default "fadeUp". Override the raw framer
   *  `variants`/`initial`/`animate` props directly for full control. */
  variant?: EntranceVariantName;
}

/** motion.div with the fadeUp entrance by default (reveals on mount). */
export const MotionDiv = forwardRef<HTMLDivElement, EntranceProps>(function MotionDiv(
  { variant = "fadeUp", ...props },
  ref,
) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div ref={ref} variants={resolveEntrance(variant, reduced)} initial="hidden" animate="visible" {...props} />
  );
});

interface EntranceSectionProps extends HTMLMotionProps<"section"> {
  variant?: EntranceVariantName;
}

/** motion.section for page sections — fadeUp entrance by default. */
export const MotionSection = forwardRef<HTMLElement, EntranceSectionProps>(function MotionSection(
  { variant = "fadeUp", ...props },
  ref,
) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.section
      ref={ref}
      variants={resolveEntrance(variant, reduced)}
      initial="hidden"
      animate="visible"
      {...props}
    />
  );
});

/* ── Stagger wrappers ──────────────────────────────────────────────────────── */

/** staggerContainer wrapper — reveals its <MotionListItem> children in sequence.
 *  Pair with MotionListItem; the container drives the children's states. */
export const MotionList = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function MotionList(props, ref) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div ref={ref} variants={resolveStaggerContainer(reduced)} initial="hidden" animate="visible" {...props} />
  );
});

/** staggerItem wrapper — a single child of MotionList. It inherits the
 *  hidden/visible states from the parent container, so it needs no
 *  initial/animate of its own. */
export const MotionListItem = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function MotionListItem(props, ref) {
  const reduced = usePrefersReducedMotion();
  return <motion.div ref={ref} variants={resolveStaggerItem(reduced)} {...props} />;
});

/* ── Interaction wrapper ───────────────────────────────────────────────────── */

/** Card wrapper with a subtle hover-lift (scale + shadow) and a slight tap
 *  press. Under reduced motion the lift is disabled — it renders as a plain
 *  div-with-motion-props so layout/styling are unchanged. */
export const MotionHoverCard = forwardRef<HTMLDivElement, HTMLMotionProps<"div">>(function MotionHoverCard(props, ref) {
  const reduced = usePrefersReducedMotion();
  if (reduced) {
    return <motion.div ref={ref} {...props} />;
  }
  return (
    <motion.div
      ref={ref}
      whileHover={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
      whileTap={{ scale: 0.99 }}
      transition={{ duration: DURATION.fast, ease: EASE.standard }}
      {...props}
    />
  );
});
