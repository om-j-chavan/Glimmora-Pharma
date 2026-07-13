"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Clock, Lock, History, Pencil, XCircle, ArrowUpCircle, Loader, CheckCircle2, Archive, RotateCcw, Send, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { Ticket, TicketMessage, TicketActivity } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { roleLabel } from "@/lib/labels/roles";
import type { TicketAttachment } from "@/lib/queries";
import { DocumentCard } from "@/components/documents/DocumentCard";
import {
  canTransition,
  RESOLUTION_CATEGORIES,
  TERMINAL_STATUSES,
  STATUS_DESCRIPTIONS,
  SUPPORT_RELATED_MODULE_ROUTE,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type TicketStatus,
} from "@/lib/support/constants";
import {
  addTicketMessage,
  updateTicketStatus,
  resolveTicket,
  confirmResolution,
  reopenTicket,
  cancelTicket,
  escalateTicket,
  editTicket,
} from "@/actions/support";
import { statusBadge, priorityBadge } from "./_shared";

interface Props {
  detail: { ticket: Ticket; messages: TicketMessage[]; activities: TicketActivity[] };
  attachments: TicketAttachment[];
  /** canHandleTicket — reply-as-support / internal note / status / resolve (SA
   *  cross-tenant; CA only on CA-routed in-tenant). */
  manage: boolean;
  /** canHandleFirstLine && routed-to-caller's-tier — the CA→SA escalate button. */
  canEscalate: boolean;
  /** canEditTicket — subject/description/priority/category, only while New/Open. */
  canEdit: boolean;
  /** The viewer's role — drives the tier badge (With me / Escalated / With CA). */
  viewerRole: string;
  /** Tenant name for the escalation trail (SA cross-tenant view). */
  tenantLabel?: string;
  currentUserId: string;
}

type Dialog = null | "edit" | "resolve" | "close" | "escalate" | "cancel" | "reopen";

const editSchema = z.object({
  subject: z.string().min(3, "Subject is required"),
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  description: z.string().min(5, "Description is required"),
});
type EditValues = z.infer<typeof editSchema>;

