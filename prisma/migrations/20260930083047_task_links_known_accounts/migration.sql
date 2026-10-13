/*
  Warnings:

  - Added the required column `updatedAt` to the `KnownAccount` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "case_reference_trgm";

-- DropIndex
DROP INDEX "case_title_trgm";

-- DropIndex
DROP INDEX "invoice_customer_trgm";

-- DropIndex
DROP INDEX "invoice_number_trgm";

-- DropIndex
DROP INDEX "KnownAccount_caseId_idx";

-- DropIndex
DROP INDEX "party_name_trgm";

-- DropIndex
DROP INDEX "txn_counterparty_trgm";

-- AlterTable
ALTER TABLE "KnownAccount" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "deletionBatchId" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restorationReason" TEXT,
ADD COLUMN     "restoredAt" TIMESTAMP(3),
ADD COLUMN     "restoredById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "linkId" TEXT,
ADD COLUMN     "linkType" TEXT;

-- CreateIndex
CREATE INDEX "KnownAccount_caseId_isDeleted_idx" ON "KnownAccount"("caseId", "isDeleted");

-- CreateIndex
CREATE INDEX "Task_linkType_linkId_idx" ON "Task"("linkType", "linkId");
