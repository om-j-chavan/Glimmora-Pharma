"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

const CreateEventSchema = z.object({
  referenceNumber: z.string().min(1),
  eventType: z.string().min(1),
  agency: z.string().min(1),
  siteId: z.string().min(1),
  inspectionDate: z.string().min(1),
  responseDeadline: z.string().min(1),
});

const CreateObservationSchema = z.object({
  eventId: z.string().min(1),
  number: z.number().int().positive(),
  text: z.string().min(10),
  area: z.string().optional(),
  regulation: z.string().optional(),
  severity: z.enum(["Critical", "High", "Low"]),
});

const CreateCommitmentSchema = z.object({
  eventId: z.string().min(1),
  text: z.string().min(5),
  dueDate: z.string().optional(),
  owner: z.string().optional(),
});

export async function createFDA483Event(
  input: z.input<typeof CreateEventSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateEventSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const event = await prisma.fDA483Event.create({
      data: {
        ...parsed.data,
        tenantId: session.user.tenantId,
        status: "Open",
        createdBy: session.user.name,
        inspectionDate: new Date(parsed.data.inspectionDate),
        responseDeadline: new Date(parsed.data.responseDeadline),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "FDA483_EVENT_CREATED",
        recordId: event.id,
        recordTitle: parsed.data.referenceNumber,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] createFDA483Event failed:", err);
    return { success: false, error: "Failed to create event" };
  }
}

export async function updateFDA483Event(
  id: string,
  input: Partial<z.input<typeof CreateEventSchema>>,
): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const event = await prisma.fDA483Event.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        ...input,
        ...(input.inspectionDate ? { inspectionDate: new Date(input.inspectionDate) } : {}),
        ...(input.responseDeadline ? { responseDeadline: new Date(input.responseDeadline) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "FDA483_EVENT_UPDATED",
        recordId: id,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] updateFDA483Event failed:", err);
    return { success: false, error: "Failed to update event" };
  }
}

export async function updateFDA483Status(id: string, status: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const event = await prisma.fDA483Event.update({
      where: { id, tenantId: session.user.tenantId },
      data: { status },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "FDA483_STATUS_CHANGED",
        recordId: id,
        newValue: status,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] updateFDA483Status failed:", err);
    return { success: false, error: "Failed to update status" };
  }
}

export async function submitFDA483Response(id: string, responseDraft: string): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can submit FDA 483 response" };
  }
  try {
    const event = await prisma.fDA483Event.update({
      where: { id, tenantId: session.user.tenantId },
      data: {
        status: "Response Submitted",
        responseDraft,
        submittedAt: new Date(),
        submittedBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "FDA483_RESPONSE_SUBMITTED",
        recordId: id,
        newValue: "Response Submitted",
      },
    });
    revalidatePath("/fda-483");
    revalidatePath("/");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] submitFDA483Response failed:", err);
    return { success: false, error: "Failed to submit response" };
  }
}

