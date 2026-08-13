import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sparkles, AlertTriangle, TrendingUp, CheckCircle2, XCircle, UploadCloud, FileText, X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AIBadge, AIButton } from "@/components/ai";
import { Modal } from "@/components/ui/Modal";
import { AiBackendError } from "@/lib/aiBackend";
import { friendlyAiError } from "@/lib/friendlyError";

const aiCapaSchema = z.object({
  // No customer_id field. The tenant is taken from the caller's session by the
  // BFF and validated against the signed token upstream — a browser-supplied
  // tenant id is exactly what tenant isolation must not depend on.
  problem_statement: z.string().min(10, "Add a problem statement (at least 10 characters)"),
  source: z.string().min(1, "Source is required"),
  area_affected: z.string().min(1, "Area affected is required"),
  equipment_product: z.string().min(1, "Equipment / product is required"),
  initial_severity: z.enum(["Low", "Medium", "High", "Critical"]),
});
export type AICapaForm = z.infer<typeof aiCapaSchema>;

/** One of the caller's OWN closed CAPAs the analyser matched against.
 *  `capa_id` is a real Prisma reference the user can open — the backend drops
 *  any reference that was not in the history it was given, so this can never be
 *  a CAPA that does not exist. */
export interface SimilarCAPA {
  capa_id: string;
  similarity_score: number;
  description: string;
  was_effective: boolean;
}

export interface AICapaResponse {
  is_recurring: boolean;
  similar_capas: SimilarCAPA[];
  recurrence_alert?: string | null;
  pattern_detected?: string | null;
  ai_recommendation: string;
  risk_score: number;
  /** How many of the tenant's closed CAPAs were actually compared. */
  analyzed_history_count: number;
  /** Set when recurrence could NOT be assessed — no comparable history, or the
   *  analyser was unavailable. The panel renders this instead of a verdict; it
   *  must never be shown as "no recurrence found". */
  note?: string | null;
  source: "backend" | "fallback";
}

interface AIGenerateCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccepted?: (response: AICapaResponse, form: AICapaForm) => void;
}

/* REMOVED — the client-side AI token cache (`glimmora-ai-token` in
 * sessionStorage) and the Redux token read that fed it.
 *
 * This modal used to juggle two copies of the AI service's bearer token: one on
 * the Redux user record, one in sessionStorage, with a 401 handler that cleared
 * both and told the user to sign out and back in. All of that existed because
 * the browser was the credential holder. It no longer is — /api/ai-proxy mints
 * the token per request from the caller's session — so there is nothing to
 * cache, refresh, or invalidate here.
 */

