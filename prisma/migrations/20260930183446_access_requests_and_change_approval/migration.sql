-- CreateEnum
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'WITHDRAWN', 'FAILED');

-- CreateEnum
CREATE TYPE "ChangeOperation" AS ENUM ('CREATE', 'UPDATE', 'IMPORT');

-- AlterEnum
ALTER TYPE "ImportStatus" ADD VALUE 'AWAITING_APPROVAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dataApprover" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permissionDenials" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT,
    "employeeNumber" TEXT,
    "jobTitle" TEXT,
    "unit" TEXT,
    "requestedRole" "RoleCode",
    "justification" TEXT NOT NULL,
    "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionComment" TEXT,
    "createdUserId" TEXT,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "operation" "ChangeOperation" NOT NULL,
    "recordId" TEXT,
    "caseId" TEXT,
    "summary" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "baseVersion" INTEGER,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "appliedRecordId" TEXT,
    "failureReason" TEXT,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_reference_key" ON "AccessRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_createdUserId_key" ON "AccessRequest"("createdUserId");

-- CreateIndex
CREATE INDEX "AccessRequest_status_createdAt_idx" ON "AccessRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AccessRequest_email_idx" ON "AccessRequest"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeRequest_reference_key" ON "ChangeRequest"("reference");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_requestedAt_idx" ON "ChangeRequest"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "ChangeRequest_requestedById_status_idx" ON "ChangeRequest"("requestedById", "status");

-- CreateIndex
CREATE INDEX "ChangeRequest_resourceKey_recordId_status_idx" ON "ChangeRequest"("resourceKey", "recordId", "status");

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