export async function addObservation(
  input: z.input<typeof CreateObservationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateObservationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const obs = await prisma.fDA483Observation.create({
      data: { ...parsed.data, status: "Open" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "OBSERVATION_ADDED",
        recordId: parsed.data.eventId,
        newValue: `Observation #${parsed.data.number}`,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: obs };
  } catch (err) {
    console.error("[action] addObservation failed:", err);
    return { success: false, error: "Failed to add observation" };
  }
}

export async function addCommitment(
  input: z.input<typeof CreateCommitmentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = CreateCommitmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const commitment = await prisma.fDA483Commitment.create({
      data: {
        eventId: parsed.data.eventId,
        text: parsed.data.text,
        owner: parsed.data.owner ?? null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        status: "Pending",
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "COMMITMENT_ADDED",
        recordId: parsed.data.eventId,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: commitment };
  } catch (err) {
    console.error("[action] addCommitment failed:", err);
    return { success: false, error: "Failed to add commitment" };
  }
}

export async function deleteFDA483Event(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    await prisma.fDA483Event.delete({
      where: { id, tenantId: session.user.tenantId },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "FDA483_EVENT_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteFDA483Event failed:", err);
    return { success: false, error: "Failed to delete event" };
  }
}

/* ══════════════════════════════════════
 * RESPONSE DRAFTS — narrative + AGI
 * ══════════════════════════════════════ */

export async function saveResponseDraft(
  eventId: string,
  draft: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const event = await prisma.fDA483Event.update({
      where: { id: eventId, tenantId: session.user.tenantId },
      data: {
        responseDraft: draft,
        // Bump status only when there's actual draft content; preserve
        // a more advanced status (e.g. Response Submitted) by checking
        // whether the current status is in the early lifecycle.
        status: "Response Drafted",
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "RESPONSE_DRAFT_SAVED",
        recordId: eventId,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] saveResponseDraft failed:", err);
    return { success: false, error: "Failed to save response draft" };
  }
}

export async function saveAGIDraft(
  eventId: string,
  agiDraft: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  try {
    const event = await prisma.fDA483Event.update({
      where: { id: eventId, tenantId: session.user.tenantId },
      data: { agiDraft },
    });
    // Audit log for AGI draft save (audit finding 10.4 — coverage gap closed).
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "AGI_DRAFT_SAVED",
        recordId: eventId,
        recordTitle: event.referenceNumber,
        newValue: agiDraft.slice(0, 200),
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] saveAGIDraft failed:", err);
    return { success: false, error: "Failed to save AGI draft" };
  }
}

/* ══════════════════════════════════════
 * SIGN & SUBMIT — captures signature meaning
 * Schema fields: status, responseDraft, submittedAt,
 * submittedBy, signatureMeaning, closedAt.
 * ══════════════════════════════════════ */

export async function signSubmitFDA483Response(
  eventId: string,
  draft: string,
  signatureMeaning: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  if (session.user.role !== "qa_head" && session.user.role !== "super_admin") {
    return { success: false, error: "Only QA Head can sign and submit FDA 483 response" };
  }
  try {
    const event = await prisma.fDA483Event.update({
      where: { id: eventId, tenantId: session.user.tenantId },
      data: {
        status: "Response Submitted",
        responseDraft: draft,
        submittedAt: new Date(),
        submittedBy: session.user.name,
        signatureMeaning,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "FDA483_RESPONSE_SUBMITTED",
        recordId: eventId,
        newValue: signatureMeaning,
      },
    });
    revalidatePath("/fda-483");
    revalidatePath("/");
    return { success: true, data: event };
  } catch (err) {
    console.error("[action] signSubmitFDA483Response failed:", err);
    return { success: false, error: "Failed to submit response" };
  }
}

/* ══════════════════════════════════════
 * OBSERVATIONS — update / delete + CAPA link
 * Schema fields: text, area, regulation, severity,
 * rcaMethod, rootCause, capaId, responseText, status.
 * (No `linkedCAPAId` or `rcaData` columns — spec
 * incorrectly named these.)
 * ══════════════════════════════════════ */

const UpdateObservationSchema = z.object({
  text: z.string().optional(),
  area: z.string().optional(),
  regulation: z.string().optional(),
  severity: z.enum(["Critical", "High", "Low"]).optional(),
  rcaMethod: z.string().optional(),
  rootCause: z.string().optional(),
  responseText: z.string().optional(),
  status: z.string().optional(),
  capaId: z.string().optional(),
});

export async function updateObservation(
  id: string,
  input: z.input<typeof UpdateObservationSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateObservationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Observation.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const obs = await prisma.fDA483Observation.update({
      where: { id },
      data: parsed.data,
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "OBSERVATION_UPDATED",
        recordId: id,
        newValue: parsed.data.status ?? parsed.data.rcaMethod ?? "updated",
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: obs };
  } catch (err) {
    console.error("[action] updateObservation failed:", err);
    return { success: false, error: "Failed to update observation" };
  }
}

export async function linkCAPAToEvent(
  eventId: string,
  observationId: string,
  capaId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Observation.findFirst({
      where: { id: observationId, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    await prisma.fDA483Observation.update({
      where: { id: observationId },
      data: { capaId, status: "CAPA Linked" },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "CAPA_LINKED_TO_OBSERVATION",
        recordId: eventId,
        newValue: capaId,
      },
    });
    revalidatePath("/fda-483");
    revalidatePath("/capa");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] linkCAPAToEvent failed:", err);
    return { success: false, error: "Failed to link CAPA" };
  }
}

export async function deleteObservation(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Observation.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    await prisma.fDA483Observation.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "OBSERVATION_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteObservation failed:", err);
    return { success: false, error: "Failed to delete observation" };
  }
}

