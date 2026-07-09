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

// The related-module list + route map moved to src/lib/support/constants.ts
// (SUPPORT_RELATED_MODULES / SUPPORT_RELATED_MODULE_ROUTE) so the modal and the
// detail view share a single source of truth.
