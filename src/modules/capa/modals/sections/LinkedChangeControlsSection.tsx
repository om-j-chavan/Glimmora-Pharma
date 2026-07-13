"use client";

import { useEffect, useState } from "react";
import { Clock, GitMerge, Link2, Plus, X } from "lucide-react";
import type { CAPAChangeControlLink as PrismaCCLink } from "@prisma/client";
import { Badge } from "@/components/ui/Badge";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useRole } from "@/hooks/useRole";
import {
  loadCAPAChangeControlLinks,
  loadLinkableChangeControls,
  linkCAPAToChangeControl,
  unlinkCAPAFromChangeControl,
} from "@/actions/change-control";
import { loadCAPACCDeps } from "@/actions/capas";
import type { CCDependencyState } from "@/lib/cc-dependencies";
import type { CAPA } from "@/store/capa.slice";
import { CCDependencyBanner } from "../components/CCDependencyBanner";

/* ── Substage 4.8 — Linked Change Controls section ──
 *
 * Inline section on the CAPA detail Overview tab. Owns its own link
 * picker modal + unlink confirm modal so the CAPA detail shell stays
 * skinny. Loads `links` and `deps` in parallel — `deps` powers the
 * substage 6.4 banner; `links` powers the per-row display + unlink
 * buttons.
 */

type LinkedCCRow = PrismaCCLink & {
  changeControl: {
    id: string;
    reference: string | null;
    title: string;
    changeType: string;
    risk: string;
    status: string;
    deletedAt: Date | null;
  };
};

type LinkableCC = {
  id: string;
  reference: string | null;
  title: string;
  changeType: string;
  risk: string;
  status: string;
};

