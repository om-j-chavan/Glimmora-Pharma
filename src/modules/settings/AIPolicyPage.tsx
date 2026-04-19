import { useNavigate } from "react-router";
import { ArrowLeft, ShieldCheck, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import clsx from "clsx";
import { useAppSelector } from "@/hooks/useAppSelector";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared";
import dayjs from "@/lib/dayjs";

const ASSISTED = [
  "Draft suggestions for FDA 483 responses",
  "Risk scoring and pattern detection",
  "RCA weakness identification",
  "Document drafting assistance",
  "Deviation clustering and trending",
  "Supplier risk scoring",
  "Regulatory guidance monitoring",
  "Configuration drift detection",
];

const RESTRICTED = [
  "Sign, close, or approve CAPAs",
  "Submit FDA 483 responses to regulators",
  "Approve IQ/OQ/PQ validation stages",
  "Release or approve batches",
  "Make audit trail entries on behalf of humans",
  "Override role-based permissions",
  "Access other customer data",
  "Make final compliance decisions",
];

const REGULATORY = [
  "21 CFR Part 11 — Electronic Records",
  "EU GMP Annex 11 — Computerised Systems",
  "GAMP 5 2nd Edition — AI/ML Guidance",
  "ICH Q10 — Quality Management System",
  "FDA Guidance on AI/ML in Drug Manufacturing",
];

export function AIPolicyPage() {
  const navigate = useNavigate();
  const isDark = useAppSelector((s) => s.theme.mode) === "dark";

  return (
    <main id="main-content" aria-label="AI usage policy" className="w-full space-y-6 max-w-4xl">
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate("/settings")}>Settings</Button>
      <PageHeader title="AI Usage Policy" subtitle={`Glimmora Platform \u00b7 ${dayjs().format("MMMM YYYY")}`} />

      {/* Philosophy */}
      <div className={clsx("rounded-xl p-5 border", isDark ? "bg-[rgba(99,102,241,0.06)] border-[rgba(99,102,241,0.2)]" : "bg-[#eef2ff] border-[#c7d2fe]")}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#6366f1] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-[14px] font-bold text-[#6366f1] mb-2">Philosophy</p>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              <strong>AI-enabled, not autonomous.</strong> Human-in-the-loop for all compliance-critical decisions. AI assists by surfacing insights, drafting content, and detecting patterns — but every final decision rests with a qualified human.
            </p>
          </div>
        </div>
      </div>

      {/* What AI can do */}
      <div className="card">
        <div className="card-header"><div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#10b981]" aria-hidden="true" /><span className="card-title">What AI can do (Assisted mode)</span></div></div>
        <div className="card-body">
          <ul className="list-none p-0 m-0 space-y-1.5">{ASSISTED.map((t) => (
            <li key={t} className="flex items-start gap-2 text-[12px]"><span className="text-[#10b981] shrink-0">✅</span><span style={{ color: "var(--text-secondary)" }}>{t}</span></li>
          ))}</ul>
          <p className="text-[11px] italic mt-3" style={{ color: "var(--text-muted)" }}>All suggestions displayed with confidence score and require explicit user acceptance.</p>
        </div>
      </div>

      {/* What AI cannot do */}
      <div className="card">
        <div className="card-header"><div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-[#ef4444]" aria-hidden="true" /><span className="card-title">What AI cannot do (Hardcoded restrictions)</span></div></div>
        <div className="card-body">
          <ul className="list-none p-0 m-0 space-y-1.5">{RESTRICTED.map((t) => (
            <li key={t} className="flex items-start gap-2 text-[12px]"><span className="text-[#ef4444] shrink-0">❌</span><span style={{ color: "var(--text-secondary)" }}>{t}</span></li>
          ))}</ul>
          <p className="text-[11px] font-semibold mt-3" style={{ color: "#ef4444" }}>These restrictions cannot be changed by any user or admin.</p>
        </div>
      </div>

      {/* How suggestions work */}
      <div className="card">
        <div className="card-header"><div className="flex items-center gap-2"><Info className="w-4 h-4 text-[#0ea5e9]" aria-hidden="true" /><span className="card-title">How AI suggestions work</span></div></div>
        <div className="card-body space-y-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          <p><strong>Confidence scoring:</strong> Every AI suggestion includes a confidence percentage. 90-100% = High (strong), 70-89% = Medium (review carefully), 50-69% = Low (use with caution), &lt;50% = Very Low (not recommended).</p>
          <p><strong>Review flow:</strong> User sees suggestion → reviews content → clicks [Use this] to accept or [Dismiss] to reject → decision logged in audit trail.</p>
          <p><strong>Audit trail:</strong> Every AI suggestion shown, accepted, or dismissed is recorded with the user who made the decision, timestamp, and context.</p>
        </div>
      </div>

      {/* Regulatory alignment */}
      <div className="card">
        <div className="card-header"><div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#6366f1]" aria-hidden="true" /><span className="card-title">Regulatory alignment</span></div></div>
        <div className="card-body">
          <p className="text-[12px] mb-3" style={{ color: "var(--text-secondary)" }}>This AI usage policy is designed to comply with:</p>
          <ul className="list-none p-0 m-0 space-y-1.5">{REGULATORY.map((r) => (
            <li key={r} className="flex items-start gap-2 text-[12px]"><ShieldCheck className="w-3.5 h-3.5 text-[#6366f1] shrink-0 mt-0.5" aria-hidden="true" /><span style={{ color: "var(--text-secondary)" }}>{r}</span></li>
          ))}</ul>
        </div>
      </div>

      {/* Disclaimer */}
      <div className={clsx("rounded-lg p-4 text-center text-[11px]", isDark ? "bg-[#071526] border border-[#1e3a5a]" : "bg-[#f8fafc] border border-[#e2e8f0]")} style={{ color: "var(--text-muted)" }}>
        This document is available for download and presentation to regulatory inspectors as part of the computerised system validation documentation package.
      </div>
    </main>
  );
}
