-- DEV-ONLY (SQLite): Gap Assessment QA finding-closure metadata, applied to
-- dev.db without a full `prisma db push`. Prod source of truth:
-- prisma/migrations/20260809120000_add_finding_qa_closure/migration.sql.
--
-- Three nullable Finding columns recording WHO closed the finding, WHEN, and the
-- closure message. Legacy closed findings keep NULL in all three.
--
-- ⚠️ AUDITED, NOT ELECTRONICALLY SIGNED. Deliberately absent: closureSignatureId.
-- The QA close re-authenticates the actor's password (identity) and writes a
-- paired AuditLog row, but mints no SignedRecord and hashes no content.
--
-- NOTE: SQLite has no `ADD COLUMN IF NOT EXISTS`. Re-running a statement that
-- already applied fails with "duplicate column name" — that error is safe to
-- ignore; it means the column is already there.

ALTER TABLE "Finding" ADD COLUMN "closedBy" TEXT;
ALTER TABLE "Finding" ADD COLUMN "closedDate" DATETIME;
ALTER TABLE "Finding" ADD COLUMN "closureNotes" TEXT;
