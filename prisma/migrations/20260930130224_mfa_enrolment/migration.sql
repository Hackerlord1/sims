-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaLastUsedStep" INTEGER,
ADD COLUMN     "mfaPendingSecret" TEXT;
