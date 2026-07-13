"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CornerDownRight,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import type { CAPAComment as PrismaCAPAComment } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import {
  addCAPAComment,
  resolveCAPAComment,
  reopenCAPAComment,
  editCAPAComment,
  softDeleteCAPAComment,
  loadCommentsForCAPA,
} from "@/actions/capa-comments";
import type { CAPA } from "@/store/capa.slice";
import { STATUS_LABEL } from "@/types/capa";
import { roleLabel } from "@/lib/labels/roles";
import { useToast } from "@/components/ui/Toast";
import {
  buildCommentTree,
  initialsFor,
  type DiscussionNode,
} from "../utils/commentTree";

/* ── Substage 5.2 §5.3 — Discussion thread ──
 *
 * Extracted from ActionsPanel as part of the file split. Behaviour
 * unchanged: threaded comments, soft-delete, mark-as-concern, resolve /
 * reopen with rationale, edit-by-author, super_admin override.
 *
 * The shell receives an `onCommentsChange` callback so ApprovalsSection's
 * unresolved-concern gate re-evaluates after every mutation here.
 */

interface DiscussionSectionProps {
  capa: CAPA;
  /** Bumps after every successful comment mutation so ApprovalsSection's
   *  evaluateApprovalProgress() runs against fresh comment state. */
  onCommentsChange: () => void;
}

