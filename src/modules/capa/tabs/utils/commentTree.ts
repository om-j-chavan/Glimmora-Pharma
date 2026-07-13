import type { CAPAComment as PrismaCAPAComment } from "@prisma/client";

/**
 * Pure helpers shared by the Discussion thread and Approvals sections.
 * Extracted from the ActionsPanel monolith — no behavioural change. The
 * tree builder and the role-label helper used to live alongside their
 * consumers; they're independently testable so a separate file makes the
 * dependency direction explicit (sections import from utils, never the
 * other way round).
 */

const ROLE_LABEL: Record<string, string> = {
  qa_head: "QA Head",
  regulatory_affairs: "Regulatory Affairs",
};

/** Render a role identifier (e.g. "qa_head") in human form
 *  (e.g. "QA Head"). Falls back to a snake_case→spaces replacement when
 *  the role isn't in the curated map. */
export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role.replace(/_/g, " ");
}

export interface DiscussionNode extends PrismaCAPAComment {
  children: DiscussionNode[];
}

/** Build a tree from a flat comment list. Soft-deleted rows stay in the
 *  tree so reply chains remain visible; the UI renders a "[deleted]"
 *  placeholder for body. Top-level: createdAt asc; replies within each
 *  parent: createdAt asc. */
export function buildCommentTree(rows: PrismaCAPAComment[]): DiscussionNode[] {
  const byId = new Map<string, DiscussionNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  const roots: DiscussionNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.id);
    if (!node) continue;
    if (r.parentId && byId.has(r.parentId)) {
      byId.get(r.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Server already returns createdAt asc; the tree-build preserves that
  // order at every level since we iterate the source array sequentially.
  return roots;
}

/** Two-letter avatar initials for a discussion-thread comment author.
 *  Returns "?" for an empty name, two chars from a single-name author,
 *  and first/last initials otherwise. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}