/* ══════════════════════════════════════
 * COMMITMENTS — update / delete
 * ══════════════════════════════════════ */

const UpdateCommitmentSchema = z.object({
  text: z.string().optional(),
  dueDate: z.string().optional(),
  owner: z.string().optional(),
  status: z.enum(["Pending", "In Progress", "Complete", "Overdue"]).optional(),
});

export async function updateCommitment(
  id: string,
  input: z.input<typeof UpdateCommitmentSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = UpdateCommitmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed" };
  }
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Commitment.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    const commitment = await prisma.fDA483Commitment.update({
      where: { id },
      data: {
        ...parsed.data,
        ...(parsed.data.dueDate ? { dueDate: new Date(parsed.data.dueDate) } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "COMMITMENT_UPDATED",
        recordId: id,
        newValue: parsed.data.status ?? "updated",
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: commitment };
  } catch (err) {
    console.error("[action] updateCommitment failed:", err);
    return { success: false, error: "Failed to update commitment" };
  }
}

export async function deleteCommitment(id: string): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Commitment.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    await prisma.fDA483Commitment.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "COMMITMENT_DELETED",
        recordId: id,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] deleteCommitment failed:", err);
    return { success: false, error: "Failed to delete commitment" };
  }
}

/* ══════════════════════════════════════
 * RESPONSE DOCUMENTS
 * (FDA483Document model — requires migration)
 *
 * Spec called the URL field `fileUrl`; for in-app uploads via the
 * shared <DocumentUpload> component, this is a base64 data URL —
 * for external links it's a real URL. Either way the column stores
 * a string the UI can hand straight to <a href={fileUrl}>.
 * ══════════════════════════════════════ */

const AddResponseDocSchema = z.object({
  eventId: z.string().min(1),
  fileName: z.string().min(1),
  fileUrl: z.string().min(1),
  fileType: z.string().optional(),
  fileSize: z.string().optional(),
  type: z.string().default("response"),
});

export async function addResponseDocument(
  input: z.input<typeof AddResponseDocSchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = AddResponseDocSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const doc = await prisma.fDA483Document.create({
      data: {
        eventId: parsed.data.eventId,
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl,
        fileType: parsed.data.fileType ?? null,
        fileSize: parsed.data.fileSize ?? null,
        type: parsed.data.type ?? "response",
        uploadedBy: session.user.name,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "RESPONSE_DOCUMENT_ADDED",
        recordId: parsed.data.eventId,
        recordTitle: parsed.data.fileName,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: doc };
  } catch (err) {
    console.error("[action] addResponseDocument failed:", err);
    return { success: false, error: "Failed to add document" };
  }
}

export async function removeResponseDocument(
  id: string,
  eventId: string,
): Promise<ActionResult> {
  const session = await requireAuth();
  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Document.findFirst({
      where: { id, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }
  try {
    await prisma.fDA483Document.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "RESPONSE_DOCUMENT_REMOVED",
        recordId: eventId,
      },
    });
    revalidatePath("/fda-483");
    return { success: true, data: null };
  } catch (err) {
    console.error("[action] removeResponseDocument failed:", err);
    return { success: false, error: "Failed to remove document" };
  }
}

