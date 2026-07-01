"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { type StatusDef } from "@/constants/statusTaxonomy";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

export interface StatusGuideProps {
  module: string;
  statuses: Record<string, StatusDef>;
}

export function StatusGuide({ module, statuses }: StatusGuideProps) {
  const [open, setOpen] = useState(false);

  // De-duplicate (backward-compat keys share labels)
  const seen = new Set<string>();
  const unique = Object.values(statuses).filter((s) => {
    if (seen.has(s.label)) return false;
    seen.add(s.label);
    return true;
  });

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        icon={HelpCircle}
        onClick={() => setOpen(true)}
        className="!h-auto !gap-1 !p-0 text-[11px] font-medium"
        style={{ color: "var(--text-muted)" }}
        aria-label="Open status guide"
      >
        Status guide
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Status Guide \u2014 ${module}`}>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {unique.map((s) => (
            <div key={s.value} className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ background: s.color }} />
              <div>
                <p className="text-[12px] font-semibold" style={{ color: s.color }}>{s.label}</p>
                <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>{s.description}</p>
                {s.nextActions.length > 0 && (
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Next: {s.nextActions.join(" \u00b7 ")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}