"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Pencil, Flag, ArrowRight, ClipboardList, AlertTriangle, Wrench } from "lucide-react";
import dayjs from "@/lib/dayjs";
import { useAppSelector } from "@/hooks/useAppSelector";
import { useRole } from "@/hooks/useRole";
import { useTenantConfig } from "@/hooks/useTenantConfig";
import { canEditRisk, canConvertRiskTo, canConvertRiskToAny } from "@/lib/permissions/roleSets";
import { updateRisk as updateRiskAction, uploadRiskDocument, removeRiskDocument } from "@/actions/risks";
import { convertRiskToGap, convertRiskToDeviation, convertRiskToCapa } from "@/actions/risk-conversion";
import { PageLayout } from "@/components/layout/PageLayout";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Popup } from "@/components/ui/Popup";
import { CategorizedDocUploader, type DocUploadEntry } from "@/components/shared/CategorizedDocUploader";
import { getSeverityVariant, normalizeSeverityForDisplay } from "@/lib/badgeVariants";
import { formatReference } from "@/lib/reference";
import { auditEventLabel } from "@/lib/labels/auditEvents";
import { roleLabel } from "@/lib/labels/roles";
import {
  RISK_CATEGORY_LABEL,
  RISK_LIKELIHOOD_LABEL,
  RISK_STATUS_BADGE,
  RISK_DOC_CATEGORIES,
  RISK_DOC_CATEGORY_LABEL,
  type RiskCategory,
  type RiskLikelihood,
  type RiskStatus,
} from "@/constants/risk";
import type { RiskListRow } from "@/lib/queries/risks";
import type { WorklistDoc } from "@/lib/queries/worklist";
import { RiskModal, type RiskOwnerOption } from "./modals/RiskModal";
import { ConvertRiskModal } from "./modals/ConvertRiskModal";
import { RISK_CONVERT_TARGET_LABEL, type RiskConvertTarget } from "@/constants/riskConversion";
import type { RiskConversion } from "@/lib/queries/risks";

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-(--text-muted) mb-1 block";

