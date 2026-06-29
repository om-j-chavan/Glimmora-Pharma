import { z } from "zod";
import { FDA_SEVERITY } from "@/lib/severity";

// Form-side schema — dropdown emits canonical TitleCase only, so the
// plain enum suffices. The server-side CreateDeviationSchema additionally
// runs the lowercase-tolerant preprocessor for legacy callers.
export const addSchema = z.object({
  title: z.string().min(5, "Title required (min 5 chars)"),
  description: z.string().min(10, "Description required"),
  type: z.enum(["planned", "unplanned"]),
  category: z.enum(["process", "equipment", "material", "environmental", "personnel", "documentation", "system", "other"]),
  severity: z.enum(FDA_SEVERITY),
  area: z.string().min(1, "Area required"),
  immediateAction: z.string().min(5, "Immediate action required"),
  patientSafetyImpact: z.enum(["high", "medium", "low", "none"]),
  productQualityImpact: z.enum(["high", "medium", "low", "none"]),
  regulatoryImpact: z.enum(["high", "medium", "low", "none"]),
  // Stage 2 (deviation redesign) — `owner` removed from creation; QA-set triage
  // priority instead (pre-filled from severity in the UI, overridable).
  priority: z.enum(["Low", "Medium", "High"]),
  dueDate: z.string().min(1, "Due date required"),
  batchesAffected: z.string().optional(),
});
export type AddForm = z.infer<typeof addSchema>;
