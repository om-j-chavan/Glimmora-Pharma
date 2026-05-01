"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import type { Playbook } from "@prisma/client";
import { createPlaybook, deletePlaybook } from "@/actions/inspections";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";

export interface PlaybooksPrismaTabProps {
  playbooks: Playbook[];
  isAdmin: boolean;
}

const PLAYBOOK_TYPES = [
  "Inspection Protocol",
  "Emergency Response",
  "Document Request",
  "Communication Guide",
  "Escalation Plan",
];

const PLAYBOOK_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "front-room", label: "Front Room" },
  { value: "back-room", label: "Back Room" },
  { value: "documentation", label: "Documentation" },
  { value: "emergency", label: "Emergency" },
];

const CATEGORY_VARIANT: Record<string, { bg: string; fg: string }> = {
  general: { bg: "var(--brand-muted)", fg: "var(--brand)" },
  "front-room": { bg: "var(--success-bg)", fg: "var(--success)" },
  "back-room": { bg: "var(--info-bg)", fg: "var(--info)" },
  documentation: { bg: "var(--warning-bg)", fg: "var(--warning)" },
  emergency: { bg: "var(--danger-bg)", fg: "var(--danger)" },
};

interface PlaybookForm {
  title: string;
  type: string;
  description: string;
  content: string;
  category: string;
}

const EMPTY_FORM: PlaybookForm = {
  title: "",
  type: "Inspection Protocol",
  description: "",
  content: "",
  category: "general",
};

export function PlaybooksPrismaTab({ playbooks, isAdmin }: PlaybooksPrismaTabProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<PlaybookForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate() {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    const result = await createPlaybook({
      title: form.title.trim(),
      type: form.type,
      description: form.description.trim() || undefined,
      content: form.content.trim(),
      category: form.category,
    });
    setSaving(false);
    if (!result.success) {
      console.error("[playbooks] createPlaybook failed:", result.error);
      return;
    }
    setAddOpen(false);
    setForm(EMPTY_FORM);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this playbook?")) return;
    setDeletingId(id);
    const result = await deletePlaybook(id);
    setDeletingId(null);
    if (!result.success) {
      console.error("[playbooks] deletePlaybook failed:", result.error);
      return;
    }
    if (expanded === id) setExpanded(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {playbooks.length} playbook{playbooks.length === 1 ? "" : "s"}
        </p>
        {isAdmin && (
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
            Add playbook
          </Button>
        )}
      </div>

      {playbooks.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl border border-dashed"
          style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}
        >
          <BookOpen className="w-9 h-9 mx-auto mb-2" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
            No playbooks yet
          </p>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Add inspection protocols and procedures for your team to reference.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {playbooks.map((pb) => {
            const variant = CATEGORY_VARIANT[pb.category] ?? CATEGORY_VARIANT.general;
            const isOpen = expanded === pb.id;
            return (
              <article
                key={pb.id}
                className="rounded-xl border overflow-hidden"
                style={{ borderColor: "var(--bg-border)" }}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : pb.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between p-4 cursor-pointer transition-colors text-left border-none"
                  style={{ background: isOpen ? "var(--bg-elevated)" : "var(--bg-surface)", color: "var(--text-primary)" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BookOpen className="w-4 h-4 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate">{pb.title}</p>
                      {pb.description && (
                        <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                          {pb.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className="text-[10px] px-2 py-1 rounded-full font-medium capitalize"
                      style={{ background: variant.bg, color: variant.fg }}
                    >
                      {pb.category.replace(/-/g, " ")}
                    </span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} aria-hidden="true" />
                    )}
                  </div>
                </button>

                {isOpen && (
                  <div
                    className="px-4 pb-4 border-t"
                    style={{ borderColor: "var(--bg-border)", background: "var(--bg-elevated)" }}
                  >
                    <pre
                      className="text-[12px] mt-3 whitespace-pre-wrap font-sans leading-relaxed"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {pb.content}
                    </pre>
                    <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)" }}>
                      {pb.type} · created by {pb.createdBy}
                    </p>
                    {isAdmin && (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          icon={Trash2}
                          loading={deletingId === pb.id}
                          onClick={() => handleDelete(pb.id)}
                        >
                          Delete playbook
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* ── Add playbook modal ── */}
      <Modal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setForm(EMPTY_FORM);
        }}
        title="Add playbook"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label htmlFor="pb-title" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Title *
            </label>
            <input
              id="pb-title"
              type="text"
              className="input w-full"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Front Room Protocol"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                Type
              </label>
              <Dropdown
                value={form.type}
                onChange={(v) => setForm((p) => ({ ...p, type: v }))}
                width="w-full"
                options={PLAYBOOK_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                Category
              </label>
              <Dropdown
                value={form.category}
                onChange={(v) => setForm((p) => ({ ...p, category: v }))}
                width="w-full"
                options={PLAYBOOK_CATEGORIES}
              />
            </div>
          </div>

          <div>
            <label htmlFor="pb-desc" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Description
            </label>
            <input
              id="pb-desc"
              type="text"
              className="input w-full"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Brief summary..."
            />
          </div>

          <div>
            <label htmlFor="pb-content" className="text-[11px] font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
              Content *
            </label>
            <textarea
              id="pb-content"
              rows={8}
              className="input w-full resize-none font-mono text-[12px]"
              value={form.content}
              onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
              placeholder={`Step 1: ...\nStep 2: ...\nStep 3: ...`}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: "var(--bg-border)" }}>
            <Button variant="secondary" onClick={() => { setAddOpen(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              loading={saving}
              disabled={!form.title.trim() || !form.content.trim() || saving}
              onClick={handleCreate}
            >
              Add playbook
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