export interface RiskAuditEntry {
  id: string;
  action: string;
  userName: string;
  userRole: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface RiskDetailPageProps {
  risk: RiskListRow;
  docs: WorklistDoc[];
  audit: RiskAuditEntry[];
  owners: RiskOwnerOption[];
  /** Non-null once this risk has been converted (Phase 2). */
  conversion: RiskConversion | null;
}

/** The three convert buttons, in escalation order. */
const CONVERT_TARGETS: { target: RiskConvertTarget; Icon: typeof ClipboardList }[] = [
  { target: "Gap", Icon: ClipboardList },
  { target: "Deviation", Icon: AlertTriangle },
  { target: "CAPA", Icon: Wrench },
];

/**
 * Risk detail. The server route already proved the caller may SEE this risk
 * (getRisk → riskVisibilityWhere), so this component only gates ACTIONS.
 *
 * Phase 2 will add a "Convert to CAPA / Deviation / Change Control" section
 * where marked below. Nothing on this page reads or writes `convertedToType` /
 * `convertedToId` — they stay unused in Phase 1.
 */
/** "CAPA-CHN-2026-008" reads better than "CAPA CAPA-CHN-2026-008"; a finding's
 *  "FND-…" reference needs its module name spelled out. Prefix the target label
 *  only when the reference doesn't already start with it. */
function conversionLabel(c: RiskConversion): string {
  const ref = c.recordReference ?? c.recordId.slice(0, 8);
  const label = RISK_CONVERT_TARGET_LABEL[c.target];
  return ref.toUpperCase().startsWith(label.toUpperCase()) ? ref : `${label} ${ref}`;
}

export function RiskDetailPage({ risk, docs, audit, owners, conversion }: RiskDetailPageProps) {
  const router = useRouter();
  const { org, allSites } = useTenantConfig();
  const user = useAppSelector((s) => s.auth.user);
  const { role } = useRole();

  const [editOpen, setEditOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false);
  const [convertTarget, setConvertTarget] = useState<RiskConvertTarget | null>(null);
  const [convertedPopup, setConvertedPopup] = useState("");

  const timezone = org.timezone;
  const dateFormat = org.dateFormat;
  const reference = formatReference("RISK", risk);

  // A Converted risk is TERMINAL: no editing, and no second conversion. Both the
  // Edit action and every Convert button disappear; the server rejects either way.
  const isConverted = risk.status === "Converted";
  const canEdit = canEditRisk(role, user?.id ?? null, risk) && !isConverted;
  // Show the Convert section only to a role that can convert into at least one
  // target. Each button is then gated on ITS target: the client mirror of the
  // two-gate server rule (governance-manage AND the target's own create gate).
  const showConvert = !isConverted && canConvertRiskToAny(role);

  const siteName = risk.siteId ? allSites.find((s) => s.id === risk.siteId)?.name ?? "—" : "Tenant-level";
  const overdue =
    !!risk.targetDate &&
    risk.status !== "Closed" &&
    risk.status !== "Converted" &&
    dayjs.utc(risk.targetDate).isBefore(dayjs());

  const fmt = (iso: string) => dayjs.utc(iso).tz(timezone).format(`${dateFormat} HH:mm`);

  async function handleEditSubmit(values: {
    title: string; description: string; category: string; severity: string;
    likelihood: string; status: string; ownerId: string; siteId: string;
    targetDate: string; mitigationPlan: string;
  }) {
    const res = await updateRiskAction(risk.id, {
      title: values.title,
      description: values.description,
      category: values.category as never,
      severity: values.severity as never,
      likelihood: values.likelihood as never,
      status: values.status as never,
      ownerId: values.ownerId,
      siteId: values.siteId || null,
      targetDate: values.targetDate ? dayjs(values.targetDate).utc().toISOString() : null,
      mitigationPlan: values.mitigationPlan || null,
    });
    if (!res.success) return { success: false, error: res.error };
    setSavedPopup(true);
    router.refresh();
    return { success: true as const };
  }

  async function handleUploadDocs(entries: DocUploadEntry[]) {
    for (const entry of entries) {
      const fd = new FormData();
      fd.append("file", entry.file);
      const res = await uploadRiskDocument(risk.id, fd, entry.category);
      if (!res.success) return { success: false, error: res.error };
    }
    router.refresh();
    return { success: true as const };
  }

  /**
   * Dispatch to the right convert action. Each is a thin wrapper that calls the
   * target module's REAL create action, then links + marks + audits.
   */
  async function handleConvert(target: RiskConvertTarget, v: {
    requirement: string; purpose: string; title: string; description: string;
    type: string; category: string; fdaSeverity: string; immediateAction: string;
    area: string; severity: string; dueDate: string; copyDocuments: boolean;
  }) {
    const res =
      target === "Gap"
        ? await convertRiskToGap(risk.id, {
            requirement: v.requirement, purpose: v.purpose || undefined, area: v.area,
            severity: v.severity as never, targetDate: v.dueDate, copyDocuments: v.copyDocuments,
          })
        : target === "Deviation"
        ? await convertRiskToDeviation(risk.id, {
            title: v.title, description: v.description, type: v.type as never,
            category: v.category as never, severity: v.fdaSeverity as never, area: v.area,
            immediateAction: v.immediateAction,
            dueDate: v.dueDate, copyDocuments: v.copyDocuments,
          })
        : await convertRiskToCapa(risk.id, {
            title: v.title, description: v.description, risk: v.severity as never, dueDate: v.dueDate,
          });

    if (!res.success) return { success: false, error: res.error };
    setConvertedPopup(`${RISK_CONVERT_TARGET_LABEL[target]} ${res.data.recordReference ?? ""} created.`);
    router.refresh();
    return { success: true as const };
  }

  async function handleRemoveDoc(docId: string) {
    const res = await removeRiskDocument(risk.id, docId);
    if (res.success) router.refresh();
    return res;
  }

  return (
    <PageLayout
      breadcrumb={{ parent: "Governance & KPIs", parentHref: "/governance", current: reference }}
      description={risk.title}
      actions={canEdit ? [{ label: "Edit", onClick: () => setEditOpen(true), variant: "primary", icon: Pencil }] : []}
      headerRight={
        <button
          type="button"
          onClick={() => setAuditOpen(true)}
          aria-label="Audit trail"
          title="Audit trail"
          className="w-8 h-8 rounded-md flex items-center justify-center bg-transparent hover:bg-(--bg-hover) border-none cursor-pointer transition-colors"
        >
          <Clock className="w-4 h-4 text-(--text-muted)" aria-hidden="true" />
        </button>
      }
    >
      <div className="space-y-5 max-w-4xl">
        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={getSeverityVariant(risk.severity, "generic")}>
            {normalizeSeverityForDisplay(risk.severity, "generic") ?? risk.severity}
          </Badge>
          <span className={RISK_STATUS_BADGE[risk.status as RiskStatus] ?? "badge badge-gray"}>{risk.status}</span>
          <span className="badge badge-blue text-[10px]">
            {RISK_CATEGORY_LABEL[risk.category as RiskCategory] ?? risk.category}
          </span>
          {overdue && <span className="badge badge-red text-[10px]">Overdue</span>}
        </div>

        {/* Details block */}
        <div className="rounded-lg border p-4" style={{ background: "var(--bg-surface)", borderColor: "var(--bg-border)" }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <h3 className={LABEL}>Category</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {RISK_CATEGORY_LABEL[risk.category as RiskCategory] ?? risk.category}
              </p>
            </div>
            <div>
              <h3 className={LABEL}>Severity</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{risk.severity}</p>
            </div>
            <div>
              <h3 className={LABEL}>Likelihood</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {RISK_LIKELIHOOD_LABEL[risk.likelihood as RiskLikelihood] ?? risk.likelihood}
              </p>
            </div>
            <div>
              <h3 className={LABEL}>Owner</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {risk.ownerName ?? "—"}
                {risk.ownerId && risk.ownerId === user?.id ? " (You)" : ""}
              </p>
            </div>
            <div>
              <h3 className={LABEL}>Status</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{risk.status}</p>
            </div>
            <div>
              <h3 className={LABEL}>Target date</h3>
              <p className="text-[12px]" style={{ color: overdue ? "#ef4444" : "var(--text-secondary)" }}>
                {risk.targetDate ? dayjs.utc(risk.targetDate).tz(timezone).format(dateFormat) : "—"}
              </p>
            </div>
            <div>
              <h3 className={LABEL}>Site</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{siteName}</p>
            </div>
            <div>
              <h3 className={LABEL}>Raised by</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{risk.createdBy}</p>
            </div>
            <div>
              <h3 className={LABEL}>Raised on</h3>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {dayjs.utc(risk.createdAt).tz(timezone).format(dateFormat)}
              </p>
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <h3 className={LABEL}>Description</h3>
          <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
            {risk.description}
          </p>
        </div>

        {/* Mitigation plan */}
        <div>
          <h3 className={LABEL}>Mitigation plan</h3>
          {risk.mitigationPlan ? (
            <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
              {risk.mitigationPlan}
            </p>
          ) : (
            <p className="text-[12px] italic" style={{ color: "var(--text-muted)" }}>
              No mitigation plan recorded yet.
            </p>
          )}
        </div>

        {/* Supporting documents */}
        <div className="pt-4 border-t border-(--bg-border)">
          <h3 className={LABEL}>Supporting documents</h3>
          <CategorizedDocUploader
            docs={docs}
            categories={RISK_DOC_CATEGORIES}
            categoryLabels={RISK_DOC_CATEGORY_LABEL}
            readOnly={!canEdit}
            emptyText="No supporting documents attached."
            onUpload={canEdit ? handleUploadDocs : undefined}
            onRemove={canEdit ? handleRemoveDoc : undefined}
          />
        </div>

        {/* ── CONVERSION (Phase 2) ────────────────────────────────────────
            Either the escalation buttons (still convertible) or the conversion
            history line (already converted). Never both — "Converted" is terminal. */}

        {conversion && (
          <div className="pt-4 border-t border-(--bg-border)">
            <h3 className={LABEL}>Conversion</h3>
            <div className="flex items-center gap-2 flex-wrap rounded-lg p-3"
                 style={{ background: "var(--bg-surface)", border: "1px solid var(--bg-border)" }}>
              <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--brand)" }} aria-hidden="true" />
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                Converted to{" "}
                <strong style={{ color: "var(--text-primary)" }}>{conversionLabel(conversion)}</strong>
                {conversion.convertedAt && <> on {dayjs.utc(conversion.convertedAt).tz(timezone).format(dateFormat)}</>}
                {conversion.convertedBy && <> by {conversion.convertedBy}</>}
              </p>
              <Link href={conversion.href}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold hover:underline ml-auto"
                    style={{ color: "var(--brand)" }}>
                view <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}

        {showConvert && (
          <div className="pt-4 border-t border-(--bg-border)">
            <h3 className={LABEL}>Convert this risk</h3>
            <p className="text-[11px] mb-2.5" style={{ color: "var(--text-muted)" }}>
              Escalate the risk into a real record with its own workflow. The risk is marked
              Converted (terminal) and linked to what it became.
            </p>
            <div className="flex gap-2 flex-wrap">
              {CONVERT_TARGETS.map(({ target, Icon }) => {
                const allowed = canConvertRiskTo(target, role);
                return (
                  <Button
                    key={target}
                    variant="secondary"
                    size="sm"
                    icon={Icon}
                    disabled={!allowed}
                    title={allowed ? undefined : `Only a quality authority (QA Head) can raise a ${RISK_CONVERT_TARGET_LABEL[target]}.`}
                    onClick={() => setConvertTarget(target)}
                  >
                    → {RISK_CONVERT_TARGET_LABEL[target]}
                  </Button>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* Edit modal — reuses the SAME RiskModal as the register's Add/Edit. */}
      <RiskModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        risk={risk}
        owners={owners}
        sites={allSites.map((s) => ({ id: s.id, name: s.name }))}
        docs={docs}
        onSubmit={handleEditSubmit}
        onUploadDocs={handleUploadDocs}
        onRemoveDoc={handleRemoveDoc}
      />

      {/* Audit trail modal (the header clock) */}
      {auditOpen && (
        <Modal open onClose={() => setAuditOpen(false)} title={`Audit Trail — ${reference}`}>
          <div className="max-h-[60vh] overflow-y-auto space-y-2.5 text-[11px] pr-1">
            {audit.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No audit entries recorded yet.</p>
            ) : (
              audit.map((e) => (
                <div key={e.id} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "var(--brand)" }} />
                  <div>
                    <p className="font-medium" style={{ color: "var(--text-primary)" }}>{auditEventLabel(e.action)}</p>
                    <p style={{ color: "var(--text-muted)" }}>
                      {e.userName}
                      {e.userRole ? ` (${roleLabel(e.userRole)})` : ""} — {fmt(e.createdAt)}
                    </p>
                    {(e.oldValue || e.newValue) && (
                      <p style={{ color: "var(--text-secondary)" }}>
                        {e.oldValue && <span style={{ color: "#ef4444" }}>{e.oldValue}</span>}
                        {e.oldValue && e.newValue && " → "}
                        {e.newValue && <span style={{ color: "#10b981" }}>{e.newValue}</span>}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {convertTarget && (
        <ConvertRiskModal
          open
          onClose={() => setConvertTarget(null)}
          risk={risk}
          target={convertTarget}
          documentCount={docs.length}
          onSubmit={handleConvert}
        />
      )}

      <Popup isOpen={!!convertedPopup} variant="success" title="Risk converted"
             description={convertedPopup} onDismiss={() => setConvertedPopup("")} />
      <Popup isOpen={savedPopup} variant="success" title="Risk updated" description="Changes saved and recorded in the audit trail." onDismiss={() => setSavedPopup(false)} />
    </PageLayout>
  );
}
