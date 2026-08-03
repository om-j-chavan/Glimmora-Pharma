-- Remove dead models surfaced by the module reachability audit.
-- CAPADocument: no `prisma.cAPADocument.*` call sites anywhere (uploads migrated
--   to EvidenceFile). ReadinessCard: no `prisma.readinessCard.*` call sites
--   (model was created ahead of UI wiring that never landed).
-- Both are pure DROP TABLE — the removed schema relations (CAPA.documents,
-- Inspection.readinessCards) were virtual reverse-relations with no DB column.

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "CAPADocument";
PRAGMA foreign_keys=on;
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "ReadinessCard";
PRAGMA foreign_keys=on;
