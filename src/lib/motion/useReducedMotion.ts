"use client";

import { useReducedMotion } from "framer-motion";

/**
 * usePrefersReducedMotion — thin wrapper over framer-motion's `useReducedMotion`
 * that keeps framer an implementation detail and coalesces the SSR/initial
 * `null` to `false` so callers get a plain boolean.
 *
 * `true` ⇒ the user has `prefers-reduced-motion: reduce`; motion should collapse
 * to opacity-only / instant (the motion variants + <Motion*> primitives honor
 * this via the `resolve*` helpers in `variants.ts`).
 */
export function usePrefersReducedMotion(): boolean {
  return useReducedMotion() ?? false;
}
