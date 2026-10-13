-- The request-access form now asks only for full name, username and password.
ALTER TABLE "AccessRequest" ADD COLUMN "username" TEXT,
ADD COLUMN "passwordHash" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "justification" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "AccessRequest_username_idx" ON "AccessRequest"("username");