export function LinkedChangeControlsSection({ capa }: { capa: CAPA }) {
  const { role } = useRole();
  const isApproverRole =
    role === "qa_head" || role === "customer_admin" || role === "super_admin";
  const capaIsClosed = capa.status === "closed" || capa.status === "rejected";

  const [links, setLinks] = useState<LinkedCCRow[]>([]);
  const [deps, setDeps] = useState<CCDependencyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkable, setLinkable] = useState<LinkableCC[]>([]);
  const [linkableLoading, setLinkableLoading] = useState(false);
  const [linkSelectedId, setLinkSelectedId] = useState<string | null>(null);
  const [linkRationale, setLinkRationale] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [unlinkReason, setUnlinkReason] = useState("");
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  // Refresh both link list and CC dependency state in parallel. The deps
  // come from a purpose-built read action so the banner sees the same
  // CCDependencyState shape the server enforces in signAndCloseCAPA.
  const refresh = async () => {
    const [linksResult, depsResult] = await Promise.all([
      loadCAPAChangeControlLinks(capa.id),
      loadCAPACCDeps(capa.id),
    ]);
    if (linksResult.success) setLinks(linksResult.data as LinkedCCRow[]);
    if (depsResult.success) {
      setDeps(
        (depsResult.data as { capaRisk: string; deps: CCDependencyState })
          .deps,
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capa.id]);

  useEffect(() => {
    if (!pickerOpen) return;
    setLinkableLoading(true);
    void (async () => {
      const result = await loadLinkableChangeControls(capa.id);
      setLinkableLoading(false);
      if (result.success) setLinkable(result.data as LinkableCC[]);
    })();
  }, [pickerOpen, capa.id]);

  const handleLink = async () => {
    if (!linkSelectedId) return;
    setLinkBusy(true);
    setLinkError(null);
    const result = await linkCAPAToChangeControl({
      capaId: capa.id,
      changeControlId: linkSelectedId,
      initiatedFrom: "CAPA",
      ...(linkRationale.trim() ? { linkRationale: linkRationale.trim() } : {}),
    });
    setLinkBusy(false);
    if (!result.success) {
      setLinkError(result.error);
      return;
    }
    setPickerOpen(false);
    setLinkSelectedId(null);
    setLinkRationale("");
    await refresh();
  };

  const handleUnlinkConfirm = async () => {
    if (!unlinkingId) return;
    setUnlinkBusy(true);
    setUnlinkError(null);
    const result = await unlinkCAPAFromChangeControl(unlinkingId, {
      reason: unlinkReason.trim(),
    });
    setUnlinkBusy(false);
    if (!result.success) {
      setUnlinkError(result.error);
      return;
    }
    setUnlinkingId(null);
    setUnlinkReason("");
    await refresh();
  };

  // Substage 6.4 — pre-build a fast lookup of overdue CC ids so each row
  // can render an inline chip without a per-render search.
  const overdueIds = new Set((deps?.overdueCCs ?? []).map((c) => c.id));

  return (
    <section
      aria-labelledby="capa-linked-cc-heading"
      className="rounded-lg p-3"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
      }}
    >
      {/* Substage 6.4 — Linked-CC dependency banner. Renders only when
       *  there's something the operator needs to act on (incomplete /
       *  blocked / overdue). The variant is risk-proportionate: hard-gate
       *  for Critical/High, soft-gate for Medium/Low; a Rejected CC always
       *  produces the danger variant regardless of risk. */}
      {deps && !capaIsClosed && capa.status !== "rejected" && (
        <CCDependencyBanner capa={capa} deps={deps} />
      )}

      <div className="flex items-center justify-between mb-2">
        <h3
          id="capa-linked-cc-heading"
          className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          <GitMerge className="w-3.5 h-3.5" aria-hidden="true" />
          Linked change controls
          <span
            className="font-normal normal-case tracking-normal"
            style={{ color: "var(--text-muted)" }}
          >
            · {links.length}
          </span>
        </h3>
        {!capaIsClosed && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => {
              setPickerOpen(true);
              setLinkSelectedId(null);
              setLinkRationale("");
              setLinkError(null);
            }}
          >
            Link a change control
          </Button>
        )}
      </div>

      {loading ? (
        <p
          className="text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          Loading…
        </p>
      ) : links.length === 0 ? (
        <p
          className="text-[11px] italic"
          style={{ color: "var(--text-muted)" }}
        >
          No change controls linked yet.
        </p>
      ) : (
        <ul role="list" className="space-y-2">
          {links.map((link) => {
            const cc = link.changeControl;
            const ccDeleted = cc.deletedAt !== null;
            return (
              <li
                key={link.id}
                className="rounded-md p-2"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--bg-border)",
                  opacity: ccDeleted ? 0.6 : 1,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span
                        className="font-mono text-[12px] font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {cc.reference ?? cc.id.slice(0, 8)}
                      </span>
                      <Badge variant="gray">{cc.changeType}</Badge>
                      <Badge variant={getSeverityVariant(cc.risk, "generic")}>
                        {normalizeSeverityForDisplay(cc.risk, "generic") ?? cc.risk}
                      </Badge>
                      <Badge variant="gray">{cc.status}</Badge>
                      <Badge variant="blue">
                        Linked from {link.initiatedFrom === "CAPA" ? "CAPA" : "CC"}
                      </Badge>
                      {ccDeleted && <Badge variant="red">Deleted</Badge>}
                      {overdueIds.has(cc.id) && (
                        <Badge variant="amber">
                          <Clock
                            className="w-3 h-3 inline mr-0.5"
                            aria-hidden="true"
                          />
                          Overdue
                        </Badge>
                      )}
                    </div>
                    <p
                      className="text-[12px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {cc.title}
                    </p>
                    {link.linkRationale && (
                      <p
                        className="text-[11px] italic mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {link.linkRationale}
                      </p>
                    )}
                  </div>
                  {isApproverRole && !capaIsClosed && (
                    <button
                      type="button"
                      onClick={() => {
                        setUnlinkingId(link.id);
                        setUnlinkReason("");
                        setUnlinkError(null);
                      }}
                      aria-label="Unlink this change control"
                      className="text-[10px] underline border-none bg-transparent cursor-pointer px-1"
                      style={{ color: "var(--danger)" }}
                    >
                      Unlink
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Link picker modal */}
      {pickerOpen && (
        <Modal
          open
          onClose={linkBusy ? () => undefined : () => setPickerOpen(false)}
          title="Link a change control"
        >
          {linkableLoading ? (
            <p
              className="text-[12px] py-4 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              Loading change controls…
            </p>
          ) : linkable.length === 0 ? (
            <p
              className="text-[12px] py-4"
              style={{ color: "var(--text-muted)" }}
            >
              No linkable change controls available. Implemented / Closed /
              Rejected CCs and CCs already linked to this CAPA are excluded.
            </p>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto mb-3">
              {linkable.map((cc) => (
                <label
                  key={cc.id}
                  className="flex items-start gap-2 p-2 rounded-md cursor-pointer"
                  style={{
                    background:
                      linkSelectedId === cc.id
                        ? "var(--brand-muted)"
                        : "var(--bg-elevated)",
                    border:
                      linkSelectedId === cc.id
                        ? "1px solid var(--brand)"
                        : "1px solid var(--bg-border)",
                  }}
                >
                  <input
                    type="radio"
                    name="link-cc"
                    checked={linkSelectedId === cc.id}
                    onChange={() => setLinkSelectedId(cc.id)}
                    disabled={linkBusy}
                    aria-label={`Link to ${cc.reference ?? cc.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[12px] font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {cc.reference ?? cc.id.slice(0, 8)}
                    </p>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {cc.title}
                    </p>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {cc.changeType} · Risk: {cc.risk} · Status: {cc.status}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <textarea
            className="input text-[12px] min-h-[60px] mb-2"
            value={linkRationale}
            onChange={(e) => setLinkRationale(e.target.value)}
            placeholder="Why is this link being made? (optional)"
            maxLength={2000}
            disabled={linkBusy}
            aria-label="Link rationale"
          />
          {linkError && (
            <p
              role="alert"
              className="text-[11px] mb-2"
              style={{ color: "var(--danger)" }}
            >
              {linkError}
            </p>
          )}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={linkBusy}
              onClick={() => setPickerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Link2}
              disabled={linkBusy || !linkSelectedId}
              loading={linkBusy}
              onClick={() => void handleLink()}
            >
              Link
            </Button>
          </div>
        </Modal>
      )}

      {/* Unlink confirm modal */}
      {unlinkingId && (
        <Modal
          open
          onClose={unlinkBusy ? () => undefined : () => setUnlinkingId(null)}
          title="Unlink change control"
        >
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            Reason of at least 10 characters is required. The link is
            removed but the audit trail preserves the original linkage history.
          </p>
          <textarea
            className="input text-[12px] min-h-[80px] mb-2"
            value={unlinkReason}
            onChange={(e) => setUnlinkReason(e.target.value)}
            placeholder="Why is this link being removed?"
            maxLength={2000}
            disabled={unlinkBusy}
            aria-label="Unlink reason"
          />
          {unlinkError && (
            <p
              role="alert"
              className="text-[11px] mb-2"
              style={{ color: "var(--danger)" }}
            >
              {unlinkError}
            </p>
          )}
          <div
            className="flex justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--bg-border)" }}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={unlinkBusy}
              onClick={() => setUnlinkingId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={X}
              disabled={unlinkBusy || unlinkReason.trim().length < 10}
              loading={unlinkBusy}
              onClick={() => void handleUnlinkConfirm()}
            >
              Unlink
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
