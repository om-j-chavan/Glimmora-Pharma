"use client";

import { useState } from "react";
import { Paperclip, Save } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { getSeverityVariant } from "@/lib/badgeVariants";
import { EVIDENCE_CATEGORIES, EVIDENCE_CATEGORY_LABEL } from "@/lib/queries/evidence";
import { uploadFindingEvidence, saveFindingWorkNotes } from "@/actions/findings";
import { GroupedTaskDocs } from "./DeviationTaskPanel";
import type { WorklistFinding } from "@/lib/queries/worklist";

/**
 * Gap Step 3 — the assignee's work surface for a gap finding: upload categorized
 * evidence documents + record completion notes. Mirrors DeviationTaskPanel (docs
 * grouped by the 7 GxP categories + a notes field). The submit → QA review →
 * rework loop + the conversation thread are a later step.
 */
export function FindingWorkPanel({
  finding,
  onClose,
  onChanged,
}: {
  finding: WorklistFinding;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { org } = useTenantConfig();
  const [notes, setNotes] = useState(finding.completionNotes ?? "");
  const [uploadCategory, setUploadCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fmtDate = (iso: string | null) => (iso ? dayjs.utc(iso).tz(org.timezone).format(org.dateFormat) : "—");

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setErr(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadFindingEvidence(finding.id, fd, uploadCategory);
    setBusy(false);
    if (!res.success) { setErr(res.error || "Upload failed."); toast.error(res.error || "Upload failed."); return; }
    toast.success("Document uploaded."); onChanged();
  }

  async function saveNotes() {
    setSavingNotes(true); setErr(null);
    const res = await saveFindingWorkNotes(finding.id, { notes: notes.trim() });
    setSavingNotes(false);
    if (!res.success) { setErr(res.error || "Failed to save notes."); toast.error(res.error || "Failed to save notes."); return; }
    toast.success("Notes saved."); onChanged();
  }

  return (
    <Modal
      open
      onClose={busy || savingNotes ? () => undefined : onClose}
      title={`Finding · ${finding.reference ?? finding.id.slice(0, 8)}`}
    >
      <div className="space-y-3">
        {/* Context */}
        <div className="p-3 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{finding.requirement}</p>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <Badge variant={getSeverityVariant(finding.severity, "generic")}>{finding.severity}</Badge>
            <Badge variant={finding.status === "In Progress" ? "amber" : "blue"}>{finding.status}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-2 text-[11px]">
            <div><span style={{ color: "var(--text-muted)" }}>Framework</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{finding.framework ?? "—"}</span></div>
            <div><span style={{ color: "var(--text-muted)" }}>Area</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{finding.area}</span></div>
            <div><span style={{ color: "var(--text-muted)" }}>Target date</span><br /><span className="font-medium" style={{ color: "var(--text-primary)" }}>{fmtDate(finding.targetDate)}</span></div>
          </div>
        </div>

        {/* Evidence documents — grouped by GxP category */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Evidence documents</p>
          <GroupedTaskDocs docs={finding.docs} emptyText="No evidence uploaded yet — pick a category and upload below." />
          {/* Upload with category (mirrors the deviation task upload). */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <Dropdown
              placeholder="Select category…"
              value={uploadCategory}
              onChange={setUploadCategory}
              width="w-48"
              size="sm"
              options={EVIDENCE_CATEGORIES.map((c) => ({ value: c, label: EVIDENCE_CATEGORY_LABEL[c] }))}
            />
            <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer px-2.5 py-1.5 rounded-lg border" style={{ borderColor: "var(--bg-border)", color: "var(--text-secondary)", opacity: (busy || !uploadCategory) ? 0.6 : 1 }}>
              <Paperclip className="w-3.5 h-3.5" /> Upload file
              <input type="file" className="hidden" disabled={busy || !uploadCategory} onChange={onPickFile} />
            </label>
          </div>
          {!uploadCategory && <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Pick a category to enable upload.</p>}
        </div>

        {/* Work / completion notes */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Work notes</p>
          <textarea
            className="input text-[12px] w-full min-h-24"
            placeholder="Summarise the work done to close this gap…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
            disabled={savingNotes}
          />
          <div className="flex justify-end mt-1.5">
            <Button variant="secondary" size="sm" icon={Save} loading={savingNotes} disabled={savingNotes} onClick={() => void saveNotes()}>Save notes</Button>
          </div>
        </div>

        {err && <p role="alert" className="text-[11px]" style={{ color: "var(--danger)" }}>{err}</p>}
      </div>
    </Modal>
  );
}
