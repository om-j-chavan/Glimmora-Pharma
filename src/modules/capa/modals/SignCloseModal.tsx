import { useState } from "react";
import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import type { CAPA, CAPARisk, CAPAStatus } from "@/store/capa.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";

const RISK_VARIANT: Record<CAPARisk, "red" | "amber" | "gray"> = { Critical: "red", Major: "amber", Minor: "gray" };
const STATUS_VARIANT: Record<CAPAStatus, "blue" | "amber" | "purple" | "green"> = { Open: "blue", "In Progress": "amber", "Pending QA Review": "purple", Closed: "green" };

interface SignCloseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSign: (data: { meaning: string; password: string }) => void;
  capa: CAPA | null;
  isDark: boolean;
}

export function SignCloseModal({ isOpen, onClose, onSign, capa, isDark }: SignCloseModalProps) {
  const [signMeaning, setSignMeaning] = useState("");
  const [signPassword, setSignPassword] = useState("");
  const [effectivenessConfirmed, setEffectivenessConfirmed] = useState(false);

  if (!capa) return null;

  function handleSign() {
    onSign({ meaning: signMeaning, password: signPassword });
    setSignMeaning("");
    setSignPassword("");
    setEffectivenessConfirmed(false);
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Sign & Close CAPA">
      <div>
        <div id="sign-part11-notice" className="alert alert-info mb-4">This is a GxP electronic signature under 21 CFR Part 11. Your identity, the meaning of this signature, and a content hash will be recorded and cannot be altered.</div>
        <div className={clsx("rounded-lg p-3 mb-4 border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[#0ea5e9] font-semibold">{capa.id}</span>
            <Badge variant={RISK_VARIANT[capa.risk]}>{capa.risk}</Badge>
            <Badge variant={STATUS_VARIANT[capa.status]}>{capa.status}</Badge>
          </div>
          <p className="text-[12px] mt-1 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{capa.description}</p>
        </div>
        <div className="space-y-4">
          <div><p className="text-[11px] font-medium text-(--text-secondary) mb-1.5">Signature meaning <span className="text-(--danger)">*</span></p><Dropdown value={signMeaning} onChange={setSignMeaning} placeholder="Select meaning..." width="w-full" options={[{ value: "approve", label: "I approve the corrective actions as complete and effective" }, { value: "verify", label: "I verify the root cause analysis is adequate" }, { value: "confirm", label: "I confirm evidence is sufficient for closure" }]} /></div>
          <div><label htmlFor="sign-password" className="text-[11px] font-medium text-(--text-secondary) block mb-1.5">Confirm your password <span className="text-(--danger)">*</span></label><input id="sign-password" type="password" className="input text-[12px]" value={signPassword} onChange={(e) => setSignPassword(e.target.value)} placeholder="Re-enter your password" /><p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>Required for identity verification under 21 CFR Part 11</p></div>
          {capa.effectivenessCheck && (
            <div className={clsx("flex items-center justify-between p-3 rounded-lg border", isDark ? "bg-[#071526] border-[#1e3a5a]" : "bg-[#f8fafc] border-[#e2e8f0]")}>
              <Toggle id="eff-confirm" checked={effectivenessConfirmed} onChange={setEffectivenessConfirmed} label="Effectiveness check confirmed" description="90-day monitoring will be scheduled" />
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={ShieldCheck} disabled={!signMeaning || !signPassword || (capa.effectivenessCheck && !effectivenessConfirmed)} onClick={handleSign}>Sign &amp; Close CAPA</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
