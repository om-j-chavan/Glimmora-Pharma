-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "rcaRecordedAt" TIMESTAMP(3),
ADD COLUMN     "rcaRecordedById" TEXT;

-- AlterTable
ALTER TABLE "CAPA" ADD COLUMN     "closingNotes" TEXT;

-- AlterTable
ALTER TABLE "CAPAActionItem" ADD COLUMN     "acceptanceNotes" TEXT,
ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptedBy" TEXT,
ADD COLUMN     "acceptedById" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "uploadSource" TEXT DEFAULT 'create';

-- AlterTable
ALTER TABLE "EvidenceFile" ADD COLUMN     "uploadSource" TEXT;

-- AlterTable
ALTER TABLE "CAPAComment" ADD COLUMN     "carriedFromFindingId" TEXT,
ADD COLUMN     "carriedFromFindingRef" TEXT;