export function TicketDetailView({ detail, attachments, manage, canEscalate, canEdit, viewerRole, tenantLabel, currentUserId }: Props) {
  const { ticket, messages, activities } = detail;
  const router = useRouter();
  const toast = useToast();
  const { org } = useTenantConfig();
  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const dtFormat = `${dateFormat} HH:mm`;
  const status = ticket.status as TicketStatus;
  const isRequester = ticket.requesterId === currentUserId;
  const isTerminal = TERMINAL_STATUSES.has(status);
  const handlerView = viewerRole === "customer_admin" || viewerRole === "super_admin";
  const backPath = viewerRole === "super_admin" ? "/admin/support" : "/support";

  const viewerTier = viewerRole === "super_admin" ? "super_admin" : viewerRole === "customer_admin" ? "customer_admin" : null;
  const tierBadge = !handlerView
    ? (isTerminal ? null : <Badge variant="blue">With Support</Badge>)
    : ticket.currentHandler === viewerTier
      ? <Badge variant="green">With me</Badge>
      : ticket.currentHandler === "super_admin"
        ? <Badge variant="amber">Escalated</Badge>
        : <Badge variant="gray">With CA</Badge>;

  const slaOverdue = ticket.slaDueAt && !isTerminal && status !== "Resolved" && dayjs(ticket.slaDueAt).isBefore(dayjs());

  // Which lifecycle controls apply.
  const canResolve = manage && !isTerminal && canTransition(status, "Resolved");
  const canClose = status === "Resolved" && (isRequester || manage);
  const canReopenUi = (status === "Resolved" || status === "Closed") && (isRequester || manage);
  const canCancelUi = canTransition(status, "Cancelled") && (isRequester || manage);
  // Move-forward cards render (for handlers on a non-terminal ticket) always;
  // each is gated by canTransition — disabled + tooltip when the transition
  // isn't legal, rather than hidden — so the workflow stays visible.
  const canMoveForward = manage && !isTerminal;
  const showMoveSection = canMoveForward || canClose;
  const hasStatusPanel = showMoveSection || canEscalate || canReopenUi || !isTerminal;

  // Composers + dialogs.
  const [reply, setReply] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [resSummary, setResSummary] = useState("");
  const [resCategory, setResCategory] = useState<string>(RESOLUTION_CATEGORIES[0]);

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { subject: ticket.subject, category: ticket.category as EditValues["category"], priority: ticket.priority as EditValues["priority"], description: ticket.description },
  });

  function openDialog(d: Dialog) {
    setReason("");
    setResSummary("");
    setResCategory(RESOLUTION_CATEGORIES[0]);
    if (d === "edit") editForm.reset({ subject: ticket.subject, category: ticket.category as EditValues["category"], priority: ticket.priority as EditValues["priority"], description: ticket.description });
    setDialog(d);
  }

  async function run(label: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) { toast.error(`${label}: ${res.error ?? "failed"}`); return false; }
    setDialog(null);
    router.refresh();
    return true;
  }

  const onEdit = editForm.handleSubmit(async (data) => {
    if (await run("Edit", () => editTicket(ticket.id, data))) toast.success("Ticket updated.");
  });

  return (
    <main id="main-content" aria-label={`Ticket ${ticket.reference ?? ""}`} className="w-full space-y-4">
      {/* Page header row — Back on the left; Edit + Cancel are the header actions. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => router.push(backPath)}>
          Back to {manage ? "queue" : "my tickets"}
        </Button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="secondary" size="sm" icon={Pencil} disabled={busy} onClick={() => openDialog("edit")}>Edit ticket</Button>
          )}
          {canCancelUi && (
            <Button variant="danger-ghost" size="sm" icon={XCircle} disabled={busy} onClick={() => openDialog("cancel")}>Cancel ticket</Button>
          )}
        </div>
      </div>

      {/* Header card — single row: ID, status, tier, priority, SLA + the title. */}
      <div className="card"><div className="card-body flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>{ticket.reference ?? ticket.id.slice(0, 8)}</span>
          {statusBadge(ticket.status)}
          {tierBadge}
          {priorityBadge(ticket.priority)}
          {ticket.slaDueAt && !isTerminal && status !== "Resolved" && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: slaOverdue ? "var(--danger-bg)" : "var(--bg-elevated)", color: slaOverdue ? "var(--danger)" : "var(--text-secondary)" }}>
              <Clock className="w-3 h-3" aria-hidden="true" />
              SLA {slaOverdue ? "breached" : "due"} {dayjs.utc(ticket.slaDueAt).tz(timezone).format(dtFormat)}
            </span>
          )}
        </div>
        <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{ticket.subject}</p>
        {ticket.lastEditedAt && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Last edited {dayjs.utc(ticket.lastEditedAt).tz(timezone).format(dtFormat)}
            {ticket.lastEditedByName ? ` · ${ticket.lastEditedByName}` : ""}
          </p>
        )}
      </div></div>

      {/* Escalation trail — visible once a CA has escalated to the SA tier. */}
      {ticket.escalatedAt && (
        <div className="rounded-lg p-3 text-[12px]" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning)" }}>
          <span className="font-semibold" style={{ color: "var(--warning)" }}>Escalated to platform support</span>
          <span style={{ color: "var(--text-primary)" }}> — by {ticket.escalatedByName ?? "Customer Admin"}</span>
          {tenantLabel && <span style={{ color: "var(--text-secondary)" }}> · {tenantLabel}</span>}
          <span style={{ color: "var(--text-muted)" }}> · {dayjs.utc(ticket.escalatedAt).tz(timezone).format(dtFormat)}</span>
        </div>
      )}

      {/* Cancelled — prominent read-only block with the reason. */}
      {status === "Cancelled" && (
        <div className="rounded-lg p-4 flex items-start gap-3" style={{ background: "var(--danger-bg)", border: "1px solid var(--danger)" }}>
          <XCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--danger)" }}>
              This ticket was cancelled — it is now read-only.
            </p>
            {ticket.cancelledAt && <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{dayjs.utc(ticket.cancelledAt).tz(timezone).format(dtFormat)}</p>}
            {ticket.cancelReason && <p className="text-[12px] mt-1" style={{ color: "var(--text-primary)" }}>Reason: {ticket.cancelReason}</p>}
          </div>
        </div>
      )}

      {/* Reopened — surface the reopen reason in its own block. */}
      {ticket.reopenReason && status !== "Cancelled" && (
        <div className="rounded-lg p-3 text-[12px]" style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Reopened</span>
          <span style={{ color: "var(--text-primary)" }}> — {ticket.reopenReason}</span>
        </div>
      )}

      {/* Metadata + Description */}
      <div className="card"><div className="card-body">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-[12px]">
          <Meta label="Category">{ticket.category}</Meta>
          <Meta label="Requester">{ticket.requesterName}{ticket.requesterRole ? ` · ${roleLabel(ticket.requesterRole)}` : ""}</Meta>
          <Meta label="Created">{dayjs.utc(ticket.createdAt).tz(timezone).format(dtFormat)}</Meta>
          {ticket.relatedRecordRef && (
            <Meta label="Related record">
              {ticket.relatedModule && SUPPORT_RELATED_MODULE_ROUTE[ticket.relatedModule] ? (
                <Link href={SUPPORT_RELATED_MODULE_ROUTE[ticket.relatedModule]} className="font-mono underline" style={{ color: "var(--brand)" }}>{ticket.relatedRecordRef}</Link>
              ) : (
                <span className="font-mono">{ticket.relatedRecordRef}</span>
              )}
              {ticket.relatedModule && <span style={{ color: "var(--text-muted)" }}> ({ticket.relatedModule})</span>}
            </Meta>
          )}
          {ticket.resolvedAt && <Meta label="Resolved">{dayjs.utc(ticket.resolvedAt).tz(timezone).format(dtFormat)}{ticket.resolutionCategory ? ` · ${ticket.resolutionCategory}` : ""}</Meta>}
        </dl>

        <p className="text-[10px] font-semibold uppercase tracking-wider mt-4 mb-1" style={{ color: "var(--text-muted)" }}>Description</p>
        <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{ticket.description}</p>

        {ticket.resolutionSummary && (
          <div className="mt-3 rounded-lg p-3 text-[12px]" style={{ background: "var(--success-bg)", border: "1px solid var(--success)" }}>
            <span className="font-semibold" style={{ color: "var(--success)" }}>Resolution: </span>
            <span style={{ color: "var(--text-primary)" }}>{ticket.resolutionSummary}</span>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Attachments</p>
            <div className="space-y-2">
              {attachments.map((a) => (
                <DocumentCard key={a.id} doc={a} />
              ))}
            </div>
          </div>
        )}
      </div></div>

      {/* Status Management panel — clickable action cards, grouped. Hidden on a
          terminal ticket with nothing actionable. */}
      {hasStatusPanel && (
        <div className="card"><div className="card-body space-y-5">
          <span className="card-title">Status management</span>

          {/* MOVE FORWARD — 2-column grid of clickable cards. canTransition gates
              each card: disabled + tooltip when the transition isn't legal. */}
          {showMoveSection && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Move forward</p>
              <div className="grid grid-cols-2 gap-3">
                {/* Working on it — collapses New→In Progress and Open→In Progress
                    into one card. Hidden once the ticket is In Progress or beyond. */}
                {canMoveForward && (status === "New" || status === "Open") && (
                  <ActionCard
                    icon={Loader}
                    title="Working on it"
                    description="Accept the ticket and actively work on it."
                    disabled={busy}
                    onClick={() => run("Working on it", () => updateTicketStatus(ticket.id, { status: "In Progress" }))}
                  />
                )}
                {canMoveForward && (
                  <ActionCard
                    icon={CheckCircle2}
                    title="Resolve"
                    description="Mark this ticket as resolved."
                    disabled={busy || !canResolve}
                    disabledReason={!canResolve ? `Cannot resolve from "${status}".` : undefined}
                    onClick={() => openDialog("resolve")}
                  />
                )}
                {canClose && (
                  <ActionCard
                    icon={Archive}
                    title="Close"
                    description={STATUS_DESCRIPTIONS.Closed}
                    disabled={busy}
                    onClick={() => openDialog("close")}
                  />
                )}
              </div>
            </div>
          )}

          {/* ESCALATE — full-width card (CA first-line only, mandatory reason). */}
          {canEscalate && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Escalate</p>
              <ActionCard
                fullWidth
                icon={ArrowUpCircle}
                title="Escalate to Super Admin"
                description="Hand this ticket to the platform support team. A reason is required."
                disabled={busy}
                onClick={() => openDialog("escalate")}
              />
            </div>
          )}

          {/* REPLY WITH A MESSAGE — one textarea + internal-note checkbox + Send.
              The checkbox (handlers only) flips isInternal; same addTicketMessage. */}
          {!isTerminal && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Reply with a message</p>
              <textarea
                rows={3}
                className="input text-[12px] resize-none w-full"
                placeholder={replyInternal ? "Add an internal note…" : "Write a reply…"}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                style={replyInternal ? { borderColor: "var(--warning)" } : undefined}
              />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {manage ? (
                  <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                    <input type="checkbox" className="cursor-pointer accent-(--brand)" checked={replyInternal} onChange={(e) => setReplyInternal(e.target.checked)} />
                    <Lock className="w-3 h-3" aria-hidden="true" /> Internal note — never shown to the requester
                  </label>
                ) : <span />}
                <Button
                  variant="primary" size="sm" icon={Send}
                  disabled={busy || reply.trim().length === 0}
                  onClick={async () => {
                    const isInternal = manage && replyInternal;
                    if (await run(isInternal ? "Internal note" : "Reply", () => addTicketMessage(ticket.id, { body: reply.trim(), isInternal }))) {
                      setReply(""); setReplyInternal(false);
                    }
                  }}
                >
                  Send
                </Button>
              </div>
            </div>
          )}

          {/* REOPEN — full-width card (Resolved / Closed only, mandatory reason). */}
          {canReopenUi && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Reopen</p>
              <ActionCard
                fullWidth
                icon={RotateCcw}
                title="Reopen ticket"
                description="Start a fresh SLA window. A reason is required."
                disabled={busy}
                onClick={() => openDialog("reopen")}
              />
            </div>
          )}
        </div></div>
      )}

      {/* Message thread (no "Conversation" heading per spec) */}
      <div className="card"><div className="card-body">
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
                  <span className="ml-auto font-mono" style={{ color: "var(--text-muted)" }}>{dayjs.utc(m.createdAt).tz(timezone).format(dtFormat)}</span>
                </div>
                <p className="text-[12px] whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div></div>

      {/* Activity / audit history — handlers ONLY. getTicket returns [] for
          non-handlers (data layer), and this UI gate matches. */}
      {manage && (
        <div className="card"><div className="card-body">
          <div className="flex items-center gap-2 mb-3"><History className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" /><span className="card-title">Activity</span></div>
          {activities.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start gap-2 text-[11px]">
                  <span className="font-mono shrink-0" style={{ color: "var(--text-muted)" }}>{dayjs.utc(a.createdAt).tz(timezone).format(dtFormat)}</span>
                  <span style={{ color: "var(--text-primary)" }}>{a.summary} <span style={{ color: "var(--text-muted)" }}>· {a.actorName}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div></div>
      )}

      {/* ── Dialogs ── */}

      {/* Edit ticket — reuses the raise-modal field set. */}
      <Modal open={dialog === "edit"} onClose={() => setDialog(null)} title="Edit ticket"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" type="submit" form="edit-ticket-form" loading={busy}>Save changes</Button>
          </div>
        }>
        <form id="edit-ticket-form" onSubmit={onEdit} noValidate className="space-y-4">
          <div>
            <label htmlFor="e-subject" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Subject *</label>
            <input id="e-subject" className="input text-[12px]" {...editForm.register("subject")} />
            {editForm.formState.errors.subject && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{editForm.formState.errors.subject.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Category *</label>
              <Controller name="category" control={editForm.control} render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={TICKET_CATEGORIES.map((c) => ({ value: c, label: c }))} />
              )} />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Priority *</label>
              <Controller name="priority" control={editForm.control} render={({ field }) => (
                <Dropdown value={field.value} onChange={field.onChange} width="w-full" options={TICKET_PRIORITIES.map((p) => ({ value: p, label: p }))} />
              )} />
            </div>
          </div>
          <div>
            <label htmlFor="e-desc" className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Description *</label>
            <textarea id="e-desc" rows={4} className="input text-[12px] resize-none" {...editForm.register("description")} />
            {editForm.formState.errors.description && <p role="alert" className="text-[11px] text-[#ef4444] mt-1">{editForm.formState.errors.description.message}</p>}
          </div>
        </form>
      </Modal>

      {/* Resolve — summary + category (min 5, server re-checks). */}
      <Modal open={dialog === "resolve"} onClose={() => setDialog(null)} title="Resolve ticket"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" disabled={busy || resSummary.trim().length < 5}
              onClick={() => run("Resolve", () => resolveTicket(ticket.id, { resolutionSummary: resSummary.trim(), resolutionCategory: resCategory as (typeof RESOLUTION_CATEGORIES)[number] }))}>
              Resolve
            </Button>
          </div>
        }>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Resolution category</label>
            <Dropdown value={resCategory} onChange={setResCategory} width="w-full" options={RESOLUTION_CATEGORIES.map((c) => ({ value: c, label: c }))} />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Resolution summary *</label>
            <textarea rows={3} className="input text-[12px] resize-none w-full" placeholder="What was done to resolve this? (min 5 characters)" value={resSummary} onChange={(e) => setResSummary(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Close — confirmation only, no reason (spec). */}
      <Modal open={dialog === "close"} onClose={() => setDialog(null)} title="Close ticket"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={() => run("Close", () => confirmResolution(ticket.id))}>Close ticket</Button>
          </div>
        }>
        <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>Confirm the resolution and close this ticket? It can still be reopened later if needed.</p>
      </Modal>

      {/* Escalate / Cancel / Reopen — mandatory reason (min 5, server re-checks). */}
      <Modal
        open={dialog === "escalate" || dialog === "cancel" || dialog === "reopen"}
        onClose={() => setDialog(null)}
        title={dialog === "escalate" ? "Escalate to Super Admin" : dialog === "cancel" ? "Cancel ticket" : "Reopen ticket"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setDialog(null)}>Back</Button>
            <Button variant="primary" disabled={busy || reason.trim().length < 5}
              onClick={() => {
                const r = reason.trim();
                if (dialog === "escalate") return void run("Escalate", () => escalateTicket(ticket.id, { reason: r }));
                if (dialog === "cancel") return void run("Cancel", () => cancelTicket(ticket.id, { reason: r }));
                return void run("Reopen", () => reopenTicket(ticket.id, { reason: r }));
              }}>
              {dialog === "escalate" ? "Escalate" : dialog === "cancel" ? "Cancel ticket" : "Reopen ticket"}
            </Button>
          </div>
        }>
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>Reason * (min 5 characters)</label>
          <textarea rows={3} className="input text-[12px] resize-none w-full" placeholder="Explain why…" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
      </Modal>
    </main>
  );
}

/** A clickable action card: brand-tinted Lucide icon + title + 1–2 line
 *  description. Disabled cards stay visible (greyed) with a tooltip reason. */
function ActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  disabled,
  disabledReason,
  fullWidth,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={clsx(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        "border-(--bg-border) bg-(--bg-elevated)",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "enabled:cursor-pointer enabled:hover:border-(--brand)",
        fullWidth && "w-full",
      )}
    >
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--brand-muted)" }}>
        <Icon className="w-4 h-4" style={{ color: "var(--brand)" }} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
        <span className="block text-[10px] mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>{description}</span>
      </span>
    </button>
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
