-- AlterTable
ALTER TABLE "CAPA" ADD COLUMN "closingNotes" TEXT;

-- AlterTable
ALTER TABLE "CAPAActionItem" ADD COLUMN "acceptanceNotes" TEXT;
ALTER TABLE "CAPAActionItem" ADD COLUMN "acceptedAt" DATETIME;
ALTER TABLE "CAPAActionItem" ADD COLUMN "acceptedBy" TEXT;
ALTER TABLE "CAPAActionItem" ADD COLUMN "acceptedById" TEXT;
