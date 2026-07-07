"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Download, Lock, MessageSquare, History, Paperclip } from "lucide-react";
import type { Ticket, TicketMessage, TicketActivity } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { roleLabel } from "@/lib/labels/roles";
import type { TicketAttachment } from "@/lib/queries";
import {
  canTransition,
  RESOLUTION_CATEGORIES,
  TERMINAL_STATUSES,
  type TicketStatus,
} from "@/lib/support/constants";
import {
  addTicketMessage,
  assignTicket,
  updateTicketStatus,
  resolveTicket,
  confirmResolution,
  reopenTicket,
  cancelTicket,
  escalateTicket,
} from "@/actions/support";
import { statusBadge, priorityBadge, RELATED_MODULE_ROUTE } from "./_shared";

interface Props {
  detail: { ticket: Ticket; messages: TicketMessage[]; activities: TicketActivity[] };
  attachments: TicketAttachment[];
  /** canHandleTicket — reply-as-support / internal note / status / close (SA
   *  cross-tenant; CA only on CA-routed in-tenant). */
  manage: boolean;
  /** canManageSupport — ASSIGN only (SA, cross-tenant); CA never gets assign. */
  canAssign: boolean;
  /** canHandleFirstLine && routed-to-caller's-tier — the CA→SA escalate button. */
  canEscalate: boolean;
  /** The viewer's role — drives the tier badge (With me / Escalated / With CA). */
  viewerRole: string;
  /** Tenant name for the escalation trail (SA cross-tenant view). */
  tenantLabel?: string;
  currentUserId: string;
  assigneeOptions: { id: string; name: string }[];
}

const STATUS_TARGETS: TicketStatus[] = ["Open", "In Progress", "Awaiting User"];

