"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--danger-bg)" }}>
        <AlertTriangle className="w-7 h-7" style={{ color: "var(--danger)" }} aria-hidden="true" />
      </div>
      <h2 className="text-[16px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Failed to load CAPA Tracker</h2>
      <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>{error.message}</p>
      <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer border-none" style={{ background: "var(--brand)", color: "#fff" }}>
        <RotateCcw className="w-4 h-4" aria-hidden="true" /> Try again
      </button>
    </div>
  );
}
