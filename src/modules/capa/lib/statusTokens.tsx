import type { ReactNode } from "react";
import type { CAPAStatus } from "@/types/capa";

/**
 * Phase C — the semantic status token system for the CAPA surface.
 * Five tokens, never brand gold (which is reserved for primary buttons,
 * the active tab, and links). Each maps to the CSS pill classes defined
 * in src/index.css (.status-pill--<token>).
 */
export type StatusToken = "pending" | "active" | "waiting" | "done" | "blocked";

/** CAPA lifecycle status → token. */
export const CAPA_STATUS_TOKEN: Record<CAPAStatus, StatusToken> = {
  open: "pending",                 // created, not started — idle
  in_progress: "active",           // work in flight
  pending_qa_review: "waiting",    // submitted, awaiting QA
  pending_verification: "waiting", // awaiting independent verification
  closed: "done",                  // closed-good
  rejected: "blocked",             // legacy rejected
};

/** Action-item status → token (enum values unchanged; display only). */
export const ACTION_STATUS_TOKEN: Record<string, StatusToken> = {
  pending: "pending",      // "Not started"
  in_progress: "active",   // "In progress"
  complete: "done",        // "Done"
  skipped: "pending",
  rework: "blocked",
};

export function pillClass(token: StatusToken): string {
  return `status-pill status-pill--${token}`;
}

/** Token-driven status chip. */
export function StatusPill({ token, children }: { token: StatusToken; children: ReactNode }) {
  return <span className={pillClass(token)}>{children}</span>;
}
