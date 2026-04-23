/**
 * Centralized Zod schemas for all forms.
 * Keeps validation rules in one place for consistency.
 */

import { z } from "zod";

/* ── Gap Assessment ── */

export const FindingSchema = z.object({
  requirement: z.string().min(10, "Describe the compliance gap (min 10 chars)"),
  area: z.string().min(1, "Select an area"),
  framework: z.string().min(1, "Select a regulatory framework"),
  severity: z.enum(["Critical", "High", "Low"]),
  owner: z.string().min(1, "Assign an owner"),
  targetDate: z.string().min(1, "Set a target date"),
  siteId: z.string().min(1, "Select a site"),
  evidenceLink: z.string().optional(),
});
export type FindingFormData = z.infer<typeof FindingSchema>;

/* ── CAPA ── */

export const CAPASchema = z.object({
  description: z.string().min(10, "Description required (min 10 chars)"),
  source: z.enum(["483", "Internal Audit", "Deviation", "Complaint", "OOS", "Change Control", "Gap Assessment"]),
  risk: z.enum(["Critical", "High", "Low"]),
  owner: z.string().min(1, "Assign an owner"),
  dueDate: z.string().min(1, "Set a due date"),
  siteId: z.string().min(1, "Select a site"),
  diGate: z.boolean().optional(),
  effectivenessCheck: z.boolean().optional(),
  rcaMethod: z.enum(["5 Why", "Fishbone", "Fault Tree", "Other"]).optional(),
  findingId: z.string().optional(),
});
export type CAPAFormData = z.infer<typeof CAPASchema>;

/* ── FDA 483 ── */

export const FDA483EventSchema = z.object({
  type: z.enum(["FDA 483", "Warning Letter", "EMA Inspection", "MHRA Inspection", "WHO Inspection"]),
  referenceNumber: z.string().min(1, "Reference number required"),
  agency: z.string().min(1, "Select an agency"),
  siteId: z.string().min(1, "Select a site"),
  inspectionDate: z.string().min(1, "Inspection date required"),
  responseDeadline: z.string().min(1, "Response deadline required"),
});
export type FDA483FormData = z.infer<typeof FDA483EventSchema>;

export const ObservationSchema = z.object({
  number: z.coerce.number().min(1, "Number required"),
  text: z.string().min(5, "Observation text required"),
  severity: z.enum(["Critical", "High", "Low"]),
  area: z.string().optional(),
  regulation: z.string().optional(),
  status: z.enum(["Open", "In Progress", "RCA In Progress", "CAPA Linked", "Response Ready", "Response Drafted", "Closed"]),
});
export type ObservationFormData = z.infer<typeof ObservationSchema>;

/* ── Deviation ── */

export const DeviationSchema = z.object({
  title: z.string().min(5, "Title required (min 5 chars)"),
  description: z.string().min(10, "Description required"),
  type: z.enum(["planned", "unplanned"]),
  category: z.enum(["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"]),
  severity: z.enum(["critical", "major", "minor"]),
  area: z.string().min(1, "Area required"),
  immediateAction: z.string().min(5, "Immediate action required"),
  patientSafetyImpact: z.enum(["high", "medium", "low", "none"]),
  productQualityImpact: z.enum(["high", "medium", "low", "none"]),
  regulatoryImpact: z.enum(["high", "medium", "low", "none"]),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  batchesAffected: z.string().optional(),
  raiseCAPA: z.boolean().optional(),
});
export type DeviationFormData = z.infer<typeof DeviationSchema>;

/* ── RAID ── */

export const RAIDSchema = z.object({
  type: z.enum(["Risk", "Action", "Issue", "Decision"]),
  title: z.string().min(3, "Title required"),
  description: z.string().min(5, "Description required"),
  priority: z.enum(["Critical", "High", "Medium", "Low"]),
  owner: z.string().min(1, "Owner required"),
  dueDate: z.string().min(1, "Due date required"),
  impact: z.string().optional(),
  mitigation: z.string().optional(),
});
export type RAIDFormData = z.infer<typeof RAIDSchema>;

/* ── CSV/CSA System ── */

export const SystemSchema = z.object({
  name: z.string().min(2, "System name required"),
  type: z.enum(["QMS", "LIMS", "ERP", "CDS", "SCADA", "MES", "CMMS", "Other"]),
  vendor: z.string().min(1, "Vendor required"),
  version: z.string().min(1, "Version required"),
  gxpRelevance: z.enum(["Critical", "Major", "Minor"]),
  gamp5Category: z.enum(["1", "3", "4", "5"]),
  riskLevel: z.enum(["HIGH", "MEDIUM", "LOW"]),
  siteId: z.string().min(1, "Select a site"),
  intendedUse: z.string().optional(),
});
export type SystemFormData = z.infer<typeof SystemSchema>;
