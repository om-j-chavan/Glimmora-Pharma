-- CreateTable
CREATE TABLE "EmailOTP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "tenantId" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'customer_admin',
    "language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sessionsValidAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Tenant" ("createdAt", "customerCode", "email", "id", "isActive", "language", "logoUrl", "name", "passwordHash", "role", "timezone", "updatedAt", "username") SELECT "createdAt", "customerCode", "email", "id", "isActive", "language", "logoUrl", "name", "passwordHash", "role", "timezone", "updatedAt", "username" FROM "Tenant";
DROP TABLE "Tenant";
ALTER TABLE "new_Tenant" RENAME TO "Tenant";
CREATE UNIQUE INDEX "Tenant_customerCode_key" ON "Tenant"("customerCode");
CREATE UNIQUE INDEX "Tenant_username_key" ON "Tenant"("username");
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EmailOTP_identifier_tenantId_idx" ON "EmailOTP"("identifier", "tenantId");

-- CreateIndex
CREATE INDEX "EmailOTP_expiresAt_idx" ON "EmailOTP"("expiresAt");