export function DiscussionSection({ capa, onCommentsChange }: DiscussionSectionProps) {
  const toast = useToast();
  const { role } = useRole();
  const currentUser = useAppSelector((s) => s.auth.user);
  const canResolve =
    role === "qa_head" ||
    role === "regulatory_affairs" ||
    role === "customer_admin" ||
    role === "super_admin";
  const isSuperAdmin = role === "super_admin";

  const isFrozen = capa.status === "closed" || capa.status === "rejected";

  const [comments, setComments] = useState<PrismaCAPAComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // New top-level comment composer.
  const [newBody, setNewBody] = useState("");
  const [newIsConcern, setNewIsConcern] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Inline reply state: id of parent the reply form is open under, plus
  // its draft. Only one reply form open at a time.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyIsConcern, setReplyIsConcern] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);

  // Inline edit state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // Modal state for resolve / reopen / delete (each needs a free-text
  // rationale, so a Modal is cleaner than inline forms).
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenBusy, setReopenBusy] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  // Batch 3b — per-thread collapse of a root's reply group (default expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapse = (rootId: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId); else next.add(rootId);
      return next;
    });

  const refresh = useCallback(async () => {
    setLoadError(null);
    const result = await loadCommentsForCAPA(capa.id);
    if (!result.success) {
      setLoadError(result.error);
      setComments([]);
      setLoading(false);
      return;
    }
    setComments(result.data as PrismaCAPAComment[]);
    setLoading(false);
  }, [capa.id]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const tree = buildCommentTree(comments);
  const liveComments = comments.filter((c) => c.deletedAt === null);
  const totalCount = liveComments.length;
  const unresolvedConcerns = liveComments.filter(
    (c) => c.isConcern && c.resolvedAt === null,
  ).length;

  /* ── Mutation handlers ── */

  const handlePostNew = async () => {
    if (newBody.trim().length < 5) return; // button is disabled; gentle hint shown
    setPostBusy(true);
    setPostError(null);
    const result = await addCAPAComment(capa.id, {
      body: newBody.trim(),
      isConcern: newIsConcern,
    });
    setPostBusy(false);
    if (!result.success) {
      setPostError(result.error);
      toast.error(result.error || "Could not post comment.");
      return;
    }
    setNewBody("");
    setNewIsConcern(false);
    toast.success(newIsConcern ? "Concern flagged." : "Comment posted.");
    await refresh();
    onCommentsChange();
  };

  const handlePostReply = async (parentId: string) => {
    if (replyBody.trim().length < 5) return;
    setReplyBusy(true);
    const result = await addCAPAComment(capa.id, {
      body: replyBody.trim(),
      isConcern: replyIsConcern,
      parentId,
    });
    setReplyBusy(false);
    if (!result.success) {
      setPostError(result.error);
      return;
    }
    setReplyingTo(null);
    setReplyBody("");
    setReplyIsConcern(false);
    await refresh();
    onCommentsChange();
  };

  const handleSaveEdit = async (commentId: string) => {
    if (editBody.trim().length < 5) return;
    setEditBusy(true);
    const result = await editCAPAComment(commentId, { body: editBody.trim() });
    setEditBusy(false);
    if (!result.success) {
      setPostError(result.error);
      toast.error(result.error || "Could not update comment.");
      return;
    }
    setEditingId(null);
    setEditBody("");
    toast.success("Comment updated.");
    await refresh();
    onCommentsChange();
  };

  const handleResolveSubmit = async () => {
    if (!resolvingId || resolveNote.trim().length < 5) return;
    setResolveBusy(true);
    setResolveError(null);
    const result = await resolveCAPAComment(resolvingId, {
      resolutionNote: resolveNote.trim(),
    });
    setResolveBusy(false);
    if (!result.success) {
      setResolveError(result.error);
      toast.error(result.error || "Could not resolve concern.");
      return;
    }
    setResolvingId(null);
    setResolveNote("");
    toast.success("Concern resolved.");
    await refresh();
    onCommentsChange();
  };

  const handleReopenSubmit = async () => {
    if (!reopeningId || reopenReason.trim().length < 10) return;
    setReopenBusy(true);
    setReopenError(null);
    const result = await reopenCAPAComment(reopeningId, {
      reason: reopenReason.trim(),
    });
    setReopenBusy(false);
    if (!result.success) {
      setReopenError(result.error);
      return;
    }
    setReopeningId(null);
    setReopenReason("");
    await refresh();
    onCommentsChange();
  };

  const handleDeleteSubmit = async () => {
    if (!deletingId || deleteReason.trim().length < 10) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const result = await softDeleteCAPAComment(deletingId, {
      reason: deleteReason.trim(),
    });
    setDeleteBusy(false);
    if (!result.success) {
      setDeleteError(result.error);
      return;
    }
    setDeletingId(null);
    setDeleteReason("");
    await refresh();
    onCommentsChange();
  };

  /* ── Comment node renderer ── */

  const renderNode = (node: DiscussionNode, depth: number): React.ReactNode => {
    const isDeleted = node.deletedAt !== null;
    const isAuthor = currentUser?.id === node.authorId;
    const canEdit = !isFrozen && !isDeleted && (isAuthor || isSuperAdmin);
    const canDelete = canEdit;
    const showResolve =
      !isFrozen &&
      !isDeleted &&
      node.isConcern &&
      node.resolvedAt === null &&
      canResolve;
    const showReopen =
      !isFrozen &&
      !isDeleted &&
      node.isConcern &&
      node.resolvedAt !== null &&
      canResolve;
    // Batch 3b — replies are one level deep, so only roots offer "Reply".
    const showReply = !isFrozen && !isDeleted && depth === 0;
    const isEditing = editingId === node.id;
    const isReplying = replyingTo === node.id;
    const menuOpen = openMenuId === node.id;

    return (
      <li
        key={node.id}
        style={{
          marginLeft: depth > 0 ? 24 : 0,
          paddingLeft: depth > 0 ? 12 : 0,
          borderLeft:
            depth > 0 ? "1px solid var(--bg-border)" : "none",
        }}
      >
        <article
          className="rounded-md p-2.5 mb-2"
          style={{
            background:
              isDeleted ? "var(--bg-elevated)" : "var(--card-bg)",
            border: "1px solid var(--card-border)",
            opacity: isDeleted ? 0.7 : 1,
          }}
          aria-labelledby={`comment-${node.id}-author`}
        >
          <div className="flex items-start gap-2 mb-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
              style={{
                background: "var(--brand-muted)",
                color: "var(--brand)",
              }}
              aria-hidden="true"
            >
              {initialsFor(node.authorName)}
            </div>
            <div className="flex-1 min-w-0">
              {/* Batch 3a #4 — name + timestamp (+ edited) on one line; role on
                  its own line beneath, legible in light + dark. */}
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span
                id={`comment-${node.id}-author`}
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {node.authorName}
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                {dayjs(node.createdAt).fromNow()}
              </span>
              {dayjs(node.updatedAt).diff(node.createdAt, "second") > 2 && !isDeleted && (
                <span className="text-[10px] italic" style={{ color: "var(--text-muted)" }}>· edited</span>
              )}
              {node.isConcern && !isDeleted && (
                <Badge
                  variant={node.resolvedAt ? "green" : "red"}
                >
                  {node.resolvedAt ? (
                    <>
                      <CheckCircle2
                        className="w-3 h-3 inline mr-0.5"
                        aria-hidden="true"
                      />
                      Resolved
                    </>
                  ) : (
                    <>
                      <AlertTriangle
                        className="w-3 h-3 inline mr-0.5"
                        aria-hidden="true"
                      />
                      Concern
                    </>
                  )}
                </Badge>
              )}
              </div>
              {/* role under the name — text-primary for legibility in both modes */}
              <span className="inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--card-border, var(--bg-border))" }}>
                {roleLabel(node.authorRole)}
              </span>
            </div>
            {(canEdit || canDelete) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenMenuId(menuOpen ? null : node.id)
                  }
                  aria-label={`Comment actions for ${node.authorName}`}
                  className="p-1 rounded border-none bg-transparent cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                >
                  <MoreHorizontal
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 rounded-md shadow-md z-10 min-w-[120px]"
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--bg-border)",
                    }}
                  >
                    {canEdit && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setEditingId(node.id);
                          setEditBody(node.body);
                          setOpenMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] border-none bg-transparent cursor-pointer text-left"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <Pencil
                          className="w-3 h-3"
                          aria-hidden="true"
                        />
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setDeletingId(node.id);
                          setDeleteReason("");
                          setOpenMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] border-none bg-transparent cursor-pointer text-left"
                        style={{ color: "var(--danger)" }}
                      >
                        <Trash2
                          className="w-3 h-3"
                          aria-hidden="true"
                        />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2 mt-1">
              <textarea
                className="input text-[12px] min-h-[60px]"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                maxLength={4000}
                disabled={editBusy}
                aria-label="Edit comment body"
              />
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={editBusy || editBody.trim().length < 5}
                  loading={editBusy}
                  onClick={() => void handleSaveEdit(node.id)}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={editBusy}
                  onClick={() => {
                    setEditingId(null);
                    setEditBody("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : isDeleted ? (
            <p
              className="text-[12px] italic"
              style={{ color: "var(--text-muted)" }}
            >
              [deleted]
              {node.deletionReason && (
                <span
                  className="ml-2 not-italic"
                  style={{ color: "var(--text-muted)" }}
                >
                  · reason: {node.deletionReason}
                </span>
              )}
            </p>
          ) : (
            <p
              className="text-[12px] whitespace-pre-wrap"
              style={{ color: "var(--text-primary)" }}
            >
              {node.body}
            </p>
          )}

          {node.resolvedAt && !isDeleted && (
            <p
              className="text-[10px] mt-1.5 italic"
              style={{ color: "var(--text-muted)" }}
            >
              <CheckCircle2
                className="w-3 h-3 inline mr-1"
                aria-hidden="true"
              />
              Resolved by {node.resolvedByName}
              {" · "}
              {dayjs(node.resolvedAt).fromNow()}
              {node.resolvedComment && <>: &ldquo;{node.resolvedComment}&rdquo;</>}
            </p>
          )}

          {(showReply || showResolve || showReopen) && !isEditing && (
            <div className="flex items-center gap-3 mt-1.5 text-[11px]">
              {showReply && (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo(isReplying ? null : node.id);
                    setReplyBody("");
                    setReplyIsConcern(false);
                  }}
                  className="border-none bg-transparent cursor-pointer p-0"
                  style={{ color: "var(--brand)" }}
                >
                  <CornerDownRight
                    className="w-3 h-3 inline mr-0.5"
                    aria-hidden="true"
                  />
                  Reply
                </button>
              )}
              {showResolve && (
                <button
                  type="button"
                  onClick={() => {
                    setResolvingId(node.id);
                    setResolveNote("");
                  }}
                  className="border-none bg-transparent cursor-pointer p-0"
                  style={{ color: "var(--success)" }}
                >
                  Mark resolved
                </button>
              )}
              {showReopen && (
                <button
                  type="button"
                  onClick={() => {
                    setReopeningId(node.id);
                    setReopenReason("");
                  }}
                  className="border-none bg-transparent cursor-pointer p-0"
                  style={{ color: "var(--warning)" }}
                >
                  Reopen
                </button>
              )}
            </div>
          )}

          {isReplying && (
            <div className="space-y-2 mt-2">
              <textarea
                className="input text-[12px] min-h-[60px]"
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Reply..."
                maxLength={4000}
                disabled={replyBusy}
                aria-label="Reply body"
              />
              <label
                className="flex items-center gap-1.5 text-[11px]"
                style={{ color: "var(--text-secondary)" }}
              >
                <input
                  type="checkbox"
                  checked={replyIsConcern}
                  onChange={(e) => setReplyIsConcern(e.target.checked)}
                  disabled={replyBusy}
                />
                Flag as concern (blocks closure)
              </label>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={replyBusy || replyBody.trim().length < 5}
                  loading={replyBusy}
                  onClick={() => void handlePostReply(node.id)}
                >
                  Post reply
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={replyBusy}
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyBody("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </article>

        {node.children.length > 0 && (
          <div className="mt-1">
            {/* Batch 3b — collapse/expand a root's reply group (default expanded). */}
            <button type="button" onClick={() => toggleCollapse(node.id)}
              className="text-[11px] inline-flex items-center gap-1 bg-transparent border-none cursor-pointer p-0 mb-1" style={{ color: "var(--brand)" }}>
              {collapsed.has(node.id) ? "▸" : "▾"} {node.children.length} {node.children.length === 1 ? "reply" : "replies"}
            </button>
            {!collapsed.has(node.id) && (
              <ul role="list" className="list-none p-0 m-0">
                {node.children.map((child) => renderNode(child, depth + 1))}
              </ul>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section
      // Phase F — no own card chrome; CAPADetailPage wraps this in .capa-card.
      aria-labelledby="discussion-heading"
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          id="discussion-heading"
          className="text-[14px] font-semibold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <MessageSquare className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          Discussion
          <span className="text-[12px] font-normal" style={{ color: "var(--text-muted)" }}>
            ({totalCount} comment{totalCount === 1 ? "" : "s"} · {unresolvedConcerns} open concern{unresolvedConcerns === 1 ? "" : "s"})
          </span>
        </h3>
      </div>

      {unresolvedConcerns > 0 && (
        <div
          role="status"
          className="alert alert-warning flex items-start gap-2 mb-3"
        >
          <AlertTriangle
            className="w-4 h-4 mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <p className="text-[11px]">
            {unresolvedConcerns} unresolved concern
            {unresolvedConcerns === 1 ? "" : "s"} — must be resolved before
            final approval.
          </p>
        </div>
      )}

      {loading && (
        <p
          role="status"
          aria-live="polite"
          className="text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          Loading discussion…
        </p>
      )}
      {loadError && (
        <p
          role="alert"
          className="text-[11px]"
          style={{ color: "var(--danger)" }}
        >
          {loadError}
        </p>
      )}

      {!loading && !loadError && tree.length === 0 && (
        <div
          className="rounded-lg border border-dashed p-5 text-center mb-3"
          style={{ borderColor: "var(--card-border, var(--bg-border))" }}
        >
          <MessageSquare className="w-6 h-6 mx-auto mb-1.5" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>No comments yet — start the discussion.</p>
        </div>
      )}

      {!loading && tree.length > 0 && (
        <ul role="list" className="list-none p-0 m-0">
          {tree.map((root) => renderNode(root, 0))}
        </ul>
      )}

      {/* Add new comment composer (top-level). */}
      {!isFrozen && (
        <div
          className="mt-2 pt-2"
          style={{ borderTop: "1px solid var(--bg-border)" }}
        >
          <textarea
            className="input text-[12px] min-h-[60px]"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Add a comment…"
            maxLength={4000}
            disabled={postBusy}
            aria-label="New comment body"
          />
          <div className="flex items-center justify-between mt-2">
            <label
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                type="checkbox"
                checked={newIsConcern}
                onChange={(e) => setNewIsConcern(e.target.checked)}
                disabled={postBusy}
              />
              Flag as concern (blocks closure)
            </label>
            <div className="flex items-center gap-2">
              {/* Batch 3a #4 — gentle hint instead of a "min N chars" scold. */}
              {newBody.trim().length < 5 && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Add a brief comment</span>}
              <Button
                variant="primary"
                size="sm"
                icon={Send}
                disabled={postBusy || newBody.trim().length < 5}
                loading={postBusy}
                onClick={() => void handlePostNew()}
              >
                Comment
              </Button>
            </div>
          </div>
          {postError && (
            <p
              role="alert"
              className="text-[11px] mt-2"
              style={{ color: "var(--danger)" }}
            >
              {postError}
            </p>
          )}
        </div>
      )}

      {isFrozen && (
        <p
          className="text-[11px] italic mt-2 pt-2"
          style={{
            color: "var(--text-muted)",
            borderTop: "1px solid var(--bg-border)",
          }}
        >
          Discussion frozen — CAPA is {STATUS_LABEL[capa.status]}.
        </p>
      )}

      {/* Resolve concern modal. */}
      {resolvingId && (
        <Modal
          open
          onClose={resolveBusy ? () => undefined : () => setResolvingId(null)}
          title="Resolve concern"
        >
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Per Part 11 ALCOA+, resolving a concern requires a recorded
            rationale of at least 5 characters.
          </p>
          <textarea
            className="input text-[12px] min-h-[80px] mb-2"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            placeholder="How is this concern resolved?"
            maxLength={2000}
            disabled={resolveBusy}
            aria-label="Resolution note"
          />
          {resolveError && (
            <p
              role="alert"
              className="text-[11px] mb-2"
              style={{ color: "var(--danger)" }}
            >
              {resolveError}
            </p>
          )}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={resolveBusy}
              onClick={() => setResolvingId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={CheckCircle2}
              disabled={resolveBusy || resolveNote.trim().length < 5}
              loading={resolveBusy}
              onClick={() => void handleResolveSubmit()}
            >
              Resolve
            </Button>
          </div>
        </Modal>
      )}

      {/* Reopen concern modal. */}
      {reopeningId && (
        <Modal
          open
          onClose={reopenBusy ? () => undefined : () => setReopeningId(null)}
          title="Reopen concern"
        >
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Reopening clears the prior resolution. Reason of at least 10
            characters is required.
          </p>
          <textarea
            className="input text-[12px] min-h-[80px] mb-2"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            placeholder="Why is this concern being reopened?"
            maxLength={2000}
            disabled={reopenBusy}
            aria-label="Reopen reason"
          />
          {reopenError && (
            <p
              role="alert"
              className="text-[11px] mb-2"
              style={{ color: "var(--danger)" }}
            >
              {reopenError}
            </p>
          )}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={reopenBusy}
              onClick={() => setReopeningId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={RotateCcw}
              disabled={reopenBusy || reopenReason.trim().length < 10}
              loading={reopenBusy}
              onClick={() => void handleReopenSubmit()}
            >
              Reopen
            </Button>
          </div>
        </Modal>
      )}

      {/* Soft-delete comment modal. */}
      {deletingId && (
        <Modal
          open
          onClose={deleteBusy ? () => undefined : () => setDeletingId(null)}
          title="Delete comment"
        >
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Soft-delete only — the row remains for audit trail. Reason of at
            least 10 characters is required.
          </p>
          <textarea
            className="input text-[12px] min-h-[80px] mb-2"
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            placeholder="Why is this comment being deleted?"
            maxLength={2000}
            disabled={deleteBusy}
            aria-label="Deletion reason"
          />
          {deleteError && (
            <p
              role="alert"
              className="text-[11px] mb-2"
              style={{ color: "var(--danger)" }}
            >
              {deleteError}
            </p>
          )}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={deleteBusy}
              onClick={() => setDeletingId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={Trash2}
              disabled={deleteBusy || deleteReason.trim().length < 10}
              loading={deleteBusy}
              onClick={() => void handleDeleteSubmit()}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
