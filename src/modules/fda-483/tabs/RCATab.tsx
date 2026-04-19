import { useNavigate } from "react-router";
import clsx from "clsx";
import { GitBranch, Plus, Save } from "lucide-react";
import type {
  FDA483Event,
  Observation,
} from "@/store/fda483.slice";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";

export interface RCATabProps {
  liveEvent: FDA483Event | null;
  selectedObs: Observation | null;
  selectedObsId: string;  role: string;
  whyAnswers: string[];
  fishboneAnswers: Record<string, string>;
  fishboneRoot: string;
  freeformRCA: string;
  onGoToEvents: () => void;
  onGoToObservations: () => void;
  onSelectedObsIdChange: (v: string) => void;
  onWhyAnswersChange: (v: string[]) => void;
  onFishboneAnswersChange: (v: Record<string, string>) => void;
  onFishboneRootChange: (v: string) => void;
  onFreeformRCAChange: (v: string) => void;
  onSelectRCAMethod: (method: "5 Why" | "Fishbone" | "Fault Tree" | "Barrier Analysis") => void;
  onSave5Why: () => void;
  onSaveFishbone: () => void;
  onSaveFreeform: () => void;
  onRaiseCAPA: () => void;
}

export function RCATab({
  liveEvent,
  selectedObs,
  selectedObsId,
  role,
  whyAnswers,
  fishboneAnswers,
  fishboneRoot,
  freeformRCA,
  onGoToEvents,
  onGoToObservations,
  onSelectedObsIdChange,
  onWhyAnswersChange,
  onFishboneAnswersChange,
  onFishboneRootChange,
  onFreeformRCAChange,
  onSelectRCAMethod,
  onSave5Why,
  onSaveFishbone,
  onSaveFreeform,
  onRaiseCAPA,
}: RCATabProps) {
  const navigate = useNavigate();

  if (!liveEvent) {
    return (
      <div className="card p-8 text-center">
        <GitBranch
          className="w-10 h-10 mx-auto mb-2"
          style={{ color: "#334155" }}
          aria-hidden="true"
        />
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Select an event from the Events tab
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={onGoToEvents}
        >
          Go to Events
        </Button>
      </div>
    );
  }

  if (liveEvent.observations.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p
          className="text-[12px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Add observations first to start RCA analysis.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={onGoToObservations}
        >
          Go to Observations
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Observation selector */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label
          className="text-[12px] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Select observation:
        </label>
        <Dropdown
          value={selectedObsId}
          onChange={onSelectedObsIdChange}
          placeholder="Choose observation..."
          width="w-72"
          options={liveEvent.observations.map((o) => ({
            value: o.id,
            label: `#${o.number} \u2014 ${o.text.slice(0, 45)}${o.text.length > 45 ? "..." : ""}`,
          }))}
        />
      </div>

      {selectedObs && (
        <>
          {/* Method card */}
          <div className="card mb-4">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <GitBranch
                  className="w-4 h-4 text-[#6366f1]"
                  aria-hidden="true"
                />
                <span className="card-title">
                  RCA &mdash; Observation #{selectedObs.number}
                </span>
              </div>
              {selectedObs.rcaMethod && (
                <Badge variant="purple">{selectedObs.rcaMethod}</Badge>
              )}
            </div>
            <div className="card-body">
              <div className="flex gap-2 flex-wrap">
                {(
                  [
                    "5 Why",
                    "Fishbone",
                    "Fault Tree",
                    "Barrier Analysis",
                  ] as const
                ).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={selectedObs.rcaMethod === m}
                    onClick={() => onSelectRCAMethod(m)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all",
                      selectedObs.rcaMethod === m
                        ? "bg-[#6366f1] text-white border-[#6366f1]"
                        : "bg-transparent border-(--bg-border) text-(--text-secondary) hover:border-[#6366f1]",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 5 Why */}
          {selectedObs.rcaMethod === "5 Why" && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">5 Why Analysis</span>
              </div>
              <div className="card-body space-y-3">
                <div
                  className={clsx(
                    "p-3 rounded-lg",
                    "bg-(--bg-surface) border border-(--bg-border)",
                  )}
                >
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Problem statement
                  </p>
                  <p
                    className="text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {selectedObs.text}
                  </p>
                </div>
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex-shrink-0 mt-2 flex items-center justify-center text-[10px] font-bold bg-(--info-bg) text-[#6366f1]">
                      {n}
                    </div>
                    <div className="flex-1">
                      <label
                        className="text-[11px] mb-1 block"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Why {n}?
                      </label>
                      <input
                        type="text"
                        className="input w-full text-[12px]"
                        value={whyAnswers[n - 1]}
                        onChange={(e) => {
                          const u = [...whyAnswers];
                          u[n - 1] = e.target.value;
                          onWhyAnswersChange(u);
                        }}
                        placeholder={
                          n === 1
                            ? "Why did this happen?"
                            : `Deeper cause of Why ${n - 1}`
                        }
                      />
                    </div>
                  </div>
                ))}
                <div
                  className={clsx(
                    "mt-2 p-3 rounded-lg border",
                    "bg-(--info-bg) border-(--info)",
                  )}
                >
                  <p className="text-[11px] font-semibold text-[#6366f1] mb-1">
                    Root cause (Why 5)
                  </p>
                  <p
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {whyAnswers[4] ||
                      "Complete all 5 Whys to identify root cause"}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Save}
                  disabled={!whyAnswers[0]}
                  onClick={onSave5Why}
                >
                  Save RCA
                </Button>
              </div>
            </div>
          )}

          {/* Fishbone */}
          {selectedObs.rcaMethod === "Fishbone" && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">
                  Fishbone (Ishikawa) Analysis
                </span>
              </div>
              <div className="card-body space-y-3">
                <div
                  className={clsx(
                    "p-3 rounded-lg",
                    "bg-(--bg-surface) border border-(--bg-border)",
                  )}
                >
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Problem statement
                  </p>
                  <p
                    className="text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {selectedObs.text}
                  </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                  {[
                    "People",
                    "Process",
                    "Equipment",
                    "Materials",
                    "Environment",
                    "Management",
                  ].map((cat) => (
                    <div key={cat}>
                      <label
                        className="text-[11px] font-semibold mb-1 block"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {cat}
                      </label>
                      <input
                        type="text"
                        className="input w-full text-[12px]"
                        value={fishboneAnswers[cat] ?? ""}
                        onChange={(e) =>
                          onFishboneAnswersChange({
                            ...fishboneAnswers,
                            [cat]: e.target.value,
                          })
                        }
                        placeholder={`Contributing factors from ${cat.toLowerCase()}...`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <label
                    className="text-[11px] font-semibold mb-1 block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Root cause summary
                  </label>
                  <textarea
                    rows={3}
                    className="input resize-none w-full text-[12px]"
                    value={fishboneRoot}
                    onChange={(e) => onFishboneRootChange(e.target.value)}
                    placeholder="Summarize the primary root cause identified..."
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Save}
                  disabled={!fishboneRoot.trim()}
                  onClick={onSaveFishbone}
                >
                  Save RCA
                </Button>
              </div>
            </div>
          )}

          {/* Fault Tree / Barrier Analysis */}
          {(selectedObs.rcaMethod === "Fault Tree" ||
            selectedObs.rcaMethod === "Barrier Analysis") && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">
                  {selectedObs.rcaMethod} Analysis
                </span>
              </div>
              <div className="card-body space-y-3">
                <div
                  className={clsx(
                    "p-3 rounded-lg",
                    "bg-(--bg-surface) border border-(--bg-border)",
                  )}
                >
                  <p
                    className="text-[11px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Problem statement
                  </p>
                  <p
                    className="text-[13px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {selectedObs.text}
                  </p>
                </div>
                <textarea
                  rows={8}
                  className="input resize-none w-full text-[12px]"
                  value={freeformRCA}
                  onChange={(e) => onFreeformRCAChange(e.target.value)}
                  placeholder={`Document your ${selectedObs.rcaMethod?.toLowerCase()} analysis here...`}
                />
                <Button
                  variant="primary"
                  size="sm"
                  icon={Save}
                  disabled={!freeformRCA.trim()}
                  onClick={onSaveFreeform}
                >
                  Save RCA
                </Button>
              </div>
            </div>
          )}

          {/* Raise CAPA */}
          {selectedObs.capaId ? (
            <div className="flex items-center gap-2 mt-4">
              <span
                className="text-[12px]"
                style={{ color: "var(--text-muted)" }}
              >
                CAPA linked:
              </span>
              <button
                onClick={() =>
                  navigate("/capa", {
                    state: { openCapaId: selectedObs.capaId },
                  })
                }
                className="font-mono text-[12px] text-[#0ea5e9] hover:underline border-none bg-transparent cursor-pointer"
              >
                {selectedObs.capaId}
              </button>
            </div>
          ) : (
            role !== "viewer" && (
              <Button
                variant="secondary"
                icon={Plus}
                fullWidth
                className="mt-4"
                onClick={onRaiseCAPA}
              >
                Raise CAPA for this observation
              </Button>
            )
          )}
        </>
      )}
    </>
  );
}
