-- Normalises CAPA.status to the canonical snake_case vocabulary.
-- See src/types/capa.ts for the authoritative list. Run this BEFORE
-- regenerating the Prisma migration that flips the schema default
-- from "Open" to "open" — otherwise the prior writes will keep
-- producing Title-Case rows and the data and schema drift apart again.
--
-- Idempotent: each UPDATE filters by the legacy literal, so re-running
-- after a successful run is a no-op.
--
-- The "rejected" → "rejected" and "pending_qa_review" → "pending_qa_review"
-- self-mappings are intentionally NOT written (they would be no-ops).
-- After this script, every row should be one of:
--   open | in_progress | pending_qa_review | closed | rejected
-- If anything else is present, do not run this migration; investigate.

BEGIN;

UPDATE "CAPA" SET "status" = 'open'              WHERE "status" = 'Open';
UPDATE "CAPA" SET "status" = 'in_progress'       WHERE "status" = 'In Progress';
UPDATE "CAPA" SET "status" = 'pending_qa_review' WHERE "status" = 'Pending QA Review';
UPDATE "CAPA" SET "status" = 'closed'            WHERE "status" = 'Closed';

-- Sanity check: surface any remaining non-canonical values. The
-- application will reject them at the type boundary; this gives the
-- operator a chance to fix them before they cause runtime issues.
-- (SQLite has no RAISE outside triggers, so this is a SELECT — review
-- the result before COMMIT.)
SELECT "id", "status" FROM "CAPA"
WHERE "status" NOT IN ('open', 'in_progress', 'pending_qa_review', 'closed', 'rejected');

COMMIT;
