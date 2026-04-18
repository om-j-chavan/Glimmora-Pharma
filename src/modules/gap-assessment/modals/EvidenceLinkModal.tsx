import { useState, useEffect } from "react";
import { Paperclip } from "lucide-react";
import clsx from "clsx";
import type { Finding } from "@/store/findings.slice";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

interface EvidenceLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (findingId: string, evidenceLink: string) => void;
  findingId: string;
  currentLink: string;
  finding: Finding | undefined;}

export function EvidenceLinkModal({ isOpen, onClose, onSave, findingId, currentLink, finding }: EvidenceLinkModalProps) {
  const [evidenceInput, setEvidenceInput] = useState(currentLink);

  useEffect(() => {
    setEvidenceInput(currentLink);
  }, [currentLink, findingId]);

  function handleClose() {
    onClose();
    setEvidenceInput("");
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title={currentLink ? "Update evidence document" : "Link evidence document"}>
      <div className={clsx("rounded-lg p-3 mb-4 border", "bg-(--bg-surface) border-(--bg-border)")}>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Linking evidence for</p>
        <p className="font-mono text-[12px] font-semibold text-[#0ea5e9] mt-0.5">{findingId}</p>
        {finding && <p className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{finding.requirement}</p>}
      </div>
      <label htmlFor="evidence-input" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Document reference or link <span className="text-(--danger)">*</span></label>
      <input id="evidence-input" type="text" className="input text-[12px]" value={evidenceInput} onChange={(e) => setEvidenceInput(e.target.value)} placeholder="e.g. SOP-QC-042-v3 or https://docs.company.com/..." aria-required="true" aria-describedby="evidence-hint" />
      <p id="evidence-hint" className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Enter a document ID, filename, or URL.</p>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="ghost" type="button" onClick={handleClose}>Cancel</Button>
        <Button variant="primary" icon={Paperclip} disabled={!evidenceInput.trim()} onClick={() => {
          onSave(findingId, evidenceInput.trim());
          handleClose();
        }}>{currentLink ? "Update evidence" : "Link evidence"}</Button>
      </div>
    </Modal>
  );
}
