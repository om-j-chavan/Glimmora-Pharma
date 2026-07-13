"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditLog as PrismaAuditLog } from "@prisma/client";
import dayjs from "@/lib/dayjs";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useRole } from "@/hooks/useRole";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { CC_STATUS_VARIANT, getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import {
  loadChangeControlById,
  loadChangeControlStatusHistory,
  loadLinkableCAPAs,
  linkCAPAToChangeControl,
  unlinkCAPAFromChangeControl,
  softDeleteChangeControl,
  transitionChangeControlStatus,
} from "@/actions/change-control";
import type { ChangeControlStatus } from "@/lib/change-control-constants";
import type { CCDetail, LinkableCAPA } from "./_shared";
import { OverviewTab } from "./tabs/OverviewTab";
import { LinksTab } from "./tabs/LinksTab";
import { HistoryTab } from "./tabs/HistoryTab";
import { TransitionModal } from "./modals/TransitionModal";
import { DeleteModal } from "./modals/DeleteModal";
import { LinkPickerModal } from "./modals/LinkPickerModal";
import { UnlinkModal } from "./modals/UnlinkModal";

/* ── ChangeControlDetailModal shell ──
 *
 * Renders the modal frame, header, tab bar, and dispatches to per-tab
 * bodies + per-action confirm modals. Each piece lives in its own file
 * under tabs/ + modals/ + components/.
 *
 * State that's shared across multiple modals (transition target, delete
 * reason, link picker selection, unlink reason) lives here in the shell
 * so the on-confirm side effects can refresh + bubble onChanged() to the
 * parent list. Per-modal local state (form drafts) is owned by the modal
 * components themselves where it's visually clearer.
 */

interface Props {
  ccId: string;
  onClose: () => void;
  /** Bumped after every successful mutation so the parent list can refresh. */
  onChanged: () => void;
}

type Tab = "overview" | "links" | "history";

export function ChangeControlDetailModal({ ccId, onClose, onChanged }: Props) {
  const { role } = useRole();
  const { org } = useTenantConfig();
  const dateFormat = org.dateFormat;
  const isApproverRole =
    role === "qa_head" || role === "customer_admin" || role === "super_admin";

  const [cc, setCC] = useState<CCDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [history, setHistory] = useState<PrismaAuditLog[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Status-transition + delete + link state
  const [transitionTarget, setTransitionTarget] =
    useState<ChangeControlStatus | null>(null);
  const [transitionComment, setTransitionComment] = useState("");
  const [transitionDate, setTransitionDate] = useState("");
  // Substage 5.4 — only populated when target ∈ {Approved, Rejected, Closed}.
  const [transitionPassword, setTransitionPassword] = useState("");
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkable, setLinkable] = useState<LinkableCAPA[]>([]);
  const [linkableLoading, setLinkableLoading] = useState(false);
  const [linkSelectedId, setLinkSelectedId] = useState<string | null>(null);
  const [linkRationale, setLinkRationale] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [unlinkReason, setUnlinkReason] = useState("");
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    const result = await loadChangeControlById(ccId);
    if (!result.success) {
      setLoadError(result.error);
      setCC(null);
      setLoading(false);
      return;
    }
    setCC(result.data as CCDetail);
    setLoading(false);
  }, [ccId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Lazy-load history when the user opens that tab.
  useEffect(() => {
    if (tab !== "history" || historyLoaded) return;
    void (async () => {
      const result = await loadChangeControlStatusHistory(ccId);
      if (result.success) {
        setHistory(result.data as PrismaAuditLog[]);
      }
      setHistoryLoaded(true);
    })();
  }, [tab, historyLoaded, ccId]);

  // Lazy-load linkable CAPAs when the picker opens.
  useEffect(() => {
    if (!linkPickerOpen) return;
    setLinkableLoading(true);
    void (async () => {
      const result = await loadLinkableCAPAs(ccId);
      setLinkableLoading(false);
      if (result.success) setLinkable(result.data as LinkableCAPA[]);
    })();
  }, [linkPickerOpen, ccId]);

  /** What status transitions are visible from the current status? */
  const transitionsForStatus: Record<
    ChangeControlStatus,
    { label: string; target: ChangeControlStatus; variant: "primary" | "secondary" | "danger" | "ghost"; needsApprover: boolean }[]
  > = {
    Draft: [
      {
        label: "Submit for review",
        target: "In Review",
        variant: "primary",
        needsApprover: false,
      },
    ],
    "In Review": [
      { label: "Approve", target: "Approved", variant: "primary", needsApprover: true },
      { label: "Reject", target: "Rejected", variant: "danger", needsApprover: true },
      {
        label: "Request revisions",
        target: "Draft",
        variant: "secondary",
        needsApprover: false,
      },
    ],
    Approved: [
      {
        label: "Start implementation",
        target: "In Implementation",
        variant: "primary",
        needsApprover: false,
      },
    ],
    "In Implementation": [
      {
        label: "Mark implemented",
        target: "Implemented",
        variant: "primary",
        needsApprover: false,
      },
    ],
    Implemented: [
      { label: "Close", target: "Closed", variant: "primary", needsApprover: true },
    ],
    Closed: [],
    Rejected: [],
  };

  const handleTransitionSubmit = async () => {
    if (!cc || !transitionTarget) return;
    setTransitionBusy(true);
    setTransitionError(null);
    const isSigned =
      transitionTarget === "Approved" ||
      transitionTarget === "Rejected" ||
      transitionTarget === "Closed";
    const result = await transitionChangeControlStatus(cc.id, {
      newStatus: transitionTarget,
      ...(transitionComment.trim()
        ? { comment: transitionComment.trim() }
        : {}),
      ...(transitionTarget === "Implemented" && transitionDate
        ? { actualImplementationDate: transitionDate }
        : {}),
      ...(isSigned ? { password: transitionPassword } : {}),
    });
    setTransitionBusy(false);
    if (!result.success) {
      setTransitionError(result.error);
      return;
    }
    setTransitionTarget(null);
    setTransitionComment("");
    setTransitionDate("");
    setTransitionPassword("");
    setHistoryLoaded(false); // force history refetch on next visit
    await refresh();
    onChanged();
  };

  const handleDelete = async () => {
    if (!cc) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const result = await softDeleteChangeControl(cc.id, {
      reason: deleteReason.trim(),
    });
    setDeleteBusy(false);
    if (!result.success) {
      setDeleteError(result.error);
      return;
    }
    setDeleteOpen(false);
    onChanged();
    onClose();
  };

  const handleLink = async () => {
    if (!cc || !linkSelectedId) return;
    setLinkBusy(true);
    setLinkError(null);
    const result = await linkCAPAToChangeControl({
      capaId: linkSelectedId,
      changeControlId: cc.id,
      initiatedFrom: "ChangeControl",
      ...(linkRationale.trim() ? { linkRationale: linkRationale.trim() } : {}),
    });
    setLinkBusy(false);
    if (!result.success) {
      setLinkError(result.error);
      return;
    }
    setLinkPickerOpen(false);
    setLinkSelectedId(null);
    setLinkRationale("");
    await refresh();
    onChanged();
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
    onChanged();
  };

  if (loading) {
    return (
      <Modal open onClose={onClose} title="Change control">
        <p
          role="status"
          aria-live="polite"
          className="text-[12px] py-6 text-center"
          style={{ color: "var(--text-muted)" }}
        >
          Loading…
        </p>
      </Modal>
    );
  }

  if (loadError || !cc) {
    return (
      <Modal open onClose={onClose} title="Change control">
        <p
          role="alert"
          className="text-[12px] py-4 text-center"
          style={{ color: "var(--danger)" }}
        >
          {loadError ?? "Change control not found."}
        </p>
      </Modal>
    );
  }

  const transitions = transitionsForStatus[cc.status as ChangeControlStatus] ?? [];
  const canDelete = cc.deletedAt === null && cc.capaLinks.length === 0;
  const isDeleted = cc.deletedAt !== null;

  const header = (
    <div
      className="px-5 pt-4 pb-3"
      style={{ borderBottom: "1px solid var(--bg-border)" }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span
          className="font-mono text-[12px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {cc.reference ?? cc.id.slice(0, 8)}
        </span>
        <Badge variant={getSeverityVariant(cc.risk, "generic")}>{normalizeSeverityForDisplay(cc.risk, "generic") ?? cc.risk}</Badge>
        <Badge variant={CC_STATUS_VARIANT[cc.status as keyof typeof CC_STATUS_VARIANT] ?? "gray"}>{cc.status}</Badge>
        {isDeleted && <Badge variant="red">Deleted</Badge>}
      </div>
      <h2
        className="text-[15px] font-semibold leading-tight"
        style={{ color: "var(--text-primary)" }}
      >
        {cc.title}
      </h2>
      <p
        className="mt-1 text-[12px]"
        style={{ color: "var(--text-secondary)" }}
      >
        Type: {cc.changeType} <span aria-hidden="true">·</span> Owner:{" "}
        {cc.ownerName} <span aria-hidden="true">·</span> Target:{" "}
        {cc.targetImplementationDate
          ? dayjs.utc(cc.targetImplementationDate).format(dateFormat)
          : "—"}
      </p>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={`Change control ${cc.reference ?? ""}`} header={header} className="max-w-2xl">
      <div
        role="tablist"
        aria-label="Change control sections"
        className="flex gap-1 mb-4"
        style={{ borderBottom: "1px solid var(--bg-border)" }}
      >
        {(
          [
            { id: "overview" as const, label: "Overview" },
            { id: "links" as const, label: "Linked CAPAs", badge: cc.capaLinks.length },
            { id: "history" as const, label: "Status history" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[12px] -mb-px bg-transparent cursor-pointer outline-none transition-colors duration-150 border-x-0 border-t-0"
            style={{
              borderBottom:
                tab === t.id
                  ? "2px solid var(--brand)"
                  : "2px solid transparent",
              color:
                tab === t.id ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: tab === t.id ? 500 : 400,
            }}
          >
            {t.label}
            {"badge" in t && t.badge !== undefined && (
              <span
                className="inline-flex items-center justify-center text-[10px] font-medium px-1.5 py-0.5 rounded-full min-w-[18px]"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--text-muted)",
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab
          cc={cc}
          isDeleted={isDeleted}
          transitions={transitions}
          isApproverRole={isApproverRole}
          canDelete={canDelete}
          onTransition={(t) => {
            setTransitionTarget(t);
            setTransitionComment("");
            setTransitionDate("");
            setTransitionError(null);
          }}
          onDelete={() => {
            setDeleteOpen(true);
            setDeleteReason("");
            setDeleteError(null);
          }}
        />
      )}

      {tab === "links" && (
        <LinksTab
          cc={cc}
          isApproverRole={isApproverRole}
          onAddLink={() => {
            setLinkPickerOpen(true);
            setLinkSelectedId(null);
            setLinkRationale("");
            setLinkError(null);
          }}
          onUnlink={(linkId) => {
            setUnlinkingId(linkId);
            setUnlinkReason("");
            setUnlinkError(null);
          }}
        />
      )}

      {tab === "history" && (
        <HistoryTab history={history} loaded={historyLoaded} />
      )}

      {transitionTarget && (
        <TransitionModal
          cc={cc}
          transitionTarget={transitionTarget}
          transitionComment={transitionComment}
          transitionDate={transitionDate}
          transitionPassword={transitionPassword}
          transitionBusy={transitionBusy}
          transitionError={transitionError}
          onCommentChange={setTransitionComment}
          onDateChange={setTransitionDate}
          onPasswordChange={setTransitionPassword}
          onCancel={() => {
            setTransitionTarget(null);
            setTransitionPassword("");
            setTransitionError(null);
          }}
          onConfirm={() => void handleTransitionSubmit()}
        />
      )}

      {deleteOpen && (
        <DeleteModal
          deleteReason={deleteReason}
          deleteBusy={deleteBusy}
          deleteError={deleteError}
          onReasonChange={setDeleteReason}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => void handleDelete()}
        />
      )}

      {linkPickerOpen && (
        <LinkPickerModal
          linkable={linkable}
          linkableLoading={linkableLoading}
          linkSelectedId={linkSelectedId}
          linkRationale={linkRationale}
          linkBusy={linkBusy}
          linkError={linkError}
          onSelect={setLinkSelectedId}
          onRationaleChange={setLinkRationale}
          onCancel={() => setLinkPickerOpen(false)}
          onConfirm={() => void handleLink()}
        />
      )}

      {unlinkingId && (
        <UnlinkModal
          unlinkReason={unlinkReason}
          unlinkBusy={unlinkBusy}
          unlinkError={unlinkError}
          onReasonChange={setUnlinkReason}
          onCancel={() => setUnlinkingId(null)}
          onConfirm={() => void handleUnlinkConfirm()}
        />
      )}
    </Modal>
  );
}
