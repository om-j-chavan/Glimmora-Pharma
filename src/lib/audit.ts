import { api } from "./axios";
import { store } from "@/store";
import { logAction, type AuditEntry as FullAuditEntry } from "@/store/auditTrail.slice";

export interface AuditEntry {
  action: string;
  module: string;
  recordId: string;
  recordTitle?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  const { user } = store.getState().auth;
  if (!user) return;

  // Dispatch to Redux audit trail for in-app log
  const full: FullAuditEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    module: entry.module,
    action: entry.action,
    recordId: entry.recordId,
    recordTitle: entry.recordTitle ?? entry.recordId,
    oldValue: entry.oldValue != null ? String(entry.oldValue) : undefined,
    newValue: entry.newValue != null ? String(entry.newValue) : undefined,
    ipAddress: "192.168.1.1",
    sessionId: `sess-${user.id}`,
  };
  store.dispatch(logAction(full));

  // Also POST to server (no-op in mock mode)
  try {
    await api.post("/audit", {
      ...entry,
      userId: user.id,
      userEmail: user.email,
    });
  } catch {
    // API may not be connected — local audit trail is the fallback
  }
}
