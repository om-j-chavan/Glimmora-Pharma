"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Ban, Bell, Check, ChevronDown, ChevronRight, FileText, RotateCcw, SkipForward, UserCog } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { displayUserName } from "@/lib/identity-display";
import { roleLabel } from "@/lib/labels/roles";
import { canExecuteCAPA } from "@/lib/permissions/roleSets";
import { acceptWork, sendWorkBack, cancelTask, skipTask, reassignTask, nudgeActionItemOwner, addActionItem } from "@/actions/capas";
import { DatePicker } from "@/components/ui/DatePicker";
import { TASK_DESCRIPTION_MIN } from "@/constants/capaValidation";
import type { CAPA, CAPAActionItem } from "@/store/capa.slice";
import type { CAPAEvidenceFileRef, CAPACarriedNote } from "@/lib/queries/capas";
import type { UserConfig } from "@/store/settings.slice";

/**
 * Phase 5 — the Assignments tab. Makes the PERSON the unit: their tasks, work
 * notes, and files in one place. Composition only — every mutation is a Phase-2
 * action (acceptWork / sendWorkBack / skipTask / reassignTask / nudge). No gate
 * logic. Per-person evidence + the unattributed footnote both read the ONE
 * `evidenceFiles` prop (getCAPAEvidenceByActionItem) — never a separate count.
 */

const OVERDUE_BANNER_DAYS = 7;

type Bucket = "not_started" | "in_progress" | "submitted" | "accepted" | "skipped";
/** Single source for cards AND pills — they can't disagree. rework folds into
 *  "in progress" (it IS being worked again) with a Returned marker.
 *  Deliberately a PURE function of the item: whether the CAPA has been submitted
 *  for review is not the item's business, so only the LABEL/VARIANT below learn
 *  about CAPA status. Branching this function would fix the word and break the
 *  cards-and-pills-agree guarantee. */
function bucketOf(status: string): Bucket {
  if (status === "pending") return "not_started";
  if (status === "in_progress" || status === "rework") return "in_progress";
  if (status === "complete") return "submitted";
  if (status === "accepted") return "accepted";
  return "skipped";
}
const BUCKET_LABEL: Record<Bucket, string> = { not_started: "Not started", in_progress: "In progress", submitted: "Done", accepted: "Accepted", skipped: "Skipped" };
const BUCKET_VARIANT: Record<Bucket, BadgeVariant> = { not_started: "gray", in_progress: "amber", submitted: "green", accepted: "blue", skipped: "red" };
/** The `submitted` bucket is the ONE label that depends on the CAPA's status,
 *  because two different facts used to share the word "Submitted":
 *    - an action item at `complete`  = the WORKER finished their task
 *    - a CAPA at `pending_qa_review` = the whole CAPA was submitted for review
 *  An item cannot be "Submitted" until the CAPA it belongs to has been. Until
 *  then it is "Done" — finished, but not in front of QA, and acceptWork would
 *  refuse it (action-items.ts :795-797). Cards and pills BOTH read this, so the
 *  single-source invariant above still holds. */
function bucketLabel(b: Bucket, underQAReview: boolean): string {
  return b === "submitted" && underQAReview ? "Submitted" : BUCKET_LABEL[b];
}
/** Same split for colour. Pre-submit "Done" is green — finished, nothing owed.
 *  Post-submit "Submitted" is AMBER: it is work QA now owes a decision on, and
 *  green would read as "nothing needed" on the one tab built to surface it. */
function bucketVariant(b: Bucket, underQAReview: boolean): BadgeVariant {
  return b === "submitted" && underQAReview ? "amber" : BUCKET_VARIANT[b];
}

function daysOverdue(dueISO: string): number {
  return dayjs.utc().startOf("day").diff(dayjs.utc(dueISO).startOf("day"), "day");
}
const isOpenItem = (s: string) => s !== "accepted" && s !== "skipped";
/** acceptWork / sendWorkBack BOTH require the CAPA to be under QA review
 *  (action-items.ts :795-797, :891-893). Mirror that here so the buttons can't
 *  offer an action the server will always refuse. Disabled, not hidden: the
 *  `hasSubmitted` branch has no fallback controls, so hiding would leave a card
 *  of finished work with nothing on it and no explanation. The decision zone
 *  (with [Submit for review]) renders ABOVE the tabs on every tab, so the next
 *  step is already on screen — point at it rather than send anyone hunting. */
