/**
 * The AI design system. Every AI entry point and every AI-generated-content
 * marker in the product comes from here — import from "@/components/ai", never
 * re-implement an AI button or badge in a module.
 */
export { AIButton } from "./AIButton";
export type { AIButtonProps, AIButtonVariant, AIButtonSize } from "./AIButton";
export { AIBadge } from "./AIBadge";
export type { AIBadgeProps } from "./AIBadge";
