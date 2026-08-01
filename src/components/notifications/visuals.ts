import {
  Bell, ShieldAlert, FileWarning, RefreshCw, ClipboardCheck, CheckCircle2, Clock,
  MessageSquare, LifeBuoy, ArrowUpCircle, UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Icon + accent colour per notification type — the SINGLE map shared by the
 * topbar bell (NotificationBell) and the /notifications page, so the two
 * surfaces can never disagree about how a type looks.
 *
 * Previously this lived inline in NotificationBell and covered only the CAPA /
 * evidence types, so every TICKET_* notification fell through to the neutral
 * grey bell (audit finding NTF-013). The support types are mapped here.
 *
 * Hex values match the app's existing colour-config convention
 * (src/constants/statusTaxonomy.ts) rather than CSS tokens, because callers
 * composite an alpha suffix onto the value for the icon chip background.
 */
export interface NotificationVisual {
  icon: LucideIcon;
  color: string;
}

export const NOTIFICATION_VISUALS: Record<string, NotificationVisual> = {
  CAPA_REJECTED:         { icon: ShieldAlert,    color: "#ef4444" },
  EVIDENCE_REJECTED:     { icon: FileWarning,    color: "#ef4444" },
  REWORK_ASSIGNED:       { icon: RefreshCw,      color: "#f59e0b" },
  CAPA_ASSIGNED:         { icon: ClipboardCheck, color: "#0ea5e9" },
  ACTION_ASSIGNED:       { icon: ClipboardCheck, color: "#0ea5e9" },
  CAPA_APPROVED:         { icon: CheckCircle2,   color: "#10b981" },
  CAPA_VERIFIED:         { icon: CheckCircle2,   color: "#10b981" },
  CAPA_CLOSED:           { icon: CheckCircle2,   color: "#10b981" },
  FINDING_CLOSED:        { icon: CheckCircle2,   color: "#10b981" },
  REVIEW_REQUESTED:      { icon: ClipboardCheck, color: "#6366f1" },
  DUE_SOON:              { icon: Clock,          color: "#f59e0b" },
  OVERDUE:               { icon: Clock,          color: "#ef4444" },
  TICKET_ASSIGNED:       { icon: UserCheck,      color: "#0ea5e9" },
  TICKET_REPLY:          { icon: MessageSquare,  color: "#0ea5e9" },
  TICKET_STATUS_CHANGED: { icon: LifeBuoy,       color: "#6366f1" },
  TICKET_RESOLVED:       { icon: CheckCircle2,   color: "#10b981" },
  TICKET_ESCALATED:      { icon: ArrowUpCircle,  color: "#f59e0b" },
};

/** Neutral fallback for any type not in the map (e.g. a future emit site). */
export const NOTIFICATION_FALLBACK_VISUAL: NotificationVisual = { icon: Bell, color: "#64748b" };

export function notificationVisual(type: string): NotificationVisual {
  return NOTIFICATION_VISUALS[type] ?? NOTIFICATION_FALLBACK_VISUAL;
}
