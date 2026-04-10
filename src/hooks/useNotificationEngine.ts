import { useEffect } from "react";
import { useAppDispatch } from "./useAppDispatch";
import { useAppSelector } from "./useAppSelector";
import { useTenantData } from "./useTenantData";
import { addNotification, type AppNotification, type NotificationType } from "@/store/notifications.slice";
import dayjs from "@/lib/dayjs";

function make(id: string, type: NotificationType, title: string, message: string, link?: string, linkState?: Record<string, unknown>, read = false): AppNotification {
  return { id, type, title, message, link, linkState, read, createdAt: dayjs().toISOString() };
}

export function useNotificationEngine() {
  const dispatch = useAppDispatch();
  const { findings, capas, systems, fda483Events, raidItems } = useTenantData();
  const currentUser = useAppSelector((s) => s.auth.user);
  const existing = useAppSelector((s) => s.notifications.items);

  function push(n: AppNotification) {
    if (!existing.some((e) => e.id === n.id)) dispatch(addNotification(n));
  }

  // Gap Assessment
  useEffect(() => {
    findings.filter((f) => f.severity === "Critical" && f.status !== "Closed").forEach((f) =>
      push(make(`finding-critical-${f.id}`, "finding_critical", "Critical finding open", `${f.id}: ${f.requirement.slice(0, 70)}`, "/gap-assessment", { openFindingId: f.id })),
    );
    findings.filter((f) => f.status !== "Closed" && f.targetDate && dayjs.utc(f.targetDate).isBefore(dayjs())).forEach((f) =>
      push(make(`finding-overdue-${f.id}`, "finding_overdue", "Finding overdue", `${f.id} \u2014 target date passed.`, "/gap-assessment", { openFindingId: f.id })),
    );
    findings.filter((f) => f.owner === currentUser?.id && f.status !== "Closed").forEach((f) =>
      push(make(`finding-assigned-${f.id}-${currentUser?.id}`, "finding_assigned", "Finding assigned to you", `${f.id}: ${f.requirement.slice(0, 60)}`, "/gap-assessment", { openFindingId: f.id })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings.length]);

  // CAPA
  useEffect(() => {
    capas.filter((c) => c.status !== "Closed" && dayjs.utc(c.dueDate).isBefore(dayjs())).forEach((c) =>
      push(make(`capa-overdue-${c.id}`, "capa_overdue", "CAPA overdue", `${c.id} is past due date.`, "/capa", { openCapaId: c.id })),
    );
    capas.filter((c) => c.status === "Pending QA Review").forEach((c) =>
      push(make(`capa-review-${c.id}`, "capa_pending_review", "CAPA awaiting QA sign-off", `${c.id} ready for review and closure.`, "/capa", { openCapaId: c.id })),
    );
    capas.filter((c) => c.owner === currentUser?.id && c.status !== "Closed").forEach((c) =>
      push(make(`capa-assigned-${c.id}-${currentUser?.id}`, "capa_assigned", "CAPA assigned to you", `${c.id}: ${c.description.slice(0, 60)}`, "/capa", { openCapaId: c.id })),
    );
    capas.filter((c) => c.diGate && c.status !== "Closed").forEach((c) =>
      push(make(`capa-digate-${c.id}`, "capa_di_gate", "DI gate CAPA open", `${c.id} \u2014 data integrity review required.`, "/capa", { openCapaId: c.id })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capas.length]);

  // CSV/CSA
  useEffect(() => {
    systems.filter((s) => s.validationStatus === "Overdue").forEach((s) =>
      push(make(`validation-overdue-${s.id}`, "validation_overdue", "Validation overdue", `${s.name} \u2014 qualification overdue.`, "/csv-csa", { systemId: s.id })),
    );
    systems.filter((s) => s.part11Status === "Non-Compliant").forEach((s) =>
      push(make(`system-noncompliant-${s.id}`, "system_non_compliant", "Part 11 non-compliant system", `${s.name} \u2014 Part 11 gaps identified.`, "/csv-csa", { systemId: s.id })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systems.length]);

  // FDA 483
  useEffect(() => {
    fda483Events.forEach((e) => {
      if (e.status === "Response Submitted" || e.status === "Closed") return;
      const dl = dayjs.utc(e.responseDeadline).diff(dayjs(), "day");
      if (dl >= 0 && dl <= 2) {
        push(make(`fda483-critical-${e.id}`, "fda483_deadline_critical", "FDA 483 response due very soon", `${e.referenceNumber} \u2014 ${dl === 0 ? "due TODAY" : `${dl} day${dl !== 1 ? "s" : ""} left`}`, "/fda-483"));
      } else if (dl > 2 && dl <= 5) {
        push(make(`fda483-deadline-${e.id}`, "fda483_deadline", "FDA 483 deadline approaching", `${e.referenceNumber} due in ${dl} days`, "/fda-483"));
      }
      e.commitments.filter((c) => c.status !== "Complete" && dayjs.utc(c.dueDate).isBefore(dayjs())).forEach((c) =>
        push(make(`commitment-overdue-${e.id}-${c.id}`, "commitment_overdue", "FDA 483 commitment overdue", `${e.referenceNumber} \u2014 commitment past due.`, "/fda-483")),
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fda483Events.length]);

  // Evidence
  useEffect(() => {
    const missing = findings.filter((f) => f.severity === "Critical" && f.status !== "Closed" && !f.evidenceLink?.trim());
    if (missing.length > 0) {
      push(make("evidence-missing-critical", "evidence_missing", "Critical findings missing evidence", `${missing.length} critical finding${missing.length !== 1 ? "s" : ""} have no evidence linked.`, "/evidence"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings.length]);

  // RAID
  useEffect(() => {
    raidItems.filter((r) => r.priority === "Critical" && r.status !== "Closed").forEach((r) =>
      push(make(`raid-critical-${r.id}`, "raid_critical", "Critical RAID item open", `${r.type}: ${r.title.slice(0, 60)}`, "/governance")),
    );
    raidItems.filter((r) => r.status !== "Closed" && dayjs.utc(r.dueDate).isBefore(dayjs())).forEach((r) =>
      push(make(`raid-overdue-${r.id}`, "raid_overdue", "RAID item overdue", `${r.type}: ${r.title.slice(0, 60)}`, "/governance")),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raidItems.length]);

}
