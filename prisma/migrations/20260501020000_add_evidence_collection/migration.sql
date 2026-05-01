-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capaId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "lockedSignatureId" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceItem_capaId_fkey" FOREIGN KEY ("capaId") REFERENCES "CAPA" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceNoteVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidenceItemId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "statusAtTime" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceNoteVersion_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidenceItemId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "contentHashSha256" TEXT NOT NULL,
    "retainUntil" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletedBy" TEXT,
    "deletionReason" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceFile_evidenceItemId_fkey" FOREIGN KEY ("evidenceItemId") REFERENCES "EvidenceItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceItem_capaId_category_key" ON "EvidenceItem"("capaId", "category");

-- CreateIndex
CREATE INDEX "EvidenceItem_capaId_idx" ON "EvidenceItem"("capaId");

-- CreateIndex
CREATE INDEX "EvidenceNoteVersion_evidenceItemId_idx" ON "EvidenceNoteVersion"("evidenceItemId");

-- CreateIndex
CREATE INDEX "EvidenceFile_evidenceItemId_idx" ON "EvidenceFile"("evidenceItemId");

-- CreateIndex
CREATE INDEX "EvidenceFile_deletedAt_idx" ON "EvidenceFile"("deletedAt");
