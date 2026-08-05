-- DEV-ONLY (SQLite): CAPA RCA-authorship FK, applied to dev.db without a full
-- `prisma db push`. Prod source of truth:
-- prisma/migrations/20260803120000_add_capa_rca_editor/migration.sql.
--
-- Nullable — legacy rows keep NULL and the author-based SoD checks don't apply.
ALTER TABLE "CAPA" ADD COLUMN "rcaEditedById" TEXT;