export function AIGenerateCAPAModal({
  isOpen,
  onClose,
  onAccepted,
}: AIGenerateCAPAModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AICapaForm>({
    resolver: zodResolver(aiCapaSchema),
    defaultValues: {
      problem_statement: "",
      source: "",
      area_affected: "",
      equipment_product: "",
      initial_severity: "High",
    },
  });

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<AICapaResponse | null>(null);
  const [lastForm, setLastForm] = useState<AICapaForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      reset({
        problem_statement: "",
        source: "",
        area_affected: "",
        equipment_product: "",
        initial_severity: "High",
      });
      setFile(null);
      setResult(null);
      setLastForm(null);
      setError(null);
    }
  }, [isOpen, reset]);

  async function onSubmit(data: AICapaForm) {
    setError(null);
    setResult(null);
    try {
      // Analysis only. This creates NOTHING — the CAPA is created afterwards
      // by the normal createCAPA server action when the user accepts. The
      // route reads this tenant's real closed CAPAs and sends them as the
      // comparison set; the AI service has no CAPA table of its own any more.
      // An attached document is forwarded as multipart so its text is
      // extracted SERVER-SIDE by the same helper Document Review uses. The
      // browser never parses a PDF, and a scanned/unreadable file is reported
      // rather than silently ignored.
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append("problem_statement", data.problem_statement);
        fd.append("source", data.source);
        fd.append("area_affected", data.area_affected);
        fd.append("equipment_product", data.equipment_product);
        fd.append("initial_severity", data.initial_severity);
        fd.append("document", file);
        res = await fetch("/api/ai/capa-recurrence", {
          method: "POST",
          credentials: "same-origin",
          body: fd,
        });
      } else {
        res = await fetch("/api/ai/capa-recurrence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            problem_statement: data.problem_statement,
            source: data.source,
            area_affected: data.area_affected,
            equipment_product: data.equipment_product,
            initial_severity: data.initial_severity,
          }),
        });
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new AiBackendError(res.status, body?.detail ?? `Request failed (${res.status})`, body);
      }
      setResult((await res.json()) as AICapaResponse);
      setLastForm(data);
    } catch (err) {
      if (err instanceof AiBackendError && err.status === 401) {
        // The proxy rejected the app session (expired / signed out elsewhere).
        // There is no cached AI token to clear any more — signing in again is
        // the whole fix.
        setError("Your session has expired. Please sign in again.");
        return;
      }
      console.error("[capa] generate CAPA failed", err);
      setError(friendlyAiError(err, "Couldn't generate CAPA. Please try again."));
    }
  }

  function handleAccept() {
    if (result && lastForm) onAccepted?.(result, lastForm);
    onClose();
  }

  function handleClose() {
    onClose();
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title="AI-Generated CAPA">
      {!result && (
        <form
          onSubmit={handleSubmit(onSubmit)}
          aria-label="Generate AI CAPA"
          className="space-y-4"
        >
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Describe the issue. The AI will analyse historical CAPAs, detect
            recurrence patterns, and propose a recommendation.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="ai-severity"
                className="text-[11px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Initial severity <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                id="ai-severity"
                className="select text-[12px]"
                {...register("initial_severity")}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div className="col-span-2">
              <label
                htmlFor="ai-problem"
                className="text-[11px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Problem statement <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <textarea
                id="ai-problem"
                rows={3}
                className="input text-[12px] resize-none"
                placeholder="Describe what went wrong..."
                {...register("problem_statement")}
              />
              {errors.problem_statement && (
                <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
                  {errors.problem_statement.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="ai-source"
                className="text-[11px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Source <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="ai-source"
                type="text"
                className="input text-[12px]"
                placeholder="e.g. Deviation, Complaint, Audit"
                {...register("source")}
              />
              {errors.source && (
                <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
                  {errors.source.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="ai-area"
                className="text-[11px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Area affected <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="ai-area"
                type="text"
                className="input text-[12px]"
                placeholder="e.g. Manufacturing, QC Lab"
                {...register("area_affected")}
              />
              {errors.area_affected && (
                <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
                  {errors.area_affected.message}
                </p>
              )}
            </div>

            <div className="col-span-2">
              <label
                htmlFor="ai-equipment"
                className="text-[11px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Equipment / Product <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input
                id="ai-equipment"
                type="text"
                className="input text-[12px]"
                placeholder="e.g. Coater, Tablet Batch #..."
                {...register("equipment_product")}
              />
              {errors.equipment_product && (
                <p role="alert" className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
                  {errors.equipment_product.message}
                </p>
              )}
            </div>

            <div className="col-span-2">
              <label
                htmlFor="ai-doc"
                className="text-[11px] font-medium block mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Supporting document (optional)
              </label>
              {!file ? (
                <label
                  htmlFor="ai-doc"
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) setFile(dropped);
                  }}
                  className="flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-lg cursor-pointer text-center transition-colors"
                  style={{
                    border: `1.5px dashed ${dragOver ? "var(--brand)" : "var(--bg-border)"}`,
                    background: dragOver ? "var(--brand-muted)" : "var(--bg-elevated)",
                  }}
                >
                  <UploadCloud
                    className="w-6 h-6"
                    aria-hidden="true"
                    style={{ color: dragOver ? "var(--brand)" : "var(--text-muted)" }}
                  />
                  <div>
                    <p className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                      <span style={{ color: "var(--brand)" }}>Click to upload</span> or drag and drop
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      PDF, DOCX, images — up to ~10 MB
                    </p>
                  </div>
                  <input
                    id="ai-doc"
                    type="file"
                    className="sr-only"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              ) : (
                <div
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
                >
                  <FileText
                    className="w-4 h-4 shrink-0"
                    aria-hidden="true"
                    style={{ color: "var(--brand)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-[12px] font-medium truncate"
                      style={{ color: "var(--text-primary)" }}
                      title={file.name}
                    >
                      {file.name}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    aria-label="Remove file"
                    className="p-1 rounded transition-colors bg-transparent border-0 cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg px-3 py-2 text-[12px]"
              style={{
                background: "var(--danger-bg)",
                color: "var(--danger)",
                border: "1px solid var(--danger)",
              }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <AIButton type="submit" loading={isSubmitting} loadingLabel="Analyzing...">
              Generate CAPA
            </AIButton>
          </div>
        </form>
      )}

      {result && (
        <AIResultPanel
          result={result}
          onBack={() => setResult(null)}
          onSave={handleAccept}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
}

function AIResultPanel({
  result,
  onBack,
  onSave,
  onClose,
}: {
  result: AICapaResponse;
  onBack: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const riskPct = Math.round(result.risk_score * 100);
  const riskColor =
    result.risk_score >= 0.75
      ? "var(--danger)"
      : result.risk_score >= 0.4
        ? "var(--warning)"
        : "var(--success)";

  // Three distinct states, and the third is the one that used to be missing:
  // "we could not assess recurrence" is NOT "no recurrence found". When `note`
  // is set the panel says so plainly instead of showing a reassuring verdict.
  const unassessed = Boolean(result.note);
  const bannerBg = unassessed
    ? "var(--bg-elevated)"
    : result.is_recurring
      ? "var(--warning-bg)"
      : "var(--brand-muted)";
  const bannerFg = unassessed
    ? "var(--text-secondary)"
    : result.is_recurring
      ? "var(--warning)"
      : "var(--brand)";
  const bannerBorder = unassessed
    ? "var(--bg-border)"
    : result.is_recurring
      ? "var(--warning)"
      : "var(--brand-border)";
  const headline = unassessed
    ? "Recurrence not assessed"
    : result.is_recurring
      ? "Recurring issue — this resembles previously closed CAPAs"
      : "No recurrence detected against your closed CAPAs";

  return (
    <div className="space-y-4" aria-live="polite">
      <div
        className="rounded-lg px-3 py-2.5 flex items-start gap-2 text-[12px]"
        style={{ background: bannerBg, color: bannerFg, border: `1px solid ${bannerBorder}` }}
      >
        {unassessed ? (
          <HelpCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        ) : result.is_recurring ? (
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        ) : (
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-semibold">{headline}</p>
          <p className="text-[11px] mt-0.5 opacity-80">
            {result.note
              ? result.note
              : `Compared against ${result.analyzed_history_count} closed CAPA${
                  result.analyzed_history_count === 1 ? "" : "s"
                } in your organisation.`}
          </p>
        </div>
      </div>
      <AIBadge source={result.source} />

      <div
        className="rounded-lg p-3"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className="text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
            title="Computed from the number of matching closed CAPAs, whether any earlier fix was ineffective, and the reported severity. Not a model-generated number."
          >
            Recurrence risk (computed)
          </span>
          <span className="text-[13px] font-bold" style={{ color: riskColor }}>
            {riskPct}%
          </span>
        </div>
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: 6, background: "var(--bg-border)" }}
        >
          <div
            style={{
              width: `${riskPct}%`,
              background: riskColor,
              height: "100%",
              transition: "width .3s",
            }}
          />
        </div>
      </div>

      {result.pattern_detected && (
        <Section icon={<TrendingUp className="w-3.5 h-3.5" />} label="Pattern detected">
          {result.pattern_detected}
        </Section>
      )}
      {result.recurrence_alert && (
        <Section icon={<AlertTriangle className="w-3.5 h-3.5" />} label="Recurrence alert">
          {result.recurrence_alert}
        </Section>
      )}
      {result.ai_recommendation && (
        <Section icon={<Sparkles className="w-3.5 h-3.5" />} label="AI recommendation">
          {result.ai_recommendation}
        </Section>
      )}

      {result.similar_capas?.length > 0 && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-wider mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Similar past CAPAs from your organisation
          </p>
          <p className="text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
            Every reference below is one of your own closed CAPAs — open it to
            review what was done last time.
          </p>
          <ul className="space-y-2" role="list">
            {result.similar_capas.map((s) => (
              <li
                key={s.capa_id}
                className="rounded-lg p-3 text-[12px]"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                    {s.capa_id}
                  </span>
                  <span className="flex items-center gap-3 text-[11px]">
                    <span style={{ color: "var(--text-secondary)" }}>
                      {Math.round(s.similarity_score * 100)}% match
                    </span>
                    {s.was_effective ? (
                      <span className="inline-flex items-center gap-1" style={{ color: "var(--success)" }}>
                        <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> effective
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1" style={{ color: "var(--danger)" }}>
                        <XCircle className="w-3 h-3" aria-hidden="true" /> not verified effective
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1" style={{ color: "var(--text-secondary)" }}>{s.description}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="ghost" type="button" onClick={onBack}>
          New analysis
        </Button>
        <div className="flex gap-2">
          {/* Discard — nothing was created, so there is nothing to clean up.
              This analysis is stateless; the CAPA only exists once the user
              creates it below. */}
          <Button variant="secondary" type="button" onClick={onClose}>
            Discard
          </Button>
          {/* Create the CAPA through the normal createCAPA server action —
              same authorization, reference allocation and audit trail as one
              typed by hand. The analysis above is advisory context. */}
          <Button variant="primary" type="button" icon={CheckCircle2} onClick={onSave}>
            Create CAPA
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 inline-flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        <span aria-hidden="true">{icon}</span> {label}
      </p>
      <p className="text-[12px]" style={{ color: "var(--text-primary)" }}>
        {children}
      </p>
    </div>
  );
}