export function TicketDetailView({ detail, attachments, manage, canAssign, canEscalate, viewerRole, tenantLabel, currentUserId, assigneeOptions }: Props) {
  const { ticket, messages, activities } = detail;
  const router = useRouter();
  const toast = useToast();
  const { org } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const status = ticket.status as TicketStatus;
  const isRequester = ticket.requesterId === currentUserId;
  const isTerminal = TERMINAL_STATUSES.has(status);
  const handlerView = viewerRole === "customer_admin" || viewerRole === "super_admin";
  const backPath = viewerRole === "super_admin" ? "/admin/support" : "/support";

  // Routing tier badge — separate from the lifecycle status badge.
  const viewerTier = viewerRole === "super_admin" ? "super_admin" : viewerRole === "customer_admin" ? "customer_admin" : null;
  const tierBadge = !handlerView
    ? (isTerminal ? null : <Badge variant="blue">With Support</Badge>)
    : ticket.currentHandler === viewerTier
      ? <Badge variant="green">With me</Badge>
      : ticket.currentHandler === "super_admin"
        ? <Badge variant="amber">Escalated</Badge>
        : <Badge variant="gray">With CA</Badge>;

  // Which actions are available — drives whether the Actions card renders at all
  // (a terminal ticket like Cancelled has none, so the card is hidden rather
  // than shown empty).
  const showManagerControls = manage && !isTerminal;
  const showAssign = canAssign && !isTerminal;
  const canEscalateUi = canEscalate && !isTerminal;
  const canConfirm = status === "Resolved" && (isRequester || manage);
  const canReopenUi = (status === "Resolved" || status === "Closed") && (isRequester || manage);
  const canCancelUi = canTransition(status, "Cancelled") && (isRequester || manage);
  const hasActions = showManagerControls || showAssign || canEscalateUi || canConfirm || canReopenUi || canCancelUi;

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignee, setAssignee] = useState(ticket.assigneeId ?? "");
  const [showResolve, setShowResolve] = useState(false);
  const [resSummary, setResSummary] = useState("");
  const [resCategory, setResCategory] = useState<string>(RESOLUTION_CATEGORIES[0]);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escNote, setEscNote] = useState("");
  const [reasonMode, setReasonMode] = useState<"reopen" | "cancel" | null>(null);
  const [reason, setReason] = useState("");

  // Message + Close (option a): the closing message becomes the resolution
  // summary; category required. Reuses the existing resolve → confirm chain.
  async function messageAndClose() {
    if (resSummary.trim().length < 5) return;
    setBusy(true);
    const r1 = await resolveTicket(ticket.id, { resolutionSummary: resSummary.trim(), resolutionCategory: resCategory as (typeof RESOLUTION_CATEGORIES)[number] });
    if (!r1.success) { setBusy(false); toast.error(`Close: ${r1.error ?? "failed"}`); return; }
    const r2 = await confirmResolution(ticket.id);
    setBusy(false);
    if (!r2.success) { toast.error(`Close: ${r2.error ?? "failed"}`); router.refresh(); return; }
    toast.success("Ticket closed."); setShowResolve(false); setResSummary(""); router.refresh();
  }

  async function doEscalate() {
    setBusy(true);
    const res = await escalateTicket(ticket.id, escNote.trim() ? { note: escNote.trim() } : undefined);
    setBusy(false);
    if (!res.success) { toast.error(`Escalate: ${res.error ?? "failed"}`); return; }
    toast.success("Escalated to platform support."); setShowEscalate(false); setEscNote(""); router.refresh();
  }

  async function run(label: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) { toast.error(`${label}: ${res.error ?? "failed"}`); return false; }
    router.refresh();
    return true;
  }

  const slaOverdue = ticket.slaDueAt && !isTerminal && status !== "Resolved" && dayjs(ticket.slaDueAt).isBefore(dayjs());

  return (
    <main id="main-content" aria-label={`Ticket ${ticket.reference ?? ""}`} className="w-full space-y-4">
      <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => router.push(backPath)}>
        Back to {manage ? "queue" : "my tickets"}
      </Button>

      {/* Header */}
      <div className="card"><div className="card-body flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{ticket.reference ?? ticket.id.slice(0, 8)}</span>
          {statusBadge(ticket.status)}
          {tierBadge}
          {priorityBadge(ticket.priority)}
          {ticket.slaDueAt && !isTerminal && status !== "Resolved" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: slaOverdue ? "var(--danger-bg)" : "var(--bg-elevated)", color: slaOverdue ? "var(--danger)" : "var(--text-secondary)" }}>
              <Clock className="w-3 h-3" aria-hidden="true" />
              SLA {slaOverdue ? "breached" : "due"} {dayjs.utc(ticket.slaDueAt).tz(timezone).format(dateFormat)}
            </span>
          )}
        </div>
        <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{ticket.subject}</p>
      </div></div>

      {/* Escalation trail — visible once a CA has escalated to the SA tier. */}
      {ticket.escalatedAt && (
        <div className="rounded-lg p-3 text-[12px]" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
          <span className="font-semibold" style={{ color: "var(--warning)" }}>Escalated to platform support</span>
          <span style={{ color: "var(--text-primary)" }}> — by {ticket.escalatedByName ?? "Customer Admin"}</span>
          {tenantLabel && <span style={{ color: "var(--text-secondary)" }}> · {tenantLabel}</span>}
          <span style={{ color: "var(--text-muted)" }}> · {dayjs.utc(ticket.escalatedAt).tz(timezone).format(`${dateFormat} HH:mm`)}</span>
        </div>
      )}

      {/* Cancellation banner — keeps the canceled record fully visible. */}
      {status === "Cancelled" && (
        <div className="rounded-lg p-3 text-[12px]" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Cancelled</span>
          {ticket.cancelledAt && <span style={{ color: "var(--text-muted)" }}> · {dayjs.utc(ticket.cancelledAt).tz(timezone).format(dateFormat)}</span>}
          {ticket.cancelReason && <span style={{ color: "var(--text-primary)" }}> — {ticket.cancelReason}</span>}
        </div>
      )}

      {/* Metadata */}
      <div className="card"><div className="card-body">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-[12px]">
          <Meta label="Category">{ticket.category}</Meta>
          <Meta label="Requester">{ticket.requesterName}{ticket.requesterRole ? ` · ${roleLabel(ticket.requesterRole)}` : ""}</Meta>
          <Meta label="Assignee">{ticket.assigneeName ?? <span style={{ color: "var(--text-muted)" }}>Unassigned</span>}</Meta>
          <Meta label="Created">{dayjs.utc(ticket.createdAt).tz(timezone).format(dateFormat)}</Meta>
          {ticket.relatedRecordRef && (
            <Meta label="Related record">
              {ticket.relatedModule && RELATED_MODULE_ROUTE[ticket.relatedModule] ? (
                <Link href={RELATED_MODULE_ROUTE[ticket.relatedModule]} className="font-mono underline" style={{ color: "var(--brand)" }}>{ticket.relatedRecordRef}</Link>
              ) : (
                <span className="font-mono">{ticket.relatedRecordRef}</span>
              )}
              {ticket.relatedModule && <span style={{ color: "var(--text-muted)" }}> ({ticket.relatedModule})</span>}
            </Meta>
          )}
          {ticket.resolvedAt && <Meta label="Resolved">{dayjs.utc(ticket.resolvedAt).tz(timezone).format(dateFormat)}{ticket.resolutionCategory ? ` · ${ticket.resolutionCategory}` : ""}</Meta>}
        </dl>
        <p className="text-[12px] mt-3 whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{ticket.description}</p>
        {ticket.resolutionSummary && (
          <div className="mt-3 rounded-lg p-3 text-[12px]" style={{ background: "var(--success-bg)", border: "1px solid var(--success)" }}>
            <span className="font-semibold" style={{ color: "var(--success)" }}>Resolution: </span>
            <span style={{ color: "var(--text-primary)" }}>{ticket.resolutionSummary}</span>
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Attachments</p>
            <ul className="space-y-1">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-[12px]">
                  <Paperclip className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                  {a.hasFile ? (
                    <a href={`/api/documents/${a.id}`} className="underline inline-flex items-center gap-1" style={{ color: "var(--brand)" }}>
                      {a.originalFileName ?? a.fileName} <Download className="w-3 h-3" aria-hidden="true" />
                    </a>
                  ) : (
                    <span style={{ color: "var(--text-secondary)" }}>{a.fileName}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div></div>

      {/* Actions — hidden entirely when none apply (e.g. a Cancelled ticket),
          so the canceled record shows read-only with no empty action card. */}
      {hasActions && (
      <div className="card"><div className="card-body space-y-3">
        {/* Handler controls (canHandleTicket) — status + Message+Close + Escalate.
            Assign is SEPARATE (canManageSupport / SA only). */}
        {(showManagerControls || showAssign || canEscalateUi) && (
          <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-(--bg-border)">
            {showAssign && (
              <>
                <Dropdown placeholder="Assign to…" value={assignee} onChange={setAssignee} width="w-48"
                  options={[{ value: "", label: "Unassigned" }, ...assigneeOptions.map((a) => ({ value: a.id, label: a.name }))]} />
                <Button variant="secondary" size="sm" disabled={busy || !assignee || assignee === (ticket.assigneeId ?? "")}
                  onClick={() => run("Assign", () => assignTicket(ticket.id, { assigneeId: assignee, assigneeName: assigneeOptions.find((a) => a.id === assignee)?.name ?? assignee }))}>
                  Assign
                </Button>
              </>
            )}
            {showManagerControls && STATUS_TARGETS.filter((s) => s !== status && canTransition(status, s)).map((s) => (
              <Button key={s} variant="ghost" size="sm" disabled={busy} onClick={() => run("Status", () => updateTicketStatus(ticket.id, { status: s as "Open" | "In Progress" | "Awaiting User" }))}>
                Mark {s}
              </Button>
            ))}
            {/* Escalate to Super Admin — CA first-line only, on a CA-routed ticket. */}
            {canEscalateUi && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setShowEscalate((v) => !v); setShowResolve(false); }}>Escalate to Super Admin</Button>
            )}
            {showManagerControls && canTransition(status, "Resolved") && (
              <Button variant="primary" size="sm" disabled={busy} onClick={() => { setShowResolve((v) => !v); setShowEscalate(false); }}>Message + Close</Button>
            )}
          </div>
        )}

        {/* Escalate panel — optional note for the SA tier. */}
        {canEscalateUi && showEscalate && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--warning-bg)", border: "1px dashed var(--warning)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--warning)" }}>Escalate to platform support</p>
            <textarea rows={2} className="input text-[12px] resize-none w-full" placeholder="Optional note for the platform team (internal)…" value={escNote} onChange={(e) => setEscNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowEscalate(false)}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={busy} onClick={doEscalate}>Escalate</Button>
            </div>
          </div>
        )}

        {/* Message + Close panel (option a): closing message → resolution summary. */}
        {showManagerControls && showResolve && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Message + Close</p>
            <Dropdown value={resCategory} onChange={setResCategory} width="w-full" options={RESOLUTION_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <textarea rows={3} className="input text-[12px] resize-none w-full" placeholder="Closing message — becomes the resolution summary (required)" value={resSummary} onChange={(e) => setResSummary(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowResolve(false)}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={busy || resSummary.trim().length < 5} onClick={messageAndClose}>Close ticket</Button>
            </div>
          </div>
        )}

        {/* Requester / shared lifecycle */}
        <div className="flex flex-wrap items-center gap-2">
          {status === "Resolved" && (isRequester || manage) && (
            <Button variant="primary" size="sm" disabled={busy} onClick={() => run("Confirm", () => confirmResolution(ticket.id))}>Confirm resolution</Button>
          )}
          {(status === "Resolved" || status === "Closed") && (isRequester || manage) && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setReasonMode("reopen"); setReason(""); }}>Reopen</Button>
          )}
          {canTransition(status, "Cancelled") && (isRequester || manage) && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setReasonMode("cancel"); setReason(""); }}>Cancel ticket</Button>
          )}
        </div>

        {reasonMode && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
            <textarea rows={2} className="input text-[12px] resize-none w-full" placeholder={reasonMode === "reopen" ? "Why are you reopening this?" : "Why are you cancelling this?"} value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReasonMode(null)}>Cancel</Button>
              <Button variant="primary" size="sm" disabled={busy || reason.trim().length < 3}
                onClick={async () => {
                  const ok = reasonMode === "reopen"
                    ? await run("Reopen", () => reopenTicket(ticket.id, { reason: reason.trim() }))
                    : await run("Cancel", () => cancelTicket(ticket.id, { reason: reason.trim() }));
                  if (ok) setReasonMode(null);
                }}>
                {reasonMode === "reopen" ? "Reopen ticket" : "Cancel ticket"}
              </Button>
            </div>
          </div>
        )}
      </div></div>
      )}

      {/* Conversation thread */}
      <div className="card"><div className="card-body">
        <div className="flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" /><span className="card-title">Conversation</span></div>
        {messages.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No messages yet.</p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li key={m.id} className="rounded-lg p-3 border" style={m.isInternal
                ? { background: "var(--warning-bg)", borderColor: "var(--warning)", borderStyle: "dashed" }
                : { background: "var(--bg-elevated)", borderColor: "var(--bg-border)" }}>
                <div className="flex items-center gap-2 text-[11px] mb-1">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>{m.authorName}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-(--bg-surface)" style={{ color: "var(--text-secondary)" }}>{roleLabel(m.authorRole)}</span>
                  {m.isInternal && <Badge variant="amber">Internal note</Badge>}
                  <span className="ml-auto font-mono" style={{ color: "var(--text-muted)" }}>{dayjs.utc(m.createdAt).tz(timezone).format(`${dateFormat} HH:mm`)}</span>
                </div>
                <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{m.body}</p>
              </li>
            ))}
          </ul>
        )}

        {/* Reply composer (hidden on terminal states) */}
        {!isTerminal && (
          <div className="mt-3 space-y-2">
            <textarea rows={3} className="input text-[12px] resize-none w-full" placeholder="Write a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
            <div className="flex justify-end">
              <Button variant="primary" size="sm" disabled={busy || reply.trim().length === 0}
                onClick={async () => { if (await run("Reply", () => addTicketMessage(ticket.id, { body: reply.trim() }))) setReply(""); }}>
                Send reply
              </Button>
            </div>
          </div>
        )}

        {/* Internal note composer — managers only, visually distinct */}
        {manage && !isTerminal && (
          <div className="mt-3 space-y-2 rounded-lg p-3" style={{ background: "var(--warning-bg)", border: "1px dashed var(--warning)" }}>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--warning)" }}><Lock className="w-3 h-3" aria-hidden="true" /> Internal note — never shown to the requester</div>
            <textarea rows={2} className="input text-[12px] resize-none w-full" placeholder="Add an internal note…" value={internal} onChange={(e) => setInternal(e.target.value)} />
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" disabled={busy || internal.trim().length === 0}
                onClick={async () => { if (await run("Internal note", () => addTicketMessage(ticket.id, { body: internal.trim(), isInternal: true }))) setInternal(""); }}>
                Add internal note
              </Button>
            </div>
          </div>
        )}
      </div></div>

      {/* Activity / audit history — support managers ONLY. The data layer
          (getTicket) already returns [] for non-managers; this UI gate matches
          so a regular user never sees the panel. */}
      {manage && (
        <div className="card"><div className="card-body">
          <div className="flex items-center gap-2 mb-3"><History className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" /><span className="card-title">Activity</span></div>
          {activities.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-[11px]">
                  <span className="font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{dayjs.utc(a.createdAt).tz(timezone).format(`${dateFormat} HH:mm`)}</span>
                  <span style={{ color: "var(--text-primary)" }}>{a.summary} <span style={{ color: "var(--text-muted)" }}>· {a.actorName}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div></div>
      )}
    </main>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ color: "var(--text-primary)" }}>{children}</dd>
    </div>
  );
}