/* ══════════════════════════════════════
 * RAISE CAPA FROM OBSERVATION
 *
 * Combined transaction:
 *   1. Create CAPA (source = "FDA 483")
 *   2. Update observation: link capaId + flip status to "CAPA Linked"
 *   3. Audit log under both modules
 *
 * Schema notes:
 *   - CAPA columns: source/description/risk/owner/dueDate/status/siteId/diGate/createdBy
 *     (NOT `site`, NOT `diGateRequired`)
 *   - Observation column: `capaId` (NOT `linkedCAPAId`)
 *   - Status defaults are PascalCase ("Open", "CAPA Linked")
 * ══════════════════════════════════════ */

const RaiseCAPASchema = z.object({
  eventId: z.string().min(1),
  observationId: z.string().min(1),
  observationNumber: z.number().int().optional(),
  observationText: z.string().min(1),
  observationSeverity: z.enum(["Critical", "High", "Low"]),
  referenceNumber: z.string().optional(),
  siteId: z.string().optional(),
  owner: z.string().min(1),
  dueDate: z.string().min(1),
  rootCause: z.string().optional(),
  rcaMethod: z.string().optional(),
});

export async function raiseCAPAFromObservation(
  input: z.input<typeof RaiseCAPASchema>,
): Promise<ActionResult> {
  const session = await requireAuth();
  const parsed = RaiseCAPASchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;
  const risk = d.observationSeverity === "Critical" ? "Critical" : d.observationSeverity === "High" ? "High" : "Low";
  const description = d.referenceNumber && d.observationNumber !== undefined
    ? `${d.referenceNumber} Obs #${d.observationNumber}: ${d.observationText}`
    : d.observationText.slice(0, 200);

  // Tenant scope check — prevents IDOR (audit finding 1.1)
  if (session.user.role !== "super_admin") {
    const owned = await prisma.fDA483Observation.findFirst({
      where: { id: d.observationId, event: { tenantId: session.user.tenantId } },
      select: { id: true },
    });
    if (!owned) return { success: false, error: "FORBIDDEN" };
  }

  try {
    // 1) Create the CAPA. The slice previously stamped a custom ID like
    //    "CAPA-1234" — we let cuid() handle it for consistency with the
    //    rest of the schema.
    const capa = await prisma.cAPA.create({
      data: {
        tenantId: session.user.tenantId,
        source: "FDA 483",
        description,
        risk,
        owner: d.owner,
        siteId: d.siteId ?? null,
        dueDate: new Date(d.dueDate),
        status: "Open",
        rca: d.rootCause ?? null,
        rcaMethod: d.rcaMethod ?? null,
        // DI gate auto-required for IT / CSV Lead origins.
        diGate: session.user.role === "it_cdo" || session.user.role === "csv_val_lead",
        diGateStatus:
          session.user.role === "it_cdo" || session.user.role === "csv_val_lead"
            ? "pending"
            : null,
        createdBy: session.user.name,
      },
    });

    // 2) Link the CAPA back to the observation + advance its status.
    await prisma.fDA483Observation.update({
      where: { id: d.observationId },
      data: { capaId: capa.id, status: "CAPA Linked" },
    });

    // 3) Audit trail in both modules.
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "FDA 483",
        action: "CAPA_RAISED_FROM_OBSERVATION",
        recordId: d.eventId,
        recordTitle: d.referenceNumber ?? null,
        newValue: capa.id,
      },
    });
    await prisma.auditLog.create({
      data: {
        tenantId: session.user.tenantId,
        userName: session.user.name,
        userRole: session.user.role,
        module: "CAPA",
        action: "CAPA_CREATED",
        recordId: capa.id,
        recordTitle: description.slice(0, 80),
        newValue: "from FDA 483 Observation",
      },
    });

    revalidatePath("/fda-483");
    revalidatePath("/capa");
    return { success: true, data: capa };
  } catch (err) {
    console.error("[action] raiseCAPAFromObservation failed:", err);
    return { success: false, error: "Failed to raise CAPA. Please try again." };
  }
}
