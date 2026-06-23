import { Badge } from "@/components/ui/Badge";
import {
  STATUS_BADGE,
  PRIORITY_BADGE,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/support/constants";

export function statusBadge(s: string) {
  return <Badge variant={STATUS_BADGE[s as TicketStatus] ?? "gray"}>{s}</Badge>;
}

export function priorityBadge(p: string) {
  return <Badge variant={PRIORITY_BADGE[p as TicketPriority] ?? "gray"}>{p}</Badge>;
}

/** Modules a ticket can reference. The link is display/navigation ONLY — a
 *  ticket never mutates the linked record (Data Correction / Compliance Concern
 *  go through the proper CAPA/deviation/CC flow with their own e-signature). */
export const RELATED_MODULES = [
  "CAPA",
  "Deviation",
  "Change Control",
  "FDA 483",
  "Gap Assessment",
  "CSV/CSA",
] as const;

export const RELATED_MODULE_ROUTE: Record<string, string> = {
  CAPA: "/capa",
  Deviation: "/deviation",
  "Change Control": "/change-control",
  "FDA 483": "/fda-483",
  "Gap Assessment": "/gap-assessment",
  "CSV/CSA": "/csv-csa",
};