const REVIEW_GATE_HINT = "This CAPA isn't in a reviewable state — work can be accepted, sent back, or cancelled only while the CAPA is in progress or under QA review.";

export function AssignmentsTab({ capa, evidenceFiles, users, carrySkipped = null, carriedNotes = [], onChanged }: {
  capa: CAPA;
  evidenceFiles: CAPAEvidenceFileRef[];
  users: UserConfig[];
  /** Item 19 — set when QA asked to carry the originating gap's assignee and the
   *  server couldn't. Parsed from this CAPA's CAPA_ASSIGNMENT_CARRY_SKIPPED audit
   *  row by the detail page; `reason` is the row's own text, since the skip has
   *  four causes (severity, no assignment record, assignee gone, not an executor)
   *  and only one is about roles. Null = no carry was attempted, or it succeeded. */
  carrySkipped?: { assigneeName: string | null; reason: string } | null;
  /** Gap work notes carried onto this CAPA at raise, keyed to their author.
   *
   *  A DIFFERENT thing from the "Work notes" block below, which reads
   *  CAPAActionItem.completionNotes — the person's notes on their CAPA TASK. These
   *  are what they wrote on the GAP before it was escalated. Two fields, two
   *  meanings, one name; keeping them visibly separate is the point. */
  carriedNotes?: CAPACarriedNote[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const { isQAHead } = usePermissions();
  const { org } = useTenantConfig();
  const dateFormat = org.dateFormat;
  const timezone = org.timezone;
  const items = useMemo(() => capa.actionItems ?? [], [capa.actionItems]);
  // The server's status guard, mirrored. `underQAReview` still drives the
  // "awaiting review" labels; `canReviewWork` is the accept/send-back/cancel gate —
  // CAPA lifecycle rework lets QA review each person's work AS IT ARRIVES, while
  // the CAPA is in progress OR under QA review (mirrors the relaxed server gate).
  const underQAReview = capa.status === "pending_qa_review";
  const canReviewWork = capa.status === "in_progress" || capa.status === "pending_qa_review";

  // ONE source: files indexed by action item + the unattributed count both come
  // from `evidenceFiles`. The Evidence tab's "Not linked" bucket reads the same prop.
  const filesByItem = useMemo(() => {
    const m = new Map<string, CAPAEvidenceFileRef[]>();
    for (const f of evidenceFiles) {
      if (!f.actionItemId) continue;
      const a = m.get(f.actionItemId) ?? [];
      a.push(f);
      m.set(f.actionItemId, a);
    }
    return m;
  }, [evidenceFiles]);
  const unattributedCount = useMemo(() => evidenceFiles.filter((f) => !f.actionItemId).length, [evidenceFiles]);

  const people = useMemo(() => {
    const m = new Map<string, { key: string; ownerId: string | null; name: string; items: CAPAActionItem[] }>();
    for (const it of items) {
      const key = it.ownerId ?? it.owner ?? "unassigned";
      const e = m.get(key) ?? { key, ownerId: it.ownerId ?? null, name: displayUserName(it.ownerId ?? it.owner, users), items: [] };
      e.items.push(it);
      m.set(key, e);
    }
    return [...m.values()];
  }, [items, users]);

  const counts = useMemo(() => {
    const c = { total: 0, not_started: 0, in_progress: 0, submitted: 0, accepted: 0, skipped: 0 };
    for (const it of items) {
      const b = bucketOf(it.status);
      c[b] += 1;
      if (b !== "skipped") c.total += 1;
    }
    return c;
  }, [items]);

  const overdue = useMemo(
    () => items.filter((it) => isOpenItem(it.status) && daysOverdue(it.dueDate) >= OVERDUE_BANNER_DAYS),
    [items],
  );

  // Executor dropdown — MUST filter by canExecuteCAPA explicitly, not just borrow
  // `users`. The passed list is complianceUsers (Active minus super_admin/
  // customer_admin/viewer), which still INCLUDES qa_head — but qa_head assigns,
  // it doesn't execute (canExecuteCAPA excludes it). The server (addActionItem /
  // reassignTask) enforces the same set, so this keeps the UI from offering a
  // choice the server would refuse.
  const executorOptions = useMemo(
    () => users.filter((u) => u.status === "Active" && canExecuteCAPA(u.role)).map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` })),
    [users],
  );

  const [filter, setFilter] = useState<Bucket | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  // Reason-collecting modals.
  const [sendBack, setSendBack] = useState<{ ownerId: string; name: string } | null>(null);
  const [cancelWork, setCancelWork] = useState<{ ownerId: string; name: string } | null>(null);
  const [skipModal, setSkipModal] = useState<{ id: string; desc: string } | null>(null);
  const [reassignModal, setReassignModal] = useState<{ id: string; desc: string } | null>(null);
  const [reason, setReason] = useState("");
  const [newOwner, setNewOwner] = useState("");
  const [busy, setBusy] = useState(false);
  // Assign-someone modal.
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignDesc, setAssignDesc] = useState("");
  const [assignOwner, setAssignOwner] = useState("");
  const [assignDue, setAssignDue] = useState("");

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>, ok: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.success) { toast.error(res.error || "Action failed."); return false; }
    toast.success(ok);
    onChanged();
    return true;
  };

  const visiblePeople = filter ? people.filter((p) => p.items.some((it) => bucketOf(it.status) === filter)) : people;

  const cards: { key: Bucket | "total"; label: string; n: number }[] = [
    { key: "total", label: "Total assigned", n: counts.total },
    // The COUNT is unchanged and stays real pre-submit — "how many people have
    // finished" is exactly what tells the driver it's time to submit. Only the
    // word above it was ever wrong.
    { key: "submitted", label: bucketLabel("submitted", underQAReview), n: counts.submitted },
    { key: "not_started", label: "Not started", n: counts.not_started },
    { key: "in_progress", label: "In progress", n: counts.in_progress },
    { key: "accepted", label: "Accepted", n: counts.accepted },
  ];

  return (
    <div className="capa-stack">
      {/* 1 — OVERDUE BANNER (only when something is badly overdue: ≥7d, still open). */}
      {overdue.length > 0 && (
        <div className="rounded-lg border p-3" style={{ background: "var(--danger-bg)", borderColor: "var(--danger)" }}>
          {overdue.slice(0, 3).map((it) => (
            <div key={it.id} className="flex items-start gap-2 flex-wrap">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--danger)" }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold" style={{ color: "var(--danger)" }}>
                  {displayUserName(it.ownerId ?? it.owner, users)}&apos;s task is {daysOverdue(it.dueDate)} days overdue and blocking closure
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{it.description}</p>
              </div>
              {isQAHead && (
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" icon={Bell} disabled={busy} onClick={() => void run(() => nudgeActionItemOwner(it.id), "Assignee nudged.")}>Nudge</Button>
                  <Button variant="ghost" size="sm" icon={UserCog} onClick={() => { setReassignModal({ id: it.id, desc: it.description }); setNewOwner(""); setReason(""); }}>Reassign</Button>
                  <Button variant="ghost" size="sm" icon={SkipForward} onClick={() => { setSkipModal({ id: it.id, desc: it.description }); setReason(""); }}>Skip w/ reason</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 2 — STATUS CARDS = filters, 1:1 with the pills (same bucketOf). */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {cards.map((c) => {
          const active = c.key !== "total" && filter === c.key;
          return (
            <button key={c.key} type="button"
              onClick={() => c.key !== "total" && setFilter(active ? null : (c.key as Bucket))}
              className="rounded-lg border p-2.5 text-left cursor-pointer"
              style={{ borderColor: active ? "var(--brand)" : "var(--card-border, var(--bg-border))", background: active ? "var(--brand-muted)" : "var(--bg-elevated)" }}>
              <p className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>{c.n}</p>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{c.label}</p>
            </button>
          );
        })}
      </div>
      {counts.skipped > 0 && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{counts.skipped} task{counts.skipped === 1 ? "" : "s"} skipped (a QA decision was recorded).</p>
      )}
      {filter && (
        <button type="button" onClick={() => setFilter(null)} className="text-[11px] underline bg-transparent border-none cursor-pointer p-0 self-start" style={{ color: "var(--brand)" }}>
          Clear filter ({bucketLabel(filter, underQAReview)})
        </button>
      )}

      {/* 3 — PEOPLE LIST, expand-in-place (multiple can be open to compare). */}
      <div className="capa-stack">
        {visiblePeople.map((p) => {
          const isOpenNow = open.has(p.key);
          const files = p.items.flatMap((it) => filesByItem.get(it.id) ?? []);
          const hasSubmitted = p.items.some((it) => it.status === "complete");
          // Phase 2 acceptance attribution. acceptWork stamps ALL of one person's
          // `complete` items in a single call, so the newest stamp IS this
          // person's acceptance; a re-accepted rework round supersedes the older.
          const acceptedItems = p.items.filter((it) => it.status === "accepted" && it.acceptedAt);
          const lastAccepted = acceptedItems.length
            ? acceptedItems.reduce((a, b) => (dayjs.utc(a.acceptedAt!).isAfter(dayjs.utc(b.acceptedAt!)) ? a : b))
            : null;
          const worstOverdue = Math.max(0, ...p.items.filter((it) => isOpenItem(it.status)).map((it) => daysOverdue(it.dueDate)));
          const summaryBucket = bucketOf(p.items.find((it) => it.status === "complete")?.status ?? p.items[0]?.status ?? "pending");
          return (
            <div key={p.key} className="capa-card">
              {/* Collapsed header */}
              <button type="button" onClick={() => toggle(p.key)} className="w-full flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 text-left">
                {isOpenNow ? <ChevronDown className="w-4 h-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {p.items.length} task{p.items.length === 1 ? "" : "s"} · {files.length} file{files.length === 1 ? "" : "s"}
                    {/* "your" is only true for the person who can actually act —
                        everyone else is watching, not reviewing. */}
                    {hasSubmitted && (underQAReview ? (
                      <> · <span style={{ color: "var(--status-waiting)" }}>{isQAHead ? "awaiting your review" : "awaiting QA review"}</span></>
                    ) : canReviewWork ? (
                      <> · <span style={{ color: "var(--status-waiting)" }}>{isQAHead ? "ready for your review" : "ready for QA review"}</span></>
                    ) : (
                      <> · done</>
                    ))}
                  </p>
                </div>
                <Badge variant={bucketVariant(summaryBucket, underQAReview)}>{bucketLabel(summaryBucket, underQAReview)}</Badge>
                {worstOverdue >= OVERDUE_BANNER_DAYS && <Badge variant="red">{worstOverdue}d overdue</Badge>}
              </button>

              {/* Expanded individual view */}
              {isOpenNow && (
                <div className="mt-3 pt-3 space-y-3" style={{ borderTop: "1px solid var(--card-border, var(--bg-border))" }}>
                  {/* TASKS */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Tasks</p>
                    <ul className="list-none p-0 m-0 space-y-1.5">
                      {p.items.map((it) => (
                        <li key={it.id} className="text-[12px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={bucketVariant(bucketOf(it.status), underQAReview)}>{bucketLabel(bucketOf(it.status), underQAReview)}</Badge>
                            {it.status === "rework" && <Badge variant="red">Returned</Badge>}
                            <span style={{ color: "var(--text-primary)" }}>{it.description}</span>
                            <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>due {dayjs.utc(it.dueDate).format(dateFormat)}</span>
                          </div>
                          {it.status === "rework" && it.reworkReason && (
                            <p className="text-[11px] mt-0.5 pl-2 border-l-2" style={{ color: "var(--danger)", borderColor: "var(--danger)" }}>Returned: {it.reworkReason}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* ACCEPTED — who signed this person's work off, and when.
                      Written by acceptWork (action-items.ts :825-828); mirrored in
                      the CAPA_WORK_ACCEPTED audit row. Was written to the DB but
                      dropped at the mapper, so it never reached the product.
                      displayUserName never leaks an unresolved cuid. */}
                  {lastAccepted && (
                    <div>
                      <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                        <Check className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--success)" }} aria-hidden="true" />
                        Accepted by {displayUserName(lastAccepted.acceptedById ?? lastAccepted.acceptedBy, users)}
                        <span aria-hidden="true">·</span>
                        <time dateTime={lastAccepted.acceptedAt!} title={dayjs.utc(lastAccepted.acceptedAt!).tz(timezone).format(`${dateFormat} HH:mm`)}>
                          {dayjs.utc(lastAccepted.acceptedAt!).fromNow()}
                        </time>
                      </p>
                      {lastAccepted.acceptanceNotes && (
                        <p className="text-[11px] italic mt-0.5" style={{ color: "var(--text-muted)" }}>&ldquo;{lastAccepted.acceptanceNotes}&rdquo;</p>
                      )}
                    </div>
                  )}

                  {/* WORK NOTES (the worker's channel — no chat thread, Phase 0A).
                      CAPAActionItem.completionNotes — their notes on the CAPA TASK. */}
                  {p.items.some((it) => it.completionNotes) && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Work notes</p>
                      {p.items.filter((it) => it.completionNotes).map((it) => (
                        <p key={it.id} className="text-[12px] whitespace-pre-wrap mb-1" style={{ color: "var(--text-secondary)" }}>&ldquo;{it.completionNotes}&rdquo;</p>
                      ))}
                    </div>
                  )}

                  {/* CARRIED GAP NOTES — what this person wrote on the GAP before it
                      was escalated. createCAPA carries them as a CAPAComment, which
                      IS the durable record; this only READS it. They are not concerns,
                      so DiscussionSection (concerns-only, Phase 0A) filters them out —
                      correctly, but that left them written and visible nowhere.

                      Deliberately NOT written into CAPAActionItem.completionNotes: that
                      would claim the person completed a CAPA task they may not have
                      started, and the next updateActionItem would overwrite it. Separate
                      block, separate label — the gap's notes are not the task's notes. */}
                  {carriedNotes.filter((n) => n.authorId === p.ownerId).map((n) => (
                    <div key={n.id}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>
                        Work notes carried from {n.findingRef}
                      </p>
                      <p className="text-[12px] whitespace-pre-wrap mb-1" style={{ color: "var(--text-secondary)" }}>&ldquo;{n.body}&rdquo;</p>
                    </div>
                  ))}

                  {/* EVIDENCE — THEIR files only */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-muted)" }}>Evidence</p>
                    {files.length > 0 ? (
                      <ul className="list-none p-0 m-0 space-y-1">
                        {files.map((f) => (
                          <li key={f.id} className="flex items-center gap-2 text-[12px]">
                            <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                            <span className="truncate" style={{ color: "var(--text-primary)" }}>{f.fileName}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-auto" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{f.category}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>No files linked to this person.</p>
                    )}
                    {unattributedCount > 0 && (
                      <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                        {unattributedCount} file{unattributedCount === 1 ? "" : "s"} on this CAPA aren&apos;t linked to a person — see the Evidence tab.
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {isQAHead && (
                    <div className="flex gap-2 flex-wrap pt-1">
                      {hasSubmitted ? (
                        <>
                          <Button variant="danger" size="sm" icon={RotateCcw} disabled={busy || !canReviewWork} title={canReviewWork ? undefined : REVIEW_GATE_HINT} onClick={() => { setSendBack({ ownerId: p.ownerId ?? "", name: p.name }); setReason(""); }}>Send this work back</Button>
                          <Button variant="primary" size="sm" icon={Check} disabled={busy || !canReviewWork} title={canReviewWork ? undefined : REVIEW_GATE_HINT} onClick={() => p.ownerId && void run(() => acceptWork(capa.id, { ownerId: p.ownerId! }), `Accepted ${p.name}'s work.`)}>Accept this work</Button>
                          <Button variant="ghost" size="sm" icon={Ban} disabled={busy || !canReviewWork} title={canReviewWork ? "Void this person's remaining work" : REVIEW_GATE_HINT} onClick={() => { setCancelWork({ ownerId: p.ownerId ?? "", name: p.name }); setReason(""); }}>Cancel work</Button>
                          {!canReviewWork && (
                            <p className="text-[11px] basis-full m-0" style={{ color: "var(--text-muted)" }}>{REVIEW_GATE_HINT}</p>
                          )}
                        </>
                      ) : (
                        p.items.filter((it) => isOpenItem(it.status)).map((it) => (
                          <div key={it.id} className="flex gap-1.5">
                            <Button variant="ghost" size="sm" icon={Bell} disabled={busy} onClick={() => void run(() => nudgeActionItemOwner(it.id), "Assignee nudged.")}>Nudge</Button>
                            <Button variant="ghost" size="sm" icon={UserCog} onClick={() => { setReassignModal({ id: it.id, desc: it.description }); setNewOwner(""); setReason(""); }}>Reassign</Button>
                            <Button variant="ghost" size="sm" icon={SkipForward} onClick={() => { setSkipModal({ id: it.id, desc: it.description }); setReason(""); }}>Skip this task</Button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visiblePeople.length === 0 && (
          <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>No people match this filter.</p>
        )}
        {/* Item 19 — nobody is assigned AND a carry was attempted and skipped.
            Without this, an empty Assignments tab looks identical whether the gap
            had an assignee or not, and QA assigns someone fresh never knowing the
            gap's own assignee was meant to continue. Shown only while the tab is
            genuinely empty: once anyone is assigned, the skip is stale news. */}
        {people.length === 0 && carrySkipped && (
          <div className="rounded-lg border p-2.5 flex items-start gap-2" style={{ background: "var(--warning-bg, var(--bg-surface))", borderColor: "var(--warning, var(--bg-border))" }}>
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "var(--warning, var(--text-muted))" }} aria-hidden="true" />
            <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>
              The originating gap&apos;s assignee{carrySkipped.assigneeName ? <> (<strong>{carrySkipped.assigneeName}</strong>)</> : null} couldn&apos;t be carried — {carrySkipped.reason}.
            </p>
          </div>
        )}
      </div>

      {/* 4 — [+ Assign someone] — manual only (auto-assign was removed deliberately). */}
      {isQAHead && (
        <Button variant="secondary" size="sm" icon={UserCog} className="self-start" onClick={() => { setAssignOpen(true); setAssignDesc(""); setAssignOwner(""); setAssignDue(""); }}>
          + Assign someone
        </Button>
      )}

      {assignOpen && (
        <Modal open onClose={busy ? () => undefined : () => setAssignOpen(false)} title="Assign a task">
          <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Assign to (CAPA executor)</p>
          <Dropdown value={assignOwner} onChange={setAssignOwner} placeholder="Select executor…" width="w-full" options={executorOptions} />
          <textarea className="input text-[12px] w-full min-h-16 my-2" placeholder={`Describe the task (≥ ${TASK_DESCRIPTION_MIN} characters)`} value={assignDesc} onChange={(e) => setAssignDesc(e.target.value)} maxLength={2000} />
          <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Due date (on or before the CAPA due date)</p>
          <DatePicker id="assign-due" value={assignDue} onChange={setAssignDue} />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" disabled={busy || !assignOwner || assignDesc.trim().length < TASK_DESCRIPTION_MIN || !assignDue} loading={busy}
              onClick={() => void run(() => addActionItem(capa.id, { description: assignDesc.trim(), owner: assignOwner, ownerId: assignOwner, dueDate: assignDue }), "Task assigned.").then((ok) => ok && setAssignOpen(false))}>Assign</Button>
          </div>
        </Modal>
      )}

      {/* ── Send-this-work-back modal — HONEST per-category evidence caveat. ── */}
      {sendBack && (
        <Modal open onClose={busy ? () => undefined : () => setSendBack(null)} title={`Send ${sendBack.name}'s work back`}>
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
            This returns <strong>{sendBack.name}&apos;s</strong> items to rework and unlocks their evidence. Note: evidence unlocks by
            {" "}<strong>category</strong>, so if someone else uploaded into the same category, that category reopens for them too. Everyone
            else&apos;s <strong>action items</strong> stay untouched. The CAPA stays in QA review.
          </p>
          <textarea className="input text-[12px] w-full min-h-20 mb-2" placeholder="Reason (≥ 10 characters) — what must be fixed?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setSendBack(null)}>Cancel</Button>
            <Button variant="danger" size="sm" disabled={busy || reason.trim().length < 10} loading={busy}
              onClick={() => sendBack.ownerId && void run(() => sendWorkBack(capa.id, { ownerId: sendBack.ownerId, reason: reason.trim() }), `Sent ${sendBack.name}'s work back.`).then((ok) => ok && setSendBack(null))}>Send back</Button>
          </div>
        </Modal>
      )}

      {/* ── Cancel-work modal — VOID this person's remaining assignment. ── */}
      {cancelWork && (
        <Modal open onClose={busy ? () => undefined : () => setCancelWork(null)} title={`Cancel ${cancelWork.name}'s work`}>
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>
            This <strong>voids</strong> all of <strong>{cancelWork.name}&apos;s</strong> still-open items on this CAPA (they move to
            {" "}<strong>Cancelled</strong>). Cancelled work is settled — it won&apos;t block closure and won&apos;t be reworked. Already
            accepted or skipped items are untouched. The assignee is notified.
          </p>
          <textarea className="input text-[12px] w-full min-h-20 mb-2" placeholder="Reason (≥ 10 characters) — why is this being cancelled?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setCancelWork(null)}>Keep it</Button>
            <Button variant="danger" size="sm" disabled={busy || reason.trim().length < 10} loading={busy}
              onClick={() => cancelWork.ownerId && void run(() => cancelTask(capa.id, { ownerId: cancelWork.ownerId, reason: reason.trim() }), `Cancelled ${cancelWork.name}'s work.`).then((ok) => ok && setCancelWork(null))}>Cancel work</Button>
          </div>
        </Modal>
      )}

      {/* ── Skip-task modal (reason ≥ 20, per skipTask). ── */}
      {skipModal && (
        <Modal open onClose={busy ? () => undefined : () => setSkipModal(null)} title="Skip this task">
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>Skipping removes a corrective action. Record why (≥ 20 characters).</p>
          <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>{skipModal.desc}</p>
          <textarea className="input text-[12px] w-full min-h-20 mb-2" placeholder="Why is this task being skipped?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setSkipModal(null)}>Cancel</Button>
            <Button variant="danger" size="sm" disabled={busy || reason.trim().length < 20} loading={busy}
              onClick={() => void run(() => skipTask(skipModal.id, { reason: reason.trim() }), "Task skipped.").then((ok) => ok && setSkipModal(null))}>Skip task</Button>
          </div>
        </Modal>
      )}

      {/* ── Reassign modal (new executor + reason ≥ 10, per reassignTask). ── */}
      {reassignModal && (
        <Modal open onClose={busy ? () => undefined : () => setReassignModal(null)} title="Reassign this task">
          <p className="text-[12px] mb-2" style={{ color: "var(--text-secondary)" }}>{reassignModal.desc}</p>
          <p className="text-[11px] font-medium mb-1" style={{ color: "var(--text-secondary)" }}>New owner (CAPA executor)</p>
          <Dropdown value={newOwner} onChange={setNewOwner} placeholder="Select executor…" width="w-full" options={executorOptions} />
          <textarea className="input text-[12px] w-full min-h-16 my-2" placeholder="Reason (≥ 10 characters)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setReassignModal(null)}>Cancel</Button>
            <Button variant="primary" size="sm" icon={UserCog} disabled={busy || !newOwner || reason.trim().length < 10} loading={busy}
              onClick={() => void run(() => reassignTask(reassignModal.id, { newOwnerId: newOwner, reason: reason.trim() }), "Task reassigned.").then((ok) => ok && setReassignModal(null))}>Reassign</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
