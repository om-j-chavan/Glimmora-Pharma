import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Sparkles, AlertTriangle, TrendingUp, CheckCircle2, XCircle, UploadCloud, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { updateTenantUser } from "@/store/auth.slice";

const aiCapaSchema = z.object({
  customer_id: z.string().min(1, "Customer ID is required"),
  problem_statement: z.string().min(3, "Problem statement is required"),
  source: z.string().min(1, "Source is required"),
  area_affected: z.string().min(1, "Area affected is required"),
  equipment_product: z.string().min(1, "Equipment / product is required"),
  initial_severity: z.enum(["Low", "Medium", "High", "Critical"]),
});
export type AICapaForm = z.infer<typeof aiCapaSchema>;

export interface SimilarCAPA {
  capa_id: string;
  similarity_score: number;
  description: string;
  was_effective: boolean;
}

export interface AICapaResponse {
  capa_id: string;
  customer_id: string;
  status: string;
  created_at: string;
  is_recurring: boolean;
  similar_capas: SimilarCAPA[];
  recurrence_alert?: string;
  pattern_detected?: string;
  ai_recommendation?: string;
  risk_score: number;
  message: string;
}

interface AIGenerateCAPAModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCustomerId?: string;
  onAccepted?: (response: AICapaResponse, form: AICapaForm) => void;
}

const API_BASE =
  process.env.NEXT_PUBLIC_AI_API_URL ??
  "https://pharma-glimmora-ai-backend.onrender.com";

const TOKEN_KEY = "glimmora-ai-token";

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(t: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function AIGenerateCAPAModal({
  isOpen,
  onClose,
  defaultCustomerId,
  onAccepted,
}: AIGenerateCAPAModalProps) {
  const dispatch = useAppDispatch();
  // Pull the AI backend access token straight off the logged-in user's
  // tenant-user record (set by the login flow). Avoids prompting for
  // a second username/password — re-login refreshes the token.
  const { authUserId, tenantId, storedAiToken } = useAppSelector((s) => {
    const u = s.auth.user;
    if (!u) return { authUserId: null, tenantId: null, storedAiToken: null };
    const tenant = s.auth.tenants.find((t) => t.id === u.tenantId);
    const tu = tenant?.config?.users?.find((x) => x.id === u.id);
    return {
      authUserId: u.id,
      tenantId: u.tenantId,
      storedAiToken: tu?.aiAccessToken ?? null,
    };
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AICapaForm>({
    resolver: zodResolver(aiCapaSchema),
    defaultValues: {
      customer_id: defaultCustomerId ?? "",
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
        customer_id: defaultCustomerId ?? "",
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
  }, [isOpen, defaultCustomerId, reset]);

  async function callCreate(data: AICapaForm, token: string) {
    const fd = new FormData();
    fd.append("customer_id", data.customer_id);
    fd.append("problem_statement", data.problem_statement);
    fd.append("source", data.source);
    fd.append("area_affected", data.area_affected);
    fd.append("equipment_product", data.equipment_product);
    fd.append("initial_severity", data.initial_severity);
    if (file) fd.append("document", file);
    return fetch(`${API_BASE}/api/v1/capa/create`, {
      method: "POST",
      headers: { auth: token },
      body: fd,
    });
  }

  async function onSubmit(data: AICapaForm) {
    setError(null);
    setResult(null);
    // Prefer the token attached to the logged-in user record (refreshed on
    // every login). Fall back to a session-scoped token from the legacy
    // login prompt if it's set. If neither exists, surface a clear error
    // and ask the user to log out and log back in — that path automatically
    // calls /api/v1/auth/login and stores the token.
    const token = storedAiToken ?? getStoredToken();
    if (!token) {
      setError("AI backend session is missing. Please sign out and sign in again to refresh your access token.");
      return;
    }
    try {
      const res = await callCreate(data, token);
      if (res.status === 401) {
        // Token expired/invalid — clear from both stores and tell the user
        // to re-login (which refreshes via /api/v1/auth/login).
        setStoredToken(null);
        if (authUserId && tenantId) {
          dispatch(updateTenantUser({ tenantId, userId: authUserId, patch: { aiAccessToken: undefined } }));
        }
        setError("AI backend rejected the cached token (401). Please sign out and sign in again to refresh it.");
        return;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Request failed (${res.status})`);
      }
      const json = (await res.json()) as AICapaResponse;
      setResult(json);
      setLastForm(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate CAPA");
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

          {/* customer_id is auto-populated from the logged-in user's tenant
              (the customer admin's aiUserId). Kept as a hidden field so it
              still flows through react-hook-form into the request payload. */}
          <input type="hidden" {...register("customer_id")} />

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
            <Button
              variant="primary"
              type="submit"
              icon={Sparkles}
              loading={isSubmitting}
            >
              {isSubmitting ? "Analyzing..." : "Generate CAPA"}
            </Button>
          </div>
        </form>
      )}

      {result && <AIResultPanel result={result} onBack={() => setResult(null)} onAccept={handleAccept} />}
    </Modal>
  );
}

function AIResultPanel({
  result,
  onBack,
  onAccept,
}: {
  result: AICapaResponse;
  onBack: () => void;
  onAccept: () => void;
}) {
  const riskPct = Math.round(result.risk_score * 100);
  const riskColor =
    result.risk_score >= 0.75
      ? "var(--danger)"
      : result.risk_score >= 0.4
        ? "var(--warning)"
        : "var(--success)";

  return (
    <div className="space-y-4" aria-live="polite">
      <div
        className="rounded-lg px-3 py-2.5 flex items-start gap-2 text-[12px]"
        style={{
          background: result.is_recurring ? "var(--warning-bg)" : "var(--brand-muted)",
          color: result.is_recurring ? "var(--warning)" : "var(--brand)",
          border: `1px solid ${result.is_recurring ? "var(--warning)" : "var(--brand-border)"}`,
        }}
      >
        {result.is_recurring ? (
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        ) : (
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-semibold">{result.message}</p>
          <p className="text-[11px] mt-0.5 opacity-80">
            {result.capa_id} · {result.status} · created {new Date(result.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      <div
        className="rounded-lg p-3"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
            AI risk score
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
            Similar past CAPAs
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
                        <XCircle className="w-3 h-3" aria-hidden="true" /> ineffective
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
        <Button variant="primary" type="button" icon={CheckCircle2} onClick={onAccept}>
          Accept &amp; close
        </Button>
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
