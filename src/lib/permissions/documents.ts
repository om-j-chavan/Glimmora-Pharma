/**
 * Evidence & Documents — the SERVER-ENFORCED permission model.
 *
 * This module aggregates documents from several places: some are uploaded
 * DIRECTLY here (rows in the `Document` table, origin = "evidence"); others are
 * READ-ONLY mirrors that originate in other modules (CAPA evidence, CSV/CSA
 * validation, FDA 483 artifacts, …) and live in their own tables.
 *
 * Two boundaries are enforced, both on the server:
 *  1. VISIBILITY — a regular user sees only THEIR OWN documents (uploader id);
 *     Customer Admin + QA Head (+ platform admin) see ALL within the tenant.
 *  2. MUTABILITY — only a document that ORIGINATED HERE (Document.sourceModule
 *     is null/"evidence") may be edited/deleted, and only by a permitted role.
 *     Other-module documents are locked — editing them here would corrupt the
 *     source module.
 *
 * Pure predicates (no Prisma/React/Redux) so the same file backs the server
 * actions/queries AND the client capability mirror — the UI can hide a button,
 * but the server is the authority.
 */
import {
  isPlatformAdmin,
  canAuthorGxP,
  COMPLIANCE_AUTHOR_ROLES,
  ADMIN_DELETE_ROLES,
  DOCUMENT_APPROVE_ROLES,
} from "@/lib/permissions/roleSets";

/** Origin marker stamped on every document uploaded directly through this
 *  module (Document.sourceModule). Anything else is a foreign-origin mirror. */
export const EVIDENCE_ORIGIN = "evidence";

/**
 * VISIBILITY: who sees every document in the tenant vs. only their own.
 * Customer Admin + QA Head oversee all documents; a platform admin (super_admin)
 * gets the tenant-keyed SA exemption. Every other role — including execution
 * "qa", csv_val_lead, regulatory_affairs, viewer — sees ONLY documents they
 * uploaded. "Own" is keyed on the uploader's USER ID, never a display name.
 */
export function canSeeAllDocuments(role: string): boolean {
  return role === "customer_admin" || role === "qa_head" || isPlatformAdmin(role);
}

/** True when a document originated in THIS module (so it may be mutated here).
 *  `null` sourceModule = a legacy here-uploaded row before origin was stamped —
 *  treated as here-origin. Any other value is a foreign-origin mirror = locked. */
export function isHereOrigin(sourceModule: string | null | undefined): boolean {
  return !sourceModule || sourceModule === EVIDENCE_ORIGIN;
}

const DOCUMENT_DELETE_ROLES: readonly string[] = [
  ...new Set([...DOCUMENT_APPROVE_ROLES, ...ADMIN_DELETE_ROLES]),
];

/** May this role EDIT a document of this origin? Requires a compliance-author
 *  role, the GxP authoring bright line (excludes super_admin), AND here-origin
 *  (foreign mirrors are never editable here). */
export function canEditDocument(role: string, sourceModule: string | null | undefined): boolean {
  return isHereOrigin(sourceModule) && canAuthorGxP(role) && COMPLIANCE_AUTHOR_ROLES.includes(role);
}

/** May this role DELETE a document of this origin? qa_head OR customer_admin
 *  (app-wide GxP delete policy), GxP bright line, AND here-origin. */
export function canDeleteDocument(role: string, sourceModule: string | null | undefined): boolean {
  return isHereOrigin(sourceModule) && canAuthorGxP(role) && DOCUMENT_DELETE_ROLES.includes(role);
}

/** Human reason shown on a locked (foreign-origin) document. */
export function lockReasonFor(originLabel: string): string {
  return `This document originates in ${originLabel} and is read-only here — manage it in that module to keep the source of record intact.`;
}
